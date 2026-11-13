import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database.service';
import { NEW_MEMBER_DAYS } from './recommendation.util';

export interface RecruitmentRow {
  id: string;
  author_id: string;
  title: string;
  description: string;
  status: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
}

export interface TargetRoleRow {
  recruitment_role_id: string; // recruitment_roles.id (AI의 role_id로 사용)
  role_id: number; // roles.id
  role_name: string;
}

export interface ExperienceRow {
  experience_id: string;
  name: string;
  type: 'OFFICIAL' | 'MATCHED' | 'PERSONAL';
  started_on: string | null;
  ended_on: string | null;
  member_role: string | null; // 이 모집글의 확정 팀원으로 맡은 역할(DB 역할명)
  role_desc: string | null; // 사용자가 직접 적은 역할 (표준 역할명과 일치할 때만 서비스에서 인정)
  description: string | null;
  skills: string[] | null;
}

export interface CandidateRow {
  user_id: string;
  name: string;
  bio: string | null;
  desired_roles: string[] | null;
  skills: string[] | null;
  interests: string[] | null;
  available: boolean;
  available_from: string | null;
  completed: boolean;
  is_new_member: boolean;
  study_count: number;
  experiences: ExperienceRow[] | null;
}

@Injectable()
export class RecommendationRepository {
  constructor(private readonly database: DatabaseService) {}

  // 모집글 기본 정보 (삭제된 글은 제외). 날짜는 문자열(YYYY-MM-DD)로 받는다
  async findRecruitment(recruitmentId: string): Promise<RecruitmentRow | null> {
    const r = await this.database.query<RecruitmentRow>(
      `SELECT id, author_id, title, description, status,
              to_char(start_date, 'YYYY-MM-DD') AS start_date,
              to_char(end_date, 'YYYY-MM-DD')   AS end_date
         FROM recruitments
        WHERE id = $1 AND deleted_at IS NULL`,
      [recruitmentId],
    );
    return r.rows[0] ?? null;
  }

  // 모집 역할 1건 (모집글에 속한 recruitment_roles.id 기준)
  async findTargetRole(recruitmentId: string, recruitmentRoleId: string): Promise<TargetRoleRow | null> {
    const r = await this.database.query<TargetRoleRow>(
      `SELECT rr.id AS recruitment_role_id, rr.role_id, ro.name AS role_name
         FROM recruitment_roles rr
         JOIN roles ro ON ro.id = rr.role_id
        WHERE rr.recruitment_id = $1 AND rr.id = $2`,
      [recruitmentId, recruitmentRoleId],
    );
    return r.rows[0] ?? null;
  }

  // 모집글의 관심 분야 이름
  async findInterestNames(recruitmentId: string): Promise<string[]> {
    const r = await this.database.query<{ name: string }>(
      `SELECT ia.name
         FROM recruitment_interests ri
         JOIN interest_areas ia ON ia.id = ri.interest_id
        WHERE ri.recruitment_id = $1`,
      [recruitmentId],
    );
    return r.rows.map((x) => x.name);
  }

  // 역할별 필수·우대 기술. 역할별 기술이 없는 옛 글은 모집글 전체 기술로 대신한다
  async findRoleSkills(recruitmentId: string, roleId: number): Promise<{ name: string; required: boolean }[]> {
    const perRole = await this.database.query<{ name: string; required: boolean }>(
      `SELECT s.name, rs.required
         FROM recruitment_role_skills rs
         JOIN skills s ON s.id = rs.skill_id
        WHERE rs.recruitment_id = $1 AND rs.role_id = $2`,
      [recruitmentId, roleId],
    );
    if (perRole.rows.length > 0) return perRole.rows;

    const all = await this.database.query<{ name: string; required: boolean }>(
      `SELECT s.name, rs.required
         FROM recruitment_skills rs
         JOIN skills s ON s.id = rs.skill_id
        WHERE rs.recruitment_id = $1`,
      [recruitmentId],
    );
    return all.rows;
  }

  // 정책 3: 작성자 + 확정 팀원 + 대기(PENDING)·수락(ACCEPTED) 지원/제안 당사자
  async findExcludedUserIds(recruitmentId: string, authorId: string): Promise<string[]> {
    const r = await this.database.query<{ user_id: string }>(
      `SELECT $2::uuid AS user_id
       UNION
       SELECT user_id FROM recruitment_members WHERE recruitment_id = $1
       UNION
       SELECT sender_id FROM applications
        WHERE recruitment_id = $1 AND status IN ('PENDING', 'ACCEPTED')
       UNION
       SELECT receiver_id FROM applications
        WHERE recruitment_id = $1 AND status IN ('PENDING', 'ACCEPTED')`,
      [recruitmentId, authorId],
    );
    return r.rows.map((x) => x.user_id);
  }

  // 후보자 snapshot. 희망 역할이 대상 역할과 같고, AI가 요구하는 최소 정보(역할·기술·관심 분야 각 1개 이상)가 있는 활성 회원만.
  // 이름·이미지·연락처는 AI로 보내지 않고, 응답 보강용(name, bio)으로만 읽는다.
  async findCandidates(roleDbNames: string[], excludedUserIds: string[]): Promise<CandidateRow[]> {
    const r = await this.database.query<CandidateRow>(
      `SELECT u.id AS user_id,
              u.name,
              p.bio,
              (SELECT array_agg(ro.name) FROM profile_roles pr
                 JOIN roles ro ON ro.id = pr.role_id WHERE pr.user_id = u.id) AS desired_roles,
              (SELECT array_agg(s.name) FROM profile_skills ps
                 JOIN skills s ON s.id = ps.skill_id WHERE ps.user_id = u.id) AS skills,
              (SELECT array_agg(ia.name) FROM profile_interests pi
                 JOIN interest_areas ia ON ia.id = pi.interest_id WHERE pi.user_id = u.id) AS interests,
              p.available,
              to_char(p.available_from, 'YYYY-MM-DD') AS available_from,
              u.completed,
              (u.join_verified_at IS NOT NULL
                 AND u.completed = FALSE
                 AND u.join_verified_at > now() - make_interval(days => $3)) AS is_new_member,
              -- 스터디 참여 횟수의 원본 컬럼이 아직 없어(activity_scores는 마이그레이션 충돌로 study_count 없음) 0으로 보낸다
              0 AS study_count,
              (SELECT json_agg(json_build_object(
                        'experience_id', pe.id,
                        'name', pe.name,
                        'type', pe.type,
                        'started_on', to_char(pe.started_on, 'YYYY-MM-DD'),
                        'ended_on', to_char(pe.ended_on, 'YYYY-MM-DD'),
                        'member_role', (SELECT ro.name FROM recruitment_members rm
                                          JOIN roles ro ON ro.id = rm.role_id
                                         WHERE rm.recruitment_id = pe.recruitment_id AND rm.user_id = pe.user_id),
                        'role_desc', btrim(pe.role_desc),
                        'description', pe.description,
                        'skills', (SELECT array_agg(s.name) FROM project_experience_skills pes
                                     JOIN skills s ON s.id = pes.skill_id WHERE pes.experience_id = pe.id)))
                 FROM project_experiences pe WHERE pe.user_id = u.id) AS experiences
         FROM users u
         JOIN profiles p ON p.user_id = u.id
        WHERE u.status = 'ACTIVE'
          AND u.join_verified_at IS NOT NULL
          AND u.id <> ALL($2::uuid[])
          AND EXISTS (SELECT 1 FROM profile_roles pr JOIN roles ro ON ro.id = pr.role_id
                       WHERE pr.user_id = u.id AND ro.name = ANY($1::text[]))
          AND EXISTS (SELECT 1 FROM profile_skills ps WHERE ps.user_id = u.id)
          AND EXISTS (SELECT 1 FROM profile_interests pi WHERE pi.user_id = u.id)
        ORDER BY u.created_at, u.id`,
      [roleDbNames, excludedUserIds, NEW_MEMBER_DAYS],
    );
    return r.rows;
  }
}
