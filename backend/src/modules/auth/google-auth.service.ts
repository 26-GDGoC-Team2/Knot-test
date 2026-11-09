// Google OAuth 2.0 (서버 리다이렉트): 인증 URL 생성, 코드 교환, ID 토큰 검증
import { Injectable, Logger } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { UnauthorizedError } from '../../common/app.exception';
import { getGoogleConfig, GoogleConfig } from '../../config/auth.config';

export interface GoogleProfile {
  sub: string; // 구글 계정 고유 번호 (회원 식별 기준)
  email: string; // 소문자로 정규화
  name: string;
}

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly config: GoogleConfig = getGoogleConfig();
  private readonly client = new OAuth2Client({
    clientId: this.config.clientId,
    clientSecret: this.config.clientSecret,
    redirectUri: this.config.redirectUri,
  });

  // state는 CSRF 방어용으로 호출 측이 생성/검증한다.
  buildAuthUrl(state: string): string {
    return this.client.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      state,
      prompt: 'select_account',
    });
  }

  // 인가 코드를 교환하고 ID 토큰을 서명/audience까지 검증한 뒤 프로필을 반환
  async fetchProfile(code: string): Promise<GoogleProfile> {
    try {
      const { tokens } = await this.client.getToken(code);
      if (!tokens.id_token) throw new Error('id_token 없음');

      const ticket = await this.client.verifyIdToken({ idToken: tokens.id_token, audience: this.config.clientId });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email || payload.email_verified !== true) {
        throw new Error('필수 클레임 누락 또는 이메일 미인증');
      }
      return {
        sub: payload.sub,
        email: payload.email.trim().toLowerCase(),
        name: (payload.name ?? payload.email).trim(),
      };
    } catch (e) {
      // 상세 사유는 로그에만 남기고 외부에는 일반 메시지만 노출
      this.logger.warn(`Google 인증 실패: ${e instanceof Error ? e.message : 'unknown'}`);
      throw new UnauthorizedError('Google 인증에 실패했습니다.');
    }
  }
}
