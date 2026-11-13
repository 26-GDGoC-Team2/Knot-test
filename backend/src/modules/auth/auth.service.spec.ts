import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { encryptJoinCode } from '../../common/join-code-crypto';
import { AuthService } from './auth.service';
import type { UserRow } from './auth.repository';

const ACCESS = 'x'.repeat(32);
const REFRESH = 'y'.repeat(32);
const KEY = randomBytes(32);

const baseUser: UserRow = {
  id: 'u1',
  google_sub: 'g-1',
  email: 'u1@example.com',
  name: '홍길동',
  role: 'MEMBER',
  status: 'ACTIVE',
  completed: false,
  join_verified_at: null,
};
const profile = { sub: 'g-1', email: 'u1@example.com', name: '홍길동' };

async function capture(p: Promise<unknown>): Promise<{ code?: string; status?: number; message?: string }> {
  try {
    await p;
  } catch (e) {
    return e as { code?: string; status?: number };
  }
  throw new Error('예외가 발생해야 합니다.');
}

function build() {
  const tx = { query: jest.fn() };
  const database = { transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
  const repo = {
    findUserByGoogleSub: jest.fn(),
    findUserById: jest.fn(),
    lockFirstAdminAssignment: jest.fn(),
    existsAdmin: jest.fn().mockResolvedValue(false),
    insertUser: jest.fn(async (u: { googleSub: string; email: string; name: string; role: 'MEMBER' | 'ADMIN'; joinVerified: boolean }) => ({
      ...baseUser,
      google_sub: u.googleSub,
      email: u.email,
      role: u.role,
      join_verified_at: u.joinVerified ? new Date() : null,
    })),
    markJoinVerified: jest.fn().mockResolvedValue(true),
    hasProfile: jest.fn().mockResolvedValue(false),
    findActiveJoinCodeEnc: jest.fn(),
    insertRefreshToken: jest.fn(),
    findRefreshTokenByHash: jest.fn(),
    revokeRefreshToken: jest.fn().mockResolvedValue(true),
    revokeRefreshTokenByHash: jest.fn(),
    revokeAllRefreshTokens: jest.fn(),
    reactivateUser: jest.fn(),
  };
  const jwt = { signAsync: jest.fn(async (p: object) => `signed:${JSON.stringify(p)}`) };
  const service = new AuthService(repo as never, database as never, jwt as never);
  return { service, repo, tx, database, jwt };
}

describe('AuthService', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = ACCESS;
    process.env.JWT_REFRESH_SECRET = REFRESH;
    process.env.JOIN_CODE_ENC_KEY = KEY.toString('base64');
    delete process.env.FIRST_ADMIN_EMAIL;
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  describe('loginWithGoogle', () => {
    it('기존 회원은 새로 만들지 않고 Refresh 토큰만 발급, DB에는 해시만 저장', async () => {
      const { service, repo } = build();
      repo.findUserByGoogleSub.mockResolvedValue(baseUser);

      const { refresh } = await service.loginWithGoogle(profile);

      expect(repo.insertUser).not.toHaveBeenCalled();
      const [userId, storedHash, expiresAt] = repo.insertRefreshToken.mock.calls[0];
      expect(userId).toBe('u1');
      expect(storedHash).toMatch(/^[0-9a-f]{64}$/);
      expect(storedHash).not.toContain(refresh.token);
      expect(refresh.maxAgeMs).toBe(14 * 86_400_000);
      expect(Math.abs((expiresAt as Date).getTime() - Date.now() - refresh.maxAgeMs)).toBeLessThan(5000);
    });

    it('로그인할 때마다 서로 다른 Refresh 토큰을 발급', async () => {
      const { service, repo } = build();
      repo.findUserByGoogleSub.mockResolvedValue(baseUser);
      const a = await service.loginWithGoogle(profile);
      const b = await service.loginWithGoogle(profile);
      expect(a.refresh.token).not.toBe(b.refresh.token);
    });

    it('탈퇴한 회원이 다시 로그인하면 같은 계정을 되살리고 토큰을 발급한다', async () => {
      const { service, repo } = build();
      repo.findUserByGoogleSub.mockResolvedValue({ ...baseUser, status: 'WITHDRAWN' });
      repo.reactivateUser.mockResolvedValue({ ...baseUser, status: 'ACTIVE', join_verified_at: null });
      const r = await service.loginWithGoogle(profile);
      expect(repo.reactivateUser).toHaveBeenCalledWith('u1', { email: 'u1@example.com', name: '홍길동' });
      expect(repo.insertUser).not.toHaveBeenCalled(); // 새 행을 만들지 않는다
      expect(repo.insertRefreshToken).toHaveBeenCalledTimes(1);
      expect(r.refresh.token).toBeTruthy();
    });

    it('재가입 중 다른 요청이 먼저 되살렸다면 그 결과로 로그인한다', async () => {
      const { service, repo } = build();
      repo.findUserByGoogleSub.mockResolvedValue({ ...baseUser, status: 'WITHDRAWN' });
      repo.reactivateUser.mockResolvedValue(null);
      repo.findUserById.mockResolvedValue({ ...baseUser, status: 'ACTIVE' });
      await service.loginWithGoogle(profile);
      expect(repo.insertRefreshToken).toHaveBeenCalledTimes(1);
    });

    it('재가입 이메일을 다른 계정이 쓰고 있으면 409, 토큰은 발급하지 않는다', async () => {
      const { service, repo } = build();
      repo.findUserByGoogleSub.mockResolvedValue({ ...baseUser, status: 'WITHDRAWN' });
      repo.reactivateUser.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
      const e = await capture(service.loginWithGoogle(profile));
      expect(e.status).toBe(409);
      expect(repo.insertRefreshToken).not.toHaveBeenCalled();
    });

    it('신규 회원은 MEMBER, 가입 코드 미인증 상태로 생성', async () => {
      const { service, repo } = build();
      repo.findUserByGoogleSub.mockResolvedValue(null);
      await service.loginWithGoogle(profile);
      expect(repo.insertUser).toHaveBeenCalledWith(
        { googleSub: 'g-1', email: 'u1@example.com', name: '홍길동', role: 'MEMBER', joinVerified: false },
        expect.anything(),
      );
    });

    it('최초 운영진 이메일로 첫 가입하면 ADMIN이고 가입 코드 없이 인증 처리', async () => {
      process.env.FIRST_ADMIN_EMAIL = 'U1@Example.com';
      const { service, repo } = build();
      repo.findUserByGoogleSub.mockResolvedValue(null);
      await service.loginWithGoogle(profile);
      expect(repo.lockFirstAdminAssignment).toHaveBeenCalled();
      expect(repo.insertUser).toHaveBeenCalledWith(expect.objectContaining({ role: 'ADMIN', joinVerified: true }), expect.anything());
    });

    it('이미 운영진이 있으면 최초 운영진 이메일이어도 MEMBER (1회 한정)', async () => {
      process.env.FIRST_ADMIN_EMAIL = 'u1@example.com';
      const { service, repo } = build();
      repo.findUserByGoogleSub.mockResolvedValue(null);
      repo.existsAdmin.mockResolvedValue(true);
      await service.loginWithGoogle(profile);
      expect(repo.insertUser).toHaveBeenCalledWith(expect.objectContaining({ role: 'MEMBER', joinVerified: false }), expect.anything());
    });

    it('최초 운영진 이메일이 아니면 MEMBER', async () => {
      process.env.FIRST_ADMIN_EMAIL = 'boss@example.com';
      const { service, repo } = build();
      repo.findUserByGoogleSub.mockResolvedValue(null);
      await service.loginWithGoogle(profile);
      expect(repo.insertUser).toHaveBeenCalledWith(expect.objectContaining({ role: 'MEMBER' }), expect.anything());
    });

    it('잠금 대기 중 다른 요청이 먼저 가입시켰다면 중복 생성하지 않는다', async () => {
      const { service, repo } = build();
      repo.findUserByGoogleSub.mockResolvedValueOnce(null).mockResolvedValueOnce(baseUser);
      await service.loginWithGoogle(profile);
      expect(repo.insertUser).not.toHaveBeenCalled();
    });

    it('이메일 중복(unique 위반)은 409', async () => {
      const { service, repo } = build();
      repo.findUserByGoogleSub.mockResolvedValue(null);
      repo.insertUser.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
      expect((await capture(service.loginWithGoogle(profile))).status).toBe(409);
    });

    it('그 외 DB 오류는 그대로 전파 (전역 필터가 500 처리)', async () => {
      const { service, repo } = build();
      repo.findUserByGoogleSub.mockResolvedValue(null);
      repo.insertUser.mockRejectedValue(new Error('connection lost'));
      await expect(service.loginWithGoogle(profile)).rejects.toThrow('connection lost');
    });
  });

  describe('refresh', () => {
    const future = new Date(Date.now() + 3_600_000);
    const row = { id: 'rt1', user_id: 'u1', expires_at: future, revoked_at: null };

    it('토큰이 없으면 401', async () => {
      const { service } = build();
      expect((await capture(service.refresh(undefined))).status).toBe(401);
    });

    it('DB에 없는 토큰은 401', async () => {
      const { service, repo } = build();
      repo.findRefreshTokenByHash.mockResolvedValue(null);
      expect((await capture(service.refresh('unknown'))).status).toBe(401);
    });

    it('이미 폐기된 토큰의 재사용은 탈취로 보고 모든 토큰 폐기 후 401', async () => {
      const { service, repo } = build();
      repo.findRefreshTokenByHash.mockResolvedValue({ ...row, revoked_at: new Date() });
      expect((await capture(service.refresh('old'))).status).toBe(401);
      expect(repo.revokeAllRefreshTokens).toHaveBeenCalledWith('u1');
    });

    it('만료된 토큰은 401 TOKEN_EXPIRED', async () => {
      const { service, repo } = build();
      repo.findRefreshTokenByHash.mockResolvedValue({ ...row, expires_at: new Date(Date.now() - 1000) });
      const e = await capture(service.refresh('t'));
      expect(e.status).toBe(401);
      expect(e.code).toBe('TOKEN_EXPIRED');
    });

    it('탈퇴한 회원은 재발급 차단하고 남은 토큰도 폐기', async () => {
      const { service, repo } = build();
      repo.findRefreshTokenByHash.mockResolvedValue(row);
      repo.findUserById.mockResolvedValue({ ...baseUser, status: 'WITHDRAWN' });
      expect((await capture(service.refresh('t'))).status).toBe(401);
      expect(repo.revokeAllRefreshTokens).toHaveBeenCalledWith('u1');
      expect(repo.insertRefreshToken).not.toHaveBeenCalled();
    });

    it('성공하면 기존 토큰을 폐기하고 새 토큰을 같은 트랜잭션에서 발급 (회전)', async () => {
      const { service, repo, tx, database } = build();
      repo.findRefreshTokenByHash.mockResolvedValue(row);
      repo.findUserById.mockResolvedValue({ ...baseUser, join_verified_at: new Date() });
      repo.hasProfile.mockResolvedValue(true);

      const res = await service.refresh('raw-token');

      expect(database.transaction).toHaveBeenCalledTimes(1);
      expect(repo.revokeRefreshToken).toHaveBeenCalledWith('rt1', tx);
      expect(repo.insertRefreshToken.mock.calls[0][3]).toBe(tx);
      expect(res.refresh.token).not.toBe('raw-token');
      expect(res.nextStep).toBe('HOME');
      expect(res.accessToken).toContain('"verified":true');
      expect(res.user).toEqual({ id: 'u1', name: '홍길동', role: 'MEMBER' });
    });

    it('동시 요청으로 이미 회전된 토큰이면 한쪽은 401 (새 토큰 미발급)', async () => {
      const { service, repo } = build();
      repo.findRefreshTokenByHash.mockResolvedValue(row);
      repo.findUserById.mockResolvedValue(baseUser);
      repo.revokeRefreshToken.mockResolvedValue(false);
      expect((await capture(service.refresh('t'))).status).toBe(401);
      expect(repo.insertRefreshToken).not.toHaveBeenCalled();
    });

    it('저장된 해시는 원문과 같지 않고, 조회 해시와 일치한다', async () => {
      const { service, repo } = build();
      repo.findRefreshTokenByHash.mockResolvedValue(null);
      await capture(service.refresh('raw-token'));
      const lookedUp = repo.findRefreshTokenByHash.mock.calls[0][0];
      expect(lookedUp).toMatch(/^[0-9a-f]{64}$/);
      expect(lookedUp).not.toContain('raw-token');
    });
  });

  describe('logout', () => {
    it('쿠키의 토큰을 해당 사용자 기준으로 폐기', async () => {
      const { service, repo } = build();
      await service.logout('u1', 'raw');
      expect(repo.revokeRefreshTokenByHash).toHaveBeenCalledWith('u1', expect.stringMatching(/^[0-9a-f]{64}$/));
    });

    it('쿠키가 없으면 아무것도 하지 않는다', async () => {
      const { service, repo } = build();
      await service.logout('u1', undefined);
      expect(repo.revokeRefreshTokenByHash).not.toHaveBeenCalled();
    });
  });

  describe('verifyJoinCode', () => {
    const enc = () => encryptJoinCode('KNOT-2026', KEY);

    it('올바른 코드면 인증 시각을 1회 기록하고 verified=true 토큰을 재발급', async () => {
      const { service, repo } = build();
      repo.findUserById
        .mockResolvedValueOnce(baseUser)
        .mockResolvedValueOnce({ ...baseUser, join_verified_at: new Date() });
      repo.findActiveJoinCodeEnc.mockResolvedValue(enc());

      const res = await service.verifyJoinCode('u1', 'KNOT-2026');

      expect(repo.markJoinVerified).toHaveBeenCalledWith('u1');
      expect(res.accessToken).toContain('"verified":true');
      expect(res.nextStep).toBe('PROFILE');
    });

    it('틀린 코드는 400 JOIN_CODE_MISMATCH이고 인증 기록을 남기지 않는다', async () => {
      const { service, repo } = build();
      repo.findUserById.mockResolvedValue(baseUser);
      repo.findActiveJoinCodeEnc.mockResolvedValue(enc());
      const e = await capture(service.verifyJoinCode('u1', 'WRONG'));
      expect(e.status).toBe(400);
      expect(e.code).toBe('JOIN_CODE_MISMATCH');
      expect(e.message).toBe('가입 코드가 맞지 않아요');
      expect(repo.markJoinVerified).not.toHaveBeenCalled();
    });

    it('대소문자가 다르면 불일치', async () => {
      const { service, repo } = build();
      repo.findUserById.mockResolvedValue(baseUser);
      repo.findActiveJoinCodeEnc.mockResolvedValue(enc());
      expect((await capture(service.verifyJoinCode('u1', 'knot-2026'))).code).toBe('JOIN_CODE_MISMATCH');
    });

    it('가입 코드가 아직 설정되지 않았으면 불일치와 같은 응답', async () => {
      const { service, repo } = build();
      repo.findUserById.mockResolvedValue(baseUser);
      repo.findActiveJoinCodeEnc.mockResolvedValue(null);
      const e = await capture(service.verifyJoinCode('u1', 'KNOT-2026'));
      expect(e.code).toBe('JOIN_CODE_MISMATCH');
      expect(repo.markJoinVerified).not.toHaveBeenCalled();
    });

    it('이미 인증된 회원은 코드를 다시 검사하지 않고 현재 상태 반환', async () => {
      const { service, repo } = build();
      repo.findUserById.mockResolvedValue({ ...baseUser, join_verified_at: new Date() });
      const res = await service.verifyJoinCode('u1', 'anything');
      expect(repo.findActiveJoinCodeEnc).not.toHaveBeenCalled();
      expect(repo.markJoinVerified).not.toHaveBeenCalled();
      expect(res.accessToken).toContain('"verified":true');
    });

    it('암호문이 손상됐거나 키가 다르면 500이고 내부 사유를 노출하지 않는다', async () => {
      const { service, repo } = build();
      repo.findUserById.mockResolvedValue(baseUser);
      repo.findActiveJoinCodeEnc.mockResolvedValue(encryptJoinCode('KNOT-2026', randomBytes(32)));
      const e = await capture(service.verifyJoinCode('u1', 'KNOT-2026'));
      expect(e.status).toBe(500);
      expect(e.message).toBe('서버 오류가 발생했습니다.');
    });

    it('탈퇴했거나 없는 회원은 401', async () => {
      const { service, repo } = build();
      repo.findUserById.mockResolvedValueOnce(null);
      expect((await capture(service.verifyJoinCode('u1', 'x'))).status).toBe(401);
      repo.findUserById.mockResolvedValueOnce({ ...baseUser, status: 'WITHDRAWN' });
      expect((await capture(service.verifyJoinCode('u1', 'x'))).status).toBe(401);
    });
  });

  describe('me / nextStep', () => {
    it('가입 코드 미인증 → JOIN_CODE, verified=false 토큰', async () => {
      const { service, repo } = build();
      repo.findUserById.mockResolvedValue(baseUser);
      const res = await service.me('u1');
      expect(res.nextStep).toBe('JOIN_CODE');
      expect(res.accessToken).toContain('"verified":false');
    });

    it('인증했지만 프로필이 없으면 PROFILE', async () => {
      const { service, repo } = build();
      repo.findUserById.mockResolvedValue({ ...baseUser, join_verified_at: new Date() });
      repo.hasProfile.mockResolvedValue(false);
      expect((await service.me('u1')).nextStep).toBe('PROFILE');
    });

    it('인증하고 프로필도 있으면 HOME', async () => {
      const { service, repo } = build();
      repo.findUserById.mockResolvedValue({ ...baseUser, join_verified_at: new Date() });
      repo.hasProfile.mockResolvedValue(true);
      expect((await service.me('u1')).nextStep).toBe('HOME');
    });

    it('탈퇴 회원은 401', async () => {
      const { service, repo } = build();
      repo.findUserById.mockResolvedValue({ ...baseUser, status: 'WITHDRAWN' });
      expect((await capture(service.me('u1'))).status).toBe(401);
    });

    it('응답에 이메일/구글 식별자는 포함되지 않는다', async () => {
      const { service, repo } = build();
      repo.findUserById.mockResolvedValue(baseUser);
      const res = await service.me('u1');
      expect(JSON.stringify(res.user)).not.toMatch(/example\.com|g-1/);
    });
  });
});
