// 인증 API: 요청/응답과 쿠키 처리만 담당하고 로직은 AuthService에 위임한다.
import { Body, Controller, Get, Headers, Logger, Post, Query, Req, Res } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { AppException, UnauthorizedError } from '../../common/app.exception';
import { CommonResponse } from '../../common/common-response';
import { ErrorCode } from '../../common/error-code';
import { safeEqual } from '../../common/join-code-crypto';
import { AllowUnverified } from '../../common/verified-guard';
import { getFrontendUrl } from '../../config/auth.config';
import { GoogleCallbackQuery, JoinCodeDto } from './auth.dto';
import { AuthService } from './auth.service';
import {
  clearRefreshCookie,
  clearStateCookie,
  readCookie,
  REFRESH_COOKIE,
  setRefreshCookie,
  setStateCookie,
  STATE_COOKIE,
} from './cookie.util';
import { GoogleAuthService } from './google-auth.service';

const KAKAO_IN_APP = /KAKAOTALK/i;

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly googleAuth: GoogleAuthService,
  ) {}

  // 카카오톡 인앱 브라우저 감지: 안내 UI는 프론트가 그리고, 서버는 상태와 외부 브라우저 열기 링크만 제공
  @Get('client-check')
  clientCheck(@Headers('user-agent') userAgent?: string) {
    const inAppBrowser = KAKAO_IN_APP.test(userAgent ?? '');
    const externalUrl = inAppBrowser
      ? `kakaotalk://web/openExternal?url=${encodeURIComponent(getFrontendUrl())}`
      : null;
    return CommonResponse.ok({ inAppBrowser, externalUrl });
  }

  // Google 로그인 시작: state(CSRF 방어)를 쿠키에 저장하고 Google로 이동
  @Get('google')
  google(@Res() res: Response): void {
    const state = randomBytes(24).toString('base64url');
    setStateCookie(res, state);
    res.redirect(this.googleAuth.buildAuthUrl(state));
  }

  // Google 콜백: 성공/실패 모두 프론트로 이동 (브라우저 이동이라 JSON 대신 리다이렉트)
  @Get('google/callback')
  async googleCallback(@Query() query: GoogleCallbackQuery, @Req() req: Request, @Res() res: Response): Promise<void> {
    const expectedState = readCookie(req, STATE_COOKIE);
    clearStateCookie(res);

    try {
      if (query.error) throw new UnauthorizedError('Google 로그인이 취소되었습니다.');
      if (!query.code || !query.state || !expectedState || !safeEqual(query.state, expectedState)) {
        throw new UnauthorizedError('잘못된 로그인 요청입니다.');
      }

      const profile = await this.googleAuth.fetchProfile(query.code);
      const { refresh } = await this.authService.loginWithGoogle(profile);
      setRefreshCookie(res, refresh.token, refresh.maxAgeMs);
      res.redirect(getFrontendUrl()); // 프론트가 /auth/refresh를 호출해 Access 토큰을 받는다
    } catch (e) {
      const code = e instanceof AppException ? e.code : ErrorCode.INTERNAL_ERROR;
      if (!(e instanceof AppException)) {
        this.logger.error(e instanceof Error ? e.message : 'unknown', e instanceof Error ? e.stack : undefined);
      }
      const url = new URL(getFrontendUrl());
      url.searchParams.set('login_error', code);
      res.redirect(url.toString());
    }
  }

  // Access 토큰 갱신 (Refresh 쿠키 필요). 공개 경로: Access가 없는 상태에서 호출됨
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const { refresh, ...session } = await this.authService.refresh(readCookie(req, REFRESH_COOKIE));
      setRefreshCookie(res, refresh.token, refresh.maxAgeMs);
      return CommonResponse.ok(session);
    } catch (e) {
      if (e instanceof AppException) clearRefreshCookie(res); // 무효 토큰은 쿠키도 제거
      throw e;
    }
  }

  @Post('logout')
  @AllowUnverified()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.user!.id, readCookie(req, REFRESH_COOKIE));
    clearRefreshCookie(res);
    return CommonResponse.ok(null, '로그아웃되었습니다.');
  }

  // 가입 코드 인증: 성공하면 verified=true 토큰을 새로 발급
  @Post('join-code')
  @AllowUnverified()
  async joinCode(@Req() req: Request, @Body() dto: JoinCodeDto) {
    return CommonResponse.ok(await this.authService.verifyJoinCode(req.user!.id, dto.code));
  }

  // 내 로그인 상태와 다음 단계(JOIN_CODE / PROFILE / HOME)
  @Get('me')
  @AllowUnverified()
  async me(@Req() req: Request) {
    return CommonResponse.ok(await this.authService.me(req.user!.id));
  }
}
