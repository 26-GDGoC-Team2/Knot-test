// 모집글/지원 API: 요청 검증과 응답 포맷만 담당하고 로직은 Service 에 위임한다.
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CommonResponse } from '../../common/common-response';
import { ApplicationService } from './application.service';
import {
  ApplicationListQuery,
  ApplyDto,
  CreateRecruitmentDto,
  ProposeDto,
  RecruitmentApplicationsQuery,
  RecruitmentListQuery,
  UpdateRecruitmentDto,
} from './recruitment.dto';
import { RecruitmentService } from './recruitment.service';

@Controller('recruitments')
export class RecruitmentController {
  constructor(
    private readonly recruitmentService: RecruitmentService,
    private readonly applicationService: ApplicationService,
  ) {}

  // 모집글 작성 (운영진이 아닌 일반 회원도 가능)
  @Post()
  async create(@Req() req: Request, @Body() dto: CreateRecruitmentDto) {
    return CommonResponse.ok(await this.recruitmentService.create(req.user!.id, dto), '모집글이 등록되었어요');
  }

  // 목록: ?status=OPEN|DONE&q=&roleIds=&skillIds=&interestIds=&mine=true&page=&size=&sortBy=
  @Get()
  async list(@Req() req: Request, @Query() query: RecruitmentListQuery) {
    return CommonResponse.ok(await this.recruitmentService.list(req.user!.id, query));
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return CommonResponse.ok(await this.recruitmentService.get(req.user!.id, id));
  }

  // 수정: 작성자 또는 운영진, 모집 중일 때만
  @Put(':id')
  async update(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRecruitmentDto) {
    return CommonResponse.ok(await this.recruitmentService.update(req.user!.id, id, dto), '모집글이 수정되었어요');
  }

  // 수동 마감
  @Post(':id/close')
  @HttpCode(200)
  async close(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return CommonResponse.ok(await this.recruitmentService.close(req.user!.id, id), '모집이 마감되었어요');
  }

  // 마감 후 팀원 내보내기: 팀장만
  @Delete(':id/members/:userId')
  @HttpCode(200)
  async removeMember(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return CommonResponse.ok(await this.recruitmentService.removeMember(req.user!.id, id, userId), '팀원을 내보냈어요');
  }

  // 팀 나가기: 확정 팀원 본인 (팀장 제외)
  @Post(':id/leave')
  @HttpCode(200)
  async leave(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return CommonResponse.ok(await this.recruitmentService.leave(req.user!.id, id), '팀에서 나왔어요');
  }

  // 삭제(소프트 삭제): 작성자 또는 운영진
  @Delete(':id')
  @HttpCode(200)
  async remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    await this.recruitmentService.remove(req.user!.id, id);
    return CommonResponse.ok(null, '모집글이 삭제되었어요');
  }

  // 지원하기
  @Post(':id/applications')
  async apply(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApplyDto) {
    return CommonResponse.ok(await this.applicationService.apply(req.user!.id, id, dto), '지원이 완료되었어요');
  }

  // 제안하기 (작성자 -> 부원)
  @Post(':id/proposals')
  async propose(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProposeDto) {
    return CommonResponse.ok(await this.applicationService.propose(req.user!.id, id, dto), '제안을 보냈어요');
  }

  // 이 모집글에 걸린 지원/제안 목록 (작성자 또는 운영진)
  @Get(':id/applications')
  async applications(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RecruitmentApplicationsQuery,
  ) {
    return CommonResponse.ok(await this.applicationService.listForRecruitment(req.user!.id, id, query));
  }
}

@Controller('applications')
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  // 내 지원/제안 목록: ?box=sent|received&status=PENDING
  @Get()
  async listMine(@Req() req: Request, @Query() query: ApplicationListQuery) {
    return CommonResponse.ok(await this.applicationService.listMine(req.user!.id, query));
  }

  @Post(':id/accept')
  @HttpCode(200)
  async accept(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return CommonResponse.ok(await this.applicationService.accept(req.user!.id, id), '수락했어요');
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return CommonResponse.ok(await this.applicationService.reject(req.user!.id, id), '거절했어요');
  }

  // 수락/거절 취소: 응답을 대기로 되돌린다 (받은 사람만, 모집 중일 때만)
  @Post(':id/revert')
  @HttpCode(200)
  async revert(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return CommonResponse.ok(await this.applicationService.revert(req.user!.id, id), '응답을 취소하고 대기로 되돌렸어요');
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return CommonResponse.ok(await this.applicationService.cancel(req.user!.id, id), '취소했어요');
  }
}
