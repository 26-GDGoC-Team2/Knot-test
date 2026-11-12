import { Controller, Get, Query } from '@nestjs/common';
import { CommonResponse } from '../../common/common-response';
import { CompetitionService } from './competition.service';

@Controller('competitions')
export class CompetitionController {
  constructor(private readonly competitionService: CompetitionService) {}

  /**
   * GET /competitions
   * ?category=웹/모바일/IT&page=1&limit=20
   */
  @Get()
  async getCompetitions(
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.competitionService.getCompetitions({
      category,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    return CommonResponse.ok(data);
  }
}
