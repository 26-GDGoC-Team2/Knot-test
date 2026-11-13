// 인증 비즈니스 로직: 로그인(가입), 토큰 발급/갱신/폐기, 가입 코드 검증, 최초 운영진 부여
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes } from 'node:crypto';
import { AppException, ConflictError, ForbiddenError, UnauthorizedError } from '../../common/app.exception';
import type { AccessTokenPayload } from '../../common/auth-middleware';
import { DatabaseService, isUniqueViolation, Queryable } from '../../common/database.service';
import { ErrorCode } from '../../common/error-code';
import { decryptJoinCode, safeEqual } from '../../common/join-code-crypto';
import { getAuthConfig, getFirstAdminEmail, parseDurationMs } from '../../config/auth.config';
import { AuthRepository, UserRow } from './auth.repository';
import type { GoogleProfile } from './google-auth.service';

// 로그인 이후 프론트가 이동할 단계
export type NextStep = 'JOIN_CODE' | 'PROFILE' | 'HOME';

export interface SessionResult {
  accessToken: string;
  nextStep: NextStep;
  user: { id: string; name: string; role: string };
}

export interface IssuedRefreshToken {
  token: string; // 원문 (쿠키로만 전달, DB에는 해시만 저장)
  expiresAt: Date;
  maxAgeMs: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly config = getAuthConfig();

  constructor(
    private readonly repo: AuthRepository,
    private readonly database: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  // ===== 로그인 / 가입 (하나의 흐름) =====

  async loginWithGoogle(profile: GoogleProfile): Promise<{ refresh: IssuedRefreshToken }> {
    const user = await this.findOrCreateUser(profile);
    if (user.status !== 'ACTIVE') throw new ForbiddenError('탈퇴한 회원입니다.');
    return { refresh: await this.issueRefreshToken(user.id) };
  }

  private async findOrCreateUser(profile: GoogleProfile): Promise<UserRow> {
    const existing = await this.repo.findUserByGoogleSub(profile.sub);
    if (existing) {
      if (existing.status === 'WITHDRAWN') return this.reactivate(existing, profile);
      return existing;
    }

    try {
      return await this.database.transaction(async (tx) => {
        // 최초 운영진 판정의 동시 실행 방지
        await this.repo.lockFirstAdminAssignment(tx);

        // 잠금을 기다리는 동안 다른 요청이 먼저 가입했을 수 있음
        const again = await this.repo.findUserByGoogleSub(profile.sub, tx);
        if (again) return again;

        // 최초 1회만 ADMIN 부여: 지정 이메일이고, 아직 운영진이 한 명도 없을 때
        const firstAdminEmail = getFirstAdminEmail();
        const grantAdmin =
          !!firstAdminEmail && profile.email === firstAdminEmail && !(await this.repo.existsAdmin(tx));

        // 최초 운영진은 가입 코드 없이 통과 (가입 코드를 설정할 주체이므로)
        return this.repo.insertUser(
          {
            googleSub: profile.sub,
            email: profile.email,
            name: profile.name,
            role: grantAdmin ? 'ADMIN' : 'MEMBER',
            joinVerified: grantAdmin,
          },
          tx,
        );
      });
    } catch (e) {
      // 같은 이메일이 다른 Google 계정으로 이미 가입된 경우
      if (isUniqueViolation(e)) throw new ConflictError('이미 가입된 이메일입니다.');
      throw e;
    }
  }

  // 탈퇴 회원의 재가입: 같은 계정을 되살린다 (가입 코드 재인증 필요, 권한은 일반 회원)
  private async reactivate(existing: UserRow, profile: GoogleProfile): Promise<UserRow> {
    try {
      const revived = await this.repo.reactivateUser(existing.id, { email: profile.email, name: profile.name });
      if (revived) {
        this.logger.log(`탈퇴 회원 재가입 (user=${existing.id})`);
        return revived;
      }
      // 동시에 다른 요청이 먼저 되살렸다면 그 결과를 사용한다
      const again = await this.repo.findUserById(existing.id);
      if (again) return again;
      throw new ForbiddenError('탈퇴한 회원입니다.');
    } catch (e) {
      // 같은 이메일을 다른 계정이 이미 쓰고 있는 경우
      if (isUniqueViolation(e)) throw new ConflictError('이미 가입된 이메일입니다.');
      throw e;
    }
  }

  // ===== 토큰 =====

  // Refresh 원문은 서버 secret으로 HMAC 처리한 값만 저장 (DB 유출 시 원문 복원 불가)
  private hashRefresh(token: string): string {
    return createHmac('sha256', this.config.refreshSecret).update(token).digest('hex');
  }

  private async issueRefreshToken(userId: string, db: Queryable = this.database): Promise<IssuedRefreshToken> {
    const token = randomBytes(48).toString('base64url');
    const maxAgeMs = parseDurationMs(this.config.refreshExpiresIn);
    const expiresAt = new Date(Date.now() + maxAgeMs);
    await this.repo.insertRefreshToken(userId, this.hashRefresh(token), expiresAt, db);
    return { token, expiresAt, maxAgeMs };
  }

  private async buildSession(user: UserRow): Promise<SessionResult> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      role: user.role,
      verified: user.join_verified_at !== null,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      nextStep: await this.resolveNextStep(user),
      user: { id: user.id, name: user.name, role: user.role },
    };
  }

  // 가입 코드 미인증 → JOIN_CODE, 인증했지만 프로필 없음 → PROFILE, 그 외 → HOME
  private async resolveNextStep(user: UserRow): Promise<NextStep> {
    if (!user.join_verified_at) return 'JOIN_CODE';
    return (await this.repo.hasProfile(user.id)) ? 'HOME' : 'PROFILE';
  }

  // Refresh 토큰 회전: 사용한 토큰은 폐기하고 새 토큰을 발급
  async refresh(rawToken: string | undefined): Promise<SessionResult & { refresh: IssuedRefreshToken }> {
    if (!rawToken) throw new UnauthorizedError();

    const row = await this.repo.findRefreshTokenByHash(this.hashRefresh(rawToken));
    if (!row) throw new UnauthorizedError();

    // 이미 폐기된 토큰의 재사용 = 탈취 의심 → 해당 사용자의 모든 토큰 폐기
    if (row.revoked_at) {
      this.logger.warn(`폐기된 Refresh 토큰 재사용 감지 (user=${row.user_id})`);
      await this.repo.revokeAllRefreshTokens(row.user_id);
      throw new UnauthorizedError();
    }
    if (row.expires_at.getTime() <= Date.now()) {
      throw new UnauthorizedError(undefined, ErrorCode.TOKEN_EXPIRED);
    }

    // 탈퇴/삭제된 회원은 재발급 차단하고 남은 토큰도 폐기
    const user = await this.repo.findUserById(row.user_id);
    if (!user || user.status !== 'ACTIVE') {
      await this.repo.revokeAllRefreshTokens(row.user_id);
      throw new UnauthorizedError();
    }

    const refresh = await this.database.transaction(async (tx) => {
      // 동시 요청으로 이미 회전된 경우 한쪽만 성공
      if (!(await this.repo.revokeRefreshToken(row.id, tx))) throw new UnauthorizedError();
      return this.issueRefreshToken(user.id, tx);
    });

    return { ...(await this.buildSession(user)), refresh };
  }

  // 로그아웃: 이 기기의 Refresh 토큰 폐기 (쿠키가 없으면 할 일 없음)
  async logout(userId: string, rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.repo.revokeRefreshTokenByHash(userId, this.hashRefresh(rawToken));
  }

  // ===== 가입 코드 =====

  // 코드가 맞으면 인증 시각을 1회 기록하고 verified=true 토큰을 새로 발급
  async verifyJoinCode(userId: string, input: string): Promise<SessionResult> {
    const user = await this.repo.findUserById(userId);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedError();

    // 이미 인증된 회원은 다시 검증하지 않고 현재 상태만 반환
    if (user.join_verified_at) return this.buildSession(user);

    const enc = await this.repo.findActiveJoinCodeEnc();
    let matched = false;
    if (enc) {
      try {
        matched = safeEqual(decryptJoinCode(enc), input);
      } catch (e) {
        // 키 불일치/데이터 손상은 서버 문제 → 상세는 로그에만
        this.logger.error(`가입 코드 복호화 실패: ${e instanceof Error ? e.message : 'unknown'}`);
        throw new AppException(ErrorCode.INTERNAL_ERROR);
      }
    }
    // 코드 미설정과 불일치는 같은 응답 (코드 존재 여부 노출 방지)
    if (!matched) throw new AppException(ErrorCode.JOIN_CODE_MISMATCH);

    await this.repo.markJoinVerified(user.id);
    const fresh = await this.repo.findUserById(user.id);
    if (!fresh) throw new UnauthorizedError();
    return this.buildSession(fresh);
  }

  // ===== 내 상태 =====

  async me(userId: string): Promise<SessionResult> {
    const user = await this.repo.findUserById(userId);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedError();
    return this.buildSession(user);
  }
}
