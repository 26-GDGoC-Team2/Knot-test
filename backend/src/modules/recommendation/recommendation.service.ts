import { Injectable, Logger } from '@nestjs/common';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ServiceUnavailableError,
} from '../../common/app.exception';
import { CandidateRow, RecommendationRepository } from './recommendation.repository';
import { cleanStrings, dbRoleNamesFor, isUuid, parseRoleId, parseSkillList, resolveExperienceRole, toAiRole } from './recommendation.util';

// AI 서버 응답 (snake_case 계약, docs/api_contract.md)
interface AiReasonItem {
  type: string;
  label: string;
  text: string;
}
interface AiCandidate {
  user_id: string;
  score: number;
  raw_rank: number;
  display_rank: number;
  best_experience_id: string | null;
  reason_items: AiReasonItem[];
}
interface AiResponse {
  context_id: string;
  candidates: AiCandidate[];
  next_action: string;
}

// 프론트로 내려주는 응답 (camelCase)
export interface RecommendationResult {
  contextId: string | null;
  page: number;
  candidates: {
    userId: string;
    name: string;
    bio: string | null;
    availableFrom: string | null;
    roleId: number;
    roleName: string;
    score: number;
    rank: number;
    bestExperienceId: string | null;
    reasons: AiReasonItem[];
  }[];
  nextAction: string;
}

const AI_TIMEOUT_MS = 30_000; // 임베딩을 새로 만드는 첫 요청은 느릴 수 있다

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(private readonly repo: RecommendationRepository) {}

  // 모집글의 한 역할에 대한 추천 후보 (작성자만, 조회 전용이라 트랜잭션 불필요)
  // recommendation_cache는 조건·제외 대상이 바뀌면 낡은 결과가 나오므로 사용하지 않는다
  // roleKey: 숫자 역할 ID(roles.id, 모집글 상세의 roleId) 또는 recruitment_roles.id(UUID) 모두 허용
  // skillOverride: '조건 바꿔 다시 추천'용. 값이 있으면 모집글 기본 필수·우대 기술 대신 사용 (쉼표 구분 문자열)
  async getRecommendations(
    actorId: string,
    recruitmentId: string,
    roleKey: string,
    skillOverride?: { requiredSkills?: string; preferredSkills?: string },
  ): Promise<RecommendationResult> {
    const numericRoleId = parseRoleId(roleKey);
    if (!isUuid(recruitmentId) || (!isUuid(roleKey) && numericRoleId === null)) {
      throw new BadRequestError('모집글 또는 역할 번호가 올바르지 않아요');
    }

    const rec = await this.repo.findRecruitment(recruitmentId);
    if (!rec) throw new NotFoundError('모집글을 찾을 수 없어요');
    if (rec.author_id !== actorId) throw new ForbiddenError('모집글 작성자만 추천을 볼 수 있어요');
    if (rec.status !== 'OPEN') throw new ConflictError('모집 중인 글만 추천을 받을 수 있어요');

    const role =
      numericRoleId !== null
        ? await this.repo.findTargetRoleByRoleId(recruitmentId, numericRoleId)
        : await this.repo.findTargetRole(recruitmentId, roleKey);
    if (!role) throw new NotFoundError('모집 역할을 찾을 수 없어요');

    const aiRoleName = toAiRole(role.role_name);
    const [interests, roleSkills, excluded] = await Promise.all([
      this.repo.findInterestNames(recruitmentId),
      this.repo.findRoleSkills(recruitmentId, role.role_id),
      this.repo.findExcludedUserIds(recruitmentId, rec.author_id),
    ]);

    const rows = await this.repo.findCandidates(dbRoleNamesFor(aiRoleName), excluded);
    const candidates = rows.map((r) => this.toAiCandidate(r));

    // 후보가 없으면 AI 서버를 부르지 않고 빈 결과를 돌려준다
    if (candidates.length === 0) {
      return { contextId: null, page: 1, candidates: [], nextAction: 'CHANGE_CONDITIONS' };
    }

    // 조건 변경 값: 넘어온 쪽만 덮어쓴다 (빈 문자열이면 '없음'으로 해석)
    const requiredOverride = parseSkillList(skillOverride?.requiredSkills);
    const preferredOverride = parseSkillList(skillOverride?.preferredSkills);

    const body = {
      recruitment: {
        recruitment_id: rec.id,
        title: rec.title,
        description: rec.description ?? '',
        start_date: rec.start_date,
        end_date: rec.end_date,
        interests: cleanStrings(interests),
      },
      target_role: {
        role_id: role.recruitment_role_id,
        role_name: aiRoleName,
        required_skills: requiredOverride ?? cleanStrings(roleSkills.filter((s) => s.required).map((s) => s.name)),
        preferred_skills: preferredOverride ?? cleanStrings(roleSkills.filter((s) => !s.required).map((s) => s.name)),
      },
      candidates,
      excluded_user_ids: excluded,
    };

    const ai = await this.callAi(body);
    return this.toResult(ai, rows, role.role_id, role.role_name);
  }

  // DB 행 → AI 후보 DTO (이름·연락처는 보내지 않는다)
  private toAiCandidate(r: CandidateRow) {
    return {
      user_id: r.user_id,
      desired_roles: cleanStrings((r.desired_roles ?? []).map(toAiRole)),
      skills: cleanStrings(r.skills),
      interests: cleanStrings(r.interests),
      introduction: r.bio ?? '',
      available: r.available,
      available_from: r.available_from,
      completed: r.completed,
      is_new_member: r.is_new_member,
      study_count: Math.max(0, Number(r.study_count) || 0),
      project_experiences: (r.experiences ?? [])
        .filter((e) => typeof e.name === 'string' && e.name.trim() !== '')
        .map((e) => ({
          experience_id: e.experience_id,
          name: e.name.trim(),
          type: e.type,
          started_on: e.started_on,
          ended_on: e.ended_on,
          // 표준 역할로 확인된 경우만 전달하고, 아니면 추측하지 않고 null
          role: resolveExperienceRole(e.member_role, e.role_desc),
          description: e.description,
          skills: cleanStrings(e.skills),
        })),
    };
  }

  // AI 서버 호출과 오류 매핑. 내부 상세는 로그에만 남기고 외부에는 노출하지 않는다
  private async callAi(body: unknown): Promise<AiResponse> {
    const base = (process.env.AI_SERVER_URL ?? 'http://localhost:8000').replace(/\/+$/, '');
    let res: Response;
    try {
      res = await fetch(`${base}/api/v1/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
    } catch (e) {
      this.logger.error(`AI 서버 연결 실패: ${e instanceof Error ? e.message : String(e)}`);
      throw new ServiceUnavailableError();
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`AI 서버 오류 status=${res.status} detail=${detail.slice(0, 300)}`);
      // 503(임베딩 설정 오류)·5xx는 일시적 사용 불가, 그 외(422/404/409)는 우리 쪽 요청 구성 오류
      if (res.status >= 500) throw new ServiceUnavailableError();
      throw new InternalError();
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      this.logger.error('AI 서버 응답이 JSON이 아님');
      throw new InternalError();
    }
    const ai = json as Partial<AiResponse> | null;
    if (!ai || !Array.isArray(ai.candidates) || typeof ai.context_id !== 'string') {
      this.logger.error('AI 서버 응답 형식이 계약과 다름');
      throw new InternalError();
    }
    return ai as AiResponse;
  }

  // AI 결과에 이름·소개를 붙인다. 후보 목록에 없는 user_id는 버린다
  private toResult(ai: AiResponse, rows: CandidateRow[], roleId: number, roleName: string): RecommendationResult {
    const byId = new Map(rows.map((r) => [r.user_id, r]));
    const candidates = ai.candidates.flatMap((c) => {
      const row = byId.get(c.user_id);
      if (!row) return [];
      return [
        {
          userId: c.user_id,
          name: row.name,
          bio: row.bio,
          availableFrom: row.available_from,
          roleId, // 모집글 상세의 roleId(roles.id, 숫자)와 같은 값
          roleName, // 화면에는 원래 모집 역할명(AI/Data 등)을 그대로 보여준다
          score: c.score,
          rank: c.display_rank,
          bestExperienceId: c.best_experience_id,
          reasons: Array.isArray(c.reason_items) ? c.reason_items : [],
        },
      ];
    });
    return { contextId: ai.context_id, page: 1, candidates, nextAction: ai.next_action };
  }
}
