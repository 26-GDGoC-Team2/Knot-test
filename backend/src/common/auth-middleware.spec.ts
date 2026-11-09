import { JwtService } from '@nestjs/jwt';
import { AuthMiddleware } from './auth-middleware';

const SECRET = 'unit-test-access-secret-0123456789-abcdefgh';

async function capture(p: Promise<unknown>): Promise<{ code?: string; status?: number }> {
  try {
    await p;
  } catch (e) {
    return e as { code?: string; status?: number };
  }
  throw new Error('예외가 발생해야 합니다.');
}

describe('AuthMiddleware', () => {
  const jwt = new JwtService({ secret: SECRET });
  const mw = new AuthMiddleware(jwt);
  const run = (authorization?: string) => {
    const req = { headers: authorization ? { authorization } : {} } as never;
    const next = jest.fn();
    return { req, next, p: mw.use(req, {} as never, next) };
  };
  const sign = (payload: object, opts: object = { expiresIn: '5m' }, secret = SECRET) =>
    new JwtService({ secret }).sign(payload, opts);

  it('Authorization 헤더가 없으면 401', async () => {
    const { p, next } = run();
    expect((await capture(p)).status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('Bearer 형식이 아니면 401', async () => {
    expect((await capture(run('Basic abc').p)).status).toBe(401);
    expect((await capture(run('Bearer ').p)).status).toBe(401);
  });

  it('다른 secret으로 서명한 위조 토큰은 401 UNAUTHORIZED', async () => {
    const token = sign({ sub: 'u', role: 'ADMIN', verified: true }, { expiresIn: '5m' }, 'another-secret-another-secret-12345678');
    const e = await capture(run(`Bearer ${token}`).p);
    expect(e.status).toBe(401);
    expect(e.code).toBe('UNAUTHORIZED');
  });

  it('만료된 토큰은 401 TOKEN_EXPIRED', async () => {
    const token = sign({ sub: 'u', role: 'MEMBER', verified: true }, { expiresIn: -10 });
    const e = await capture(run(`Bearer ${token}`).p);
    expect(e.status).toBe(401);
    expect(e.code).toBe('TOKEN_EXPIRED');
  });

  it('필수 클레임(verified)이 없으면 401', async () => {
    expect((await capture(run(`Bearer ${sign({ sub: 'u', role: 'MEMBER' })}`).p)).status).toBe(401);
  });

  it('알 수 없는 역할이면 401', async () => {
    expect((await capture(run(`Bearer ${sign({ sub: 'u', role: 'ROOT', verified: true })}`).p)).status).toBe(401);
  });

  it('sub가 없으면 401', async () => {
    expect((await capture(run(`Bearer ${sign({ role: 'MEMBER', verified: true })}`).p)).status).toBe(401);
  });

  it('유효한 토큰이면 req.user를 채우고 next를 호출한다', async () => {
    const { req, next, p } = run(`Bearer ${sign({ sub: 'u1', role: 'ADMIN', verified: false })}`);
    await p;
    expect((req as { user: unknown }).user).toEqual({ id: 'u1', role: 'ADMIN', verified: false });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
