// 프로필 요청 DTO(검증)와 응답 타입. 요청과 응답은 분리한다.
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { toBoolean, toIntArray, trim, trimEach, trimToNull } from '../../common/dto-transforms';
import { PageRequest } from '../../common/pagination';
import { PROFILE_LIMITS as L } from './profile.constants';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const NO_CONTROL_CHARS = /^[^\p{Cc}]+$/u;
const GITHUB_URL = /^https:\/\/(www\.)?github\.com\/[\w.-]+(\/[\w.-]*)*\/?$/i;

// ===== 요청 DTO =====

// 프로필 등록/수정 (전체 교체 방식: 보낸 값이 최종 상태가 된다)
export class SaveProfileDto {
  @trim()
  @IsString()
  @IsNotEmpty({ message: '실명을 입력해 주세요' })
  @MaxLength(L.NAME_MAX)
  name!: string;

  @IsArray()
  @ArrayMinSize(1, { message: '희망 역할을 1개 이상 선택해 주세요' })
  @ArrayMaxSize(L.MAX_ROLE_IDS)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  roleIds!: number[];

  // 선택 목록의 기술. 직접 입력(customSkills)과 합쳐 1개 이상이어야 한다(서비스에서 검사)
  @IsArray()
  @ArrayMaxSize(L.MAX_SKILL_IDS)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  skillIds: number[] = [];

  // 선택 목록에 없는 기술을 직접 입력
  @trimEach()
  @IsArray()
  @ArrayMaxSize(L.MAX_CUSTOM_SKILLS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(L.CUSTOM_SKILL_MAX_LEN, { each: true })
  @Matches(NO_CONTROL_CHARS, { each: true, message: '기술 이름에 사용할 수 없는 문자가 있어요' })
  customSkills: string[] = [];

  @IsArray()
  @ArrayMinSize(1, { message: '관심 분야를 1개 이상 선택해 주세요' })
  @ArrayMaxSize(L.MAX_INTEREST_IDS)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  interestIds!: number[];

  @IsBoolean({ message: '참여 가능 여부를 선택해 주세요' })
  available!: boolean;

  // 참여 가능 시작일 (YYYY-MM-DD)
  @IsOptional()
  @Matches(DATE_ONLY, { message: '날짜는 YYYY-MM-DD 형식이어야 해요' })
  availableFrom?: string | null;

  @trimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(L.BIO_MAX)
  bio?: string | null;

  @trimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(L.GITHUB_URL_MAX)
  @Matches(GITHUB_URL, { message: 'GitHub 주소(https://github.com/...)만 입력할 수 있어요' })
  githubUrl?: string | null;
}

// 프로젝트 경험 등록/수정 (직접 입력 프로젝트만)
export class SaveExperienceDto {
  @trim()
  @IsString()
  @IsNotEmpty({ message: '프로젝트 이름을 입력해 주세요' })
  @MaxLength(L.EXPERIENCE_NAME_MAX)
  name!: string;

  @IsOptional()
  @Matches(DATE_ONLY, { message: '날짜는 YYYY-MM-DD 형식이어야 해요' })
  startedOn?: string | null;

  @IsOptional()
  @Matches(DATE_ONLY, { message: '날짜는 YYYY-MM-DD 형식이어야 해요' })
  endedOn?: string | null;

  @trimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(L.EXPERIENCE_ROLE_DESC_MAX)
  roleDesc?: string | null;

  @trimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(L.EXPERIENCE_DESC_MAX)
  description?: string | null;

  @trimToNull()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'https 링크만 입력할 수 있어요' })
  @MaxLength(L.EXPERIENCE_LINK_MAX)
  link?: string | null;

  @IsBoolean({ message: '공개 여부를 선택해 주세요' })
  isPublic!: boolean;

  @IsArray()
  @ArrayMaxSize(L.MAX_EXPERIENCE_SKILLS)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  skillIds: number[] = [];
}

// 공개 여부만 변경 (동아리/팀 프로젝트 포함 모든 종류 가능)
export class ExperienceVisibilityDto {
  @IsBoolean({ message: '공개 여부를 선택해 주세요' })
  isPublic!: boolean;
}

// 부원 목록 검색. 같은 분류 안은 OR, 분류끼리는 AND
export class MemberSearchQuery extends PageRequest {
  @trim()
  @IsOptional()
  @IsString()
  @MaxLength(L.SEARCH_KEYWORD_MAX)
  q?: string;

  @toIntArray()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.MAX_ROLE_IDS)
  @IsInt({ each: true })
  roleIds?: number[];

  @toIntArray()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.MAX_SKILL_IDS)
  @IsInt({ each: true })
  skillIds?: number[];

  @toIntArray()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.MAX_INTEREST_IDS)
  @IsInt({ each: true })
  interestIds?: number[];

  @toBoolean()
  @IsOptional()
  @IsBoolean()
  available?: boolean;
}

// ===== 응답 타입 =====
export interface IdName {
  id: number;
  name: string;
}
export interface SkillItem extends IdName {
  isCustom: boolean;
}

export interface ExperienceResponse {
  id: string;
  name: string;
  type: 'OFFICIAL' | 'MATCHED' | 'PERSONAL';
  startedOn: string | null;
  endedOn: string | null;
  roleDesc: string | null;
  description: string | null;
  link: string | null;
  isPublic: boolean;
  skills: SkillItem[];
}

export interface ProfileResponse {
  userId: string;
  name: string;
  bio: string | null;
  githubUrl: string | null;
  available: boolean;
  availableFrom: string | null;
  roles: IdName[];
  skills: SkillItem[];
  interests: IdName[];
  experiences: ExperienceResponse[]; // 타인 조회 시 공개 프로젝트 최대 3개
  isMine: boolean;
  updatedAt: string;
}

// 목록용 요약 (프로젝트 경험은 포함하지 않는다)
export interface MemberListItem {
  userId: string;
  name: string;
  bio: string | null;
  available: boolean;
  availableFrom: string | null;
  roles: IdName[];
  skills: SkillItem[];
  interests: IdName[];
}

// 프로필 입력 화면의 선택 목록
export interface ProfileOptions {
  roles: IdName[];
  skills: SkillItem[]; // 기본 제공 기술만 (직접 입력 기술 제외)
  interests: IdName[];
}
