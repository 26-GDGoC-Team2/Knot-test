import { Controller, Get, Param } from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { CommonResponse } from '../../common/common-response';

@Controller('recommendations')
export class RecommendationController {
  constructor(
    private readonly recommendationService: RecommendationService,
  ) {}

  // 모집글 역할별 추천 후보 조회
  @Get(':recruitmentId/roles/:roleId')
  async getRecommendations(
    @Param('recruitmentId') recruitmentId: string,
    @Param('roleId') roleId: string,
  ) {
    const data = await this.recommendationService.getRecommendations(
      recruitmentId,
      roleId,
    );
    return CommonResponse.ok(data);
  }
}