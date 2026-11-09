import { Reflector } from '@nestjs/core';
import { Roles, RolesGuard } from './role-guard';
import { AllowUnverified, VerifiedGuard } from './verified-guard';

// 데코레이터가 붙은 핸들러를 가진 가짜 컨트롤러
class FakeController {
  @Roles('ADMIN')
  adminOnly() {}

  open() {}

  @AllowUnverified()
  allowUnverified() {}
}

function ctx(method: keyof FakeController, user?: object) {
  const handler = FakeController.prototype[method];
  return {
    getHandler: () => handler,
    getClass: () => FakeController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;
}

function capture(fn: () => unknown): { code?: string; status?: number } {
  try {
    fn();
  } catch (e) {
    return e as { code?: string; status?: number };
  }
  throw new Error('예외가 발생해야 합니다.');
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('@Roles가 없으면 로그인한 누구나 통과', () => {
    expect(guard.canActivate(ctx('open', { id: 'u', role: 'MEMBER', verified: true }))).toBe(true);
  });

  it('ADMIN 전용 API에 MEMBER가 접근하면 403', () => {
    const e = capture(() => guard.canActivate(ctx('adminOnly', { id: 'u', role: 'MEMBER', verified: true })));
    expect(e.status).toBe(403);
    expect(e.code).toBe('FORBIDDEN');
  });

  it('ADMIN 전용 API에 ADMIN은 통과', () => {
    expect(guard.canActivate(ctx('adminOnly', { id: 'a', role: 'ADMIN', verified: true }))).toBe(true);
  });

  it('인증 정보가 없으면 401 (미들웨어를 거치지 않은 경우 방어)', () => {
    expect(capture(() => guard.canActivate(ctx('adminOnly'))).status).toBe(401);
  });
});

describe('VerifiedGuard', () => {
  const guard = new VerifiedGuard(new Reflector());

  it('공개 경로(user 없음)는 통과', () => {
    expect(guard.canActivate(ctx('open'))).toBe(true);
  });

  it('가입 코드 인증을 마친 회원은 통과', () => {
    expect(guard.canActivate(ctx('open', { id: 'u', role: 'MEMBER', verified: true }))).toBe(true);
  });

  it('미인증 회원은 일반 API에서 403 JOIN_CODE_REQUIRED', () => {
    const e = capture(() => guard.canActivate(ctx('open', { id: 'u', role: 'MEMBER', verified: false })));
    expect(e.status).toBe(403);
    expect(e.code).toBe('JOIN_CODE_REQUIRED');
  });

  it('@AllowUnverified 핸들러는 미인증 회원도 통과', () => {
    expect(guard.canActivate(ctx('allowUnverified', { id: 'u', role: 'MEMBER', verified: false }))).toBe(true);
  });
});
