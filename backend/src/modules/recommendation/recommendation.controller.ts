import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RecommendationService } from './recommendation.service';
import { CommonResponse } from '../../common/common-response';

@Controller('recommendations')
export class RecommendationController {
  constructor(
    private readonly recommendationService: RecommendationService,
  ) {}

  // 모집글 역할별 추천 후보 조회 (작성자만). 한 번에 최대 10명(1~5위, 6~10위)을 내려준다
  // roleId = 모집글 상세의 숫자 roleId (recruitment_roles UUID도 허용)
  // 선택 쿼리: requiredSkills, preferredSkills = 쉼표 구분 기술 이름 (조건 바꿔 다시 추천)
  @Get(':recruitmentId/roles/:roleId')
  async getRecommendations(
    @Req() req: Request,
    @Param('recruitmentId') recruitmentId: string,
    @Param('roleId') roleId: string,
    @Query('requiredSkills') requiredSkills?: string,
    @Query('preferredSkills') preferredSkills?: string,
  ) {
    const data = await this.recommendationService.getRecommendations(
      (req.user as { id: string }).id,
      recruitmentId,
      roleId,
      { requiredSkills, preferredSkills },
    );
    return CommonResponse.ok(data);
  }
}
