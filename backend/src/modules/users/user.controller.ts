// 회원 API: 요청/응답과 쿠키 처리만 담당하고 로직은 UserService에 위임한다.
import { Controller, Delete, Req, Res, Get, Patch, Body } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CommonResponse } from '../../common/common-response';
import { AllowUnverified } from '../../common/verified-guard';
import { clearRefreshCookie } from '../auth/cookie.util';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // 회원 탈퇴. 가입 코드 미인증 상태에서도 탈퇴할 수 있어야 하므로 AllowUnverified
  @Delete('me')
  @AllowUnverified()
  async withdraw(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.userService.withdraw(req.user!.id);
    clearRefreshCookie(res);
    return CommonResponse.ok(null, '탈퇴가 완료되었습니다.');
  }
    // 수료 기수 조회
  @Get('me/graduation-cohort')
  async getGraduationCohort(@Req() req: Request) {
    const cohort = await this.userService.getGraduationCohort((req.user as any).id);
    return CommonResponse.ok({ graduationCohort: cohort });
  }

  // 수료 기수 저장/업데이트
  @Patch('me/graduation-cohort')
  async updateGraduationCohort(
    @Req() req: Request,
    @Body('graduationCohort') cohort: number
  ) {
    await this.userService.updateGraduationCohort((req.user as any).id, cohort);
    return CommonResponse.ok(null);
  }
}
