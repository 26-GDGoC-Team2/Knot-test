import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RecommendationRepository } from './recommendation.repository';

// TODO: AI팀과 협의 후 실제 AI 서버 주소로 교체
const AI_SERVER_URL = process.env.AI_SERVER_URL ?? 'http://localhost:8000';

@Injectable()
export class RecommendationService {
  constructor(
    private readonly recommendationRepository: RecommendationRepository,
  ) {}

  async getRecommendations(recruitmentId: string, roleId: string) {
    // 1. 캐시 확인
    const cached = await this.recommendationRepository.getCachedResult(
      recruitmentId,
      roleId,
    );
    if (cached) {
      return { source: 'cache', data: cached };
    }

    // 2. 모집글 + 역할 데이터 조회
    const { recruitment, roles } =
      await this.recommendationRepository.getCandidatePool(recruitmentId);

    if (!recruitment) {
      throw new ServiceUnavailableException('모집글을 찾을 수 없습니다.');
    }

    const targetRole = roles.find((r) => r.id === roleId);
    if (!targetRole) {
      throw new ServiceUnavailableException('모집 역할을 찾을 수 없습니다.');
    }

    // 3. AI 서버 요청
    // TODO: AI팀과 입출력 인터페이스 협의 후 구현
    // 현재는 stub — AI 서버 연동 전까지 빈 결과 반환
    try {
      // const response = await fetch(`${AI_SERVER_URL}/recommend`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     recruitment_id: recruitmentId,
      //     role_id: roleId,
      //     role_name: targetRole.role_name,
      //     required_skills: targetRole.required_skills,
      //     preferred_skills: targetRole.preferred_skills,
      //   }),
      // });
      // const result = await response.json();

      // stub 결과
      const result = {
        recruitmentId,
        roleId,
        candidates: [],
        message: 'AI 서버 연동 전 stub 응답입니다.',
      };

      // 4. 결과 캐싱
      await this.recommendationRepository.saveRecommendationResult(
        recruitmentId,
        roleId,
        result,
      );

      return { source: 'ai', data: result };
    } catch {
      throw new ServiceUnavailableException(
        'AI 추천 서버에 연결할 수 없습니다.',
      );
    }
  }
}