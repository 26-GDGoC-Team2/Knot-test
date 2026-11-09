// 인증 미들웨어: Authorization: Bearer <accessToken>을 검증하고 req.user를 채운다.
// 로그인/콜백 등 공개 경로는 모듈의 consumer.exclude()로 제외한다.
import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from './app.exception';
import { ErrorCode } from './error-code';
import type { UserRole } from './role-guard';

export interface AuthUser {
  id: string;
  role: UserRole;
  verified: boolean; // 가입 코드 인증 완료 여부
}

// access token payload (sub = users.id)
export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  verified: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw new UnauthorizedError();

    const token = header.slice('Bearer '.length).trim();
    if (!token) throw new UnauthorizedError();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch (e) {
      // 만료와 위조를 구분하되 상세 사유는 노출하지 않는다.
      const expired = e instanceof Error && e.name === 'TokenExpiredError';
      throw new UnauthorizedError(undefined, expired ? ErrorCode.TOKEN_EXPIRED : ErrorCode.UNAUTHORIZED);
    }

    // payload 형태 검증 (필수 클레임 누락/비정상 역할 방어)
    if (
      !payload?.sub ||
      (payload.role !== 'MEMBER' && payload.role !== 'ADMIN') ||
      typeof payload.verified !== 'boolean'
    ) {
      throw new UnauthorizedError();
    }

    // 탈퇴 회원은 Refresh 재발급 시 차단한다 (Access 만료까지 최대 30분 남음)
    req.user = { id: payload.sub, role: payload.role, verified: payload.verified };
    next();
  }
}
