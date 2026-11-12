// 운영진 권한 변경(마지막 운영진 보호) + 아카이브 저장 트랜잭션 실제 PostgreSQL 테스트.
// 실행: TEST_DATABASE_URL=postgres://... npx jest src/modules/admin/role-archive.db.spec.ts --runInBand
//  - TEST_DATABASE_URL 이 없으면 건너뜀, localhost 가 아니면 거부
//  - 다른 운영진은 잠시 WITHDRAWN 으로 바꿨다가 끝나면 원래대로 복구, 만든 데이터는 모두 삭제
import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import 'reflect-metadata';
import { DatabaseService } from '../../common/database.service';
import { ArchiveRepository } from '../archive/archive.repository';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

async function capture(p: Promise<unknown>): Promise<{ code?: string }> {
  try {
    await p;
  } catch (e) {
    return e as { code?: string };
  }
  throw new Error('예외가 발생해야 합니다.');
}

suite('운영진 권한 변경 / 아카이브 트랜잭션 DB 테스트', () => {
  jest.setTimeout(60_000);

  const tag = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
  const sub = (n: string) => `ra-${tag}-${n}`;
  let db: DatabaseService;
  let admin: AdminService;
  let archive: ArchiveRepository;
  let others: string[] = [];

  const rows = async <T = any>(sql: string, params: unknown[] = []): Promise<T[]> => (await db.query(sql, params)).rows as T[];
  const one = async <T = any>(sql: string, params: unknown[] = []): Promise<T> => (await rows<T>(sql, params))[0];
  const newUser = async (n: string, role: 'ADMIN' | 'MEMBER') =>
    (await one<{ id: string }>(
      `INSERT INTO users (google_sub, email, name, role, join_verified_at) VALUES ($1, $2, $3, $4, now()) RETURNING id`,
      [sub(n), `${sub(n)}@example.test`, `회원${n}`, role],
    )).id;
  const roleOf = async (id: string) => (await one(`SELECT role FROM users WHERE id = $1`, [id])).role;

  beforeAll(async () => {
    const host = new URL(url!).hostname;
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error(`로컬 DB가 아니면 실행하지 않습니다: ${host}`);
    process.env.DATABASE_URL = url;
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    db = new DatabaseService();
    admin = new AdminService(new AdminRepository(db), db, {} as never);
    archive = new ArchiveRepository(db);
    // 기존 활성 운영진을 임시로 빼서 "운영진 수"를 테스트가 통제하도록 한다
    others = (await rows<{ id: string }>(`SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'`)).map((r) => r.id);
    if (others.length) await db.query(`UPDATE users SET status = 'WITHDRAWN' WHERE id = ANY($1::uuid[])`, [others]);
  });

  afterAll(async () => {
    if (!db) return;
    const mine = `SELECT id FROM users WHERE google_sub LIKE 'ra-${tag}-%'`;
    await db.query(`DELETE FROM club_projects WHERE title LIKE $1`, [`ra-${tag}-%`]);
    await db.query(`DELETE FROM audit_logs WHERE actor_id IN (${mine})`);
    await db.query(`DELETE FROM role_histories WHERE user_id IN (${mine}) OR changed_by IN (${mine})`);
    await db.query(`DELETE FROM users WHERE google_sub LIKE 'ra-${tag}-%'`);
    if (others.length) await db.query(`UPDATE users SET status = 'ACTIVE' WHERE id = ANY($1::uuid[])`, [others]);
    await db.onModuleDestroy();
  });

  it('마지막 운영진을 일반 회원으로 바꾸면 403 LAST_ADMIN, 역할·이력·감사 로그 모두 그대로', async () => {
    const a = await newUser('solo', 'ADMIN');

    const e = await capture(admin.changeRole(a, { role: 'MEMBER', reason: '테스트' } as never, a));

    expect(e.code).toBe('LAST_ADMIN');
    expect(await roleOf(a)).toBe('ADMIN');
    expect((await one(`SELECT count(*)::int n FROM role_histories WHERE user_id = $1`, [a])).n).toBe(0);
    expect((await one(`SELECT count(*)::int n FROM audit_logs WHERE actor_id = $1`, [a])).n).toBe(0);
    await db.query(`UPDATE users SET status = 'WITHDRAWN' WHERE id = $1`, [a]);
  });

  it('운영진이 2명이면 한 명은 일반 회원으로 바꿀 수 있고, 이력과 감사 로그가 함께 남는다', async () => {
    const a = await newUser('duoA', 'ADMIN');
    const b = await newUser('duoB', 'ADMIN');

    await admin.changeRole(a, { role: 'MEMBER', reason: '활동 종료' } as never, b);

    expect(await roleOf(a)).toBe('MEMBER');
    expect((await one(`SELECT new_role FROM role_histories WHERE user_id = $1`, [a])).new_role).toBe('MEMBER');
    expect((await one(`SELECT count(*)::int n FROM audit_logs WHERE actor_id = $1 AND action = 'CHANGE_ROLE'`, [b])).n).toBe(1);
  });

  it('운영진 2명이 동시에 서로를 강등해도 정확히 한 명만 성공한다 (5회 반복)', async () => {
    for (let round = 0; round < 5; round++) {
      await db.query(`UPDATE users SET status = 'WITHDRAWN' WHERE role = 'ADMIN' AND google_sub LIKE 'ra-${tag}-%'`);
      const a = await newUser(`raceA${round}`, 'ADMIN');
      const b = await newUser(`raceB${round}`, 'ADMIN');

      const results = await Promise.allSettled([
        admin.changeRole(a, { role: 'MEMBER', reason: 'x' } as never, b),
        admin.changeRole(b, { role: 'MEMBER', reason: 'x' } as never, a),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(failed).toHaveLength(1);
      expect(failed[0].reason.code).toBe('LAST_ADMIN');
      expect((await one(`SELECT count(*)::int n FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' AND id IN ($1, $2)`, [a, b])).n).toBe(1);
    }
  });

  it('일반 회원을 운영진으로 올릴 수 있다', async () => {
    const actor = await newUser('actor', 'ADMIN');
    const m = await newUser('promote', 'MEMBER');
    await admin.changeRole(m, { role: 'ADMIN', reason: '임명' } as never, actor);
    expect(await roleOf(m)).toBe('ADMIN');
  });

  const baseData = { title: '', techStacks: ['NestJS'], links: [{ label: 'repo', url: 'https://example.test' }] };

  it('아카이브 등록 중 참여자 저장이 실패하면 프로젝트도 저장되지 않는다', async () => {
    const title = `ra-${tag}-create-fail`;
    // name 은 NOT NULL 이라 두 번째 참여자에서 실패한다
    const members = [{ name: '정상', role: 'BE' }, { name: null as never, role: 'FE' }];

    await expect(archive.create({ ...baseData, title, members }, await newUser('creator', 'MEMBER'))).rejects.toThrow();

    expect((await one(`SELECT count(*)::int n FROM club_projects WHERE title = $1`, [title])).n).toBe(0);
  });

  it('아카이브 정상 등록·수정은 프로젝트·참여자·링크가 함께 저장된다', async () => {
    const creator = await newUser('creator2', 'MEMBER');
    const title = `ra-${tag}-ok`;
    const id = await archive.create({ ...baseData, title, members: [{ name: '가', role: 'BE' }] }, creator);

    expect((await one(`SELECT count(*)::int n FROM club_project_members WHERE project_id = $1`, [id])).n).toBe(1);
    expect((await one(`SELECT count(*)::int n FROM club_project_links WHERE project_id = $1`, [id])).n).toBe(1);

    expect(await archive.update(id, { description: '수정', members: [{ name: '나', role: 'FE' }, { name: '다', role: 'PM' }] })).toBe(true);
    expect((await one(`SELECT count(*)::int n FROM club_project_members WHERE project_id = $1`, [id])).n).toBe(2);
    expect(await archive.update('00000000-0000-0000-0000-000000000000', { title: 'x' })).toBe(false);
  });

  it('아카이브 수정 중 참여자 저장이 실패하면 기존 내용이 그대로 남는다', async () => {
    const creator = await newUser('creator3', 'MEMBER');
    const title = `ra-${tag}-upd-fail`;
    const id = await archive.create({ ...baseData, title, members: [{ name: '원본', role: 'BE' }] }, creator);

    await expect(
      archive.update(id, { description: '바뀌면 안 됨', members: [{ name: null as never, role: 'FE' }] }),
    ).rejects.toThrow();

    expect((await one(`SELECT description FROM club_projects WHERE id = $1`, [id])).description).not.toBe('바뀌면 안 됨');
    expect((await one(`SELECT name FROM club_project_members WHERE project_id = $1`, [id])).name).toBe('원본');
  });
});
