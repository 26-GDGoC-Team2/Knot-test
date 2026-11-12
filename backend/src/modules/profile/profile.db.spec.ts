// 프로필 모듈 실제 PostgreSQL 통합 테스트.
// 실행: TEST_DATABASE_URL=postgres://... npx jest src/modules/profile/profile.db.spec.ts
//  - TEST_DATABASE_URL 이 없으면 건너뜀, localhost 가 아니면 거부
//  - 이 테스트가 만든 데이터(회원/역할/기술/관심 분야)는 끝나면 모두 삭제
import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { DatabaseService } from '../../common/database.service';
import { ImportExperienceDto, MemberSearchQuery, SaveExperienceDto, SaveProfileDto } from './profile.dto';
import { ProfileRepository } from './profile.repository';
import { ProfileService } from './profile.service';

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

suite('프로필 모듈 실제 DB 통합 테스트', () => {
  jest.setTimeout(60_000);

  const tag = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
  const sub = (n: string) => `pf-${tag}-${n}`;
  let db: DatabaseService;
  let service: ProfileService;
  let roleA: number;
  let roleB: number;
  let skillX: number;
  let skillY: number;
  let interestP: number;
  let interestQ: number;
  const customNorms: string[] = [];

  const rows = async <T = any>(sql: string, params: unknown[] = []): Promise<T[]> => (await db.query(sql, params)).rows as T[];
  const one = async <T = any>(sql: string, params: unknown[] = []): Promise<T> => (await rows<T>(sql, params))[0];
  const newUser = async (n: string, name = `회원${n}`) =>
    (await one<{ id: string }>(
      `INSERT INTO users (google_sub, email, name, join_verified_at) VALUES ($1, $2, $3, now()) RETURNING id`,
      [sub(n), `${sub(n)}@example.test`, name],
    )).id;
  const save = (userId: string, o: object = {}) =>
    service.saveMyProfile(
      userId,
      plainToInstance(SaveProfileDto, {
        name: '기본이름', roleIds: [roleA], skillIds: [skillX], interestIds: [interestP], available: true, ...o,
      }),
    );
  const search = (o: object = {}) =>
    service.searchMembers(plainToInstance(MemberSearchQuery, { size: '100', ...o }));
  const ids = (res: { items: { userId: string }[] }) => res.items.map((i) => i.userId);

  beforeAll(async () => {
    const host = new URL(url!).hostname;
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error(`로컬 DB가 아니면 실행하지 않습니다: ${host}`);
    process.env.DATABASE_URL = url;
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    db = new DatabaseService();
    service = new ProfileService(db, new ProfileRepository(db));
    const ins = async (table: string, name: string) =>
      (await one<{ id: number }>(`INSERT INTO ${table} (name) VALUES ($1) RETURNING id`, [name])).id;
    roleA = await ins('roles', `PF-ROLE-A-${tag}`);
    roleB = await ins('roles', `PF-ROLE-B-${tag}`);
    interestP = await ins('interest_areas', `PF-INT-P-${tag}`);
    interestQ = await ins('interest_areas', `PF-INT-Q-${tag}`);
    const sk = async (n: string) =>
      (await one<{ id: number }>(`INSERT INTO skills (name, name_norm, is_custom) VALUES ($1, $1, FALSE) RETURNING id`, [`pf-skill-${n}-${tag}`])).id;
    skillX = await sk('x');
    skillY = await sk('y');
  });

  afterAll(async () => {
    if (!db) return;
    const mine = `SELECT id FROM users WHERE google_sub LIKE 'pf-${tag}-%'`;
    await db.query(`DELETE FROM club_projects WHERE title LIKE 'PF-ARC-${tag}%'`); // 링크/부원은 CASCADE
    await db.query(`DELETE FROM users WHERE id IN (${mine})`); // 프로필/경험은 CASCADE
    await db.query(`DELETE FROM skills WHERE name LIKE 'pf-skill-%-${tag}' OR name_norm = ANY($1)`, [customNorms]);
    await db.query(`DELETE FROM interest_areas WHERE name LIKE 'PF-INT-%-${tag}'`);
    await db.query(`DELETE FROM roles WHERE name LIKE 'PF-ROLE-%-${tag}'`);
    await db.onModuleDestroy();
  });

  it('프로필 저장: 실명 갱신, 역할/기술/관심 분야 저장, 다시 저장하면 전체 교체', async () => {
    const u = await newUser('save');
    const res = await save(u, { name: '김실명', roleIds: [roleA, roleB], skillIds: [skillX, skillY], bio: ' 안녕 ', githubUrl: 'https://github.com/abc' });
    expect(res.name).toBe('김실명');
    expect(res.bio).toBe('안녕');
    expect(res.roles.map((r) => r.id).sort()).toEqual([roleA, roleB].sort());
    expect(res.skills).toHaveLength(2);
    expect((await one(`SELECT name FROM users WHERE id = $1`, [u])).name).toBe('김실명');
    expect((await one(`SELECT embedding_stale FROM profiles WHERE user_id = $1`, [u])).embedding_stale).toBe(true);

    const res2 = await save(u, { roleIds: [roleB], skillIds: [skillY], bio: null });
    expect(res2.roles.map((r) => r.id)).toEqual([roleB]);
    expect(res2.skills.map((s) => s.id)).toEqual([skillY]);
    expect(res2.bio).toBeNull();
    expect((await one(`SELECT count(*)::int AS n FROM profiles WHERE user_id = $1`, [u])).n).toBe(1);
  });

  it('존재하지 않는 id 는 400 이고 기존 프로필은 그대로(롤백)', async () => {
    const u = await newUser('rollback');
    await save(u, { name: '원래이름' });
    const e = await capture(save(u, { name: '바뀐이름', roleIds: [roleA, 999999] }));
    expect(e.code).toBe('BAD_REQUEST');
    expect((await one(`SELECT name FROM users WHERE id = $1`, [u])).name).toBe('원래이름');
  });

  it('직접 입력 기술: 공백/대소문자 달라도 같은 항목 재사용, 5개 초과는 롤백', async () => {
    const a = await newUser('cs-a');
    const b = await newUser('cs-b');
    customNorms.push(`pf${tag}langx`);
    const r1 = await save(a, { customSkills: [`PF${tag} Lang X`] });
    const custom1 = r1.skills.find((s) => s.isCustom)!;
    const r2 = await save(b, { customSkills: [` pf${tag}langx `] });
    expect(r2.skills.find((s) => s.isCustom)!.id).toBe(custom1.id);
    expect((await one(`SELECT count(*)::int AS n FROM skills WHERE name_norm = $1`, [`pf${tag}langx`])).n).toBe(1);

    // 6번째 직접 입력(DTO 한도는 우회해 서비스 한도를 확인): 기존 5개 + 신규 1개
    const c = await newUser('cs-c');
    const five = [1, 2, 3, 4, 5].map((i) => `pf${tag}c${i}`);
    customNorms.push(...five, `pf${tag}c6`);
    await save(c, { customSkills: five });
    const dto = plainToInstance(SaveProfileDto, {
      name: '기본', roleIds: [roleA], skillIds: [skillX], interestIds: [interestP], available: true, customSkills: [`pf${tag}c6`],
    });
    dto.skillIds = [skillX, ...(await rows<{ skill_id: number }>(`SELECT skill_id FROM profile_skills WHERE user_id = $1 AND skill_id <> $2`, [c, skillX])).map((r) => r.skill_id)];
    expect((await capture(service.saveMyProfile(c, dto))).code).toBe('BAD_REQUEST');
    expect((await one(`SELECT count(*)::int AS n FROM skills WHERE name_norm = $1`, [`pf${tag}c6`])).n).toBe(0); // 롤백 확인
  });

  it('타인 조회는 공개 프로젝트 전부(최신순), 본인은 전체', async () => {
    const owner = await newUser('exp-owner');
    const viewer = await newUser('exp-viewer');
    await save(owner);
    const mk = (name: string, endedOn: string, isPublic: boolean) =>
      service.createExperience(owner, plainToInstance(SaveExperienceDto, { name, endedOn, isPublic, skillIds: [skillX] }));
    await mk('공개2020', '2020-01-01', true);
    await mk('공개2024', '2024-01-01', true);
    await mk('비공개2025', '2025-01-01', false);
    await mk('공개2023', '2023-01-01', true);
    await mk('공개2022', '2022-01-01', true);

    const others = await service.getProfile(viewer, owner);
    expect(others.experiences.map((e) => e.name)).toEqual(['공개2024', '공개2023', '공개2022', '공개2020']);
    expect(others.isMine).toBe(false);
    expect(others.experiences[0].skills).toHaveLength(1);

    const mine = await service.getProfile(owner, owner);
    expect(mine.experiences).toHaveLength(5);
    expect(mine.experiences[0].name).toBe('비공개2025');
  });

  it('경험 수정/공개 변경/삭제는 본인 것만(남의 것은 404), 종류와 상관없이 가능', async () => {
    const owner = await newUser('exp2-owner');
    const other = await newUser('exp2-other');
    await save(owner);
    const created = await service.createExperience(owner, plainToInstance(SaveExperienceDto, { name: '내것', isPublic: false }));

    expect((await capture(service.updateExperience(other, created.id, plainToInstance(SaveExperienceDto, { name: 'x', isPublic: true })))).code).toBe('NOT_FOUND');
    expect((await capture(service.deleteExperience(other, created.id))).code).toBe('NOT_FOUND');

    const upd = await service.updateExperience(owner, created.id, plainToInstance(SaveExperienceDto, { name: '수정됨', isPublic: true, skillIds: [skillY] }));
    expect(upd.name).toBe('수정됨');
    expect(upd.skills.map((s) => s.id)).toEqual([skillY]);
    expect((await service.setExperienceVisibility(owner, created.id, { isPublic: false })).isPublic).toBe(false);

    const official = (await one<{ id: string }>(
      `INSERT INTO project_experiences (user_id, name, type, is_public) VALUES ($1, '동아리', 'OFFICIAL', FALSE) RETURNING id`, [owner])).id;
    // 동아리 프로젝트(OFFICIAL)도 수정·공개 변경·삭제 가능
    const updOfficial = await service.updateExperience(owner, official, plainToInstance(SaveExperienceDto, { name: '동아리 수정', isPublic: false }));
    expect(updOfficial.name).toBe('동아리 수정');
    expect((await service.setExperienceVisibility(owner, official, { isPublic: true })).isPublic).toBe(true);
    await service.deleteExperience(owner, official);
    expect(await one(`SELECT 1 FROM project_experiences WHERE id = $1`, [official])).toBeUndefined();

    await service.deleteExperience(owner, created.id);
    expect(await one(`SELECT 1 FROM project_experiences WHERE id = $1`, [created.id])).toBeUndefined();
  });

  it('아카이브에서 가져오기: 참여 부원만, 내용·기술 복사, 응답에 archiveId, 중복은 409, 없는 건 404', async () => {
    const member = await newUser('imp-member');
    const outsider = await newUser('imp-outsider');
    const arc = (await one<{ id: string }>(
      `INSERT INTO club_projects (title, description, tech_stacks, started_at, ended_at)
       VALUES ($1, '설명', $2, '2025-03-01', '2025-06-30') RETURNING id`,
      [`PF-ARC-${tag}`, [`pf-skill-x-${tag}`, '목록에없는기술']],
    )).id;
    await db.query(`INSERT INTO club_project_links (project_id, label, url, sort_order) VALUES ($1, 'GitHub', 'https://github.com/x/y', 0)`, [arc]);
    await db.query(`INSERT INTO club_project_members (project_id, user_id, name, role) VALUES ($1, $2, '회원', 'FE')`, [arc, member]);
    const dto = plainToInstance(ImportExperienceDto, { archiveId: arc });

    expect((await capture(service.importExperience(outsider, dto))).code).toBe('FORBIDDEN');
    expect((await capture(service.importExperience(member, plainToInstance(ImportExperienceDto, { archiveId: '00000000-0000-4000-8000-000000000000' })))).code).toBe('NOT_FOUND');

    const imported = await service.importExperience(member, dto);
    expect(imported.archiveId).toBe(arc);
    expect(imported.type).toBe('OFFICIAL');
    expect(imported.name).toBe(`PF-ARC-${tag}`);
    expect(imported.roleDesc).toBe('FE');
    expect(imported.link).toBe('https://github.com/x/y');
    expect(imported.startedOn).toBe('2025-03-01');
    expect(imported.isPublic).toBe(false);
    expect(imported.skills.map((s) => s.id)).toEqual([skillX]); // 목록에 없는 기술은 빠진다

    expect((await capture(service.importExperience(member, dto))).code).toBe('CONFLICT');

    // 가져온 경험을 지우면 다시 가져올 수 있다
    await service.deleteExperience(member, imported.id);
    expect((await service.importExperience(member, dto)).archiveId).toBe(arc);
  });

  describe('부원 검색', () => {
    let m1: string; let m2: string; let m3: string; let noProfile: string; let withdrawn: string;

    beforeAll(async () => {
      m1 = await newUser('s1'); m2 = await newUser('s2'); m3 = await newUser('s3');
      noProfile = await newUser('s-none'); withdrawn = await newUser('s-wd');
      await save(m1, { name: `${tag}김철수`, roleIds: [roleA], skillIds: [skillX], interestIds: [interestP], available: true });
      await save(m2, { name: `${tag}이영희`, roleIds: [roleB], skillIds: [skillY], interestIds: [interestQ], available: false });
      await save(m3, { name: `${tag}100%_박`, roleIds: [roleA, roleB], skillIds: [skillX, skillY], interestIds: [interestP, interestQ], available: true });
      await save(withdrawn, { name: `${tag}탈퇴자`, roleIds: [roleA] });
      await db.query(`UPDATE users SET status = 'WITHDRAWN' WHERE id = $1`, [withdrawn]);
      // 앞선 테스트가 만든 다른 프로필이 검색 결과에 섞이지 않도록 제거
      await db.query(
        `DELETE FROM profiles WHERE user_id IN (SELECT id FROM users WHERE google_sub LIKE 'pf-${tag}-%')
           AND user_id <> ALL($1::uuid[])`,
        [[m1, m2, m3, withdrawn]],
      );
    });

    // 다른 데이터와 섞이지 않도록 이 테스트의 역할로 범위를 좁힘
    const inScope = (o: object = {}) => search({ roleIds: `${roleA},${roleB}`, ...o });

    it('조건이 없으면 프로필 있는 활성 회원만(프로필 없는 회원, 탈퇴 회원 제외)', async () => {
      const res = await inScope();
      expect(ids(res).sort()).toEqual([m1, m2, m3].sort());
      expect(res.total).toBe(3);
      expect(ids(await search({ q: tag }))).not.toContain(noProfile);
    });

    it('이름 검색(부분 일치, 대소문자 무시)과 LIKE 와일드카드 이스케이프', async () => {
      expect(ids(await search({ q: `${tag}김` }))).toEqual([m1]);
      expect(ids(await search({ q: `${tag.toUpperCase()}이영` }))).toEqual([m2]);
      expect(ids(await search({ q: '%' }))).toEqual([m3]); // 100%_박 만 일치. 이스케이프 안 하면 전부 일치
      expect(ids(await search({ q: `${tag}_` }))).toEqual([]); // '_'가 임의 한 글자로 해석되면 안 됨
      expect(ids(await search({ q: `${tag}탈퇴` }))).toEqual([]);
    });

    it('역할/기술/관심 분야: 같은 분류 안은 OR, 분류끼리는 AND', async () => {
      expect(ids(await search({ roleIds: `${roleA}` })).sort()).toEqual([m1, m3].sort());
      expect(ids(await search({ roleIds: `${roleA},${roleB}` })).sort()).toEqual([m1, m2, m3].sort());
      expect(ids(await search({ skillIds: [String(skillY)] })).sort()).toEqual([m2, m3].sort());
      expect(ids(await search({ roleIds: `${roleA}`, skillIds: `${skillY}` }))).toEqual([m3]);
      expect(ids(await search({ roleIds: `${roleB}`, interestIds: `${interestP}` }))).toEqual([m3]);
      expect(ids(await search({ roleIds: `${roleA}`, interestIds: `${interestQ}` }))).toEqual([m3]);
    });

    it('참여 가능 여부 필터와 복합 조건', async () => {
      expect(ids(await inScope({ available: 'true' })).sort()).toEqual([m1, m3].sort());
      expect(ids(await inScope({ available: 'false' }))).toEqual([m2]);
      expect(ids(await inScope({ available: 'true', q: '철수' }))).toEqual([m1]);
      expect(ids(await inScope({ available: 'false', q: '철수' }))).toEqual([]);
    });

    it('한 회원이 여러 조건에 걸려도 결과에 중복되지 않고, 목록에 역할/기술/관심 분야가 포함', async () => {
      const res = await search({ roleIds: `${roleA},${roleB}`, skillIds: `${skillX},${skillY}` });
      expect(ids(res).filter((i) => i === m3)).toHaveLength(1);
      const item = res.items.find((i) => i.userId === m3)!;
      expect(item.roles).toHaveLength(2);
      expect(item.skills).toHaveLength(2);
      expect(item.interests).toHaveLength(2);
    });

    it('페이지네이션과 정렬(이름 오름차순)', async () => {
      const p1 = await inScope({ size: '2', page: '1', sortBy: 'name', sortDir: 'asc' });
      const p2 = await inScope({ size: '2', page: '2', sortBy: 'name', sortDir: 'asc' });
      expect(p1.total).toBe(3);
      expect(p1.totalPages).toBe(2);
      expect(p1.items).toHaveLength(2);
      expect(p2.items).toHaveLength(1);
      const names = [...p1.items, ...p2.items].map((i) => i.name);
      expect(names).toEqual([...names].sort());
      expect((await inScope({ page: '9' })).items).toHaveLength(0);
    });

    it('SQL 인젝션 시도는 문자 그대로 검색되어 결과 없음', async () => {
      expect(ids(await search({ q: `x'; DROP TABLE users; --` }))).toEqual([]);
      expect((await one(`SELECT count(*)::int AS n FROM users`)).n).toBeGreaterThan(0);
    });
  });

  it('프로필 선택 목록: 기본 기술만 노출하고 직접 입력 기술은 제외', async () => {
    const opts = await service.getOptions();
    expect(opts.roles.map((r) => r.id)).toEqual(expect.arrayContaining([roleA, roleB]));
    expect(opts.skills.every((s) => !s.isCustom)).toBe(true);
    expect(opts.skills.map((s) => s.id)).toEqual(expect.arrayContaining([skillX, skillY]));
  });
});
