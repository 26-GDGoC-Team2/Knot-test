import { Injectable } from '@nestjs/common';
import { DatabaseService, Queryable } from '../../common/database.service';

@Injectable()
export class AdminRepository {
  constructor(private readonly database: DatabaseService) {}

  // 전체 멤버 목록 조회
  async findAllMembers() {
    const result = await this.database.query<{
      id: string;
      email: string;
      name: string;
      role: string;
      status: string;
      isGraduated: boolean;
      graduationCohort: number | null;
      created_at: Date;
    }>(
      // 수료 여부는 users.completed, 수료 기수는 users.graduation_cohort (둘 다 운영진이 지정)
      `SELECT id, email, name, role, status, completed AS "isGraduated",
              graduation_cohort AS "graduationCohort", created_at
       FROM users
       WHERE status != 'WITHDRAWN'
       ORDER BY created_at DESC`,
    );
    return result.rows;
  }

  // 특정 유저 조회 (탈퇴 회원 제외). 트랜잭션 안에서 쓰려면 db 로 tx 를 넘긴다
  async findMemberById(userId: string, db: Queryable = this.database) {
    const result = await db.query<{
      id: string;
      email: string;
      name: string;
      role: string;
      status: string;
    }>(
      `SELECT id, email, name, role, status
       FROM users
       WHERE id = $1 AND status != 'WITHDRAWN'`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  // 대상을 제외한 활성(ACTIVE) 운영진 수
  async countOtherActiveAdmins(excludeId: string, db: Queryable = this.database): Promise<number> {
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' AND id <> $1`,
      [excludeId],
    );
    return r.rows[0].n;
  }

  // 역할 변경
  async updateRole(userId: string, role: string, db: Queryable = this.database) {
    await db.query(
      `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`,
      [role, userId],
    );
  }

  // 역할 변경 이력 저장
  async insertRoleHistory(
    userId: string,
    changedBy: string,
    oldRole: string,
    newRole: string,
    reason: string,
    db: Queryable = this.database,
  ) {
    await db.query(
      `INSERT INTO role_histories (user_id, changed_by, old_role, new_role, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, changedBy, oldRole, newRole, reason],
    );
  }

  // 활성 가입 코드 교체: 기존 활성 코드를 끄고 새 코드를 활성으로 저장 (인증 모듈이 읽는 join_codes)
  async replaceActiveJoinCode(codeEnc: string, changedBy: string, db: Queryable = this.database) {
    await db.query(`UPDATE join_codes SET active = FALSE WHERE active`);
    await db.query(`INSERT INTO join_codes (code_enc, active, changed_by) VALUES ($1, TRUE, $2)`, [codeEnc, changedBy]);
  }

  // 가입 코드 이력 저장
  async insertJoinCodeHistory(
    codeHash: string,
    issuedBy: string,
    expiresAt: Date,
    db: Queryable = this.database,
  ) {
    await db.query(
      `INSERT INTO join_code_histories (code_hash, issued_by, expires_at)
       VALUES ($1, $2, $3)`,
      [codeHash, issuedBy, expiresAt],
    );
  }

  // 감사 로그 저장
  async insertAuditLog(
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    meta?: Record<string, unknown>,
    db: Queryable = this.database,
  ) {
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, meta)
       VALUES ($1, $2, $3, $4, $5)`,
      [actorId, action, targetType, targetId, meta ?? null],
    );
  }
    // 현재 가입 코드 조회
  async getJoinCode(): Promise<{ codeHash: string; expiresAt: Date; createdAt: Date } | null> {
    const result = await this.database.query<{
      code_hash: string;
      expires_at: Date;
      created_at: Date;
    }>(
      `SELECT code_hash, expires_at, created_at
         FROM join_code_histories
         ORDER BY created_at DESC
         LIMIT 1`,
    );
    if (!result.rows[0]) return null;
    return {
      codeHash: result.rows[0].code_hash,
      expiresAt: result.rows[0].expires_at,
      createdAt: result.rows[0].created_at,
    };
  }

  // 수료 여부 지정 (users.completed)
  // graduationCohort: undefined 면 기수는 그대로, null 이면 지움, 숫자면 저장
  async setGraduationStatus(
    userId: string,
    isGraduated: boolean,
    db: Queryable = this.database,
    graduationCohort?: number | null,
  ): Promise<void> {
    if (graduationCohort === undefined) {
      await db.query(`UPDATE users SET completed = $1, updated_at = NOW() WHERE id = $2`, [isGraduated, userId]);
      return;
    }
    await db.query(
      `UPDATE users SET completed = $1, graduation_cohort = $3, updated_at = NOW() WHERE id = $2`,
      [isGraduated, userId, graduationCohort],
    );
  }
}