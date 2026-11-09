import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ApplicationListQuery,
  ApplyDto,
  CreateRecruitmentDto,
  ProposeDto,
  RecruitmentListQuery,
} from './recruitment.dto';

const errorsOf = (cls: new () => object, plain: object) => validateSync(plainToInstance(cls, plain) as object);
const fields = (errs: { property: string }[]) => errs.map((e) => e.property).sort();

const validCreate = {
  title: '팀원 구해요',
  description: '같이 해요',
  startDate: '2026-12-01',
  endDate: '2026-12-31',
  openChatUrl: 'https://open.kakao.com/o/abc',
  teamChatUrl: 'https://open.kakao.com/o/team',
  roles: [{ roleId: 1, capacity: 2 }],
  authorRoleId: 1,
};

describe('CreateRecruitmentDto', () => {
  it('필수값을 모두 보내면 통과하고 선택 목록은 빈 배열', () => {
    expect(errorsOf(CreateRecruitmentDto, validCreate)).toHaveLength(0);
    const dto = plainToInstance(CreateRecruitmentDto, validCreate);
    expect(dto.requiredSkillIds).toEqual([]);
    expect(dto.preferredSkillIds).toEqual([]);
    expect(dto.interestIds).toEqual([]);
  });

  it('필수값이 빠지면 오류', () => {
    expect(fields(errorsOf(CreateRecruitmentDto, {}))).toEqual([
      'authorRoleId', 'description', 'endDate', 'openChatUrl', 'roles', 'startDate', 'teamChatUrl', 'title',
    ]);
  });

  it('역할이 비어 있거나 정원이 0/소수/너무 크면 거부 (중첩 검증)', () => {
    expect(fields(errorsOf(CreateRecruitmentDto, { ...validCreate, roles: [] }))).toEqual(['roles']);
    expect(fields(errorsOf(CreateRecruitmentDto, { ...validCreate, roles: [{ roleId: 1, capacity: 0 }] }))).toEqual(['roles']);
    expect(fields(errorsOf(CreateRecruitmentDto, { ...validCreate, roles: [{ roleId: 1, capacity: 1.5 }] }))).toEqual(['roles']);
    expect(fields(errorsOf(CreateRecruitmentDto, { ...validCreate, roles: [{ roleId: 1, capacity: 999 }] }))).toEqual(['roles']);
  });

  it('오픈채팅 링크는 https 만 허용', () => {
    expect(fields(errorsOf(CreateRecruitmentDto, { ...validCreate, openChatUrl: 'http://open.kakao.com/o/a' }))).toEqual(['openChatUrl']);
    expect(fields(errorsOf(CreateRecruitmentDto, { ...validCreate, openChatUrl: 'javascript:alert(1)' }))).toEqual(['openChatUrl']);
  });

  it('제목/내용 공백만 입력하면 거부, 앞뒤 공백은 제거', () => {
    expect(fields(errorsOf(CreateRecruitmentDto, { ...validCreate, title: '   ' }))).toEqual(['title']);
    expect(plainToInstance(CreateRecruitmentDto, { ...validCreate, title: '  제목  ' }).title).toBe('제목');
  });

  it('날짜 형식 검사', () => {
    expect(fields(errorsOf(CreateRecruitmentDto, { ...validCreate, startDate: '2026/12/01' }))).toEqual(['startDate']);
  });
});

describe('ApplyDto / ProposeDto 한 줄 메시지 50자 제한', () => {
  it('50자는 통과, 51자는 거부', () => {
    expect(errorsOf(ApplyDto, { roleId: 1, message: 'a'.repeat(50) })).toHaveLength(0);
    expect(fields(errorsOf(ApplyDto, { roleId: 1, message: 'a'.repeat(51) }))).toEqual(['message']);
  });

  it('한글도 글자 수 기준 50자', () => {
    expect(errorsOf(ApplyDto, { roleId: 1, message: '가'.repeat(50) })).toHaveLength(0);
    expect(fields(errorsOf(ApplyDto, { roleId: 1, message: '가'.repeat(51) }))).toEqual(['message']);
  });

  it('메시지는 선택, 공백만 있으면 null 로 취급', () => {
    expect(errorsOf(ApplyDto, { roleId: 1 })).toHaveLength(0);
    expect(plainToInstance(ApplyDto, { roleId: 1, message: '   ' }).message).toBeNull();
  });

  it('역할 id 필수, 제안은 대상 UUID 필수', () => {
    expect(fields(errorsOf(ApplyDto, {}))).toEqual(['roleId']);
    expect(fields(errorsOf(ProposeDto, { roleId: 1 }))).toEqual(['targetUserId']);
    expect(fields(errorsOf(ProposeDto, { roleId: 1, targetUserId: 'abc' }))).toEqual(['targetUserId']);
    expect(errorsOf(ProposeDto, { roleId: 1, targetUserId: '0fbac07c-7e7d-4d1d-9bb3-94946467c2da', message: '함께해요' })).toHaveLength(0);
  });
});

describe('목록 쿼리', () => {
  it('RecruitmentListQuery: status/ids/mine 변환', () => {
    const q = plainToInstance(RecruitmentListQuery, { status: 'OPEN', roleIds: '1,2', mine: 'true' });
    expect(validateSync(q)).toHaveLength(0);
    expect(q.roleIds).toEqual([1, 2]);
    expect(q.mine).toBe(true);
    expect(fields(errorsOf(RecruitmentListQuery, { status: 'ALL' }))).toEqual(['status']);
    expect(fields(errorsOf(RecruitmentListQuery, { mine: 'yes' }))).toEqual(['mine']);
  });

  it('ApplicationListQuery: box 필수', () => {
    expect(fields(errorsOf(ApplicationListQuery, {}))).toEqual(['box']);
    expect(errorsOf(ApplicationListQuery, { box: 'sent', status: 'PENDING' })).toHaveLength(0);
    expect(fields(errorsOf(ApplicationListQuery, { box: 'all' }))).toEqual(['box']);
  });
});
