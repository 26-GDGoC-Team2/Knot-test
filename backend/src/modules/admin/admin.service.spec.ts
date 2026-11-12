// 가입 코드 발급 단위 테스트 (DB 없이 저장소를 가짜로 대체)
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { decryptJoinCode } from '../../common/join-code-crypto';
import { AdminService, createJoinCodeText } from './admin.service';

describe('AdminService.generateJoinCode', () => {
  const saved = { ...process.env };
  const tx = { query: jest.fn() };
  const repo = {
    replaceActiveJoinCode: jest.fn(),
    insertJoinCodeHistory: jest.fn(),
    insertAuditLog: jest.fn(),
  };
  const database = { transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
  const userService = { withdrawInTx: jest.fn() };
  let service: AdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JOIN_CODE_ENC_KEY = randomBytes(32).toString('base64');
    service = new AdminService(repo as never, database as never, userService as never);
  });
  afterAll(() => {
    process.env = saved;
  });

  it('사람이 입력하기 쉬운 8자리 코드를 만든다 (헷갈리는 문자 제외)', () => {
    for (let i = 0; i < 50; i++) expect(createJoinCodeText()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it('활성 코드로 암호화해 저장하고, 원문은 응답에만 준다', async () => {
    const res = await service.generateJoinCode('admin-1');

    expect(res.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const [enc, by, usedTx] = repo.replaceActiveJoinCode.mock.calls[0];
    expect(decryptJoinCode(enc)).toBe(res.code); // 인증 모듈이 복호화해서 비교하는 값과 같다
    expect(enc).not.toContain(res.code);
    expect(by).toBe('admin-1');
    expect(usedTx).toBe(tx); // 같은 트랜잭션 사용
  });

  it('이력에는 원문이 아닌 해시만 남기고, 감사 로그도 같은 트랜잭션에 기록한다', async () => {
    const res = await service.generateJoinCode('admin-1');

    const [hash, issuedBy, , historyTx] = repo.insertJoinCodeHistory.mock.calls[0];
    expect(hash).toBe(createHash('sha256').update(res.code).digest('hex'));
    expect(hash).not.toBe(res.code);
    expect(issuedBy).toBe('admin-1');
    expect(historyTx).toBe(tx);
    expect(repo.insertAuditLog.mock.calls[0][0]).toBe('admin-1');
    expect(repo.insertAuditLog.mock.calls[0][5]).toBe(tx);
  });

  it('저장 중 오류가 나면 코드를 응답하지 않고 그대로 던진다', async () => {
    repo.replaceActiveJoinCode.mockRejectedValueOnce(new Error('db down'));
    await expect(service.generateJoinCode('admin-1')).rejects.toThrow('db down');
  });
});

describe('AdminService.forceWithdraw / setGraduationStatus', () => {
  const tx = { query: jest.fn() };
  const repo = {
    findMemberById: jest.fn(),
    insertAuditLog: jest.fn(),
    setGraduationStatus: jest.fn(),
  };
  const database = { transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
  const userService = { withdrawInTx: jest.fn() };
  let service: AdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminService(repo as never, database as never, userService as never);
  });

  it('강제 탈퇴는 본인 탈퇴와 같은 처리(withdrawInTx)를 같은 트랜잭션에서 하고 감사 로그에 건수를 남긴다', async () => {
    repo.findMemberById.mockResolvedValue({ id: 'u1', role: 'MEMBER', status: 'ACTIVE' });
    userService.withdrawInTx.mockResolvedValue({ completedRecruitments: 2, canceledApplications: 3 });

    await service.forceWithdraw('u1', { reason: '규칙 위반' }, 'admin-1');

    expect(userService.withdrawInTx.mock.calls[0][0]).toBe('u1');
    expect(userService.withdrawInTx.mock.calls[0][1]).toBe(tx);
    const audit = repo.insertAuditLog.mock.calls[0];
    expect(audit.slice(0, 4)).toEqual(['admin-1', 'FORCE_WITHDRAW', 'user', 'u1']);
    expect(audit[4]).toEqual({ reason: '규칙 위반', completedRecruitments: 2, canceledApplications: 3 });
    expect(audit[5]).toBe(tx);
  });

  it('운영진은 강제 탈퇴할 수 없고(403), 없는 멤버는 404 — 탈퇴 처리는 호출하지 않는다', async () => {
    repo.findMemberById.mockResolvedValueOnce({ id: 'a2', role: 'ADMIN', status: 'ACTIVE' });
    await expect(service.forceWithdraw('a2', { reason: 'x' }, 'admin-1')).rejects.toBeInstanceOf(ForbiddenException);

    repo.findMemberById.mockResolvedValueOnce(null);
    await expect(service.forceWithdraw('nobody', { reason: 'x' }, 'admin-1')).rejects.toBeInstanceOf(NotFoundException);

    expect(userService.withdrawInTx).not.toHaveBeenCalled();
    expect(repo.insertAuditLog).not.toHaveBeenCalled();
  });

  it('탈퇴 처리 중 오류가 나면 감사 로그를 남기지 않고 그대로 던진다', async () => {
    repo.findMemberById.mockResolvedValue({ id: 'u1', role: 'MEMBER', status: 'ACTIVE' });
    userService.withdrawInTx.mockRejectedValueOnce(new Error('db down'));
    await expect(service.forceWithdraw('u1', { reason: 'x' }, 'admin-1')).rejects.toThrow('db down');
    expect(repo.insertAuditLog).not.toHaveBeenCalled();
  });

  it('수료 지정은 저장과 감사 로그를 같은 트랜잭션으로 처리, 없는 멤버는 404', async () => {
    repo.findMemberById.mockResolvedValueOnce({ id: 'u1', role: 'MEMBER', status: 'ACTIVE' });
    await service.setGraduationStatus('u1', true, 'admin-1');
    expect(repo.setGraduationStatus).toHaveBeenCalledWith('u1', true, tx);
    expect(repo.insertAuditLog.mock.calls[0][1]).toBe('SET_GRADUATION_STATUS');
    expect(repo.insertAuditLog.mock.calls[0][5]).toBe(tx);

    repo.findMemberById.mockResolvedValueOnce(null);
    await expect(service.setGraduationStatus('nobody', true, 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AdminService.changeRole', () => {
  const tx = { query: jest.fn() };
  const repo = {
    findMemberById: jest.fn(),
    countOtherActiveAdmins: jest.fn(),
    updateRole: jest.fn(),
    insertRoleHistory: jest.fn(),
    insertAuditLog: jest.fn(),
  };
  const database = { transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
  const dto = { role: 'MEMBER', reason: '활동 종료' } as never;
  let service: AdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminService(repo as never, database as never, {} as never);
  });

  it('역할 변경·이력·감사 로그를 같은 트랜잭션(tx)으로 저장한다', async () => {
    repo.findMemberById.mockResolvedValue({ id: 'u1', role: 'ADMIN', status: 'ACTIVE' });
    repo.countOtherActiveAdmins.mockResolvedValue(1);

    await service.changeRole('u1', dto, 'admin-1');

    expect(repo.updateRole).toHaveBeenCalledWith('u1', 'MEMBER', tx);
    expect(repo.insertRoleHistory.mock.calls[0][5]).toBe(tx);
    expect(repo.insertAuditLog.mock.calls[0][5]).toBe(tx);
  });

  it('마지막 운영진을 일반 회원으로 바꾸면 403 LAST_ADMIN, 아무것도 저장하지 않는다', async () => {
    repo.findMemberById.mockResolvedValue({ id: 'u1', role: 'ADMIN', status: 'ACTIVE' });
    repo.countOtherActiveAdmins.mockResolvedValue(0);

    await expect(service.changeRole('u1', dto, 'u1')).rejects.toMatchObject({ code: 'LAST_ADMIN' });
    expect(repo.updateRole).not.toHaveBeenCalled();
    expect(repo.insertRoleHistory).not.toHaveBeenCalled();
    expect(repo.insertAuditLog).not.toHaveBeenCalled();
  });

  it('일반 회원을 운영진으로 올리는 경우는 운영진 수를 확인하지 않는다', async () => {
    repo.findMemberById.mockResolvedValue({ id: 'u2', role: 'MEMBER', status: 'ACTIVE' });

    await service.changeRole('u2', { role: 'ADMIN', reason: '임명' } as never, 'admin-1');

    expect(repo.countOtherActiveAdmins).not.toHaveBeenCalled();
    expect(repo.updateRole).toHaveBeenCalledWith('u2', 'ADMIN', tx);
  });

  it('없는 멤버는 404', async () => {
    repo.findMemberById.mockResolvedValue(null);
    await expect(service.changeRole('nobody', dto, 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.updateRole).not.toHaveBeenCalled();
  });
});
