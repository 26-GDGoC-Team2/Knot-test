// AI 추천 시험용 데모 데이터 시드/삭제 스크립트 (운영 DB에서는 실행하지 말 것)
//
// 왜 필요한가: AI 서버는 OpenAI 키 없이 "데모 50명 + 데모 모집 조건" 임베딩 캐시만 갖고 있다.
//   그래서 이 스크립트가 같은 내용의 데모 회원 50명과 데모 모집글 1개를 시험 DB에 만든다.
//   (새 모집글·새 회원은 캐시에 없어 키 없이는 추천이 503이 된다)
//
// 사용 (backend 폴더에서):
//   DATABASE_URL=... node scripts/seed-demo-recommendation.mjs --author-email you@gmail.com --yes
//   DATABASE_URL=... node scripts/seed-demo-recommendation.mjs --author-email you@gmail.com --remove --yes
//
// 규칙:
//   - --author-email : 이미 로그인해서 가입된 사용자 이메일. 이 사람이 데모 모집글의 작성자(=추천 조회 가능자)가 된다.
//   - --yes          : 없으면 대상 DB 주소만 보여 주고 아무것도 하지 않는다.
//   - 데모 회원 이메일은 *@demo.knot.invalid (실제로 존재할 수 없는 도메인)
//   - 전부 하나의 트랜잭션: 중간에 실패하면 아무것도 남지 않는다.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// 캐시의 데모 모집 조건과 글자 하나까지 같아야 한다 (AI 서버 scripts/demo_api_recommendation.py 기준)
const DEMO_TITLE = 'AI 서비스 백엔드 개발';
const DEMO_DESC =
  'FastAPI 기반 AI 서비스를 함께 개발할 백엔드 팀원을 모집합니다. API 설계와 데이터 처리 경험이 있는 팀원을 찾습니다.';
const DEMO_START = '2026-12-01';
const DEMO_END = '2027-03-01';
const DEMO_DOMAIN = 'demo.knot.invalid';

// 데모 역할명 → 서비스 DB 역할명 ('앱'은 DB에 없어 건너뜀)
const ROLE_DB = { BE: 'BE', FE: 'FE', PM: '기획', AI: 'AI/Data', 디자인: '디자인' };
const TYPE = { CLUB_PROJECT: 'OFFICIAL', MEMBER_TEAM: 'MATCHED', SELF_REPORTED: 'PERSONAL' };
const norm = (n) => n.toLowerCase().replace(/\s/g, '');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name) => process.argv.includes(name);

const url = process.env.DATABASE_URL;
const authorEmail = arg('--author-email')?.trim().toLowerCase();
const remove = has('--remove');
if (!url || !authorEmail) {
  console.error('DATABASE_URL 환경변수와 --author-email 이 필요합니다.');
  process.exit(1);
}
const host = new URL(url).host;
console.log(`대상 DB: ${host} / 작성자: ${authorEmail} / 동작: ${remove ? '데모 데이터 삭제' : '데모 데이터 생성'}`);
if (!has('--yes')) {
  console.log('--yes 가 없어 아무것도 하지 않았습니다. 위 대상이 맞으면 --yes 를 붙여 다시 실행하세요.');
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const people = JSON.parse(
  readFileSync(join(here, '..', '..', 'ai', 'data', 'demo', 'personas_50.json'), 'utf8').replace(/^﻿/, ''),
);

const client = new pg.Client({ connectionString: url });
await client.connect();
const q = (t, p) => client.query(t, p);

try {
  await q('BEGIN');
  const author = (await q('SELECT id FROM users WHERE email = $1 AND status = $2', [authorEmail, 'ACTIVE'])).rows[0];
  if (!author) throw new Error(`작성자(${authorEmail})가 DB에 없습니다. 먼저 그 계정으로 로그인해 가입을 마치세요.`);

  const existingRec = (
    await q('SELECT id FROM recruitments WHERE author_id = $1 AND title = $2 AND description = $3', [author.id, DEMO_TITLE, DEMO_DESC])
  ).rows;
  const existingUsers = (await q('SELECT count(*)::int AS n FROM users WHERE email LIKE $1', [`%@${DEMO_DOMAIN}`])).rows[0].n;

  if (remove) {
    // 모집글을 지우면 역할·기술·지원·팀원 행이 함께 삭제된다. 그 뒤 데모 회원 삭제 (프로필 등은 CASCADE)
    for (const r of existingRec) await q('DELETE FROM recruitments WHERE id = $1', [r.id]);
    const del = await q('DELETE FROM users WHERE email LIKE $1', [`%@${DEMO_DOMAIN}`]);
    await q('COMMIT');
    console.log(`삭제 완료: 데모 모집글 ${existingRec.length}개, 데모 회원 ${del.rowCount}명`);
  } else {
    if (existingUsers > 0 || existingRec.length > 0) {
      throw new Error(`이미 데모 데이터가 있습니다(회원 ${existingUsers}명, 모집글 ${existingRec.length}개). 먼저 --remove 로 지우세요.`);
    }
    const roleId = async (n) => (await q('SELECT id FROM roles WHERE name = $1', [n])).rows[0]?.id;
    const skillId = async (n) => {
      await q('INSERT INTO skills (name, name_norm, is_custom) VALUES ($1, $2, TRUE) ON CONFLICT (name_norm) DO NOTHING', [n, norm(n)]);
      return (await q('SELECT id FROM skills WHERE name_norm = $1', [norm(n)])).rows[0].id;
    };
    const interestId = async (n) => {
      await q('INSERT INTO interest_areas (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [n]);
      return (await q('SELECT id FROM interest_areas WHERE name = $1', [n])).rows[0].id;
    };

    for (const p of people) {
      const u = (
        await q(
          `INSERT INTO users (google_sub, email, name, completed, join_verified_at)
           VALUES ($1, $2, $3, $4, now() - make_interval(days => $5)) RETURNING id`,
          [`demo-${p.user_id}`, `${p.user_id.toLowerCase()}@${DEMO_DOMAIN}`, p.name, p.completion_status === '수료', p.is_new_member ? 5 : 200],
        )
      ).rows[0].id;
      await q('INSERT INTO profiles (user_id, bio, available, available_from) VALUES ($1, $2, $3, $4)', [
        u, p.introduction, p.availability === '참여 가능', p.available_from || null,
      ]);
      for (const r of p.desired_roles) {
        const id = await roleId(ROLE_DB[r]);
        if (id) await q('INSERT INTO profile_roles VALUES ($1, $2) ON CONFLICT DO NOTHING', [u, id]);
      }
      for (const s of p.skills) await q('INSERT INTO profile_skills VALUES ($1, $2) ON CONFLICT DO NOTHING', [u, await skillId(s)]);
      for (const i of p.interests) await q('INSERT INTO profile_interests VALUES ($1, $2) ON CONFLICT DO NOTHING', [u, await interestId(i)]);
      for (const e of p.project_experiences) {
        // 월 단위 날짜(2026-04)는 일을 지어내지 않고 비워 둔다 (AI 데모와 동일)
        const eid = (
          await q(
            `INSERT INTO project_experiences (user_id, name, type, role_desc, description) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [u, e.title, TYPE[e.project_type], e.role || null, e.description],
          )
        ).rows[0].id;
        for (const s of e.skills) await q('INSERT INTO project_experience_skills VALUES ($1, $2) ON CONFLICT DO NOTHING', [eid, await skillId(s)]);
      }
    }

    const BE = await roleId('BE');
    if (!BE) throw new Error("DB에 'BE' 역할이 없습니다.");
    const rec = (
      await q(
        `INSERT INTO recruitments (author_id, title, description, start_date, end_date, open_chat_url)
         VALUES ($1, $2, $3, $4, $5, 'https://open.kakao.com/o/demo') RETURNING id`,
        [author.id, DEMO_TITLE, DEMO_DESC, DEMO_START, DEMO_END],
      )
    ).rows[0].id;
    const rr = (await q('INSERT INTO recruitment_roles (recruitment_id, role_id, capacity) VALUES ($1, $2, 3) RETURNING id', [rec, BE])).rows[0].id;
    for (const i of ['백엔드', 'AI/ML']) await q('INSERT INTO recruitment_interests VALUES ($1, $2)', [rec, await interestId(i)]);
    for (const [s, required] of [['Python', true], ['FastAPI', true], ['PostgreSQL', false], ['Docker', false]]) {
      const sid = await skillId(s);
      await q('INSERT INTO recruitment_skills VALUES ($1, $2, $3)', [rec, sid, required]);
      await q('INSERT INTO recruitment_role_skills VALUES ($1, $2, $3, $4)', [rec, BE, sid, required]);
    }
    await q('COMMIT');
    console.log(`생성 완료: 데모 회원 ${people.length}명`);
    console.log(`추천 호출 경로: GET /recommendations/${rec}/roles/${rr}  (작성자 ${authorEmail} 로그인 토큰 필요)`);
  }
} catch (e) {
  await q('ROLLBACK').catch(() => {});
  console.error('실패(변경 없음):', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
