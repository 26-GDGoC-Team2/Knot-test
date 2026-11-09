// 프로필/부원 검색 API: 요청 검증과 응답 포맷만 담당하고 로직은 ProfileService에 위임한다.
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CommonResponse } from '../../common/common-response';
import { ExperienceVisibilityDto, MemberSearchQuery, SaveExperienceDto, SaveProfileDto } from './profile.dto';
import { ProfileService } from './profile.service';

@Controller('profiles')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  // 프로필 입력 화면의 선택 목록 (역할/기술/관심 분야)
  @Get('options')
  async options() {
    return CommonResponse.ok(await this.profileService.getOptions());
  }

  // 내 프로필 등록/수정
  @Put('me')
  async saveMine(@Req() req: Request, @Body() dto: SaveProfileDto) {
    return CommonResponse.ok(await this.profileService.saveMyProfile(req.user!.id, dto), '프로필이 저장되었어요');
  }

  // 내 프로필 조회 (비공개 프로젝트 포함)
  @Get('me')
  async getMine(@Req() req: Request) {
    return CommonResponse.ok(await this.profileService.getProfile(req.user!.id, req.user!.id));
  }

  @Post('me/experiences')
  async createExperience(@Req() req: Request, @Body() dto: SaveExperienceDto) {
    return CommonResponse.ok(await this.profileService.createExperience(req.user!.id, dto), '프로젝트가 등록되었어요');
  }

  @Put('me/experiences/:id')
  async updateExperience(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveExperienceDto,
  ) {
    return CommonResponse.ok(await this.profileService.updateExperience(req.user!.id, id, dto), '프로젝트가 수정되었어요');
  }

  // 공개 여부만 변경
  @Patch('me/experiences/:id/visibility')
  async setVisibility(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExperienceVisibilityDto,
  ) {
    return CommonResponse.ok(await this.profileService.setExperienceVisibility(req.user!.id, id, dto));
  }

  @Delete('me/experiences/:id')
  @HttpCode(200)
  async deleteExperience(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    await this.profileService.deleteExperience(req.user!.id, id);
    return CommonResponse.ok(null, '프로젝트가 삭제되었어요');
  }

  // 다른 부원의 프로필 조회 (공개 프로젝트 최대 3개). 'me' 경로보다 뒤에 선언해야 한다
  @Get(':userId')
  async getOne(@Req() req: Request, @Param('userId', ParseUUIDPipe) userId: string) {
    return CommonResponse.ok(await this.profileService.getProfile(req.user!.id, userId));
  }
}

@Controller('members')
export class MemberController {
  constructor(private readonly profileService: ProfileService) {}

  // 부원 목록 검색: ?q=&roleIds=1,2&skillIds=3&interestIds=4&available=true&page=1&size=20
  @Get()
  async search(@Query() query: MemberSearchQuery) {
    return CommonResponse.ok(await this.profileService.searchMembers(query));
  }
}
