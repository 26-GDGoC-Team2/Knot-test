import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MemberSearchQuery, SaveExperienceDto, SaveProfileDto } from './profile.dto';

const errorsOf = (cls: new () => object, plain: object) => validateSync(plainToInstance(cls, plain) as object);
const fields = (errs: { property: string }[]) => errs.map((e) => e.property).sort();

const validProfile = {
  name: '홍길동',
  roleIds: [1],
  skillIds: [1],
  interestIds: [1],
  available: true,
};

describe('SaveProfileDto', () => {
  it('필수값을 모두 보내면 통과', () => {
    expect(errorsOf(SaveProfileDto, validProfile)).toHaveLength(0);
  });

  it('필수값이 빠지면 해당 필드가 오류', () => {
    expect(fields(errorsOf(SaveProfileDto, {}))).toEqual(['available', 'interestIds', 'name', 'roleIds']);
  });

  it('공백뿐인 실명, 빈 역할/관심 분야는 거부', () => {
    const errs = errorsOf(SaveProfileDto, { ...validProfile, name: '   ', roleIds: [], interestIds: [] });
    expect(fields(errs)).toEqual(['interestIds', 'name', 'roleIds']);
  });

  it('available 이 문자열이면 거부', () => {
    expect(fields(errorsOf(SaveProfileDto, { ...validProfile, available: 'true' }))).toEqual(['available']);
  });

  it('직접 입력 기술은 6개 이상, 31자 이상, 제어문자 포함 시 거부', () => {
    expect(fields(errorsOf(SaveProfileDto, { ...validProfile, customSkills: ['a', 'b', 'c', 'd', 'e', 'f'] }))).toEqual(['customSkills']);
    expect(fields(errorsOf(SaveProfileDto, { ...validProfile, customSkills: ['x'.repeat(31)] }))).toEqual(['customSkills']);
    expect(fields(errorsOf(SaveProfileDto, { ...validProfile, customSkills: ['a\u0000b'] }))).toEqual(['customSkills']);
  });

  it('직접 입력 기술은 앞뒤 공백을 제거하고 공백뿐이면 거부', () => {
    const ok = plainToInstance(SaveProfileDto, { ...validProfile, customSkills: ['  Rust  '] });
    expect(ok.customSkills).toEqual(['Rust']);
    expect(fields(errorsOf(SaveProfileDto, { ...validProfile, customSkills: ['   '] }))).toEqual(['customSkills']);
  });

  it('중복/비정수 id 거부', () => {
    expect(fields(errorsOf(SaveProfileDto, { ...validProfile, roleIds: [1, 1] }))).toEqual(['roleIds']);
    expect(fields(errorsOf(SaveProfileDto, { ...validProfile, skillIds: ['a'] }))).toEqual(['skillIds']);
  });

  it('GitHub 주소는 https://github.com/ 만 허용, null/빈 문자열은 지우기', () => {
    expect(errorsOf(SaveProfileDto, { ...validProfile, githubUrl: 'https://github.com/user' })).toHaveLength(0);
    expect(fields(errorsOf(SaveProfileDto, { ...validProfile, githubUrl: 'http://github.com/user' }))).toEqual(['githubUrl']);
    expect(fields(errorsOf(SaveProfileDto, { ...validProfile, githubUrl: 'https://evil.com/user' }))).toEqual(['githubUrl']);
    expect(plainToInstance(SaveProfileDto, { ...validProfile, githubUrl: '  ' }).githubUrl).toBeNull();
    expect(errorsOf(SaveProfileDto, { ...validProfile, githubUrl: null })).toHaveLength(0);
  });

  it('날짜 형식 검사', () => {
    expect(fields(errorsOf(SaveProfileDto, { ...validProfile, availableFrom: '2025/01/01' }))).toEqual(['availableFrom']);
    expect(errorsOf(SaveProfileDto, { ...validProfile, availableFrom: '2025-01-01' })).toHaveLength(0);
  });
});

describe('SaveExperienceDto', () => {
  const base = { name: '프로젝트', isPublic: true };

  it('최소 입력 통과, skillIds 기본값은 빈 배열', () => {
    expect(errorsOf(SaveExperienceDto, base)).toHaveLength(0);
    expect(plainToInstance(SaveExperienceDto, base).skillIds).toEqual([]);
  });

  it('이름/공개 여부 필수', () => {
    expect(fields(errorsOf(SaveExperienceDto, {}))).toEqual(['isPublic', 'name']);
  });

  it('링크는 https 만 허용', () => {
    expect(errorsOf(SaveExperienceDto, { ...base, link: 'https://example.com/a' })).toHaveLength(0);
    expect(fields(errorsOf(SaveExperienceDto, { ...base, link: 'http://example.com' }))).toEqual(['link']);
    expect(fields(errorsOf(SaveExperienceDto, { ...base, link: 'javascript:alert(1)' }))).toEqual(['link']);
  });
});

describe('MemberSearchQuery', () => {
  it('아무 조건이 없어도 통과하고 페이지 기본값 유지', () => {
    const q = plainToInstance(MemberSearchQuery, {});
    expect(validateSync(q)).toHaveLength(0);
    expect(q.page).toBe(1);
    expect(q.size).toBe(20);
  });

  it('쉼표 구분과 반복 파라미터를 숫자 배열로 변환', () => {
    const q = plainToInstance(MemberSearchQuery, { roleIds: '1,2', skillIds: ['3', '4'], interestIds: '5' });
    expect(q.roleIds).toEqual([1, 2]);
    expect(q.skillIds).toEqual([3, 4]);
    expect(q.interestIds).toEqual([5]);
    expect(validateSync(q)).toHaveLength(0);
  });

  it('숫자가 아닌 id 는 거부', () => {
    expect(fields(validateSync(plainToInstance(MemberSearchQuery, { roleIds: 'a' })))).toEqual(['roleIds']);
  });

  it('available 은 true/false 문자열만 허용', () => {
    expect(plainToInstance(MemberSearchQuery, { available: 'true' }).available).toBe(true);
    expect(plainToInstance(MemberSearchQuery, { available: 'false' }).available).toBe(false);
    expect(fields(validateSync(plainToInstance(MemberSearchQuery, { available: 'yes' })))).toEqual(['available']);
  });
});
