import { Controller, Get, Param, Req } from '@nestjs/common';
import { Request } from 'express';
import { RecommendationService } from './recommendation.service';
import { CommonResponse } from '../../common/common-response';

@Controller('recommendations')
export class RecommendationController {
  constructor(
    private readonly recommendationService: RecommendationService,
  ) {}

  // 모집글 역할별 추천 후보 조회 (roleId = 모집 역할 id, 작성자만)
  @Get(':recruitmentId/roles/:roleId')
  async getRecommendations(
    @Req() req: Request,
    @Param('recruitmentId') recruitmentId: string,
    @Param('roleId') roleId: string,
  ) {
    const data = await this.recommendationService.getRecommendations(
      (req.user as { id: string }).id,
      recruitmentId,
      roleId,
    );
    return CommonResponse.ok(data);
  }
}
