import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ArchiveService } from './archive.service';
import { CreateArchiveDto, UpdateArchiveDto } from './archive.dto';
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
  async getProjectDetail(@Req() req: Request, @Param('projectId') projectId: string) {
    const isClubMember = !!(req.user as any)?.id;
    const data = await this.archiveService.getProjectDetail(projectId, isClubMember);
    return CommonResponse.ok(data);
  }

  // 인증은 전역 AuthMiddleware가 처리하므로 별도 가드 없음
  @Post()
  async createProject(@Req() req: Request, @Body() dto: CreateArchiveDto) {
    const userId = (req.user as any).id as string;
    const data = await this.archiveService.createProject(dto, userId);
    return CommonResponse.ok(data);
  }

  // 작성자·참여 부원·운영진만 가능 (검사는 서비스에서)
  @Patch(':projectId')
  async updateProject(@Req() req: Request, @Param('projectId') projectId: string, @Body() dto: UpdateArchiveDto) {
    const data = await this.archiveService.updateProject(projectId, dto, (req.user as any).id as string);
    return CommonResponse.ok(data);
  }

  @Delete(':projectId')
  @HttpCode(200)
  async deleteProject(@Req() req: Request, @Param('projectId') projectId: string) {
    const data = await this.archiveService.deleteProject(projectId, (req.user as any).id as string);
    return CommonResponse.ok(data);
  }
}
