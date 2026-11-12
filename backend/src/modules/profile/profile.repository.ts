// 프로필/프로젝트 경험/부원 검색 SQL. 모든 메서드는 트랜잭션 client(db)를 받을 수 있다.
import { Injectable } from '@nestjs/common';
import { DatabaseService, Queryable } from '../../common/database.service';
import type { ResolvedSort } from '../../common/pagination';
import type { ExperienceResponse, IdName, MemberListItem, ProfileOptions, SkillItem } from './profile.dto';

// 역할/기술/관심 분야를 JSON 배열로 묶는 서브쿼리 (프로필 별칭 p 기준)
const ROLES_JSON = `COALESCE((SELECT json_agg(json_build_object('id', r.id, 'name', r.name) ORDER BY r.id)
  FROM profile_roles pr JOIN roles r ON r.id = pr.role_id WHERE pr.user_id = p.user_id), '[]'::json)`;
const SKILLS_JSON = `COALESCE((SELECT json_agg(json_build_object('id', s.id, 'name', s.name, 'isCustom', s.is_custom) ORDER BY s.name, s.id)
  FROM profile_skills ps JOIN skills s ON s.id = ps.skill_id WHERE ps.user_id = p.user_id), '[]'::json)`;
const INTERESTS_JSON = `COALESCE((SELECT json_agg(json_build_object('id', i.id, 'name', i.name) ORDER BY i.id)
  FROM profile_interests pi JOIN interest_areas i ON i.id = pi.interest_id WHERE pi.user_id = p.user_id), '[]'::json)`;

export interface ProfileRow {
  userId: string;
  name: string;
  status: 'ACTIVE' | 'WITHDRAWN';
  bio: string | null;
  githubUrl: string | null;
  available: boolean;
  availableFrom: string | null;
  roles: IdName[];
  skills: SkillItem[];
  interests: IdName[];
  graduationCohort: number | null;
  updatedAt: string;
}

export interface ProfileSaveValues {
  bio: string | null;
  githubUrl: string | null;
  available: boolean;
  availableFrom: string | null;
}

export interface ExperienceSaveValues {
  name: string;
  startedOn: string | null;
  endedOn: string | null;
  roleDesc: string | null;
  description: string | null;
  link: string | null;
  isPublic: boolean;
}

// 아카이브 → 경험 복사에 필요한 원본 값
export interface ArchiveImportSource {
  id: string;
  title: string;
  description: string | null;
  techStacks: string[];
  startedOn: string | null;
  endedOn: string | null;
  link: string | null;
  memberRole: string | null;
  isMember: boolean;
}

export interface MemberFilter {
  q?: string;
  roleIds?: number[];
  skillIds?: number[];
  interestIds?: number[];
  available?: boolean;
}

// LIKE 와일드카드(%, _, \)를 문자 그대로 검색하도록 이스케이프
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&');
}

@Injectable()
export class ProfileRepository {
  constructor(private readonly database: DatabaseService) {}

  // ===== 회원 =====

  // 활성 회원 행을 잠그고 조회 (같은 회원의 동시 수정 직렬화). 없거나 탈퇴했으면 null
  async lockActiveUser(userId: string, db: Queryable = this.database): Promise<{ id: string } | null> {
    const r = await db.query<{ id: string }>(`SELECT id FROM users WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE`, [
      userId,
    ]);
    return r.rows[0] ?? null;
  }

  async updateUserName(userId: string, name: string, db: Queryable = this.database): Promise<void> {
    await db.query(`UPDATE users SET name = $2, updated_at = now() WHERE id = $1`, [userId, name]);
  }

  // ===== 선택 목록 / ID 검증 =====

  async findExistingIds(
    table: 'roles' | 'skills' | 'interest_areas',
    ids: number[],
    db: Queryable = this.database,
  ): Promise<number[]> {
    if (ids.length === 0) return [];
    // table은 위 리터럴 유니온으로만 들어오므로 SQL에 직접 넣어도 안전하다
    const r = await db.query<{ id: number }>(`SELECT id FROM ${table} WHERE id = ANY($1::int[])`, [ids]);
    return r.rows.map((x) => x.id);
  }

  // 직접 입력 기술 저장. 정규화 이름이 이미 있으면 기존 항목을 재사용하고 id를 반환
  async upsertCustomSkill(name: string, nameNorm: string, db: Queryable = this.database): Promise<number> {
    const r = await db.query<{ id: number }>(
      `INSERT INTO skills (name, name_norm, is_custom) VALUES ($1, $2, TRUE)
       ON CONFLICT (name_norm) DO UPDATE SET name = skills.name
       RETURNING id`,
      [name, nameNorm],
    );
    return r.rows[0].id;
  }

  async countCustomSkills(ids: number[], db: Queryable = this.database): Promise<number> {
    if (ids.length === 0) return 0;
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM skills WHERE id = ANY($1::int[]) AND is_custom`,
      [ids],
    );
    return r.rows[0].n;
  }

  async listOptions(db: Queryable = this.database): Promise<ProfileOptions> {
    const [roles, skills, interests] = await Promise.all([
      db.query<IdName>(`SELECT id, name FROM roles ORDER BY id`),
      db.query<SkillItem>(`SELECT id, name, is_custom AS "isCustom" FROM skills WHERE NOT is_custom ORDER BY name`),
      db.query<IdName>(`SELECT id, name FROM interest_areas ORDER BY id`),
    ]);
    return { roles: roles.rows, skills: skills.rows, interests: interests.rows };
  }

  // ===== 프로필 =====

  async upsertProfile(userId: string, v: ProfileSaveValues, db: Queryable = this.database): Promise<void> {
    // 내용이 바뀌었으므로 임베딩 재계산 대상으로 표시
    await db.query(
      `INSERT INTO profiles (user_id, bio, github_url, available, available_from, embedding_stale, updated_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, now())
       ON CONFLICT (user_id) DO UPDATE SET
         bio = EXCLUDED.bio, github_url = EXCLUDED.github_url, available = EXCLUDED.available,
         available_from = EXCLUDED.available_from, embedding_stale = TRUE, updated_at = now()`,
      [userId, v.bio, v.githubUrl, v.available, v.availableFrom],
    );
  }

  async replaceRoles(userId: string, ids: number[], db: Queryable = this.database): Promise<void> {
    await db.query(`DELETE FROM profile_roles WHERE user_id = $1`, [userId]);
    await db.query(`INSERT INTO profile_roles (user_id, role_id) SELECT $1, unnest($2::smallint[])`, [userId, ids]);
  }

  async replaceSkills(userId: string, ids: number[], db: Queryable = this.database): Promise<void> {
    await db.query(`DELETE FROM profile_skills WHERE user_id = $1`, [userId]);
    await db.query(`INSERT INTO profile_skills (user_id, skill_id) SELECT $1, unnest($2::int[])`, [userId, ids]);
  }

  async replaceInterests(userId: string, ids: number[], db: Queryable = this.database): Promise<void> {
    await db.query(`DELETE FROM profile_interests WHERE user_id = $1`, [userId]);
    await db.query(`INSERT INTO profile_interests (user_id, interest_id) SELECT $1, unnest($2::smallint[])`, [
      userId,
      ids,
    ]);
  }

  async findProfile(userId: string, db: Queryable = this.database): Promise<ProfileRow | null> {
    const r = await db.query<ProfileRow>(
      `SELECT p.user_id AS "userId", u.name, u.status, p.bio, p.github_url AS "githubUrl", p.available,
              to_char(p.available_from, 'YYYY-MM-DD') AS "availableFrom",
              ${ROLES_JSON} AS roles, ${SKILLS_JSON} AS skills, ${INTERESTS_JSON} AS interests,
              u.graduation_cohort AS "graduationCohort",
              to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "updatedAt"
       FROM profiles p JOIN users u ON u.id = p.user_id
       WHERE p.user_id = $1`,
      [userId],
    );
    return r.rows[0] ?? null;
  }

  // ===== 프로젝트 경험 =====

  private static readonly EXPERIENCE_SELECT = `
    SELECT e.id, e.name, e.type, to_char(e.started_on, 'YYYY-MM-DD') AS "startedOn",
           to_char(e.ended_on, 'YYYY-MM-DD') AS "endedOn", e.role_desc AS "roleDesc", e.description, e.link,
           e.is_public AS "isPublic", e.archive_id AS "archiveId",
           COALESCE((SELECT json_agg(json_build_object('id', s.id, 'name', s.name, 'isCustom', s.is_custom) ORDER BY s.name, s.id)
             FROM project_experience_skills es JOIN skills s ON s.id = es.skill_id WHERE es.experience_id = e.id), '[]'::json) AS skills
    FROM project_experiences e`;

  // 최신순(종료일 → 시작일 → 등록일). onlyPublic=true면 공개 프로젝트만
  async listExperiences(userId: string, onlyPublic: boolean, db: Queryable = this.database): Promise<ExperienceResponse[]> {
    const r = await db.query<ExperienceResponse>(
      `${ProfileRepository.EXPERIENCE_SELECT}
       WHERE e.user_id = $1 ${onlyPublic ? 'AND e.is_public' : ''}
       ORDER BY COALESCE(e.ended_on, e.started_on, e.created_at::date) DESC, e.created_at DESC, e.id`,
      [userId],
    );
    return r.rows;
  }

  async findExperience(id: string, userId: string, db: Queryable = this.database): Promise<ExperienceResponse | null> {
    const r = await db.query<ExperienceResponse>(
      `${ProfileRepository.EXPERIENCE_SELECT} WHERE e.id = $1 AND e.user_id = $2`,
      [id, userId],
    );
    return r.rows[0] ?? null;
  }

  // 수정/삭제 전에 본인 소유 경험 행을 잠그고 종류와 연결된 모집글 id를 조회
  async lockExperience(
    id: string,
    userId: string,
    db: Queryable = this.database,
  ): Promise<{ type: ExperienceResponse['type']; recruitmentId: string | null } | null> {
    const r = await db.query<{ type: ExperienceResponse['type']; recruitmentId: string | null }>(
      `SELECT type, recruitment_id AS "recruitmentId" FROM project_experiences WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [id, userId],
    );
    return r.rows[0] ?? null;
  }

  async countExperiences(userId: string, db: Queryable = this.database): Promise<number> {
    const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM project_experiences WHERE user_id = $1`, [
      userId,
    ]);
    return r.rows[0].n;
  }

  // 직접 입력(PERSONAL) 경험 생성. 생성된 id 반환
  async insertPersonalExperience(userId: string, v: ExperienceSaveValues, db: Queryable = this.database): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO project_experiences (user_id, name, type, started_on, ended_on, role_desc, description, link, is_public)
       VALUES ($1, $2, 'PERSONAL', $3, $4, $5, $6, $7, $8) RETURNING id`,
      [userId, v.name, v.startedOn, v.endedOn, v.roleDesc, v.description, v.link, v.isPublic],
    );
    return r.rows[0].id;
  }

  // 종류와 상관없이 내용을 수정 (소유자 확인은 lockExperience 에서 끝낸다)
  async updateExperience(id: string, v: ExperienceSaveValues, db: Queryable = this.database): Promise<void> {
    await db.query(
      `UPDATE project_experiences SET name = $2, started_on = $3, ended_on = $4, role_desc = $5, description = $6,
              link = $7, is_public = $8, embedding_stale = TRUE
       WHERE id = $1`,
      [id, v.name, v.startedOn, v.endedOn, v.roleDesc, v.description, v.link, v.isPublic],
    );
  }

  async replaceExperienceSkills(id: string, skillIds: number[], db: Queryable = this.database): Promise<void> {
    await db.query(`DELETE FROM project_experience_skills WHERE experience_id = $1`, [id]);
    if (skillIds.length === 0) return;
    await db.query(`INSERT INTO project_experience_skills (experience_id, skill_id) SELECT $1, unnest($2::int[])`, [
      id,
      skillIds,
    ]);
  }

  async setExperienceVisibility(id: string, isPublic: boolean, db: Queryable = this.database): Promise<void> {
    await db.query(`UPDATE project_experiences SET is_public = $2 WHERE id = $1`, [id, isPublic]);
  }

  // 종류와 상관없이 삭제 (소유자 확인은 lockExperience 에서 끝낸다)
  async deleteExperience(id: string, db: Queryable = this.database): Promise<void> {
    await db.query(`DELETE FROM project_experiences WHERE id = $1`, [id]);
  }

  // 본인이 지운 동아리원 팀(MATCHED) 경험 기록: 마감 처리가 다시 돌아도 되살아나지 않게 한다
  async recordDeletedMatched(userId: string, recruitmentId: string, db: Queryable = this.database): Promise<void> {
    await db.query(
      `INSERT INTO deleted_matched_experiences (user_id, recruitment_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, recruitmentId],
    );
  }

  // 가져오기용 아카이브 조회. 참여 부원이 아니면 memberRole 이 null
  async findArchiveForImport(archiveId: string, userId: string, db: Queryable = this.database): Promise<ArchiveImportSource | null> {
    const r = await db.query<ArchiveImportSource>(
      `SELECT p.id, p.title, p.description, p.tech_stacks AS "techStacks",
              to_char(p.started_at, 'YYYY-MM-DD') AS "startedOn", to_char(p.ended_at, 'YYYY-MM-DD') AS "endedOn",
              (SELECT l.url FROM club_project_links l WHERE l.project_id = p.id ORDER BY l.sort_order, l.created_at LIMIT 1) AS link,
              (SELECT m.role FROM club_project_members m WHERE m.project_id = p.id AND m.user_id = $2 LIMIT 1) AS "memberRole",
              EXISTS (SELECT 1 FROM club_project_members m WHERE m.project_id = p.id AND m.user_id = $2) AS "isMember"
       FROM club_projects p WHERE p.id = $1`,
      [archiveId, userId],
    );
    return r.rows[0] ?? null;
  }

  // 아카이브 복사본(OFFICIAL, 비공개) 생성. 이미 가져왔으면 null (사용자+아카이브 유니크)
  async insertImportedExperience(userId: string, src: ArchiveImportSource, db: Queryable = this.database): Promise<string | null> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO project_experiences (user_id, name, type, started_on, ended_on, role_desc, description, link, is_public, archive_id)
       VALUES ($1, $2, 'OFFICIAL', $3, $4, $5, $6, $7, FALSE, $8)
       ON CONFLICT (user_id, archive_id) WHERE archive_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [userId, src.title, src.startedOn, src.endedOn, src.memberRole, src.description, src.link, src.id],
    );
    return r.rows[0]?.id ?? null;
  }

  // 기술 이름(정규화됨) → 기본 목록에 있는 기술 id. 목록에 없는 이름은 빠진다
  async findSkillIdsByNorm(norms: string[], db: Queryable = this.database): Promise<number[]> {
    if (norms.length === 0) return [];
    const r = await db.query<{ id: number }>(`SELECT id FROM skills WHERE name_norm = ANY($1::text[])`, [norms]);
    return r.rows.map((x) => x.id);
  }

  // ===== 부원 검색 =====

  // 전달된 조건만 WHERE에 추가하는 동적 쿼리. 탈퇴 회원과 프로필 없는 회원은 제외.
  // 값은 모두 바인딩 파라미터, 정렬 컬럼은 호출 측에서 허용 목록으로 검증된 값만 받는다.
  async searchMembers(
    f: MemberFilter,
    paging: { limit: number; offset: number },
    sort: ResolvedSort,
    db: Queryable = this.database,
  ): Promise<{ items: MemberListItem[]; total: number }> {
    const params: unknown[] = [];
    const bind = (v: unknown): string => {
      params.push(v);
      return `$${params.length}`;
    };

    const where: string[] = [`u.status = 'ACTIVE'`];
    if (f.q) where.push(`u.name ILIKE ${bind('%' + escapeLike(f.q) + '%')} ESCAPE '\\'`);
    if (f.roleIds?.length) {
      where.push(
        `EXISTS (SELECT 1 FROM profile_roles x WHERE x.user_id = p.user_id AND x.role_id = ANY(${bind(f.roleIds)}::smallint[]))`,
      );
    }
    if (f.skillIds?.length) {
      where.push(
        `EXISTS (SELECT 1 FROM profile_skills x WHERE x.user_id = p.user_id AND x.skill_id = ANY(${bind(f.skillIds)}::int[]))`,
      );
    }
    if (f.interestIds?.length) {
      where.push(
        `EXISTS (SELECT 1 FROM profile_interests x WHERE x.user_id = p.user_id AND x.interest_id = ANY(${bind(f.interestIds)}::smallint[]))`,
      );
    }
    if (f.available !== undefined) where.push(`p.available = ${bind(f.available)}`);

    const fromWhere = `FROM profiles p JOIN users u ON u.id = p.user_id WHERE ${where.join(' AND ')}`;
    const filterParams = [...params];

    const limitPh = bind(paging.limit);
    const offsetPh = bind(paging.offset);
    const [rows, count] = await Promise.all([
      db.query<MemberListItem>(
        `SELECT p.user_id AS "userId", u.name, p.bio, p.available,
                to_char(p.available_from, 'YYYY-MM-DD') AS "availableFrom",
                ${ROLES_JSON} AS roles, ${SKILLS_JSON} AS skills, ${INTERESTS_JSON} AS interests
         ${fromWhere}
         ORDER BY ${sort.column} ${sort.direction === 'asc' ? 'ASC' : 'DESC'}, p.user_id
         LIMIT ${limitPh} OFFSET ${offsetPh}`,
        params,
      ),
      db.query<{ n: number }>(`SELECT count(*)::int AS n ${fromWhere}`, filterParams),
    ]);
    return { items: rows.rows, total: count.rows[0].n };
  }
}
