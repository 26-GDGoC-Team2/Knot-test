// 인증 관련 SQL만 담당한다. join_codes는 읽기 전용 (쓰기는 운영진 모듈).
// 모든 메서드는 트랜잭션 client(db)를 받을 수 있고, 생략하면 풀을 사용한다.
import { Injectable } from '@nestjs/common';
import { DatabaseService, Queryable } from '../../common/database.service';
import type { UserRole } from '../../common/role-guard';

export interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  name: string;
  role: UserRole;
  status: 'ACTIVE' | 'WITHDRAWN';
  completed: boolean;
  join_verified_at: Date | null;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

const USER_COLUMNS = 'id, google_sub, email, name, role, status, completed, join_verified_at';

@Injectable()
export class AuthRepository {
  constructor(private readonly database: DatabaseService) {}

  async findUserByGoogleSub(googleSub: string, db: Queryable = this.database): Promise<UserRow | null> {
    const r = await db.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE google_sub = $1`, [googleSub]);
    return r.rows[0] ?? null;
  }

  async findUserById(id: string, db: Queryable = this.database): Promise<UserRow | null> {
    const r = await db.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
    return r.rows[0] ?? null;
  }

  // 최초 운영진 판정이 동시에 두 번 일어나지 않도록 트랜잭션 단위 잠금
  async lockFirstAdminAssignment(db: Queryable): Promise<void> {
    await db.query(`SELECT pg_advisory_xact_lock(hashtext('knot:first-admin'))`);
  }

  async existsAdmin(db: Queryable = this.database): Promise<boolean> {
    const r = await db.query(`SELECT 1 FROM users WHERE role = 'ADMIN' LIMIT 1`);
    return (r.rowCount ?? 0) > 0;
  }

  async insertUser(
    u: { googleSub: string; email: string; name: string; role: UserRole; joinVerified: boolean },
    db: Queryable = this.database,
  ): Promise<UserRow> {
    const r = await db.query<UserRow>(
      `INSERT INTO users (google_sub, email, name, role, join_verified_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $5::boolean THEN now() ELSE NULL END)
       RETURNING ${USER_COLUMNS}`,
      [u.googleSub, u.email, u.name, u.role, u.joinVerified],
    );
    return r.rows[0];
  }

  // 탈퇴 회원 재가입: 같은 행을 ACTIVE로 되살리고 이름·이메일을 구글 정보로 복구한다.
  // 권한은 MEMBER로, 가입 코드 인증은 비워서 다시 입력하게 한다 (탈퇴자가 코드·운영진 권한 없이 복귀하는 것을 막음).
  // 조건부 UPDATE라 동시에 두 번 요청돼도 한 번만 반영되고, 이미 되살아났으면 null을 돌려준다
  async reactivateUser(
    id: string,
    u: { email: string; name: string },
    db: Queryable = this.database,
  ): Promise<UserRow | null> {
    const r = await db.query<UserRow>(
      `UPDATE users
          SET status = 'ACTIVE', withdrawn_at = NULL, role = 'MEMBER', join_verified_at = NULL,
              email = $2, name = $3, updated_at = now()
        WHERE id = $1 AND status = 'WITHDRAWN'
        RETURNING ${USER_COLUMNS}`,
      [id, u.email, u.name],
    );
    return r.rows[0] ?? null;
  }

  // 가입 코드 인증 시각을 1회만 기록. 이미 인증된 경우 false
  async markJoinVerified(userId: string, db: Queryable = this.database): Promise<boolean> {
    const r = await db.query(
      `UPDATE users SET join_verified_at = now(), updated_at = now()
       WHERE id = $1 AND join_verified_at IS NULL`,
      [userId],
    );
    return (r.rowCount ?? 0) === 1;
  }

  async hasProfile(userId: string, db: Queryable = this.database): Promise<boolean> {
    const r = await db.query(`SELECT 1 FROM profiles WHERE user_id = $1`, [userId]);
    return (r.rowCount ?? 0) > 0;
  }

  // 현재 유효한 가입 코드의 암호문 (없으면 null)
  async findActiveJoinCodeEnc(db: Queryable = this.database): Promise<string | null> {
    const r = await db.query<{ code_enc: string }>(`SELECT code_enc FROM join_codes WHERE active = TRUE LIMIT 1`);
    return r.rows[0]?.code_enc ?? null;
  }

  async insertRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    db: Queryable = this.database,
  ): Promise<void> {
    await db.query(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`, [
      userId,
      tokenHash,
      expiresAt,
    ]);
  }

  async findRefreshTokenByHash(tokenHash: string, db: Queryable = this.database): Promise<RefreshTokenRow | null> {
    const r = await db.query<RefreshTokenRow>(
      `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1`,
      [tokenHash],
    );
    return r.rows[0] ?? null;
  }

  // 아직 폐기되지 않은 토큰만 폐기. 성공 여부 반환 (동시 재발급 방어)
  async revokeRefreshToken(id: string, db: Queryable = this.database): Promise<boolean> {
    const r = await db.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [id]);
    return (r.rowCount ?? 0) === 1;
  }

  async revokeRefreshTokenByHash(userId: string, tokenHash: string, db: Queryable = this.database): Promise<void> {
    await db.query(
      `UPDATE refresh_tokens SET revoked_at = now()
       WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL`,
      [userId, tokenHash],
    );
  }

  async revokeAllRefreshTokens(userId: string, db: Queryable = this.database): Promise<void> {
    await db.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
  }
}
