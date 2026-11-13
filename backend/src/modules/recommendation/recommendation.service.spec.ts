import { ForbiddenError, NotFoundError, ConflictError, BadRequestError, ServiceUnavailableError, InternalError } from '../../common/app.exception';
import { RecommendationService } from './recommendation.service';
import { RecommendationRepository, CandidateRow } from './recommendation.repository';
import { cleanStrings, dbRoleNamesFor, isUuid, resolveExperienceRole, toAiRole } from './recommendation.util';

const REC = '11111111-1111-4111-8111-111111111111';
const ROLE = '22222222-2222-4222-8222-222222222222';
const AUTHOR = '33333333-3333-4333-8333-333333333333';
const U1 = '44444444-4444-4444-8444-444444444444';

function candidate(over: Partial<CandidateRow> = {}): CandidateRow {
  return {
    user_id: U1, name: '홍길동', bio: '소개', desired_roles: ['AI/Data', 'AI'], skills: ['Python', ' '], interests: ['AI/ML'],
    available: true, available_from: null, completed: false, is_new_member: true, study_count: 2,
    experiences: [
      { experience_id: 'e1', name: ' 프로젝트 ', type: 'PERSONAL', started_on: null, ended_on: null, member_role: null, role_desc: 'AI/Data', description: null, skills: ['Python'] },
      { experience_id: 'e2', name: '  ', type: 'PERSONAL', started_on: null, ended_on: null, member_role: null, role_desc: null, description: null, skills: null },
    ],
    ...over,
  };
}

function makeRepo(over: Record<string, unknown> = {}) {
  return {
    findRecruitment: jest.fn().mockResolvedValue({ id: REC, author_id: AUTHOR, title: 't', description: 'd', status: 'OPEN', start_date: '2026-11-20', end_date: '2027-01-20' }),
    findTargetRole: jest.fn().mockResolvedValue({ recruitment_role_id: ROLE, role_id: 5, role_name: 'AI/Data' }),
    findInterestNames: jest.fn().mockResolvedValue(['AI/ML']),
    findRoleSkills: jest.fn().mockResolvedValue([{ name: 'Python', required: true }, { name: 'Docker', required: false }]),
    findExcludedUserIds: jest.fn().mockResolvedValue([AUTHOR]),
    findCandidates: jest.fn().mockResolvedValue([candidate()]),
    ...over,
  } as unknown as jest.Mocked<RecommendationRepository>;
}

const aiOk = {
  context_id: 'rec_1',
  candidates: [
    { user_id: U1, score: 0.8, raw_rank: 1, display_rank: 1, best_experience_id: 'e1', reason_items: [{ type: 'skill', label: '기술', text: 'Python 일치' }] },
    { user_id: 'unknown', score: 0.5, raw_rank: 2, display_rank: 2, best_experience_id: null, reason_items: [] },
  ],
  next_action: 'CHANGE_CONDITIONS',
};

function mockFetch(status: number, body: unknown) {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

describe('recommendation.util', () => {
  it('AI/Data는 AI로 변환하고 나머지는 그대로 둔다', () => {
    expect(toAiRole('AI/Data')).toBe('AI');
    expect(toAiRole('기획')).toBe('PM');
    expect(toAiRole('BE')).toBe('BE');
  });
  it('AI에 해당하는 DB 역할명 목록', () => {
    expect(dbRoleNamesFor('AI').sort()).toEqual(['AI', 'AI/Data']);
    expect(dbRoleNamesFor('PM').sort()).toEqual(['PM', '기획']);
    expect(dbRoleNamesFor('BE')).toEqual(['BE']);
  });
  it('빈 문자열·중복·null을 정리한다', () => {
    expect(cleanStrings([' a ', 'a', '', null, undefined, 'b'])).toEqual(['a', 'b']);
    expect(cleanStrings(null)).toEqual([]);
  });
  it('경험 역할: 팀원 역할 우선, 직접 적은 값은 표준 역할명일 때만 인정', () => {
    expect(resolveExperienceRole('BE', 'FE')).toBe('BE');
    expect(resolveExperienceRole(null, ' PM ')).toBe('PM');
    expect(resolveExperienceRole(null, 'AI/Data')).toBe('AI');
    expect(resolveExperienceRole(null, '백엔드 개발')).toBeNull();
    expect(resolveExperienceRole(null, null)).toBeNull();
  });
  it('UUID 형식 검사', () => {
    expect(isUuid(REC)).toBe(true);
    expect(isUuid('abc')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe('RecommendationService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('UUID가 아니면 400', async () => {
    const s = new RecommendationService(makeRepo());
    await expect(s.getRecommendations(AUTHOR, 'x', ROLE)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('모집글이 없으면 404, 작성자가 아니면 403, 마감이면 409', async () => {
    await expect(new RecommendationService(makeRepo({ findRecruitment: jest.fn().mockResolvedValue(null) })).getRecommendations(AUTHOR, REC, ROLE)).rejects.toBeInstanceOf(NotFoundError);
    await expect(new RecommendationService(makeRepo()).getRecommendations(U1, REC, ROLE)).rejects.toBeInstanceOf(ForbiddenError);
    const closed = makeRepo({ findRecruitment: jest.fn().mockResolvedValue({ id: REC, author_id: AUTHOR, status: 'CLOSED' }) });
    await expect(new RecommendationService(closed).getRecommendations(AUTHOR, REC, ROLE)).rejects.toBeInstanceOf(ConflictError);
  });

  it('모집 역할이 없으면 404', async () => {
    const s = new RecommendationService(makeRepo({ findTargetRole: jest.fn().mockResolvedValue(null) }));
    await expect(s.getRecommendations(AUTHOR, REC, ROLE)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('후보가 없으면 AI 서버를 호출하지 않고 빈 결과', async () => {
    const f = jest.spyOn(global, 'fetch');
    const s = new RecommendationService(makeRepo({ findCandidates: jest.fn().mockResolvedValue([]) }));
    const r = await s.getRecommendations(AUTHOR, REC, ROLE);
    expect(r.candidates).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it('AI 요청 본문을 계약대로 만들고 응답에 이름·소개를 붙인다', async () => {
    const f = mockFetch(200, aiOk);
    const s = new RecommendationService(makeRepo());
    const r = await s.getRecommendations(AUTHOR, REC, ROLE);

    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/recommendations$/);
    const sent = JSON.parse(init.body as string);
    expect(sent.target_role).toEqual({ role_id: ROLE, role_name: 'AI', required_skills: ['Python'], preferred_skills: ['Docker'] });
    expect(sent.excluded_user_ids).toEqual([AUTHOR]);
    const c = sent.candidates[0];
    expect(c.desired_roles).toEqual(['AI']); // AI/Data와 AI가 합쳐짐
    expect(c.skills).toEqual(['Python']); // 공백 항목 제거
    expect(c).not.toHaveProperty('name'); // 이름은 AI로 보내지 않음
    expect(c.project_experiences).toHaveLength(1); // 이름 없는 경험 제외
    expect(c.project_experiences[0]).toMatchObject({ name: '프로젝트', role: 'AI' });

    expect(r.contextId).toBe('rec_1');
    expect(r.candidates).toHaveLength(1); // 목록에 없는 user_id는 버림
    expect(r.candidates[0]).toMatchObject({ userId: U1, name: '홍길동', roleName: 'AI/Data', rank: 1 });
  });

  it('AI 서버 연결 실패·5xx는 503', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(new RecommendationService(makeRepo()).getRecommendations(AUTHOR, REC, ROLE)).rejects.toBeInstanceOf(ServiceUnavailableError);
    jest.restoreAllMocks();
    mockFetch(503, { detail: 'Embedding cache miss' });
    await expect(new RecommendationService(makeRepo()).getRecommendations(AUTHOR, REC, ROLE)).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('AI 422와 잘못된 응답 형식은 500(내부 오류)', async () => {
    mockFetch(422, { detail: 'bad' });
    await expect(new RecommendationService(makeRepo()).getRecommendations(AUTHOR, REC, ROLE)).rejects.toBeInstanceOf(InternalError);
    jest.restoreAllMocks();
    mockFetch(200, { foo: 1 });
    await expect(new RecommendationService(makeRepo()).getRecommendations(AUTHOR, REC, ROLE)).rejects.toBeInstanceOf(InternalError);
  });
});
