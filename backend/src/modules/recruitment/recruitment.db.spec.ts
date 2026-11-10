// 모집/지원 모듈 실제 PostgreSQL 통합 테스트 (정원 동시성, 자동 마감, 일괄 거절, 권한).
// 실행: TEST_DATABASE_URL=postgres://... npx jest src/modules/recruitment/recruitment.db.spec.ts
//  - TEST_DATABASE_URL 이 없으면 건너뜀, localhost 가 아니면 거부
//  - 이 테스트가 만든 데이터는 끝나면 모두 삭제
import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { DatabaseService } from '../../common/database.service';
import { ApplicationRepository } from './application.repository';
import { ApplicationService } from './application.service';
import {
  ApplicationListQuery,
  ApplyDto,
  CreateRecruitmentDto,
  ProposeDto,
  RecruitmentListQuery,
  UpdateRecruitmentDto,
} from './recruitment.dto';
import { RecruitmentRepository } from './recruitment.repository';
import { RecruitmentService } from './recruitment.service';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

async function capture(p: Promise<unknown>): Promise<{ code?: string; message?: string }> {
  try {
    await p;
  } catch (e) {
    return e as { code?: string };
  }
  throw new Error('예외가 발생해야 합니다.');
}

suite('모집/지원 모듈 실제 DB 통합 테스트', () => {
  jest.setTimeout(90_000);

  const tag = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
  const sub = (n: string) => `rc-${tag}-${n}`;
  let db: DatabaseService;
  let rs: RecruitmentService;
  let as: ApplicationService;
  let roleA: number;
  let roleB: number;
  let skillX: number;
  let skillY: number;
  let interestP: number;

  const rows = async <T = any>(sql: string, params: unknown[] = []): Promise<T[]> => (await db.query(sql, params)).rows as T[];
  const one = async <T = any>(sql: string, params: unknown[] = []): Promise<T> => (await rows<T>(sql, params))[0];
  const newUser = async (n: string, role: 'MEMBER' | 'ADMIN' = 'MEMBER') =>
    (await one<{ id: string }>(
      `INSERT INTO users (google_sub, email, name, role, join_verified_at) VALUES ($1, $2, $3, $4, now()) RETURNING id`,
      [sub(n), `${sub(n)}@example.test`, `${tag}회원${n}`, role],
    )).id;

  // 모집글 생성 헬퍼: 기본은 A 역할 2명(작성자 포함) + B 역할 1명
  const mk = (authorId: string, o: Record<string, unknown> = {}) =>
    rs.create(
      authorId,
      plainToInstance(CreateRecruitmentDto, {
        title: `${tag} 모집`,
        description: '같이 해요',
        startDate: '2026-12-01',
        endDate: '2026-12-31',
        openChatUrl: 'https://open.kakao.com/o/test',
        teamChatUrl: 'https://open.kakao.com/o/team',
        roles: [{ roleId: roleA, capacity: 2 }, { roleId: roleB, capacity: 1 }],
        authorRoleId: roleA,
        ...o,
      }),
    );
  const upd = (actor: string, id: string, o: Record<string, unknown> = {}) =>
    rs.update(
      actor,
      id,
      plainToInstance(UpdateRecruitmentDto, {
        title: `${tag} 수정`, description: '수정됨', startDate: '2026-12-01', endDate: '2026-12-31',
        openChatUrl: 'https://open.kakao.com/o/test',
        teamChatUrl: 'https://open.kakao.com/o/team', roles: [{ roleId: roleA, capacity: 2 }, { roleId: roleB, capacity: 1 }], ...o,
      }),
    );
  const apply = (actor: string, recId: string, roleId: number, message?: string) =>
    as.apply(actor, recId, plainToInstance(ApplyDto, { roleId, message }));
  const propose = (actor: string, recId: string, target: string, roleId: number) =>
    as.propose(actor, recId, plainToInstance(ProposeDto, { roleId, targetUserId: target }));
  const recStatus = async (id: string) => (await one(`SELECT status, deleted_at FROM recruitments WHERE id = $1`, [id]));
  const appStatus = async (id: string) => (await one(`SELECT status FROM applications WHERE id = $1`, [id])).status as string;
  const slot = async (recId: string, roleId: number) =>
    one<{ capacity: number; confirmed_count: number }>(`SELECT capacity, confirmed_count FROM recruitment_roles WHERE recruitment_id = $1 AND role_id = $2`, [recId, roleId]);
  const memberCount = async (recId: string) => (await one(`SELECT count(*)::int AS n FROM recruitment_members WHERE recruitment_id = $1`, [recId])).n as number;

  beforeAll(async () => {
    const host = new URL(url!).hostname;
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error(`로컬 DB가 아니면 실행하지 않습니다: ${host}`);
    process.env.DATABASE_URL = url;
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    db = new DatabaseService();
    const recRepo = new RecruitmentRepository(db);
    const appRepo = new ApplicationRepository(db);
    rs = new RecruitmentService(db, recRepo, appRepo);
    as = new ApplicationService(db, recRepo, appRepo, rs);
    const ins = async (table: string, name: string) =>
      (await one<{ id: number }>(`INSERT INTO ${table} (name) VALUES ($1) RETURNING id`, [name])).id;
    roleA = await ins('roles', `RC-ROLE-A-${tag}`);
    roleB = await ins('roles', `RC-ROLE-B-${tag}`);
    interestP = await ins('interest_areas', `RC-INT-P-${tag}`);
    const sk = async (n: string) =>
      (await one<{ id: number }>(`INSERT INTO skills (name, name_norm, is_custom) VALUES ($1, $1, FALSE) RETURNING id`, [`rc-skill-${n}-${tag}`])).id;
    skillX = await sk('x');
    skillY = await sk('y');
  });

  afterAll(async () => {
    if (!db) return;
    const mine = `SELECT id FROM users WHERE google_sub LIKE 'rc-${tag}-%'`;
    await db.query(`DELETE FROM applications WHERE sender_id IN (${mine}) OR receiver_id IN (${mine})`);
    await db.query(`DELETE FROM recruitment_members WHERE user_id IN (${mine})`);
    await db.query(`DELETE FROM recruitments WHERE author_id IN (${mine})`); // 역할/기술/관심 분야는 CASCADE
    await db.query(`DELETE FROM users WHERE id IN (${mine})`);
    await db.query(`DELETE FROM skills WHERE name LIKE 'rc-skill-%-${tag}'`);
    await db.query(`DELETE FROM interest_areas WHERE name LIKE 'RC-INT-%-${tag}'`);
    await db.query(`DELETE FROM roles WHERE name LIKE 'RC-ROLE-%-${tag}'`);
    await db.onModuleDestroy();
  });

  describe('작성', () => {
    it('작성자는 선택한 역할의 확정 인원 1명으로 시작 (4명 모집이면 1/4)', async () => {
      const author = await newUser('c1');
      const rec = await mk(author, { roles: [{ roleId: roleA, capacity: 2 }, { roleId: roleB, capacity: 2 }], authorRoleId: roleA });
      expect(rec.totalCapacity).toBe(4);
      expect(rec.totalConfirmed).toBe(1);
      expect(rec.roles.find((r) => r.roleId === roleA)).toMatchObject({ capacity: 2, confirmedCount: 1, full: false });
      expect(rec.roles.find((r) => r.roleId === roleB)).toMatchObject({ capacity: 2, confirmedCount: 0 });
      expect(rec.members).toHaveLength(1);
      expect(rec.members[0].user.id).toBe(author);
      expect(rec.status).toBe('OPEN');
      expect(rec.canManage).toBe(true);
    });

    it('필수/우대 기술, 관심 분야 저장 및 조회', async () => {
      const author = await newUser('c2');
      const rec = await mk(author, { requiredSkillIds: [skillX], preferredSkillIds: [skillY], interestIds: [interestP] });
      expect(rec.requiredSkills.map((s) => s.id)).toEqual([skillX]);
      expect(rec.preferredSkills.map((s) => s.id)).toEqual([skillY]);
      expect(rec.interests.map((i) => i.id)).toEqual([interestP]);
    });

    it('검증 실패: 작성자 역할이 목록에 없음 / 정원 합계 1 / 중복 역할 / 기술 겹침 / 없는 id / 날짜 역전', async () => {
      const author = await newUser('c3');
      expect((await capture(mk(author, { authorRoleId: 999999 }))).code).toBe('BAD_REQUEST');
      expect((await capture(mk(author, { roles: [{ roleId: roleA, capacity: 1 }], authorRoleId: roleA }))).code).toBe('BAD_REQUEST');
      expect((await capture(mk(author, { roles: [{ roleId: roleA, capacity: 2 }, { roleId: roleA, capacity: 1 }] }))).code).toBe('BAD_REQUEST');
      expect((await capture(mk(author, { requiredSkillIds: [skillX], preferredSkillIds: [skillX] }))).code).toBe('BAD_REQUEST');
      expect((await capture(mk(author, { roles: [{ roleId: 999999, capacity: 2 }], authorRoleId: 999999 }))).code).toBe('BAD_REQUEST');
      expect((await capture(mk(author, { startDate: '2026-12-31', endDate: '2026-12-01' }))).code).toBe('BAD_REQUEST');
      expect((await capture(mk(author, { startDate: '2026-02-30' }))).code).toBe('BAD_REQUEST');
      expect((await one(`SELECT count(*)::int AS n FROM recruitments WHERE author_id = $1`, [author])).n).toBe(0); // 롤백 확인
    });

    it('탈퇴한 회원은 작성할 수 없다 (401)', async () => {
      const gone = await newUser('c4');
      await db.query(`UPDATE users SET status = 'WITHDRAWN' WHERE id = $1`, [gone]);
      expect((await capture(mk(gone))).code).toBe('UNAUTHORIZED');
    });

    it('문의용 오픈채팅 링크는 누구에게나 보인다', async () => {
      const author = await newUser('o1');
      const stranger = await newUser('o2');
      const admin = await newUser('o3', 'ADMIN');
      const member = await newUser('o4');
      const rec = await mk(author);
      const a = await apply(member, rec.id, roleB);
      await as.accept(author, a.id);
      expect((await rs.get(stranger, rec.id)).openChatUrl).toContain('https://');
      expect((await rs.get(author, rec.id)).openChatUrl).toContain('https://');
      expect((await rs.get(admin, rec.id)).openChatUrl).toContain('https://');
      expect((await rs.get(member, rec.id)).openChatUrl).toContain('https://');
    });
  });

  describe('지원/제안 검증', () => {
    it('본인 모집글에는 지원 불가(400), 없는 모집글 404, 없는 역할 400', async () => {
      const author = await newUser('v1');
      const user = await newUser('v2');
      const rec = await mk(author);
      expect((await capture(apply(author, rec.id, roleB))).code).toBe('BAD_REQUEST');
      expect((await capture(apply(user, '00000000-0000-4000-8000-000000000000', roleB))).code).toBe('NOT_FOUND');
      expect((await capture(apply(user, rec.id, 999999))).code).toBe('BAD_REQUEST');
    });

    it('같은 모집글 중복 지원 불가(409) - 다른 역할로도 불가, 거절 후에는 재지원 가능', async () => {
      const author = await newUser('v3');
      const user = await newUser('v4');
      const rec = await mk(author);
      const first = await apply(user, rec.id, roleB, '안녕하세요');
      expect(first.status).toBe('PENDING');
      expect(first.message).toBe('안녕하세요');
      expect((await capture(apply(user, rec.id, roleB))).code).toBe('CONFLICT');
      expect((await capture(apply(user, rec.id, roleA))).code).toBe('CONFLICT');
      await as.reject(author, first.id);
      expect((await apply(user, rec.id, roleA)).status).toBe('PENDING');
    });

    it('정원이 찬 역할에는 지원 불가(409)', async () => {
      const author = await newUser('v5');
      const u1 = await newUser('v6');
      const u2 = await newUser('v7');
      const rec = await mk(author, { roles: [{ roleId: roleA, capacity: 2 }, { roleId: roleB, capacity: 1 }] });
      const a1 = await apply(u1, rec.id, roleB);
      await as.accept(author, a1.id); // B 정원 1/1
      expect((await capture(apply(u2, rec.id, roleB))).code).toBe('CONFLICT');
      expect((await apply(u2, rec.id, roleA)).status).toBe('PENDING'); // A 는 아직 여유
    });

    it('마감/삭제된 모집글에는 지원 불가', async () => {
      const author = await newUser('v8');
      const user = await newUser('v9');
      const closed = await mk(author);
      await rs.close(author, closed.id);
      expect((await capture(apply(user, closed.id, roleB))).code).toBe('CONFLICT');
      const deleted = await mk(author);
      await rs.remove(author, deleted.id);
      expect((await capture(apply(user, deleted.id, roleB))).code).toBe('NOT_FOUND');
    });

    it('이미 팀원인 회원은 지원/제안 불가, 탈퇴 회원은 지원/제안 불가', async () => {
      const author = await newUser('v10');
      const member = await newUser('v11');
      const gone = await newUser('v12');
      const rec = await mk(author, { roles: [{ roleId: roleA, capacity: 3 }, { roleId: roleB, capacity: 2 }] });
      await as.accept(author, (await apply(member, rec.id, roleB)).id);
      expect((await capture(apply(member, rec.id, roleA))).code).toBe('CONFLICT');
      expect((await capture(propose(author, rec.id, member, roleA))).code).toBe('CONFLICT');
      await db.query(`UPDATE users SET status = 'WITHDRAWN' WHERE id = $1`, [gone]);
      expect((await capture(apply(gone, rec.id, roleA))).code).toBe('UNAUTHORIZED');
      expect((await capture(propose(author, rec.id, gone, roleA))).code).toBe('BAD_REQUEST');
    });

    it('제안은 작성자만(403), 본인에게 불가(400), 같은 대상 중복 불가(409), 다른 대상에게는 가능', async () => {
      const author = await newUser('p1');
      const t1 = await newUser('p2');
      const t2 = await newUser('p3');
      const other = await newUser('p4');
      const rec = await mk(author, { roles: [{ roleId: roleA, capacity: 3 }, { roleId: roleB, capacity: 2 }] });
      expect((await capture(propose(other, rec.id, t1, roleB))).code).toBe('FORBIDDEN');
      expect((await capture(propose(author, rec.id, author, roleB))).code).toBe('BAD_REQUEST');
      const p = await propose(author, rec.id, t1, roleB);
      expect(p).toMatchObject({ kind: 'PROPOSE', status: 'PENDING' });
      expect(p.sender.id).toBe(author);
      expect(p.receiver.id).toBe(t1);
      expect((await capture(propose(author, rec.id, t1, roleA))).code).toBe('CONFLICT');
      expect((await propose(author, rec.id, t2, roleB)).status).toBe('PENDING');
    });

    it('한 줄 메시지는 DB 에도 최대 200자 제약이 있다 (서비스 50자 검사는 DTO)', async () => {
      const author = await newUser('m1');
      const user = await newUser('m2');
      const rec = await mk(author);
      await expect(
        db.query(
          `INSERT INTO applications (recruitment_id, role_id, kind, sender_id, receiver_id, message) VALUES ($1,$2,'APPLY',$3,$4,$5)`,
          [rec.id, roleB, user, author, 'x'.repeat(201)],
        ),
      ).rejects.toThrow();
    });
  });

  describe('수락 / 거절 / 취소', () => {
    it('수락: 팀원 추가 + 확정 인원 +1 + 상태 ACCEPTED, 그 회원의 다른 대기 건은 취소', async () => {
      const author = await newUser('a1');
      const user = await newUser('a2');
      const target = await newUser('a3');
      const rec = await mk(author, { roles: [{ roleId: roleA, capacity: 3 }, { roleId: roleB, capacity: 2 }] });
      const applyB = await apply(user, rec.id, roleB);
      const proposeA = await propose(author, rec.id, user, roleA); // 같은 회원에게 간 제안도 대기 중
      const otherApply = await apply(target, rec.id, roleB);

      const res = await as.accept(author, applyB.id);
      expect(res.application.status).toBe('ACCEPTED');
      expect(res.recruitmentStatus).toBe('OPEN');
      expect(res.roleFull).toBe(false);
      expect(await slot(rec.id, roleB)).toMatchObject({ confirmed_count: 1 });
      expect(await memberCount(rec.id)).toBe(2);
      expect(await appStatus(proposeA.id)).toBe('CANCELED');
      expect(await appStatus(otherApply.id)).toBe('PENDING'); // 다른 회원의 건은 영향 없음
    });

    it('제안 수락: 제안 받은 회원이 수락하면 그 회원이 팀원이 된다', async () => {
      const author = await newUser('a4');
      const target = await newUser('a5');
      const rec = await mk(author);
      const p = await propose(author, rec.id, target, roleB);
      expect((await capture(as.accept(author, p.id))).code).toBe('FORBIDDEN'); // 보낸 사람은 수락 불가
      const res = await as.accept(target, p.id);
      expect(res.application.status).toBe('ACCEPTED');
      const detail = await rs.get(author, rec.id);
      expect(detail.members.map((m) => m.user.id)).toEqual(expect.arrayContaining([author, target]));
    });

    it('받은 사람만 수락/거절, 보낸 사람만 취소, 무관한 사람은 404, 이미 처리된 건 409', async () => {
      const author = await newUser('a6');
      const user = await newUser('a7');
      const stranger = await newUser('a8');
      const rec = await mk(author);
      const a = await apply(user, rec.id, roleB);
      expect((await capture(as.accept(user, a.id))).code).toBe('FORBIDDEN');
      expect((await capture(as.accept(stranger, a.id))).code).toBe('NOT_FOUND');
      expect((await capture(as.reject(user, a.id))).code).toBe('FORBIDDEN');
      expect((await capture(as.cancel(author, a.id))).code).toBe('FORBIDDEN');
      expect((await capture(as.cancel(stranger, a.id))).code).toBe('NOT_FOUND');
      expect((await as.cancel(user, a.id)).status).toBe('CANCELED');
      expect((await capture(as.accept(author, a.id))).code).toBe('CONFLICT');
      expect((await capture(as.cancel(user, a.id))).code).toBe('CONFLICT');
      expect((await capture(as.accept(author, '00000000-0000-4000-8000-000000000000'))).code).toBe('NOT_FOUND');
    });

    it('거절: 상태 REJECTED, 정원 변화 없음', async () => {
      const author = await newUser('a9');
      const user = await newUser('a10');
      const rec = await mk(author);
      const a = await apply(user, rec.id, roleB);
      expect((await as.reject(author, a.id)).status).toBe('REJECTED');
      expect(await slot(rec.id, roleB)).toMatchObject({ confirmed_count: 0 });
    });

    it('역할 정원이 차면 그 역할의 남은 대기 건은 자동 거절, 다른 역할은 유지', async () => {
      const author = await newUser('f1');
      const u1 = await newUser('f2');
      const u2 = await newUser('f3');
      const u3 = await newUser('f4');
      const rec = await mk(author, { roles: [{ roleId: roleA, capacity: 3 }, { roleId: roleB, capacity: 1 }] });
      const a1 = await apply(u1, rec.id, roleB);
      const a2 = await apply(u2, rec.id, roleB);
      const a3 = await apply(u3, rec.id, roleA);
      const res = await as.accept(author, a1.id);
      expect(res.roleFull).toBe(true);
      expect(res.recruitmentStatus).toBe('OPEN');
      expect(await appStatus(a2.id)).toBe('REJECTED');
      expect(await appStatus(a3.id)).toBe('PENDING');
    });

    it('모든 역할의 정원이 차면 모집글이 자동으로 CLOSED 되고 남은 대기 건은 일괄 거절', async () => {
      const author = await newUser('g1');
      const u1 = await newUser('g2');
      const u2 = await newUser('g3');
      const u3 = await newUser('g4');
      const rec = await mk(author, { roles: [{ roleId: roleA, capacity: 2 }, { roleId: roleB, capacity: 1 }] });
      const a1 = await apply(u1, rec.id, roleB);
      const a2 = await apply(u2, rec.id, roleA);
      const a3 = await apply(u3, rec.id, roleA);
      await as.accept(author, a1.id); // B 가득, 모집 중
      expect((await recStatus(rec.id)).status).toBe('OPEN');
      const last = await as.accept(author, a2.id); // A 가득 -> 전체 가득
      expect(last.recruitmentStatus).toBe('CLOSED');
      expect((await recStatus(rec.id)).status).toBe('CLOSED');
      expect(await appStatus(a3.id)).toBe('REJECTED');
      expect(await memberCount(rec.id)).toBe(3);
      expect(await slot(rec.id, roleA)).toMatchObject({ capacity: 2, confirmed_count: 2 });
    });

    it('동시성: 마지막 1자리에 3건을 동시에 수락해도 1건만 성공하고 정원이 초과되지 않는다', async () => {
      for (let round = 0; round < 3; round++) {
        const author = await newUser(`z${round}-0`);
        const users = await Promise.all([1, 2, 3].map((i) => newUser(`z${round}-${i}`)));
        const rec = await mk(author, { roles: [{ roleId: roleA, capacity: 2 }, { roleId: roleB, capacity: 1 }] });
        const apps = [];
        for (const u of users) apps.push(await apply(u, rec.id, roleB));

        const results = await Promise.allSettled(apps.map((a) => as.accept(author, a.id)));
        const ok = results.filter((r) => r.status === 'fulfilled');
        const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
        expect(ok).toHaveLength(1);
        expect(failed).toHaveLength(2);
        expect(failed.every((f) => f.reason.code === 'CONFLICT')).toBe(true);
        expect(await slot(rec.id, roleB)).toMatchObject({ capacity: 1, confirmed_count: 1 });
        expect(await memberCount(rec.id)).toBe(2); // 작성자 + 1명
        const statuses = await Promise.all(apps.map((a) => appStatus(a.id)));
        expect(statuses.filter((s) => s === 'ACCEPTED')).toHaveLength(1);
        expect(statuses.filter((s) => s === 'PENDING')).toHaveLength(0);
      }
    });

    it('동시성: 같은 사람의 지원과 제안을 동시에 수락해도 팀원으로 한 번만 등록된다', async () => {
      const author = await newUser('y1');
      const user = await newUser('y2');
      const rec = await mk(author, { roles: [{ roleId: roleA, capacity: 3 }, { roleId: roleB, capacity: 2 }] });
      const applyB = await apply(user, rec.id, roleB);
      const proposeA = await propose(author, rec.id, user, roleA);
      const results = await Promise.allSettled([as.accept(author, applyB.id), as.accept(user, proposeA.id)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await memberCount(rec.id)).toBe(2);
      const total = await one(`SELECT sum(confirmed_count)::int AS n FROM recruitment_roles WHERE recruitment_id = $1`, [rec.id]);
      expect(total.n).toBe(2);
    });

    it('동시성: 수락과 마감이 겹쳐도 상태가 어긋나지 않는다', async () => {
      const author = await newUser('x1');
      const user = await newUser('x2');
      const rec = await mk(author);
      const a = await apply(user, rec.id, roleB);
      await Promise.allSettled([as.accept(author, a.id), rs.close(author, rec.id)]);
      const status = await appStatus(a.id);
      const members = await memberCount(rec.id);
      if (status === 'ACCEPTED') expect(members).toBe(2);
      else {
        expect(status).toBe('REJECTED');
        expect(members).toBe(1);
      }
      expect(['PENDING']).not.toContain(status);
    });
  });

  describe('마감 / 삭제 / 수정', () => {
    it('수동 마감: CLOSED + 대기 건 일괄 거절, 이미 마감된 글은 409, 작성자/운영진이 아니면 403', async () => {
      const author = await newUser('k1');
      const admin = await newUser('k2', 'ADMIN');
      const other = await newUser('k3');
      const u1 = await newUser('k4');
      const u2 = await newUser('k5');
      const rec = await mk(author);
      const a1 = await apply(u1, rec.id, roleB);
      const p = await propose(author, rec.id, u2, roleA);
      expect((await capture(rs.close(other, rec.id))).code).toBe('FORBIDDEN');
      const closed = await rs.close(author, rec.id);
      expect(closed.status).toBe('CLOSED');
      expect(await appStatus(a1.id)).toBe('REJECTED');
      expect(await appStatus(p.id)).toBe('REJECTED');
      expect((await capture(rs.close(admin, rec.id))).code).toBe('CONFLICT');
    });

    it('삭제: 소프트 삭제 + 대기 건 일괄 거절 + 조회 404, 이력은 보존, 작성자/운영진만 가능', async () => {
      const author = await newUser('d1');
      const admin = await newUser('d2', 'ADMIN');
      const other = await newUser('d3');
      const u1 = await newUser('d4');
      const rec = await mk(author);
      const a1 = await apply(u1, rec.id, roleB);
      expect((await capture(rs.remove(other, rec.id))).code).toBe('FORBIDDEN');
      await rs.remove(author, rec.id);
      expect((await recStatus(rec.id)).deleted_at).not.toBeNull();
      expect(await appStatus(a1.id)).toBe('REJECTED');
      expect((await capture(rs.get(author, rec.id))).code).toBe('NOT_FOUND');
      expect((await capture(rs.remove(author, rec.id))).code).toBe('NOT_FOUND');

      const rec2 = await mk(author); // 운영진은 남의 글도 삭제 가능
      await rs.remove(admin, rec2.id);
      expect((await recStatus(rec2.id)).deleted_at).not.toBeNull();

      // 삭제된 모집글의 지원 이력은 내 목록에서 계속 보인다
      const mine = await as.listMine(u1, plainToInstance(ApplicationListQuery, { box: 'sent' }));
      expect(mine.items.map((i) => i.id)).toContain(a1.id);
    });

    it('수정: 작성자와 운영진만, 모집 중일 때만, 일반 회원은 403', async () => {
      const author = await newUser('e1');
      const admin = await newUser('e2', 'ADMIN');
      const other = await newUser('e3');
      const rec = await mk(author);
      expect((await capture(upd(other, rec.id))).code).toBe('FORBIDDEN');
      expect((await upd(author, rec.id, { title: '작성자 수정' })).title).toBe('작성자 수정');
      const byAdmin = await upd(admin, rec.id, { title: '운영진 수정', description: '운영진이 고침' });
      expect(byAdmin.title).toBe('운영진 수정');
      expect(byAdmin.author.id).toBe(author); // 작성자는 그대로
      expect((await one(`SELECT embedding_stale FROM recruitments WHERE id = $1`, [rec.id])).embedding_stale).toBe(true);
      await rs.close(author, rec.id);
      expect((await capture(upd(author, rec.id))).code).toBe('CONFLICT');
    });


    it('수정 규칙: 확정자가 있는 역할은 삭제 불가, 정원은 확정 인원 미만으로 축소 불가(롤백), 같은 값까지는 가능', async () => {
      const author = await newUser('r1');
      const u1 = await newUser('r2');
      const u2 = await newUser('r3');
      const u3 = await newUser('r4');
      const rec = await mk(author, { roles: [{ roleId: roleA, capacity: 3 }, { roleId: roleB, capacity: 2 }] });
      await as.accept(author, (await apply(u1, rec.id, roleB)).id);
      await as.accept(author, (await apply(u2, rec.id, roleB)).id); // B 2/2
      expect((await capture(upd(author, rec.id, { title: '실패해야 함', roles: [{ roleId: roleA, capacity: 3 }] }))).code).toBe('BAD_REQUEST');
      expect((await capture(upd(author, rec.id, { title: '실패해야 함', roles: [{ roleId: roleA, capacity: 3 }, { roleId: roleB, capacity: 1 }] }))).code).toBe('BAD_REQUEST');
      expect((await one(`SELECT title FROM recruitments WHERE id = $1`, [rec.id])).title).toBe(`${tag} 모집`); // 롤백 확인
      expect(await slot(rec.id, roleB)).toMatchObject({ capacity: 2, confirmed_count: 2 });
      const same = await upd(author, rec.id, { roles: [{ roleId: roleA, capacity: 3 }, { roleId: roleB, capacity: 2 }] });
      expect(same.roles.find((r) => r.roleId === roleB)).toMatchObject({ capacity: 2, confirmedCount: 2, full: true });
      expect((await capture(apply(u3, rec.id, roleB))).code).toBe('CONFLICT'); // 가득 찬 역할
    });

    it('수정: 확정자 없는 역할을 지우면 그 역할의 대기 건은 거절되고, 새 역할을 추가할 수 있다', async () => {
      const author = await newUser('r5');
      const u1 = await newUser('r6');
      const rec = await mk(author, { roles: [{ roleId: roleA, capacity: 2 }, { roleId: roleB, capacity: 1 }] });
      const a = await apply(u1, rec.id, roleB);
      const res = await upd(author, rec.id, { roles: [{ roleId: roleA, capacity: 3 }] });
      expect(res.roles.map((r) => r.roleId)).toEqual([roleA]);
      expect(res.roles[0]).toMatchObject({ capacity: 3, confirmedCount: 1 });
      expect(await appStatus(a.id)).toBe('REJECTED');
      const added = await upd(author, rec.id, { roles: [{ roleId: roleA, capacity: 3 }, { roleId: roleB, capacity: 2 }] });
      expect(added.roles).toHaveLength(2);
    });

    it('수정으로 정원을 줄여 모두 차면 자동으로 CLOSED 되고 대기 건이 거절된다', async () => {
      const author = await newUser('r7');
      const u1 = await newUser('r8');
      const rec = await mk(author, { roles: [{ roleId: roleA, capacity: 2 }, { roleId: roleB, capacity: 1 }] });
      const a = await apply(u1, rec.id, roleA);
      const res = await upd(author, rec.id, { roles: [{ roleId: roleA, capacity: 1 }] }); // 작성자 1/1
      expect(res.status).toBe('CLOSED');
      expect(await appStatus(a.id)).toBe('REJECTED');
    });
  });

  describe('목록 / 조회', () => {
    it('모집글 목록: 상태 탭(모집 중/완료), 역할·기술 필터, 제목 검색, 내 글, 삭제 글 제외, 페이지네이션', async () => {
      const author = await newUser('l1');
      const other = await newUser('l2');
      // 앞선 테스트가 만든 모집글과 섞이지 않도록 이 테스트 전용 제목 접두어를 쓴다
      const lt = `${tag}LIST`;
      const q = (o: object = {}) => rs.list(author, plainToInstance(RecruitmentListQuery, { size: '100', q: lt, ...o }));
      const open1 = await mk(author, { title: `${lt} 열림A`, requiredSkillIds: [skillX], roles: [{ roleId: roleA, capacity: 2 }] });
      const open2 = await mk(other, { title: `${lt} 열림B`, roles: [{ roleId: roleB, capacity: 2 }], authorRoleId: roleB });
      const closed = await mk(author, { title: `${lt} 닫힘` });
      await rs.close(author, closed.id);
      const deleted = await mk(author, { title: `${lt} 삭제됨` });
      await rs.remove(author, deleted.id);
      const ids = (r: { items: { id: string }[] }) => r.items.map((i) => i.id);

      expect(ids(await q({ status: 'OPEN' })).sort()).toEqual([open1.id, open2.id].sort());
      expect(ids(await q({ status: 'DONE' }))).toEqual([closed.id]);
      expect(ids(await q())).not.toContain(deleted.id);
      expect(ids(await q({ roleIds: `${roleB}`, status: 'OPEN' }))).toEqual([open2.id]);
      expect(ids(await q({ skillIds: `${skillX}` }))).toEqual([open1.id]);
      expect(ids(await q({ q: `${lt} 열림A` }))).toEqual([open1.id]);
      expect(ids(await q({ mine: 'true' })).sort()).toEqual([open1.id, closed.id].sort());
      expect(ids(await rs.list(author, plainToInstance(RecruitmentListQuery, { q: '%' })))).toEqual([]); // 와일드카드 이스케이프

      const p1 = await q({ size: '2', page: '1' });
      expect(p1.total).toBe(3);
      expect(p1.totalPages).toBe(2);
      expect(p1.items).toHaveLength(2);
      const item = p1.items.find((i) => i.id === open1.id) ?? (await q()).items.find((i) => i.id === open1.id)!;
      expect(item.author.id).toBe(author);
      expect(item.totalCapacity).toBe(2);
      expect(item.totalConfirmed).toBe(1);
    });

    it('탈퇴한 작성자는 "탈퇴한 회원"으로 표시된다', async () => {
      const author = await newUser('l3');
      const viewer = await newUser('l4');
      const rec = await mk(author);
      await db.query(`UPDATE users SET status = 'WITHDRAWN' WHERE id = $1`, [author]);
      const detail = await rs.get(viewer, rec.id);
      expect(detail.author).toMatchObject({ name: '탈퇴한 회원', withdrawn: true });
      expect(JSON.stringify(detail)).not.toContain('@example.test');
    });

    it('지원/제안 목록: 내가 보낸/받은 것, 상태 필터, 모집글 단위 조회는 작성자/운영진만', async () => {
      const author = await newUser('n1');
      const admin = await newUser('n2', 'ADMIN');
      const u1 = await newUser('n3');
      const u2 = await newUser('n4');
      const rec = await mk(author, { roles: [{ roleId: roleA, capacity: 3 }, { roleId: roleB, capacity: 2 }] });
      const a1 = await apply(u1, rec.id, roleB);
      await propose(author, rec.id, u2, roleB);
      const lq = (o: object) => plainToInstance(ApplicationListQuery, { size: '100', ...o });

      const sent = await as.listMine(u1, lq({ box: 'sent' }));
      expect(sent.items.map((i) => i.id)).toEqual([a1.id]);
      expect(sent.items[0].recruitmentTitle).toBe(`${tag} 모집`);
      const received = await as.listMine(author, lq({ box: 'received' }));
      expect(received.items.map((i) => i.id)).toContain(a1.id);
      expect((await as.listMine(u2, lq({ box: 'received', status: 'PENDING' }))).items).toHaveLength(1);
      expect((await as.listMine(u2, lq({ box: 'received', status: 'ACCEPTED' }))).items).toHaveLength(0);

      const query = plainToInstance(ApplicationListQuery, { box: 'sent' }) as unknown as import('./recruitment.dto').RecruitmentApplicationsQuery;
      expect((await as.listForRecruitment(author, rec.id, query)).total).toBe(2);
      expect((await as.listForRecruitment(admin, rec.id, query)).total).toBe(2);
      expect((await capture(as.listForRecruitment(u1, rec.id, query))).code).toBe('FORBIDDEN');
    });
  });

  describe('프론트 요청 반영 (팀 채팅방/되돌리기/내보내기/거절 이유)', () => {
    it('문의용 오픈채팅은 누구나, 팀 채팅방은 작성자/운영진 항상 + 확정 팀원은 마감 후에만', async () => {
      const author = await newUser('t1');
      const stranger = await newUser('t2');
      const admin = await newUser('t3', 'ADMIN');
      const u1 = await newUser('t4');
      const u2 = await newUser('t5');
      const rec = await mk(author);
      const a1 = await apply(u1, rec.id, roleB);
      await as.accept(author, a1.id);
      expect((await rs.get(stranger, rec.id)).openChatUrl).toContain('https://');
      expect((await rs.get(stranger, rec.id)).teamChatUrl).toBeNull();
      expect((await rs.get(u1, rec.id)).teamChatUrl).toBeNull(); // 모집 중에는 팀원도 못 봄
      expect((await rs.get(author, rec.id)).teamChatUrl).toContain('https://');
      expect((await rs.get(admin, rec.id)).teamChatUrl).toContain('https://');
      const a2 = await apply(u2, rec.id, roleA);
      await as.accept(author, a2.id); // 전체 가득 -> CLOSED
      expect((await rs.get(u1, rec.id)).teamChatUrl).toContain('https://');
      expect((await rs.get(stranger, rec.id)).teamChatUrl).toBeNull();
      const detail = await rs.get(stranger, rec.id);
      expect(detail.authorRoleId).toBe(roleA);
      expect(detail.members.filter((m) => m.isLeader).map((m) => m.user.id)).toEqual([author]);
    });

    it('거절 이유: 직접 거절은 MANUAL, 마감으로 자동 정리된 건은 CLOSED', async () => {
      const author = await newUser('fr1');
      const u1 = await newUser('fr2');
      const u2 = await newUser('fr3');
      const rec = await mk(author);
      const a1 = await apply(u1, rec.id, roleB);
      const a2 = await apply(u2, rec.id, roleA);
      expect((await as.reject(author, a1.id)).rejectReason).toBe('MANUAL');
      await rs.close(author, rec.id);
      const closed = await as.listForRecruitment(author, rec.id, plainToInstance(ApplicationListQuery, { box: 'sent' }) as never);
      expect(closed.items.find((i) => i.id === a2.id)).toMatchObject({ status: 'REJECTED', rejectReason: 'CLOSED' });
    });

    it('수락 취소: 팀원에서 빠지고 대기로 복귀, 마감 후에는 409', async () => {
      const author = await newUser('fv1');
      const u1 = await newUser('fv2');
      const u2 = await newUser('fv3');
      const rec = await mk(author);
      const a1 = await apply(u1, rec.id, roleB);
      await as.accept(author, a1.id);
      expect(await slot(rec.id, roleB)).toMatchObject({ confirmed_count: 1 });
      expect((await capture(as.revert(u1, a1.id))).code).toBe('FORBIDDEN'); // 보낸 사람은 불가
      const back = await as.revert(author, a1.id);
      expect(back).toMatchObject({ status: 'PENDING', rejectReason: null });
      expect(await slot(rec.id, roleB)).toMatchObject({ confirmed_count: 0 });
      expect(await memberCount(rec.id)).toBe(1);
      // 다시 수락한 뒤 마감되면 취소할 수 없다
      await as.accept(author, a1.id);
      const a2 = await apply(u2, rec.id, roleA);
      await as.accept(author, a2.id);
      expect((await recStatus(rec.id)).status).toBe('CLOSED');
      expect((await capture(as.revert(author, a1.id))).code).toBe('CONFLICT');
    });

    it('거절 취소: 직접 거절은 대기로 복귀, 대기 건/마감 후에는 409', async () => {
      const author = await newUser('w1');
      const u1 = await newUser('w2');
      const u2 = await newUser('w3');
      const rec = await mk(author);
      const a1 = await apply(u1, rec.id, roleB);
      await as.reject(author, a1.id);
      expect((await as.revert(author, a1.id)).status).toBe('PENDING');
      // 대기 상태는 되돌릴 대상이 아니다
      expect((await capture(as.revert(author, a1.id))).code).toBe('CONFLICT');
      // 마감된 뒤에는 되돌릴 수 없다
      const a2 = await apply(u2, rec.id, roleA);
      await as.accept(author, a1.id); // B 가득 -> 남은 건 유지
      await as.accept(author, a2.id); // 전체 가득 -> 마감
      expect((await capture(as.revert(author, a2.id))).code).toBe('CONFLICT');
    });

    it('팀원 내보내기: 팀장만, 마감 후에만, 자리가 비고 모집 중으로 복귀, 수락 건은 취소', async () => {
      const author = await newUser('fk1');
      const u1 = await newUser('fk2');
      const u2 = await newUser('fk3');
      const rec = await mk(author);
      const a1 = await apply(u1, rec.id, roleB);
      await as.accept(author, a1.id);
      expect((await capture(rs.removeMember(author, rec.id, u1))).code).toBe('CONFLICT'); // 모집 중
      const a2 = await apply(u2, rec.id, roleA);
      await as.accept(author, a2.id); // 마감
      expect((await capture(rs.removeMember(u1, rec.id, u2))).code).toBe('FORBIDDEN');
      expect((await capture(rs.removeMember(author, rec.id, author))).code).toBe('BAD_REQUEST');
      const stranger = await newUser('fk4');
      expect((await capture(rs.removeMember(author, rec.id, stranger))).code).toBe('NOT_FOUND');

      const detail = await rs.removeMember(author, rec.id, u1);
      expect(detail.status).toBe('OPEN');
      expect(detail.members.map((m) => m.user.id)).not.toContain(u1);
      expect(await slot(rec.id, roleB)).toMatchObject({ confirmed_count: 0 });
      expect(await appStatus(a1.id)).toBe('REMOVED');
      expect((await rs.get(u1, rec.id)).teamChatUrl).toBeNull();
    });

    it('팀 나가기: 팀원 본인만, 팀장 불가, 모집 중/마감 모두 가능, 자리가 비고 LEFT 로 남음', async () => {
      const author = await newUser('lv1');
      const u1 = await newUser('lv2');
      const u2 = await newUser('lv3');
      const stranger = await newUser('lv4');
      const rec = await mk(author);
      const a1 = await apply(u1, rec.id, roleB);
      await as.accept(author, a1.id);

      expect((await capture(rs.leave(author, rec.id))).code).toBe('BAD_REQUEST'); // 팀장
      expect((await capture(rs.leave(stranger, rec.id))).code).toBe('NOT_FOUND'); // 팀원 아님

      // 모집 중에 나가기
      const detail = await rs.leave(u1, rec.id);
      expect(detail.status).toBe('OPEN');
      expect(detail.members.map((m) => m.user.id)).not.toContain(u1);
      expect(await slot(rec.id, roleB)).toMatchObject({ confirmed_count: 0 });
      expect(await appStatus(a1.id)).toBe('LEFT');
      expect((await capture(rs.leave(u1, rec.id))).code).toBe('NOT_FOUND'); // 이미 나감
      expect((await capture(as.revert(author, a1.id))).code).toBe('CONFLICT'); // LEFT 는 되돌릴 수 없다

      // 마감된 뒤에 나가면 모집 중으로 복귀
      const a2 = await apply(u1, rec.id, roleB);
      const a3 = await apply(u2, rec.id, roleA);
      await as.accept(author, a2.id);
      await as.accept(author, a3.id); // 전체 가득 -> 마감
      expect((await rs.get(author, rec.id)).status).toBe('CLOSED');
      expect((await rs.leave(u2, rec.id)).status).toBe('OPEN');
    });
  });
});
