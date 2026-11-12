// 실제 PostgreSQL 통합 테스트 (인증 + 회원 탈퇴 + 스키마 제약).
// 실행: TEST_DATABASE_URL=postgres://... npx jest src/integration.db.spec.ts
//  - TEST_DATABASE_URL 이 없으면 전체 건너뜀 (일반 npm test 에는 영향 없음)
//  - localhost 가 아닌 DB 에서는 실행을 거부함 (가짜 데이터 오염 방지)
//  - 운영진(ADMIN)이 없는 비어 있는 개발 DB 에서만 실행. 이 테스트가 만든 데이터는 끝나면 삭제함
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from './common/database.service';
import { encryptJoinCode } from './common/join-code-crypto';
import { AuthRepository } from './modules/auth/auth.repository';
import { AuthService } from './modules/auth/auth.service';
import { ApplicationRepository } from './modules/recruitment/application.repository';
import { RecruitmentRepository } from './modules/recruitment/recruitment.repository';
import { UserRepository } from './modules/users/user.repository';
import { UserService } from './modules/users/user.service';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

async function capture(p: Promise<unknown>): Promise<{ code?: string; status?: number; message?: string }> {
  try {
    await p;
  } catch (e) {
    return e as { code?: string; status?: number };
  }
  throw new Error('예외가 발생해야 합니다.');
}

suite('실제 DB 통합 테스트', () => {
  jest.setTimeout(60_000);

  const tag = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
  const sub = (n: string) => `it-${tag}-${n}`;
  const mail = (n: string) => `${sub(n)}@example.test`;
  const googleProfile = (n: string, email = mail(n)) => ({ sub: sub(n), email, name: `테스트${n}` });
  const KEY = randomBytes(32);
  const JOIN_CODE = `JC-${tag}`;
  const bossEmail = `boss-${tag}@example.test`;
  const saved = { ...process.env };

  let db: DatabaseService;
  let authService: AuthService;
  let userService: UserService;
  let roleId: number;
  let roleId2: number;
  const joinCodeIds: string[] = [];

  // ---------- 헬퍼 ----------
  const rows = async <T = any>(sql: string, params: unknown[] = []): Promise<T[]> => (await db.query(sql, params)).rows as T[];
  const one = async <T = any>(sql: string, params: unknown[] = []): Promise<T> => (await rows<T>(sql, params))[0];

  async function insertUser(n: string, role: 'MEMBER' | 'ADMIN' = 'MEMBER', verified = true): Promise<string> {
    const r = await one<{ id: string }>(
      `INSERT INTO users (google_sub, email, name, role, join_verified_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $5::boolean THEN now() ELSE NULL END) RETURNING id`,
      [sub(n), mail(n), `테스트${n}`, role, verified],
    );
    return r.id;
  }

  async function insertRecruitment(authorId: string, status: 'OPEN' | 'CLOSED' | 'COMPLETED' = 'OPEN'): Promise<string> {
    const r = await one<{ id: string }>(
      `INSERT INTO recruitments (author_id, title, description, start_date, end_date, open_chat_url, status)
       VALUES ($1, '테스트 모집', '소개', '2026-12-01', '2026-12-31', 'https://open.kakao.com/o/test', $2) RETURNING id`,
      [authorId, status],
    );
    await db.query(`INSERT INTO recruitment_roles (recruitment_id, role_id, capacity) VALUES ($1, $2, 3)`, [r.id, roleId]);
    return r.id;
  }

  async function insertApplication(
    recruitmentId: string,
    kind: 'APPLY' | 'PROPOSE',
    senderId: string,
    receiverId: string,
    status = 'PENDING',
    role: number = roleId,
  ): Promise<string> {
    const r = await one<{ id: string }>(
      `INSERT INTO applications (recruitment_id, role_id, kind, sender_id, receiver_id, message, status)
       VALUES ($1, $2, $3, $4, $5, '안녕하세요', $6) RETURNING id`,
      [recruitmentId, role, kind, senderId, receiverId, status],
    );
    return r.id;
  }

  const appStatus = async (id: string) => (await one<{ status: string; responded_at: Date | null }>(`SELECT status, responded_at FROM applications WHERE id = $1`, [id]));
  const userStatus = async (id: string) => one<{ status: string; withdrawn_at: Date | null }>(`SELECT status, withdrawn_at FROM users WHERE id = $1`, [id]);

  // ---------- 준비 / 정리 ----------
  beforeAll(async () => {
    const host = new URL(url!).hostname;
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
      throw new Error(`로컬 DB가 아니면 실행하지 않습니다: ${host}`);
    }
    Object.assign(process.env, {
      DATABASE_URL: url,
      JWT_ACCESS_SECRET: 'it-access-secret-0123456789-abcdefghijklmnop',
      JWT_REFRESH_SECRET: 'it-refresh-secret-9876543210-qrstuvwxyzabcd',
      JOIN_CODE_ENC_KEY: KEY.toString('base64'),
      FIRST_ADMIN_EMAIL: bossEmail,
    });
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    db = new DatabaseService();
    const authRepo = new AuthRepository(db);
    authService = new AuthService(authRepo, db, new JwtService({ secret: process.env.JWT_ACCESS_SECRET }));
    userService = new UserService(db, new UserRepository(db), new RecruitmentRepository(db), new ApplicationRepository(db), authRepo);

    // 운영진 수에 의존하는 테스트가 있어서 비어 있는 DB에서만 실행
    if (await one(`SELECT 1 FROM users WHERE role = 'ADMIN' LIMIT 1`)) {
      throw new Error('이미 ADMIN 회원이 있는 DB입니다. 비어 있는 개발 DB에서만 실행하세요.');
    }
    if (await one(`SELECT 1 FROM join_codes WHERE active LIMIT 1`)) {
      throw new Error('이미 활성 가입 코드가 있는 DB입니다. 비어 있는 개발 DB에서만 실행하세요.');
    }
    roleId = (await one<{ id: number }>(`INSERT INTO roles (name) VALUES ($1) RETURNING id`, [`IT-ROLE-${tag}`])).id;
    roleId2 = (await one<{ id: number }>(`INSERT INTO roles (name) VALUES ($1) RETURNING id`, [`IT-ROLE2-${tag}`])).id;
  });

  afterAll(async () => {
    if (!db) return;
    const mine = `SELECT id FROM users WHERE google_sub LIKE 'it-${tag}-%'`;
    await db.query(`DELETE FROM applications WHERE sender_id IN (${mine}) OR receiver_id IN (${mine})`);
    await db.query(`DELETE FROM recruitment_members WHERE user_id IN (${mine})`);
    await db.query(`DELETE FROM recruitment_roles WHERE recruitment_id IN (SELECT id FROM recruitments WHERE author_id IN (${mine}))`);
    await db.query(`DELETE FROM recruitments WHERE author_id IN (${mine})`);
    await db.query(`DELETE FROM refresh_tokens WHERE user_id IN (${mine})`);
    await db.query(`DELETE FROM users WHERE google_sub LIKE 'it-${tag}-%'`);
    if (joinCodeIds.length) await db.query(`DELETE FROM join_codes WHERE id = ANY($1::uuid[])`, [joinCodeIds]);
    await db.query(`DELETE FROM roles WHERE id = ANY($1::int[])`, [[roleId, roleId2].filter(Boolean)]);
    await db.onModuleDestroy();
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  // ================= 인증 =================
  describe('로그인 / 가입', () => {
    it('신규 회원 생성: MEMBER, 가입 코드 미인증, 이메일 소문자', async () => {
      await authService.loginWithGoogle(googleProfile('a1', `UPPER-${mail('a1')}`.toLowerCase()));
      const u = await one(`SELECT role, status, join_verified_at, email FROM users WHERE google_sub = $1`, [sub('a1')]);
      expect(u).toMatchObject({ role: 'MEMBER', status: 'ACTIVE', join_verified_at: null });
      expect(u.email).toBe(u.email.toLowerCase());
    });

    it('같은 계정이 동시에 10번 로그인해도 회원은 1명만 생성되고 모두 성공', async () => {
      const results = await Promise.allSettled(Array.from({ length: 10 }, () => authService.loginWithGoogle(googleProfile('race'))));
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      expect((await one(`SELECT count(*)::int n FROM users WHERE google_sub = $1`, [sub('race')])).n).toBe(1);
      expect((await one(`SELECT count(*)::int n FROM refresh_tokens WHERE user_id = (SELECT id FROM users WHERE google_sub = $1)`, [sub('race')])).n).toBe(10);
    });

    it('다른 구글 계정이 같은 이메일로 가입하면 409', async () => {
      await authService.loginWithGoogle(googleProfile('dup1', mail('dupshared')));
      const e = await capture(authService.loginWithGoogle(googleProfile('dup2', mail('dupshared'))));
      expect(e.status).toBe(409);
      expect((await one(`SELECT count(*)::int n FROM users WHERE google_sub = $1`, [sub('dup2')])).n).toBe(0);
    });

    it('최초 운영진 이메일로 첫 가입하면 ADMIN + 가입 코드 인증 처리, 이후 같은 이메일 계정은 못 만든다', async () => {
      await authService.loginWithGoogle({ sub: sub('boss'), email: bossEmail, name: '운영진' });
      expect(await one(`SELECT role, join_verified_at IS NOT NULL AS verified FROM users WHERE google_sub = $1`, [sub('boss')])).toEqual({ role: 'ADMIN', verified: true });
      expect((await capture(authService.loginWithGoogle({ sub: sub('boss2'), email: bossEmail, name: 'x' }))).status).toBe(409);
    });

    it('운영진이 이미 있으면 다른 회원은 ADMIN이 되지 않는다', async () => {
      await authService.loginWithGoogle(googleProfile('normal'));
      expect((await one(`SELECT role FROM users WHERE google_sub = $1`, [sub('normal')])).role).toBe('MEMBER');
    });
  });

  describe('Refresh 토큰', () => {
    it('회전: 새 토큰 발급, 기존 토큰 폐기, 폐기된 토큰 재사용 시 해당 사용자의 모든 토큰 폐기', async () => {
      const { refresh: first } = await authService.loginWithGoogle(googleProfile('rt'));
      const second = await authService.refresh(first.token);
      expect(second.refresh.token).not.toBe(first.token);

      const userId = (await one(`SELECT id FROM users WHERE google_sub = $1`, [sub('rt')])).id;
      expect((await one(`SELECT count(*)::int n FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL`, [userId])).n).toBe(1);

      expect((await capture(authService.refresh(first.token))).status).toBe(401); // 재사용
      expect((await one(`SELECT count(*)::int n FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL`, [userId])).n).toBe(0);
      expect((await capture(authService.refresh(second.refresh.token))).status).toBe(401); // 정상 토큰도 이제 무효
    });

    it('같은 토큰으로 동시에 갱신하면 하나만 성공한다', async () => {
      const { refresh } = await authService.loginWithGoogle(googleProfile('rtrace'));
      const results = await Promise.allSettled(Array.from({ length: 5 }, () => authService.refresh(refresh.token)));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });

    it('DB에는 원문이 저장되지 않는다', async () => {
      const { refresh } = await authService.loginWithGoogle(googleProfile('rthash'));
      const stored = await rows(`SELECT token_hash FROM refresh_tokens WHERE token_hash = $1`, [refresh.token]);
      expect(stored).toHaveLength(0);
    });
  });

  describe('가입 코드', () => {
    let userId: string;
    beforeAll(async () => {
      await authService.loginWithGoogle(googleProfile('jc'));
      userId = (await one(`SELECT id FROM users WHERE google_sub = $1`, [sub('jc')])).id;
    });

    it('코드가 아직 설정되지 않았으면 불일치와 같은 400', async () => {
      const e = await capture(authService.verifyJoinCode(userId, JOIN_CODE));
      expect(e.code).toBe('JOIN_CODE_MISMATCH');
    });

    it('틀린 코드는 400이고 인증 시각이 기록되지 않는다', async () => {
      const ins = await one<{ id: string }>(`INSERT INTO join_codes (code_enc, active) VALUES ($1, TRUE) RETURNING id`, [encryptJoinCode(JOIN_CODE, KEY)]);
      joinCodeIds.push(ins.id);
      expect((await capture(authService.verifyJoinCode(userId, 'WRONG'))).code).toBe('JOIN_CODE_MISMATCH');
      expect((await one(`SELECT join_verified_at FROM users WHERE id = $1`, [userId])).join_verified_at).toBeNull();
    });

    it('맞는 코드는 인증 시각을 1회만 기록하고, 이미 인증된 후에는 시각이 바뀌지 않는다', async () => {
      const res = await authService.verifyJoinCode(userId, JOIN_CODE);
      expect(res.nextStep).toBe('PROFILE');
      const t1 = (await one(`SELECT join_verified_at FROM users WHERE id = $1`, [userId])).join_verified_at;
      expect(t1).not.toBeNull();
      await authService.verifyJoinCode(userId, 'ANYTHING');
      expect((await one(`SELECT join_verified_at FROM users WHERE id = $1`, [userId])).join_verified_at).toEqual(t1);
    });

    it('활성 가입 코드는 DB 제약으로 항상 1개', async () => {
      await expect(db.query(`INSERT INTO join_codes (code_enc, active) VALUES ('x', TRUE)`)).rejects.toMatchObject({ code: '23505' });
    });
  });

  // ================= 회원 탈퇴 =================
  describe('회원 탈퇴', () => {
    it('모집글 완료, 대기 지원/제안 취소, 토큰 폐기. 행은 보존되고 무관한 데이터는 그대로', async () => {
      const m = await insertUser('wm'); // 탈퇴할 회원
      const o = await insertUser('wo');
      const p = await insertUser('wp');
      const r1 = await insertRecruitment(m, 'OPEN'); // 완료 처리 대상
      const r2 = await insertRecruitment(m, 'CLOSED'); // 변경 없음
      const r3 = await insertRecruitment(o, 'OPEN'); // 남의 모집글

      const a1 = await insertApplication(r1, 'APPLY', o, m); // m의 글에 대한 받은 지원
      const a2 = await insertApplication(r3, 'APPLY', m, o); // m이 보낸 지원
      const a3 = await insertApplication(r3, 'PROPOSE', o, m); // m이 받은 제안
      const a4 = await insertApplication(r3, 'APPLY', m, o, 'ACCEPTED'); // 이미 수락됨 -> 유지
      const a5 = await insertApplication(r3, 'APPLY', p, o); // m과 무관 -> 유지
      const a6 = await insertApplication(r1, 'APPLY', p, o); // m의 글인데 수신자가 다름 -> 취소
      const mToken = (await authService.loginWithGoogle({ sub: sub('wm'), email: mail('wm'), name: 'x' })).refresh.token;
      const oToken = (await authService.loginWithGoogle({ sub: sub('wo'), email: mail('wo'), name: 'x' })).refresh.token;

      const result = await userService.withdraw(m);

      expect(result).toEqual({ completedRecruitments: 1, canceledApplications: 4 });
      expect(await userStatus(m)).toMatchObject({ status: 'WITHDRAWN' });
      expect((await userStatus(m)).withdrawn_at).not.toBeNull();
      expect((await one(`SELECT count(*)::int n FROM users WHERE id = $1`, [m])).n).toBe(1); // 삭제되지 않음

      expect((await one(`SELECT status FROM recruitments WHERE id = $1`, [r1])).status).toBe('COMPLETED');
      expect((await one(`SELECT status FROM recruitments WHERE id = $1`, [r2])).status).toBe('CLOSED');
      expect((await one(`SELECT status FROM recruitments WHERE id = $1`, [r3])).status).toBe('OPEN');

      for (const id of [a1, a2, a3, a6]) {
        const s = await appStatus(id);
        expect(s.status).toBe('CANCELED');
        expect(s.responded_at).not.toBeNull();
      }
      expect((await appStatus(a4)).status).toBe('ACCEPTED');
      expect((await appStatus(a5)).status).toBe('PENDING');

      expect((await one(`SELECT count(*)::int n FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL`, [m])).n).toBe(0);
      expect((await capture(authService.refresh(mToken))).status).toBe(401);
      expect((await authService.refresh(oToken)).refresh.token).toBeTruthy(); // 다른 회원은 영향 없음

      // 탈퇴 후 로그인은 거부
      expect((await capture(authService.loginWithGoogle({ sub: sub('wm'), email: mail('wm'), name: 'x' }))).status).toBe(403);
      // 두 번 탈퇴 불가
      expect((await capture(userService.withdraw(m))).status).toBe(401);
    });

    it('이미 삭제된(deleted_at) 모집글은 탈퇴 시 완료 처리 대상에서 제외', async () => {
      const m = await insertUser('wdel');
      const live = await insertRecruitment(m, 'OPEN');
      const deleted = await insertRecruitment(m, 'OPEN');
      await db.query(`UPDATE recruitments SET deleted_at = now() WHERE id = $1`, [deleted]);

      const result = await userService.withdraw(m);

      expect(result.completedRecruitments).toBe(1);
      expect((await one(`SELECT status FROM recruitments WHERE id = $1`, [live])).status).toBe('COMPLETED');
      expect((await one(`SELECT status FROM recruitments WHERE id = $1`, [deleted])).status).toBe('OPEN');
    });

    it('마지막 운영진은 탈퇴할 수 없고 아무것도 바뀌지 않는다', async () => {
      const admin = await insertUser('lastadmin', 'ADMIN');
      // 이 테스트 시점에 ACTIVE 운영진은 boss(최초 운영진)와 lastadmin 둘 -> boss를 임시로 비활성화해 1명 상황을 만든다
      await db.query(`UPDATE users SET status = 'WITHDRAWN' WHERE google_sub = $1`, [sub('boss')]);
      const rec = await insertRecruitment(admin, 'OPEN');

      const e = await capture(userService.withdraw(admin));
      expect(e.status).toBe(403);
      expect(e.code).toBe('LAST_ADMIN');
      expect((await userStatus(admin)).status).toBe('ACTIVE');
      expect((await one(`SELECT status FROM recruitments WHERE id = $1`, [rec])).status).toBe('OPEN'); // 롤백 확인

      await db.query(`UPDATE users SET status = 'WITHDRAWN' WHERE id = $1`, [admin]);
    });

    it('운영진 2명이 동시에 탈퇴하면 정확히 한 명만 성공한다 (5회 반복)', async () => {
      for (let round = 0; round < 5; round++) {
        // 이전 회차 생존자를 정리해서 ACTIVE 운영진을 정확히 2명으로 맞춘다
        await db.query(`UPDATE users SET status = 'WITHDRAWN' WHERE role = 'ADMIN' AND google_sub LIKE 'it-${tag}-%'`);
        const a = await insertUser(`dualA${round}`, 'ADMIN');
        const b = await insertUser(`dualB${round}`, 'ADMIN');

        const results = await Promise.allSettled([userService.withdraw(a), userService.withdraw(b)]);

        const ok = results.filter((r) => r.status === 'fulfilled');
        const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
        expect(ok).toHaveLength(1);
        expect(failed).toHaveLength(1);
        expect(failed[0].reason.code).toBe('LAST_ADMIN');
        expect((await one(`SELECT count(*)::int n FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' AND id IN ($1, $2)`, [a, b])).n).toBe(1);
      }
    });

    it('운영진이 2명 이상이면 운영진도 탈퇴할 수 있다', async () => {
      await db.query(`UPDATE users SET status = 'WITHDRAWN' WHERE role = 'ADMIN' AND google_sub LIKE 'it-${tag}-%'`);
      const a = await insertUser('twoA', 'ADMIN');
      await insertUser('twoB', 'ADMIN');
      await expect(userService.withdraw(a)).resolves.toBeDefined();
      expect((await userStatus(a)).status).toBe('WITHDRAWN');
    });
  });

  // ================= 스키마 제약 =================
  describe('스키마 제약 조건', () => {
    let author: string, applicant: string, rec: string;
    beforeAll(async () => {
      author = await insertUser('cauthor');
      applicant = await insertUser('capplicant');
      rec = await insertRecruitment(author);
    });

    it('자기 자신에게 지원/제안 불가 (chk_not_self)', async () => {
      await expect(insertApplication(rec, 'APPLY', applicant, applicant)).rejects.toMatchObject({ code: '23514' });
    });

    it('메시지는 DB에서 200자까지만 허용 (실제 50자 제한은 서비스 설정값으로 검사). 이모지도 1글자로 센다', async () => {
      const ins = (msg: string) =>
        db.query(`INSERT INTO applications (recruitment_id, role_id, kind, sender_id, receiver_id, message) VALUES ($1,$2,'PROPOSE',$3,$4,$5)`, [rec, roleId, author, applicant, msg]);
      await expect(ins('가'.repeat(201))).rejects.toMatchObject({ code: '23514' });
      await expect(ins('😀'.repeat(200))).resolves.toBeDefined();
      await db.query(`DELETE FROM applications WHERE recruitment_id = $1`, [rec]);
    });

    it('대기 중인 지원은 모집글당 1건: 같은 글의 다른 역할에도 중복 지원 불가, 거절 후에는 재지원 가능', async () => {
      const first = await insertApplication(rec, 'APPLY', applicant, author);
      await expect(insertApplication(rec, 'APPLY', applicant, author)).rejects.toMatchObject({ code: '23505' });
      await expect(insertApplication(rec, 'APPLY', applicant, author, 'PENDING', roleId2)).rejects.toMatchObject({ code: '23505' });
      await db.query(`UPDATE applications SET status = 'REJECTED', reject_reason = 'MANUAL' WHERE id = $1`, [first]);
      await expect(insertApplication(rec, 'APPLY', applicant, author)).resolves.toBeDefined();
      await db.query(`DELETE FROM applications WHERE recruitment_id = $1`, [rec]);
    });

    it('제안: 같은 사람에게 대기 중인 중복 제안은 불가, 작성자는 여러 명에게 제안 가능', async () => {
      const other = await insertUser('cother');
      await insertApplication(rec, 'PROPOSE', author, applicant);
      await expect(insertApplication(rec, 'PROPOSE', author, applicant, 'PENDING', roleId2)).rejects.toMatchObject({ code: '23505' });
      await expect(insertApplication(rec, 'PROPOSE', author, other)).resolves.toBeDefined();
      await db.query(`DELETE FROM applications WHERE recruitment_id = $1`, [rec]);
    });

    it('확정 인원이 정원을 넘을 수 없다 (chk_capacity)', async () => {
      await expect(db.query(`UPDATE recruitment_roles SET confirmed_count = 4 WHERE recruitment_id = $1`, [rec])).rejects.toMatchObject({ code: '23514' });
    });

    it('한 모집글에 같은 회원은 한 번만 확정된다', async () => {
      await db.query(`INSERT INTO recruitment_members (recruitment_id, role_id, user_id) VALUES ($1,$2,$3)`, [rec, roleId, applicant]);
      await expect(db.query(`INSERT INTO recruitment_members (recruitment_id, role_id, user_id) VALUES ($1,$2,$3)`, [rec, roleId, applicant])).rejects.toMatchObject({ code: '23505' });
    });

    it('이메일과 구글 식별자는 유일하다', async () => {
      await expect(db.query(`INSERT INTO users (google_sub, email, name) VALUES ($1, $2, 'x')`, [sub('uniq-new'), mail('cauthor')])).rejects.toMatchObject({ code: '23505' });
      await expect(db.query(`INSERT INTO users (google_sub, email, name) VALUES ($1, $2, 'x')`, [sub('cauthor'), mail('uniq-new2')])).rejects.toMatchObject({ code: '23505' });
    });

    it('소프트 삭제된 모집글은 인덱스 조건에서 제외되고, 지원 이력은 보존된다', async () => {
      const deletedRec = await insertRecruitment(author, 'OPEN');
      const appId = await insertApplication(deletedRec, 'APPLY', applicant, author);
      await db.query(`UPDATE recruitments SET deleted_at = now() WHERE id = $1`, [deletedRec]);
      expect((await one(`SELECT count(*)::int n FROM applications WHERE id = $1`, [appId])).n).toBe(1);
      await db.query(`DELETE FROM applications WHERE id = $1`, [appId]);
    });

    it('시드 데이터: 역할 4개, 기술 58개, 관심 분야 21개가 들어 있고 기술 정규화 규칙(소문자·공백 제거)을 따른다', async () => {
      // 다른 통합 테스트 파일이 병렬로 만든 임시 데이터(IT-/PF-/RC- 접두어)는 제외하고 시드만 비교
      const roles = await rows<{ name: string }>(
        `SELECT name FROM roles WHERE name NOT LIKE 'IT-ROLE%' AND name NOT LIKE 'PF-ROLE%' AND name NOT LIKE 'RC-ROLE%' ORDER BY id`,
      );
      expect(roles.map((r) => r.name)).toEqual(['기획', '디자인', 'FE', 'BE']);
      expect(
        (await one(`SELECT count(*)::int n FROM skills WHERE is_custom = FALSE AND name NOT LIKE 'pf-skill-%' AND name NOT LIKE 'rc-skill-%'`)).n,
      ).toBe(58); // 마이그레이션 0018 에서 58개로 교체
      expect(
        (await one(`SELECT count(*)::int n FROM interest_areas WHERE name NOT LIKE 'PF-INT-%' AND name NOT LIKE 'RC-INT-%'`)).n,
      ).toBe(21); // 마이그레이션 0018 에서 21개로 교체
      expect((await one(`SELECT name_norm FROM skills WHERE name = 'Next.js'`)).name_norm).toBe('next.js');
      // React 와 react 는 같은 기술로 취급되어 중복 추가 불가
      await expect(db.query(`INSERT INTO skills (name, name_norm, is_custom) VALUES ('react', 'react', TRUE)`)).rejects.toMatchObject({ code: '23505' });
    });

    it('한글 이름이 깨지지 않고 저장된다 (UTF8)', async () => {
      const id = await insertUser('korean');
      await db.query(`UPDATE users SET name = '가나다 홍길동 😀' WHERE id = $1`, [id]);
      expect((await one(`SELECT name FROM users WHERE id = $1`, [id])).name).toBe('가나다 홍길동 😀');
    });
  });
});
