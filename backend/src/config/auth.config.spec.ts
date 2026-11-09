import {
  getAuthConfig,
  getCookieConfig,
  getFirstAdminEmail,
  getFrontendUrl,
  getJoinCodeKey,
  parseDurationMs,
} from './auth.config';

const SECRET_A = 'a'.repeat(32);
const SECRET_B = 'b'.repeat(32);

describe('auth.config', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  describe('parseDurationMs', () => {
    it.each([
      ['30s', 30_000],
      ['30m', 1_800_000],
      ['2h', 7_200_000],
      ['14d', 1_209_600_000],
    ])('%s → %d ms', (v, ms) => expect(parseDurationMs(v)).toBe(ms));

    it.each(['14 days', '', 'd', '-1d', '1.5h', '10'])('잘못된 형식 "%s" 은 오류', (v) => {
      expect(() => parseDurationMs(v)).toThrow();
    });
  });

  describe('getAuthConfig', () => {
    it('secret 두 개가 있으면 기본 만료 시간(30m/14d)으로 반환', () => {
      process.env.JWT_ACCESS_SECRET = SECRET_A;
      process.env.JWT_REFRESH_SECRET = SECRET_B;
      delete process.env.JWT_ACCESS_EXPIRES_IN;
      delete process.env.JWT_REFRESH_EXPIRES_IN;
      expect(getAuthConfig()).toEqual({
        accessSecret: SECRET_A,
        refreshSecret: SECRET_B,
        accessExpiresIn: '30m',
        refreshExpiresIn: '14d',
      });
    });

    it('secret이 없거나 32자 미만이면 실패', () => {
      process.env.JWT_ACCESS_SECRET = 'short';
      process.env.JWT_REFRESH_SECRET = SECRET_B;
      expect(() => getAuthConfig()).toThrow('JWT_ACCESS_SECRET');
      process.env.JWT_ACCESS_SECRET = SECRET_A;
      delete process.env.JWT_REFRESH_SECRET;
      expect(() => getAuthConfig()).toThrow('JWT_REFRESH_SECRET');
    });

    it('Access와 Refresh secret이 같으면 실패', () => {
      process.env.JWT_ACCESS_SECRET = SECRET_A;
      process.env.JWT_REFRESH_SECRET = SECRET_A;
      expect(() => getAuthConfig()).toThrow('서로 달라야');
    });

    it('오류 메시지에 secret 값이 포함되지 않는다', () => {
      process.env.JWT_ACCESS_SECRET = 'short-secret-value';
      process.env.JWT_REFRESH_SECRET = SECRET_B;
      expect(() => getAuthConfig()).toThrow(expect.not.objectContaining({ message: expect.stringContaining('short-secret-value') }));
    });
  });

  describe('getCookieConfig', () => {
    it('기본값: 개발은 Secure 없이 lax', () => {
      delete process.env.COOKIE_SECURE;
      delete process.env.COOKIE_SAMESITE;
      process.env.NODE_ENV = 'development';
      expect(getCookieConfig()).toEqual({ secure: false, sameSite: 'lax' });
    });

    it('production은 기본 Secure', () => {
      delete process.env.COOKIE_SECURE;
      process.env.NODE_ENV = 'production';
      expect(getCookieConfig().secure).toBe(true);
    });

    it('SameSite=none은 Secure 없이는 거부', () => {
      process.env.COOKIE_SAMESITE = 'none';
      process.env.COOKIE_SECURE = 'false';
      expect(() => getCookieConfig()).toThrow();
      process.env.COOKIE_SECURE = 'true';
      expect(getCookieConfig()).toEqual({ secure: true, sameSite: 'none' });
    });

    it('알 수 없는 SameSite 값은 거부', () => {
      process.env.COOKIE_SAMESITE = 'whatever';
      expect(() => getCookieConfig()).toThrow();
    });
  });

  describe('getJoinCodeKey', () => {
    it('base64 32바이트면 통과', () => {
      process.env.JOIN_CODE_ENC_KEY = Buffer.alloc(32, 1).toString('base64');
      expect(getJoinCodeKey()).toHaveLength(32);
    });

    it('길이가 다르거나 없으면 실패', () => {
      process.env.JOIN_CODE_ENC_KEY = Buffer.alloc(16, 1).toString('base64');
      expect(() => getJoinCodeKey()).toThrow();
      delete process.env.JOIN_CODE_ENC_KEY;
      expect(() => getJoinCodeKey()).toThrow();
    });
  });

  describe('getFirstAdminEmail / getFrontendUrl', () => {
    it('최초 운영진 이메일은 소문자·trim 처리, 비어 있으면 undefined', () => {
      process.env.FIRST_ADMIN_EMAIL = '  Admin@Example.COM ';
      expect(getFirstAdminEmail()).toBe('admin@example.com');
      process.env.FIRST_ADMIN_EMAIL = '   ';
      expect(getFirstAdminEmail()).toBeUndefined();
      delete process.env.FIRST_ADMIN_EMAIL;
      expect(getFirstAdminEmail()).toBeUndefined();
    });

    it('프론트 주소는 URL 형식이어야 한다', () => {
      process.env.FRONTEND_URL = 'http://localhost:5173';
      expect(getFrontendUrl()).toBe('http://localhost:5173');
      process.env.FRONTEND_URL = 'not a url';
      expect(() => getFrontendUrl()).toThrow();
      delete process.env.FRONTEND_URL;
      expect(() => getFrontendUrl()).toThrow();
    });
  });
});
