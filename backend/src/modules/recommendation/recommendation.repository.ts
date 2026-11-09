import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database.service';

@Injectable()
export class RecommendationRepository {
  constructor(private readonly database: DatabaseService) {}

  // 추천 요청에 필요한 사용자 프로필 데이터 조회
  async getCandidatePool(recruitmentId: string) {
    // 모집글 정보
    const recruitmentResult = await this.database.query<{
      id: string;
      title: string;
      description: string | null;
    }>(
      `SELECT id, title, description FROM recruitments WHERE id = $1`,
      [recruitmentId],
    );
    const recruitment = recruitmentResult.rows[0] ?? null;

    // 모집 역할 목록
    const rolesResult = await this.database.query<{
      id: string;
      role_name: string;
      required_skills: string[];
      preferred_skills: string[];
      capacity: number;
    }>(
      `SELECT id, role_name, required_skills, preferred_skills, capacity
         FROM recruitment_roles WHERE recruitment_id = $1`,
      [recruitmentId],
    );

    return { recruitment, roles: rolesResult.rows };
  }

  // 추천 결과 저장 (캐싱용)
  async saveRecommendationResult(
    recruitmentId: string,
    roleId: string,
    result: unknown,
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO recommendation_cache (recruitment_id, role_id, result, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (recruitment_id, role_id)
         DO UPDATE SET result = $3, created_at = NOW()`,
      [recruitmentId, roleId, JSON.stringify(result)],
    );
  }

  // 캐시된 추천 결과 조회
  async getCachedResult(
    recruitmentId: string,
    roleId: string,
  ): Promise<unknown | null> {
    const result = await this.database.query<{
      result: unknown;
      created_at: Date;
    }>(
      `SELECT result, created_at FROM recommendation_cache
         WHERE recruitment_id = $1 AND role_id = $2`,
      [recruitmentId, roleId],
    );
    return result.rows[0]?.result ?? null;
  }
}