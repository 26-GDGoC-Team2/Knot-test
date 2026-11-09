// 쿠키 처리 유틸 (cookie-parser 의존성 없이 사용)
import type { CookieOptions, Request, Response } from 'express';
import { getCookieConfig } from '../../config/auth.config';

export const REFRESH_COOKIE = 'refresh_token';
export const STATE_COOKIE = 'oauth_state';
const REFRESH_PATH = '/auth';
const STATE_PATH = '/auth/google';

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return undefined; // 잘못된 인코딩은 없는 값으로 취급
      }
    }
  }
  return undefined;
}

function baseOptions(path: string, forOAuthState = false): CookieOptions {
  const { secure, sameSite } = getCookieConfig();
  // Google에서 돌아오는 이동은 외부 사이트발이라 strict 쿠키는 전송되지 않는다 → state 쿠키만 lax로 낮춤
  const effective = forOAuthState && sameSite === 'strict' ? 'lax' : sameSite;
  return { httpOnly: true, secure, sameSite: effective, path };
}

export function setRefreshCookie(res: Response, token: string, maxAgeMs: number): void {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions(REFRESH_PATH), maxAge: maxAgeMs });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions(REFRESH_PATH));
}

// OAuth state는 10분만 유효
export function setStateCookie(res: Response, state: string): void {
  res.cookie(STATE_COOKIE, state, { ...baseOptions(STATE_PATH, true), maxAge: 10 * 60 * 1000 });
}

export function clearStateCookie(res: Response): void {
  res.clearCookie(STATE_COOKIE, baseOptions(STATE_PATH, true));
}
