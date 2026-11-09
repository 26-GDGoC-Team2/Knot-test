import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ArchiveService } from './archive.service';
import { CommonResponse } from '../../common/common-response';

@Controller('archive')
export class ArchiveController {
  constructor(private readonly archiveService: ArchiveService) {}

  @Get()
  async getProjects(
    @Req() req: Request,
    @Query('category') category?: string,
    @Query('cohort') cohort?: string,
    @Query('techStack') techStack?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const isClubMember = !!(req.user as any)?.id;
    const data = await this.archiveService.getProjects(
      {
        category,
        cohort: cohort ? Number(cohort) : undefined,
        techStack,
        keyword,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      },
      isClubMember,
    );
    return CommonResponse.ok(data);
  }

  @Get(':projectId')
  async getProjectDetail(
    @Req() req: Request,
    @Param('projectId') projectId: string,
  ) {
    const isClubMember = !!(req.user as any)?.id;
    const data = await this.archiveService.getProjectDetail(projectId, isClubMember);
    return CommonResponse.ok(data);
  }
}