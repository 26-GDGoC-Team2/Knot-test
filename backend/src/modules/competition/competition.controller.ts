import { Controller, Get, Post, Query } from '@nestjs/common';
import { CommonResponse } from '../../common/common-response';
import { CompetitionService } from './competition.service';
import { WevityCrawler } from './wevity.crawler';

@Controller('competitions')
export class CompetitionController {
  constructor(
    private readonly competitionService: CompetitionService,
    private readonly wevityCrawler: WevityCrawler,
  ) {}

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

  /** POST /competitions/crawl — 수동 크롤링 트리거 (배포 직후 초기 데이터 적재용) */
  @Post('crawl')
  async triggerCrawl() {
    await this.wevityCrawler.crawl();
    return CommonResponse.ok({ message: '크롤링 완료' });
  }
}
