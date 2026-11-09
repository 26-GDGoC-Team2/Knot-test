// 가입 코드 미인증(가입 대기) 사용자 차단 가드.
// @AllowUnverified()가 붙은 핸들러(가입 코드 인증, 로그아웃, 내 상태 조회)만 통과시킨다.
import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppException } from './app.exception';
import { ErrorCode } from './error-code';

export const ALLOW_UNVERIFIED_KEY = 'allowUnverified';
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED_KEY, true);

@Injectable()
export class VerifiedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) return true; // 공개 경로 (인증은 미들웨어가 담당)

    const allowed = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_UNVERIFIED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed || user.verified) return true;
    throw new AppException(ErrorCode.JOIN_CODE_REQUIRED);
  }
}
