import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { AppException } from '../../common/app.exception';
import { ErrorCode } from '../../common/error-code';
import { MemberSearchQuery, SaveExperienceDto, SaveProfileDto } from './profile.dto';
import { ProfileService } from './profile.service';
import type { ProfileRepository, ProfileRow } from './profile.repository';

const exp = (i: number) => ({ id: `e${i}` }) as never;
const profileRow: ProfileRow = {
  userId: 'u1', name: '홍길동', status: 'ACTIVE', bio: null, githubUrl: null, available: true, availableFrom: null,
  roles: [], skills: [], interests: [], updatedAt: '2025-01-01T00:00:00Z',
};

function setup(overrides: Partial<Record<keyof ProfileRepository, jest.Mock>> = {}) {
  const repo = {
    findProfile: jest.fn().mockResolvedValue(profileRow),
    listExperiences: jest.fn().mockResolvedValue([]),
    lockActiveUser: jest.fn().mockResolvedValue({ id: 'u1' }),
    findExistingIds: jest.fn().mockImplementation((_t: string, ids: number[]) => Promise.resolve(ids)),
    upsertCustomSkill: jest.fn().mockResolvedValue(100),
    countCustomSkills: jest.fn().mockResolvedValue(0),
    updateUserName: jest.fn(), upsertProfile: jest.fn(), replaceRoles: jest.fn(), replaceSkills: jest.fn(), replaceInterests: jest.fn(),
    countExperiences: jest.fn().mockResolvedValue(0),
    lockExperience: jest.fn(), insertPersonalExperience: jest.fn().mockResolvedValue('new'), updatePersonalExperience: jest.fn(),
    replaceExperienceSkills: jest.fn(), findExperience: jest.fn().mockResolvedValue({ id: 'new' }),
    setExperienceVisibility: jest.fn(), deletePersonalExperience: jest.fn(), searchMembers: jest.fn(),
    ...overrides,
  };
  const database = { transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({})) };
  const service = new ProfileService(database as never, repo as never);
  return { service, repo };
}

const profileDto = (o: object = {}) =>
  plainToInstance(SaveProfileDto, { name: '홍길동', roleIds: [1], skillIds: [1], interestIds: [1], available: true, ...o });
const expDto = (o: object = {}) => plainToInstance(SaveExperienceDto, { name: 'P', isPublic: true, ...o });
const codeOf = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return (e as AppException).code; }
  return undefined;
};

describe('ProfileService.getProfile (공개 프로젝트 개수 제한 없음)', () => {
  it('타인 조회: 공개 프로젝트만 요청하고 개수 제한 없이 모두 반환', async () => {
    const { service, repo } = setup();
    repo.listExperiences.mockResolvedValue([1, 2, 3, 4, 5].map(exp));
    const res = await service.getProfile('viewer', 'u1');
    expect(repo.listExperiences).toHaveBeenCalledWith('u1', true);
    expect(res.experiences).toHaveLength(5);
    expect(res.isMine).toBe(false);
  });

  it('본인 조회: 전체(비공개 포함)를 자르지 않고 반환', async () => {
    const { service, repo } = setup();
    repo.listExperiences.mockResolvedValue([1, 2, 3, 4, 5].map(exp));
    const res = await service.getProfile('u1', 'u1');
    expect(repo.listExperiences).toHaveBeenCalledWith('u1', false);
    expect(res.experiences).toHaveLength(5);
    expect(res.isMine).toBe(true);
  });

  it('프로필이 없거나 탈퇴 회원이면 404', async () => {
    const a = setup({ findProfile: jest.fn().mockResolvedValue(null) });
    expect(await codeOf(a.service.getProfile('v', 'u1'))).toBe(ErrorCode.NOT_FOUND);
    const b = setup({ findProfile: jest.fn().mockResolvedValue({ ...profileRow, status: 'WITHDRAWN' }) });
    expect(await codeOf(b.service.getProfile('v', 'u1'))).toBe(ErrorCode.NOT_FOUND);
  });
});

describe('ProfileService.saveMyProfile', () => {
  it('기술이 하나도 없으면 400', async () => {
    const { service } = setup();
    expect(await codeOf(service.saveMyProfile('u1', profileDto({ skillIds: [], customSkills: [] })))).toBe(ErrorCode.BAD_REQUEST);
  });

  it('존재하지 않는 역할 id 는 400 이고 아무것도 저장하지 않음', async () => {
    const { service, repo } = setup({ findExistingIds: jest.fn().mockResolvedValue([]) });
    expect(await codeOf(service.saveMyProfile('u1', profileDto()))).toBe(ErrorCode.BAD_REQUEST);
    expect(repo.upsertProfile).not.toHaveBeenCalled();
  });

  it('탈퇴/없는 회원은 401', async () => {
    const { service } = setup({ lockActiveUser: jest.fn().mockResolvedValue(null) });
    expect(await codeOf(service.saveMyProfile('u1', profileDto()))).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('잘못된 날짜(2월 30일)는 400', async () => {
    const { service } = setup();
    expect(await codeOf(service.saveMyProfile('u1', profileDto({ availableFrom: '2025-02-30' })))).toBe(ErrorCode.BAD_REQUEST);
  });

  it('직접 입력 기술은 공백/대소문자만 다른 중복을 한 번만 저장', async () => {
    const { service, repo } = setup();
    await service.saveMyProfile('u1', profileDto({ customSkills: ['Rust Lang', 'rustlang', ' RUST  LANG '] }));
    expect(repo.upsertCustomSkill).toHaveBeenCalledTimes(1);
    expect(repo.upsertCustomSkill).toHaveBeenCalledWith('Rust Lang', 'rustlang', expect.anything());
    expect(repo.replaceSkills).toHaveBeenCalledWith('u1', [1, 100], expect.anything());
  });

  it('직접 입력 기술 합계가 한도를 넘으면 400 (저장 안 함)', async () => {
    const { service, repo } = setup({ countCustomSkills: jest.fn().mockResolvedValue(6) });
    expect(await codeOf(service.saveMyProfile('u1', profileDto({ customSkills: ['A'] })))).toBe(ErrorCode.BAD_REQUEST);
    expect(repo.upsertProfile).not.toHaveBeenCalled();
  });

  it('정상 저장 시 이름/프로필/역할/기술/관심 분야를 모두 갱신', async () => {
    const { service, repo } = setup();
    const res = await service.saveMyProfile('u1', profileDto());
    expect(repo.updateUserName).toHaveBeenCalledWith('u1', '홍길동', expect.anything());
    expect(repo.upsertProfile).toHaveBeenCalled();
    expect(repo.replaceRoles).toHaveBeenCalled();
    expect(repo.replaceInterests).toHaveBeenCalled();
    expect(res.userId).toBe('u1');
  });
});

describe('ProfileService 프로젝트 경험', () => {
  it('종료일이 시작일보다 앞서면 400', async () => {
    const { service } = setup();
    expect(await codeOf(service.createExperience('u1', expDto({ startedOn: '2025-03-01', endedOn: '2025-02-01' })))).toBe(ErrorCode.BAD_REQUEST);
  });

  it('등록 한도를 넘으면 400', async () => {
    const { service } = setup({ countExperiences: jest.fn().mockResolvedValue(50) });
    expect(await codeOf(service.createExperience('u1', expDto()))).toBe(ErrorCode.BAD_REQUEST);
  });

  it('남의 경험/없는 경험 수정은 404', async () => {
    const { service } = setup({ lockExperience: jest.fn().mockResolvedValue(null) });
    expect(await codeOf(service.updateExperience('u1', 'x', expDto()))).toBe(ErrorCode.NOT_FOUND);
  });

  it('동아리/팀 프로젝트는 수정·삭제 불가(403)지만 공개 여부는 변경 가능', async () => {
    const { service, repo } = setup({ lockExperience: jest.fn().mockResolvedValue({ type: 'OFFICIAL' }) });
    expect(await codeOf(service.updateExperience('u1', 'x', expDto()))).toBe(ErrorCode.FORBIDDEN);
    expect(await codeOf(service.deleteExperience('u1', 'x'))).toBe(ErrorCode.FORBIDDEN);
    await service.setExperienceVisibility('u1', 'x', { isPublic: false });
    expect(repo.setExperienceVisibility).toHaveBeenCalledWith('x', false, expect.anything());
  });
});

describe('ProfileService.searchMembers', () => {
  it('정렬은 허용 목록만 가능', async () => {
    const { service } = setup();
    const q = plainToInstance(MemberSearchQuery, { sortBy: 'password' });
    expect(await codeOf(service.searchMembers(q))).toBe(ErrorCode.BAD_REQUEST);
  });

  it('필터와 페이지 정보를 저장소에 전달하고 페이지 응답으로 감쌈', async () => {
    const { service, repo } = setup();
    repo.searchMembers.mockResolvedValue({ items: [{ userId: 'u1' }], total: 21 });
    const q = plainToInstance(MemberSearchQuery, { q: ' 길동 ', roleIds: '1,2', available: 'true', page: '2', size: '10' });
    const res = await service.searchMembers(q);
    expect(repo.searchMembers).toHaveBeenCalledWith(
      { q: '길동', roleIds: [1, 2], skillIds: undefined, interestIds: undefined, available: true },
      { limit: 10, offset: 10 },
      { column: 'p.updated_at', direction: 'desc' },
    );
    expect(res.total).toBe(21);
    expect(res.totalPages).toBe(3);
  });
});
