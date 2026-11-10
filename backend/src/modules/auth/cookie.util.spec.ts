import { clearRefreshCookie, readCookie, setRefreshCookie, setStateCookie } from './cookie.util';

describe('cookie.util', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  describe('readCookie', () => {
    const req = (cookie?: string) => ({ headers: cookie === undefined ? {} : { cookie } }) as never;

    it('여러 쿠키 중 이름이 일치하는 값을 디코딩해서 반환', () => {
      expect(readCookie(req('a=1; refresh_token=xyz%21; b=2'), 'refresh_token')).toBe('xyz!');
    });

    it('값에 = 가 들어 있어도 첫 = 기준으로 분리', () => {
      expect(readCookie(req('t=abc=def'), 't')).toBe('abc=def');
    });

    it('이름이 부분 일치만 하면 찾지 않는다', () => {
      expect(readCookie(req('xrefresh_token=1'), 'refresh_token')).toBeUndefined();
    });

    it('헤더가 없거나 잘못된 인코딩이면 undefined', () => {
      expect(readCookie(req(), 'a')).toBeUndefined();
      expect(readCookie(req('a=%E0%A4%A'), 'a')).toBeUndefined();
    });
  });

  describe('쿠키 옵션', () => {
    const res = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });

    it('Refresh 쿠키는 httpOnly, / 경로, 만료 시간 포함', () => {
      process.env.COOKIE_SECURE = 'true';
      process.env.COOKIE_SAMESITE = 'none';
      const r = res();
      setRefreshCookie(r as never, 'tok', 1000);
      expect(r.cookie).toHaveBeenCalledWith('refresh_token', 'tok', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        maxAge: 1000,
      });
    });

    it('삭제할 때도 설정할 때와 같은 path/속성을 사용 (브라우저가 지우도록)', () => {
      process.env.COOKIE_SECURE = 'false';
      process.env.COOKIE_SAMESITE = 'lax';
      const r = res();
      clearRefreshCookie(r as never);
      expect(r.clearCookie).toHaveBeenCalledWith('refresh_token', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      });
    });

    it('SameSite=strict여도 OAuth state 쿠키는 lax (Google 이동 시 전송되도록)', () => {
      process.env.COOKIE_SECURE = 'false';
      process.env.COOKIE_SAMESITE = 'strict';
      const r = res();
      setStateCookie(r as never, 'st');
      expect(r.cookie.mock.calls[0][2]).toMatchObject({ sameSite: 'lax', path: '/', httpOnly: true });
      const refresh = res();
      setRefreshCookie(refresh as never, 't', 1);
      expect(refresh.cookie.mock.calls[0][2]).toMatchObject({ sameSite: 'strict' });
    });
  });
});
