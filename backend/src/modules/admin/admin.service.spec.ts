// 가입 코드 발급 단위 테스트 (DB 없이 저장소를 가짜로 대체)
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
  let service: AdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JOIN_CODE_ENC_KEY = randomBytes(32).toString('base64');
    service = new AdminService(repo as never, database as never);
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
