// users 테이블 SQL (탈퇴 관련). 모든 메서드는 트랜잭션 client(db)를 받을 수 있다.
import { Injectable } from '@nestjs/common';
import { DatabaseService, Queryable } from '../../common/database.service';
import type { UserRole } from '../../common/role-guard';

export interface WithdrawalTarget {
  id: string;
  role: UserRole;
  status: 'ACTIVE' | 'WITHDRAWN';
}

@Injectable()
export class UserRepository {
  constructor(private readonly database: DatabaseService) {}

  // 탈퇴 대상 행을 잠그고 조회 (같은 회원의 중복 탈퇴 요청 방지)
  async findForWithdrawal(id: string, db: Queryable = this.database): Promise<WithdrawalTarget | null> {
    const r = await db.query<WithdrawalTarget>(`SELECT id, role, status FROM users WHERE id = $1 FOR UPDATE`, [id]);
    return r.rows[0] ?? null;
  }

  // 본인을 제외한 활성(ACTIVE) 운영진 수
  async countOtherActiveAdmins(excludeId: string, db: Queryable = this.database): Promise<number> {
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' AND id <> $1`,
      [excludeId],
    );
    return r.rows[0].n;
  }

  // 프로필(소개/GitHub), 희망 역할, 기술, 관심 분야, 프로젝트 경험을 삭제한다.
  // 모집글/활동 이력이 참조하는 users 행은 남기고(아래 markWithdrawn), 개인정보만 지운다.
  async erasePersonalData(id: string, db: Queryable = this.database): Promise<void> {
    await db.query(`DELETE FROM profile_roles WHERE user_id = $1`, [id]);
    await db.query(`DELETE FROM profile_skills WHERE user_id = $1`, [id]);
    await db.query(`DELETE FROM profile_interests WHERE user_id = $1`, [id]);
    await db.query(`DELETE FROM project_experiences WHERE user_id = $1`, [id]); // 경험별 기술은 CASCADE
    await db.query(`DELETE FROM profiles WHERE user_id = $1`, [id]);
  }

  // 행은 삭제하지 않고 탈퇴 상태로 변경하며 이름/이메일을 지운다. 이미 탈퇴했으면 false
  // google_sub 는 재가입 차단(로그인 시 탈퇴 회원 거부)에 쓰이므로 유지한다
  async markWithdrawn(id: string, db: Queryable = this.database): Promise<boolean> {
    const r = await db.query(
      `UPDATE users SET status = 'WITHDRAWN', withdrawn_at = now(), updated_at = now(),
              name = '탈퇴한 회원', email = 'withdrawn-' || id::text || '@withdrawn.invalid'
       WHERE id = $1 AND status = 'ACTIVE'`,
      [id],
    );
    return (r.rowCount ?? 0) === 1;
  }
    // 수료 기수 조회
  async getGraduationCohort(userId: string): Promise<number | null> {
    const r = await this.database.query<{ graduation_cohort: number | null }>(
      `SELECT graduation_cohort FROM users WHERE id = $1`,
      [userId]
    );
    return r.rows[0]?.graduation_cohort ?? null;
  }
}
