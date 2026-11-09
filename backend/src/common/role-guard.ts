// 역할 가드: @Roles('ADMIN')이 붙은 핸들러/컨트롤러만 역할을 검사한다.
// UI에서 숨기는 것과 무관하게 서버에서 직접 요청도 거부한다 (setting.md 운영진 절).
import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ForbiddenError, UnauthorizedError } from './app.exception';

export type UserRole = 'MEMBER' | 'ADMIN'; // DB user_role enum과 동일

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true; // 역할 제한 없음

    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) throw new UnauthorizedError(); // 미들웨어를 거치지 않은 경우 방어
    if (!required.includes(user.role)) throw new ForbiddenError();
    return true;
  }
}
