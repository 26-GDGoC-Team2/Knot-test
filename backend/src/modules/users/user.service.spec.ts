import { Logger } from '@nestjs/common';
import { toPublicUser } from './user.dto';
import { UserService } from './user.service';

type Target = { id: string; role: 'MEMBER' | 'ADMIN'; status: 'ACTIVE' | 'WITHDRAWN' } | null;

async function capture(p: Promise<unknown>): Promise<{ code?: string; status?: number; message?: string }> {
  try {
    await p;
  } catch (e) {
    return e as { code?: string; status?: number };
  }
  throw new Error('예외가 발생해야 합니다.');
}

function build(user: Target, others = 1) {
  const calls: string[] = [];
  const state = { committed: false, rolledBack: false };
  const tx = {
    query: jest.fn(async (sql: string) => {
      calls.push(sql.includes('pg_advisory_xact_lock') ? 'lockAdmin' : sql);
      return { rows: [], rowCount: 0 };
    }),
  };
  const database = {
    transaction: jest.fn(async (fn: (t: unknown) => unknown) => {
      try {
        const r = await fn(tx);
        state.committed = true;
        return r;
      } catch (e) {
        state.rolledBack = true;
        throw e;
      }
    }),
  };
  // 모든 Repository 호출은 트랜잭션 client로 실행되어야 한다
  const step = (name: string, value: unknown) =>
    jest.fn(async (...args: unknown[]) => {
      expect(args[args.length - 1]).toBe(tx);
      calls.push(name);
      return value;
    });
  const users = {
    findForWithdrawal: step('findUser', user),
    countOtherActiveAdmins: step('countAdmins', others),
    erasePersonalData: step('erasePersonalData', undefined),
    markWithdrawn: step('markWithdrawn', true),
  };
  const recruitments = { completeOpenByAuthor: step('completeRecruitments', 2) };
  const applications = { cancelPendingInvolving: step('cancelApplications', 5) };
  const authRepo = { revokeAllRefreshTokens: step('revokeTokens', undefined) };
  const service = new UserService(database as never, users as never, recruitments as never, applications as never, authRepo as never);
  return { service, calls, state, users, recruitments, applications, authRepo };
}

describe('UserService.withdraw', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const member = { id: 'u1', role: 'MEMBER', status: 'ACTIVE' } as const;
  const admin = { id: 'a1', role: 'ADMIN', status: 'ACTIVE' } as const;

  it('일반 회원: 정해진 순서로 한 트랜잭션에서 처리하고 건수를 반환', async () => {
    const t = build(member);
    await expect(t.service.withdraw('u1')).resolves.toEqual({ completedRecruitments: 2, canceledApplications: 5 });
    expect(t.calls).toEqual(['lockAdmin', 'findUser', 'completeRecruitments', 'cancelApplications', 'revokeTokens', 'erasePersonalData', 'markWithdrawn']);
    expect(t.state).toEqual({ committed: true, rolledBack: false });
  });

  it('일반 회원은 운영진 수를 조회하지 않는다', async () => {
    const t = build(member);
    await t.service.withdraw('u1');
    expect(t.users.countOtherActiveAdmins).not.toHaveBeenCalled();
  });

  it('마지막 운영진은 403 LAST_ADMIN으로 거부, 데이터 변경 없이 롤백', async () => {
    const t = build(admin, 0);
    const e = await capture(t.service.withdraw('a1'));
    expect(e.status).toBe(403);
    expect(e.code).toBe('LAST_ADMIN');
    expect(e.message).toBe('마지막 운영진은 탈퇴할 수 없습니다.');
    expect(t.calls).toEqual(['lockAdmin', 'findUser', 'countAdmins']);
    expect(t.state).toEqual({ committed: false, rolledBack: true });
  });

  it('다른 활성 운영진이 있으면 운영진도 탈퇴할 수 있다', async () => {
    const t = build(admin, 1);
    await t.service.withdraw('a1');
    expect(t.state.committed).toBe(true);
  });

  it('이미 탈퇴했거나 없는 회원은 401, 아무것도 변경하지 않는다', async () => {
    for (const u of [{ ...member, status: 'WITHDRAWN' as const }, null]) {
      const t = build(u);
      expect((await capture(t.service.withdraw('u1'))).status).toBe(401);
      expect(t.calls).toEqual(['lockAdmin', 'findUser']);
      expect(t.state.rolledBack).toBe(true);
    }
  });

  it.each(['completeRecruitments', 'cancelApplications', 'revokeTokens', 'erasePersonalData'])('%s 단계가 실패하면 롤백되고 탈퇴 상태로 바뀌지 않는다', async (failAt) => {
    const t = build(member);
    const target = {
      completeRecruitments: t.recruitments.completeOpenByAuthor,
      cancelApplications: t.applications.cancelPendingInvolving,
      revokeTokens: t.authRepo.revokeAllRefreshTokens,
      erasePersonalData: t.users.erasePersonalData,
    }[failAt as 'completeRecruitments']!;
    target.mockRejectedValueOnce(new Error('boom'));
    await expect(t.service.withdraw('u1')).rejects.toThrow('boom');
    expect(t.state).toEqual({ committed: false, rolledBack: true });
    expect(t.users.markWithdrawn).not.toHaveBeenCalled();
  });

  it('마지막 갱신에서 이미 탈퇴 처리된 것으로 나오면(동시 요청) 409로 롤백', async () => {
    const t = build(member);
    t.users.markWithdrawn.mockImplementationOnce(async () => false);
    const e = await capture(t.service.withdraw('u1'));
    expect(e.status).toBe(409);
    expect(t.state.rolledBack).toBe(true);
  });
});

describe('toPublicUser', () => {
  it('탈퇴 회원은 실명 대신 "탈퇴한 회원"으로 표시', () => {
    expect(toPublicUser({ id: 'x', name: '홍길동', status: 'WITHDRAWN' })).toEqual({
      id: 'x',
      name: '탈퇴한 회원',
      withdrawn: true,
    });
  });

  it('활동 중인 회원은 실명 그대로', () => {
    expect(toPublicUser({ id: 'x', name: '홍길동', status: 'ACTIVE' })).toEqual({ id: 'x', name: '홍길동', withdrawn: false });
  });

  it('이메일 등 추가 필드가 들어와도 응답에 포함하지 않는다', () => {
    const dto = toPublicUser({ id: 'x', name: '홍길동', status: 'ACTIVE', email: 'a@b.c', google_sub: 'g' } as never);
    expect(Object.keys(dto).sort()).toEqual(['id', 'name', 'withdrawn']);
  });
});
