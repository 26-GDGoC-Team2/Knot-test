// 인증 설정: 모든 값은 환경 변수에서만 읽는다. (코드/저장소에 secret 미포함)
export interface AuthConfig {
  accessSecret: string;
  refreshSecret: string;
  accessExpiresIn: string; // 예: 30m
  refreshExpiresIn: string; // 예: 14d
}

const MIN_SECRET_LENGTH = 32;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경 변수 ${name}가 설정되지 않았습니다.`);
  return value;
}

function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < MIN_SECRET_LENGTH) {
    // 값 자체는 로그에 남기지 않는다.
    throw new Error(`환경 변수 ${name}가 없거나 ${MIN_SECRET_LENGTH}자 미만입니다.`);
  }
  return value;
}

// 환경 변수 로드 이후 호출해야 하므로 함수로 제공한다.
export function getAuthConfig(): AuthConfig {
  const accessSecret = requireSecret('JWT_ACCESS_SECRET');
  const refreshSecret = requireSecret('JWT_REFRESH_SECRET');
  if (accessSecret === refreshSecret) {
    throw new Error('JWT_ACCESS_SECRET과 JWT_REFRESH_SECRET은 서로 달라야 합니다.');
  }
  return {
    accessSecret,
    refreshSecret,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '30m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '14d',
  };
}

// "30m", "14d" 같은 기간 문자열을 밀리초로 변환 (s, m, h, d 지원)
export function parseDurationMs(value: string): number {
  const m = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!m) throw new Error(`기간 형식이 올바르지 않습니다: ${value} (예: 30m, 14d)`);
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 's' | 'm' | 'h' | 'd'];
  return Number(m[1]) * unit;
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getGoogleConfig(): GoogleConfig {
  return {
    clientId: requireEnv('GOOGLE_CLIENT_ID'),
    clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
    redirectUri: requireEnv('GOOGLE_REDIRECT_URI'),
  };
}

// 로그인 후 이동할 프론트 주소 (CORS 허용 origin으로도 사용)
export function getFrontendUrl(): string {
  const url = requireEnv('FRONTEND_URL');
  new URL(url); // 형식 검증
  return url;
}

// 최초 운영진 이메일. 미설정이면 최초 운영진 자동 부여를 하지 않는다.
export function getFirstAdminEmail(): string | undefined {
  const v = process.env.FIRST_ADMIN_EMAIL?.trim().toLowerCase();
  return v || undefined;
}

export interface CookieConfig {
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
}

// 기본값: 운영(production)에서는 Secure. 프론트가 다른 사이트면 COOKIE_SAMESITE=none 필요(Secure 필수)
export function getCookieConfig(): CookieConfig {
  const secure = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production';
  const sameSite = (process.env.COOKIE_SAMESITE || 'lax') as CookieConfig['sameSite'];
  if (!['lax', 'strict', 'none'].includes(sameSite)) {
    throw new Error('COOKIE_SAMESITE는 lax, strict, none 중 하나여야 합니다.');
  }
  if (sameSite === 'none' && !secure) {
    throw new Error('COOKIE_SAMESITE=none 은 COOKIE_SECURE=true 와 함께 써야 합니다.');
  }
  return { secure, sameSite };
}

// 가입 코드 암호화 키: base64 인코딩된 32바이트 (AES-256)
export function getJoinCodeKey(): Buffer {
  const key = Buffer.from(requireEnv('JOIN_CODE_ENC_KEY'), 'base64');
  if (key.length !== 32) throw new Error('JOIN_CODE_ENC_KEY는 base64로 인코딩된 32바이트여야 합니다.');
  return key;
}

// 인증 없이 접근 가능한 경로 (임시 경로명 - B개발자/프론트와 합의 필요)
export const PUBLIC_ROUTES: ReadonlyArray<string> = [
  'auth/google',
  'auth/google/callback',
  'auth/refresh',
  'auth/client-check',
  'health',
];
