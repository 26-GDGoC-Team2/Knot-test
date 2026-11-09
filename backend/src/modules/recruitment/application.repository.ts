// 지원/제안 SQL. 모든 메서드는 트랜잭션 client(db)를 받을 수 있다.
import { Injectable } from '@nestjs/common';
import { DatabaseService, Queryable } from '../../common/database.service';
import type { ApplicationKind, ApplicationStatus, RejectReason } from './recruitment.dto';

export interface ApplicationLock {
  id: string;
  recruitmentId: string;
  roleId: number;
  kind: ApplicationKind;
  senderId: string;
  receiverId: string;
  status: ApplicationStatus;
  rejectReason: RejectReason | null;
}

export interface ApplicationRow {
  id: string;
  recruitmentId: string;
  recruitmentTitle: string;
  kind: ApplicationKind;
  status: ApplicationStatus;
  rejectReason: RejectReason | null;
  roleId: number;
  roleName: string;
  message: string | null;
  senderId: string;
  senderName: string;
  senderStatus: 'ACTIVE' | 'WITHDRAWN';
  receiverId: string;
  receiverName: string;
  receiverStatus: 'ACTIVE' | 'WITHDRAWN';
  createdAt: string;
  respondedAt: string | null;
}

export interface NewApplication {
  recruitmentId: string;
  roleId: number;
  kind: ApplicationKind;
  senderId: string;
  receiverId: string;
  message: string | null;
}

const ISO = (col: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

const ROW_SELECT = `
  SELECT a.id, a.recruitment_id AS "recruitmentId", rc.title AS "recruitmentTitle", a.kind, a.status, a.reject_reason AS "rejectReason",
         a.role_id AS "roleId", ro.name AS "roleName", a.message,
         a.sender_id AS "senderId", s.name AS "senderName", s.status AS "senderStatus",
         a.receiver_id AS "receiverId", rv.name AS "receiverName", rv.status AS "receiverStatus",
         ${ISO('a.created_at')} AS "createdAt", ${ISO('a.responded_at')} AS "respondedAt"
  FROM applications a
  JOIN recruitments rc ON rc.id = a.recruitment_id
  JOIN roles ro ON ro.id = a.role_id
  JOIN users s ON s.id = a.sender_id
  JOIN users rv ON rv.id = a.receiver_id`;

@Injectable()
export class ApplicationRepository {
  constructor(private readonly database: DatabaseService) {}

  // 소속 모집글을 알아내기 위한 잠금 없는 조회 (모집글 행을 먼저 잠그기 위함)
  async findRecruitmentId(id: string, db: Queryable = this.database): Promise<string | null> {
    const r = await db.query<{ recruitment_id: string }>(`SELECT recruitment_id FROM applications WHERE id = $1`, [id]);
    return r.rows[0]?.recruitment_id ?? null;
  }

  async lockById(id: string, db: Queryable = this.database): Promise<ApplicationLock | null> {
    const r = await db.query<ApplicationLock>(
      `SELECT id, recruitment_id AS "recruitmentId", role_id AS "roleId", kind, sender_id AS "senderId",
              receiver_id AS "receiverId", status, reject_reason AS "rejectReason"
       FROM applications WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return r.rows[0] ?? null;
  }

  // 대기 중 중복은 부분 유니크 인덱스가 최종 방어(unique 위반은 호출 측에서 409 로 변환)
  async insert(v: NewApplication, db: Queryable = this.database): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO applications (recruitment_id, role_id, kind, sender_id, receiver_id, message)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [v.recruitmentId, v.roleId, v.kind, v.senderId, v.receiverId, v.message],
    );
    return r.rows[0].id;
  }

  // 대기(PENDING) 상태일 때만 상태를 바꾼다. 이미 처리됐으면 false
  // 거절(REJECTED)이면 직접 거절(MANUAL)로 기록한다
  async resolvePending(id: string, status: Exclude<ApplicationStatus, 'PENDING'>, db: Queryable = this.database): Promise<boolean> {
    const r = await db.query(
      `UPDATE applications SET status = $2::application_status, responded_at = now(),
              reject_reason = CASE WHEN $2::application_status = 'REJECTED' THEN 'MANUAL'::application_reject_reason ELSE NULL END
       WHERE id = $1 AND status = 'PENDING'`,
      [id, status],
    );
    return (r.rowCount ?? 0) === 1;
  }

  // 모집글의 대기 건을 일괄 거절. roleId 를 주면 그 역할만. 변경 건수 반환
  async rejectPending(recruitmentId: string, roleId: number | null, db: Queryable = this.database): Promise<number> {
    const r = await db.query(
      `UPDATE applications SET status = 'REJECTED', reject_reason = 'CLOSED', responded_at = now()
       WHERE recruitment_id = $1 AND status = 'PENDING' AND ($2::smallint IS NULL OR role_id = $2)`,
      [recruitmentId, roleId],
    );
    return r.rowCount ?? 0;
  }

  // 수락/직접 거절을 취소하고 대기로 되돌린다. 기대한 상태(from)일 때만 변경하고, 아니면 false
  // (대기 중 중복 유니크 인덱스에 걸리면 호출 측에서 409 로 변환)
  async revertToPending(id: string, from: 'ACCEPTED' | 'REJECTED', db: Queryable = this.database): Promise<boolean> {
    const r = await db.query(
      `UPDATE applications SET status = 'PENDING', reject_reason = NULL, responded_at = NULL
       WHERE id = $1 AND status = $2::application_status`,
      [id, from],
    );
    return (r.rowCount ?? 0) === 1;
  }

  // 팀원에서 빠진 회원의 수락 건을 취소 처리 (이력은 남기되 다시 되돌릴 수 없게 함)
  async cancelAccepted(recruitmentId: string, userId: string, db: Queryable = this.database): Promise<number> {
    const r = await db.query(
      `UPDATE applications SET status = 'CANCELED', responded_at = now()
       WHERE recruitment_id = $1 AND status = 'ACCEPTED'
         AND ((kind = 'APPLY' AND sender_id = $2) OR (kind = 'PROPOSE' AND receiver_id = $2))`,
      [recruitmentId, userId],
    );
    return r.rowCount ?? 0;
  }

  // 팀원으로 확정된 회원의 같은 모집글 내 다른 대기 건(보낸 지원, 받은 제안)을 취소
  async cancelOtherPendingOfUser(recruitmentId: string, userId: string, db: Queryable = this.database): Promise<number> {
    const r = await db.query(
      `UPDATE applications SET status = 'CANCELED', responded_at = now()
       WHERE recruitment_id = $1 AND status = 'PENDING'
         AND ((kind = 'APPLY' AND sender_id = $2) OR (kind = 'PROPOSE' AND receiver_id = $2))`,
      [recruitmentId, userId],
    );
    return r.rowCount ?? 0;
  }

  // 탈퇴 회원이 보냈거나 받은 대기(PENDING) 지원/제안과, 탈퇴 회원이 작성한 모집글에 걸린 대기 건을 모두 취소
  async cancelPendingInvolving(userId: string, db: Queryable = this.database): Promise<number> {
    const r = await db.query(
      `UPDATE applications SET status = 'CANCELED', responded_at = now()
       WHERE status = 'PENDING'
         AND (sender_id = $1
              OR receiver_id = $1
              OR recruitment_id IN (SELECT id FROM recruitments WHERE author_id = $1))`,
      [userId],
    );
    return r.rowCount ?? 0;
  }

  async findRow(id: string, db: Queryable = this.database): Promise<ApplicationRow | null> {
    const r = await db.query<ApplicationRow>(`${ROW_SELECT} WHERE a.id = $1`, [id]);
    return r.rows[0] ?? null;
  }

  // 내 지원/제안 목록. sent = 내가 보낸 것, received = 내가 받은 것. 삭제된 모집글의 이력도 포함
  async listByUser(
    userId: string,
    box: 'sent' | 'received',
    status: ApplicationStatus | undefined,
    paging: { limit: number; offset: number },
    db: Queryable = this.database,
  ): Promise<{ items: ApplicationRow[]; total: number }> {
    const params: unknown[] = [userId];
    const where = [box === 'sent' ? 'a.sender_id = $1' : 'a.receiver_id = $1'];
    if (status) {
      params.push(status);
      where.push(`a.status = $${params.length}`);
    }
    const w = where.join(' AND ');
    const [rows, count] = await Promise.all([
      db.query<ApplicationRow>(
        `${ROW_SELECT} WHERE ${w} ORDER BY a.created_at DESC, a.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, paging.limit, paging.offset],
      ),
      db.query<{ n: number }>(`SELECT count(*)::int AS n FROM applications a WHERE ${w}`, params),
    ]);
    return { items: rows.rows, total: count.rows[0].n };
  }

  async listByRecruitment(
    recruitmentId: string,
    status: ApplicationStatus | undefined,
    paging: { limit: number; offset: number },
    db: Queryable = this.database,
  ): Promise<{ items: ApplicationRow[]; total: number }> {
    const params: unknown[] = [recruitmentId];
    const where = ['a.recruitment_id = $1'];
    if (status) {
      params.push(status);
      where.push(`a.status = $${params.length}`);
    }
    const w = where.join(' AND ');
    const [rows, count] = await Promise.all([
      db.query<ApplicationRow>(
        `${ROW_SELECT} WHERE ${w} ORDER BY a.created_at DESC, a.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, paging.limit, paging.offset],
      ),
      db.query<{ n: number }>(`SELECT count(*)::int AS n FROM applications a WHERE ${w}`, params),
    ]);
    return { items: rows.rows, total: count.rows[0].n };
  }
}
