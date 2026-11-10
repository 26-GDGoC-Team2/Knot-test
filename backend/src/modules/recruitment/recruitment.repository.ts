// 모집글/역할별 정원/확정 팀원 SQL. 모든 메서드는 트랜잭션 client(db)를 받을 수 있다.
// 잠금 순서 규칙(교착 방지): 항상 모집글 행 -> 역할 행 -> 지원 행 순서로 잠근다.
import { Injectable } from '@nestjs/common';
import { DatabaseService, Queryable } from '../../common/database.service';
import type { ResolvedSort } from '../../common/pagination';
import type { RecruitmentMemberResponse, RecruitmentStatus, RoleSlotResponse, SkillRef } from './recruitment.dto';

export interface RecruitmentLock {
  id: string;
  authorId: string;
  status: RecruitmentStatus;
  endDate: string; // 'YYYY-MM-DD'
}

export interface RoleSlotRow {
  id: string;
  roleId: number;
  roleName: string;
  capacity: number;
  confirmedCount: number;
}

export interface RecruitmentFields {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  openChatUrl: string;
  teamChatUrl: string;
}

export interface RecruitmentRow {
  id: string;
  title: string;
  description: string;
  status: RecruitmentStatus;
  startDate: string;
  endDate: string;
  openChatUrl: string;
  teamChatUrl: string | null;
  authorId: string;
  authorName: string;
  authorStatus: 'ACTIVE' | 'WITHDRAWN';
  createdAt: string;
  updatedAt: string;
}

export interface RecruitmentListRow {
  id: string;
  title: string;
  status: RecruitmentStatus;
  startDate: string;
  endDate: string;
  authorId: string;
  authorName: string;
  authorStatus: 'ACTIVE' | 'WITHDRAWN';
  createdAt: string;
  roles: Omit<RoleSlotResponse, 'full'>[];
}

export interface RecruitmentFilter {
  status?: 'OPEN' | 'DONE';
  q?: string;
  roleIds?: number[];
  skillIds?: number[];
  interestIds?: number[];
  authorId?: string; // 내가 쓴 글만
}

export type MemberRow = Omit<RecruitmentMemberResponse, 'user' | 'isLeader'> & {
  userId: string;
  name: string;
  status: 'ACTIVE' | 'WITHDRAWN';
};

export interface UserBrief {
  id: string;
  role: 'MEMBER' | 'ADMIN';
  status: 'ACTIVE' | 'WITHDRAWN';
}

const ISO = (col: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&');
}

@Injectable()
export class RecruitmentRepository {
  constructor(private readonly database: DatabaseService) {}

  // ===== 회원 / ID 검증 =====

  // 현재 DB 기준 회원 역할/상태 (JWT 의 role 은 최대 30분 지연되므로 권한 판단에는 DB 값을 쓴다)
  async findUserBrief(userId: string, db: Queryable = this.database): Promise<UserBrief | null> {
    const r = await db.query<UserBrief>(`SELECT id, role, status FROM users WHERE id = $1`, [userId]);
    return r.rows[0] ?? null;
  }

  async findExistingIds(
    table: 'roles' | 'skills' | 'interest_areas',
    ids: number[],
    db: Queryable = this.database,
  ): Promise<number[]> {
    if (ids.length === 0) return [];
    // table 은 위 리터럴 유니온으로만 들어오므로 SQL 에 직접 넣어도 안전하다
    const r = await db.query<{ id: number }>(`SELECT id FROM ${table} WHERE id = ANY($1::int[])`, [ids]);
    return r.rows.map((x) => x.id);
  }

  // ===== 모집글 =====

  // 삭제되지 않은 모집글 행을 잠그고 조회. 없으면 null
  // FOR UPDATE: 수정/마감/삭제/수락(정원 변경)용, FOR SHARE: 지원/제안 생성용(마감과 직렬화)
  async lockActive(id: string, mode: 'UPDATE' | 'SHARE', db: Queryable = this.database): Promise<RecruitmentLock | null> {
    const r = await db.query<RecruitmentLock>(
      `SELECT id, author_id AS "authorId", status, to_char(end_date, 'YYYY-MM-DD') AS "endDate" FROM recruitments
       WHERE id = $1 AND deleted_at IS NULL FOR ${mode === 'UPDATE' ? 'UPDATE' : 'SHARE'}`,
      [id],
    );
    return r.rows[0] ?? null;
  }

  async insert(authorId: string, v: RecruitmentFields, db: Queryable = this.database): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO recruitments (author_id, title, description, start_date, end_date, open_chat_url, team_chat_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [authorId, v.title, v.description, v.startDate, v.endDate, v.openChatUrl, v.teamChatUrl],
    );
    return r.rows[0].id;
  }

  // 내용이 바뀌었으므로 임베딩 재계산 대상으로 표시
  async updateFields(id: string, v: RecruitmentFields, db: Queryable = this.database): Promise<void> {
    await db.query(
      `UPDATE recruitments SET title = $2, description = $3, start_date = $4, end_date = $5, open_chat_url = $6,
              team_chat_url = $7, embedding_stale = TRUE, updated_at = now()
       WHERE id = $1`,
      [id, v.title, v.description, v.startDate, v.endDate, v.openChatUrl, v.teamChatUrl],
    );
  }

  async setStatus(id: string, status: RecruitmentStatus, db: Queryable = this.database): Promise<void> {
    await db.query(`UPDATE recruitments SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
  }

  // 소프트 삭제 (지원/제안 이력은 보존)
  async softDelete(id: string, db: Queryable = this.database): Promise<void> {
    await db.query(`UPDATE recruitments SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL`, [
      id,
    ]);
  }

  // 작성자가 탈퇴할 때 진행 중(OPEN)인 모집글을 모두 완료(COMPLETED) 처리하고 변경 건수를 반환
  async completeOpenByAuthor(authorId: string, db: Queryable = this.database): Promise<number> {
    const r = await db.query(
      `UPDATE recruitments SET status = 'COMPLETED', updated_at = now()
       WHERE author_id = $1 AND status = 'OPEN' AND deleted_at IS NULL`,
      [authorId],
    );
    return r.rowCount ?? 0;
  }

  async replaceSkills(id: string, requiredIds: number[], preferredIds: number[], db: Queryable = this.database): Promise<void> {
    await db.query(`DELETE FROM recruitment_skills WHERE recruitment_id = $1`, [id]);
    if (requiredIds.length > 0) {
      await db.query(
        `INSERT INTO recruitment_skills (recruitment_id, skill_id, required) SELECT $1, unnest($2::int[]), TRUE`,
        [id, requiredIds],
      );
    }
    if (preferredIds.length > 0) {
      await db.query(
        `INSERT INTO recruitment_skills (recruitment_id, skill_id, required) SELECT $1, unnest($2::int[]), FALSE`,
        [id, preferredIds],
      );
    }
  }

  async replaceInterests(id: string, interestIds: number[], db: Queryable = this.database): Promise<void> {
    await db.query(`DELETE FROM recruitment_interests WHERE recruitment_id = $1`, [id]);
    if (interestIds.length === 0) return;
    await db.query(`INSERT INTO recruitment_interests (recruitment_id, interest_id) SELECT $1, unnest($2::smallint[])`, [
      id,
      interestIds,
    ]);
  }

  // ===== 역할별 정원 =====

  // 역할 행 조회. lock=true 면 행을 잠근다
  async findRoles(recruitmentId: string, lock: boolean, db: Queryable = this.database): Promise<RoleSlotRow[]> {
    const r = await db.query<RoleSlotRow>(
      `SELECT rr.id, rr.role_id AS "roleId", ro.name AS "roleName", rr.capacity, rr.confirmed_count AS "confirmedCount"
       FROM recruitment_roles rr JOIN roles ro ON ro.id = rr.role_id
       WHERE rr.recruitment_id = $1 ORDER BY rr.role_id ${lock ? 'FOR UPDATE OF rr' : ''}`,
      [recruitmentId],
    );
    return r.rows;
  }

  async findRoleLocked(recruitmentId: string, roleId: number, db: Queryable = this.database): Promise<RoleSlotRow | null> {
    const r = await db.query<RoleSlotRow>(
      `SELECT rr.id, rr.role_id AS "roleId", ro.name AS "roleName", rr.capacity, rr.confirmed_count AS "confirmedCount"
       FROM recruitment_roles rr JOIN roles ro ON ro.id = rr.role_id
       WHERE rr.recruitment_id = $1 AND rr.role_id = $2 FOR UPDATE OF rr`,
      [recruitmentId, roleId],
    );
    return r.rows[0] ?? null;
  }

  async insertRoles(recruitmentId: string, slots: { roleId: number; capacity: number }[], db: Queryable = this.database): Promise<void> {
    await db.query(
      `INSERT INTO recruitment_roles (recruitment_id, role_id, capacity)
       SELECT $1, x.role_id, x.capacity FROM unnest($2::smallint[], $3::smallint[]) AS x(role_id, capacity)`,
      [recruitmentId, slots.map((s) => s.roleId), slots.map((s) => s.capacity)],
    );
  }

  async updateRoleCapacity(rowId: string, capacity: number, db: Queryable = this.database): Promise<void> {
    await db.query(`UPDATE recruitment_roles SET capacity = $2 WHERE id = $1`, [rowId, capacity]);
  }

  async deleteRole(rowId: string, db: Queryable = this.database): Promise<void> {
    await db.query(`DELETE FROM recruitment_roles WHERE id = $1`, [rowId]);
  }

  // 정원 여유가 있을 때만 확정 인원을 1 늘린다. 정원이 찼으면 false (초과 방지의 마지막 방어선)
  async incrementConfirmed(recruitmentId: string, roleId: number, db: Queryable = this.database): Promise<boolean> {
    const r = await db.query(
      `UPDATE recruitment_roles SET confirmed_count = confirmed_count + 1
       WHERE recruitment_id = $1 AND role_id = $2 AND confirmed_count < capacity`,
      [recruitmentId, roleId],
    );
    return (r.rowCount ?? 0) === 1;
  }

  // 확정 인원을 1 줄인다. 이미 0 이면 false (음수 방지)
  async decrementConfirmed(recruitmentId: string, roleId: number, db: Queryable = this.database): Promise<boolean> {
    const r = await db.query(
      `UPDATE recruitment_roles SET confirmed_count = confirmed_count - 1
       WHERE recruitment_id = $1 AND role_id = $2 AND confirmed_count > 0`,
      [recruitmentId, roleId],
    );
    return (r.rowCount ?? 0) === 1;
  }

  // 정원이 남은 역할 수
  async countOpenRoles(recruitmentId: string, db: Queryable = this.database): Promise<number> {
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM recruitment_roles WHERE recruitment_id = $1 AND confirmed_count < capacity`,
      [recruitmentId],
    );
    return r.rows[0].n;
  }

  // ===== 확정 팀원 =====

  async addMember(recruitmentId: string, roleId: number, userId: string, db: Queryable = this.database): Promise<void> {
    await db.query(`INSERT INTO recruitment_members (recruitment_id, role_id, user_id) VALUES ($1, $2, $3)`, [
      recruitmentId,
      roleId,
      userId,
    ]);
  }

  // 팀원 한 명의 역할 조회. 팀원이 아니면 null
  async findMemberRole(recruitmentId: string, userId: string, db: Queryable = this.database): Promise<number | null> {
    const r = await db.query<{ roleId: number }>(
      `SELECT role_id AS "roleId" FROM recruitment_members WHERE recruitment_id = $1 AND user_id = $2`,
      [recruitmentId, userId],
    );
    return r.rows[0]?.roleId ?? null;
  }

  // 팀원 삭제. 삭제했으면 true
  async removeMember(recruitmentId: string, userId: string, db: Queryable = this.database): Promise<boolean> {
    const r = await db.query(`DELETE FROM recruitment_members WHERE recruitment_id = $1 AND user_id = $2`, [
      recruitmentId,
      userId,
    ]);
    return (r.rowCount ?? 0) === 1;
  }

  async isMember(recruitmentId: string, userId: string, db: Queryable = this.database): Promise<boolean> {
    const r = await db.query(`SELECT 1 FROM recruitment_members WHERE recruitment_id = $1 AND user_id = $2`, [
      recruitmentId,
      userId,
    ]);
    return r.rows.length > 0;
  }

  async listMembers(recruitmentId: string, db: Queryable = this.database): Promise<MemberRow[]> {
    const r = await db.query<MemberRow>(
      `SELECT m.user_id AS "userId", u.name, u.status, m.role_id AS "roleId", ro.name AS "roleName"
       FROM recruitment_members m JOIN users u ON u.id = m.user_id JOIN roles ro ON ro.id = m.role_id
       WHERE m.recruitment_id = $1 ORDER BY m.confirmed_at, m.id`,
      [recruitmentId],
    );
    return r.rows;
  }

  // ===== 조회 =====

  async findDetailRow(id: string, db: Queryable = this.database): Promise<RecruitmentRow | null> {
    const r = await db.query<RecruitmentRow>(
      `SELECT r.id, r.title, r.description, r.status,
              to_char(r.start_date, 'YYYY-MM-DD') AS "startDate", to_char(r.end_date, 'YYYY-MM-DD') AS "endDate",
              r.open_chat_url AS "openChatUrl", r.team_chat_url AS "teamChatUrl", r.author_id AS "authorId", u.name AS "authorName", u.status AS "authorStatus",
              ${ISO('r.created_at')} AS "createdAt", ${ISO('r.updated_at')} AS "updatedAt"
       FROM recruitments r JOIN users u ON u.id = r.author_id
       WHERE r.id = $1 AND r.deleted_at IS NULL`,
      [id],
    );
    return r.rows[0] ?? null;
  }

  async findSkills(id: string, db: Queryable = this.database): Promise<{ required: SkillRef[]; preferred: SkillRef[] }> {
    const r = await db.query<{ id: number; name: string; required: boolean }>(
      `SELECT s.id, s.name, rs.required FROM recruitment_skills rs JOIN skills s ON s.id = rs.skill_id
       WHERE rs.recruitment_id = $1 ORDER BY s.name, s.id`,
      [id],
    );
    return {
      required: r.rows.filter((x) => x.required).map(({ id: i, name }) => ({ id: i, name })),
      preferred: r.rows.filter((x) => !x.required).map(({ id: i, name }) => ({ id: i, name })),
    };
  }

  async findInterests(id: string, db: Queryable = this.database): Promise<{ id: number; name: string }[]> {
    const r = await db.query<{ id: number; name: string }>(
      `SELECT i.id, i.name FROM recruitment_interests ri JOIN interest_areas i ON i.id = ri.interest_id
       WHERE ri.recruitment_id = $1 ORDER BY i.id`,
      [id],
    );
    return r.rows;
  }

  // 목록 검색: 전달된 조건만 WHERE 에 추가하는 동적 쿼리. 삭제된 글은 제외.
  // 값은 모두 바인딩 파라미터, 정렬 컬럼은 호출 측에서 허용 목록으로 검증된 값만 받는다.
  async search(
    f: RecruitmentFilter,
    paging: { limit: number; offset: number },
    sort: ResolvedSort,
    db: Queryable = this.database,
  ): Promise<{ items: RecruitmentListRow[]; total: number }> {
    const params: unknown[] = [];
    const bind = (v: unknown): string => {
      params.push(v);
      return `$${params.length}`;
    };

    const where: string[] = ['r.deleted_at IS NULL'];
    // 종료일이 지난 글(한국 시간 기준)도 마감으로 본다
    const today = `(now() AT TIME ZONE 'Asia/Seoul')::date`;
    if (f.status === 'OPEN') where.push(`r.status = 'OPEN' AND r.end_date >= ${today}`);
    if (f.status === 'DONE') where.push(`(r.status IN ('CLOSED', 'COMPLETED') OR r.end_date < ${today})`);
    if (f.authorId) where.push(`r.author_id = ${bind(f.authorId)}`);
    if (f.q) where.push(`r.title ILIKE ${bind('%' + escapeLike(f.q) + '%')} ESCAPE '\\'`);
    if (f.roleIds?.length) {
      where.push(
        `EXISTS (SELECT 1 FROM recruitment_roles x WHERE x.recruitment_id = r.id AND x.role_id = ANY(${bind(f.roleIds)}::smallint[]))`,
      );
    }
    if (f.skillIds?.length) {
      where.push(
        `EXISTS (SELECT 1 FROM recruitment_skills x WHERE x.recruitment_id = r.id AND x.skill_id = ANY(${bind(f.skillIds)}::int[]))`,
      );
    }
    if (f.interestIds?.length) {
      where.push(
        `EXISTS (SELECT 1 FROM recruitment_interests x WHERE x.recruitment_id = r.id AND x.interest_id = ANY(${bind(f.interestIds)}::smallint[]))`,
      );
    }

    const fromWhere = `FROM recruitments r JOIN users u ON u.id = r.author_id WHERE ${where.join(' AND ')}`;
    const filterParams = [...params];
    const limitPh = bind(paging.limit);
    const offsetPh = bind(paging.offset);

    const [rows, count] = await Promise.all([
      db.query<RecruitmentListRow>(
        `SELECT r.id, r.title, r.status, to_char(r.start_date, 'YYYY-MM-DD') AS "startDate",
                to_char(r.end_date, 'YYYY-MM-DD') AS "endDate", r.author_id AS "authorId", u.name AS "authorName",
                u.status AS "authorStatus", ${ISO('r.created_at')} AS "createdAt",
                COALESCE((SELECT json_agg(json_build_object('roleId', rr.role_id, 'roleName', ro.name,
                            'capacity', rr.capacity, 'confirmedCount', rr.confirmed_count) ORDER BY rr.role_id)
                          FROM recruitment_roles rr JOIN roles ro ON ro.id = rr.role_id
                          WHERE rr.recruitment_id = r.id), '[]'::json) AS roles
         ${fromWhere}
         ORDER BY ${sort.column} ${sort.direction === 'asc' ? 'ASC' : 'DESC'}, r.id
         LIMIT ${limitPh} OFFSET ${offsetPh}`,
        params,
      ),
      db.query<{ n: number }>(`SELECT count(*)::int AS n ${fromWhere}`, filterParams),
    ]);
    return { items: rows.rows, total: count.rows[0].n };
  }
}
