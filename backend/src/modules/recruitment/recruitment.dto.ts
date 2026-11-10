// 모집/지원 요청 DTO(검증)와 응답 타입. 요청과 응답은 분리한다.
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { toBoolean, toIntArray, trim, trimToNull } from '../../common/dto-transforms';
import { PageRequest } from '../../common/pagination';
import type { PublicUser } from '../users/user.dto';
import { APPLICATION_MESSAGE_MAX, RECRUITMENT_LIMITS as L } from './recruitment.constants';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// 지원 상태 목록 (REMOVED = 팀장이 내보냄, LEFT = 스스로 팀을 나감)
const APPLICATION_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELED', 'REMOVED', 'LEFT'] as const;

// ===== 요청 DTO =====

// 역할별 정원 (작성자를 포함한 인원)
export class RoleSlotDto {
  @IsInt()
  @Min(1)
  roleId!: number;

  @IsInt({ message: '모집 인원은 정수여야 해요' })
  @Min(1, { message: '모집 인원은 1명 이상이어야 해요' })
  @Max(L.CAPACITY_MAX)
  capacity!: number;

  // 역할별 필수/우대 기술 (선택). 하나라도 보내면 모집글 단위 기술 목록은 역할별 기술을 합쳐서 자동으로 채운다
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.MAX_SKILLS)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  requiredSkillIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.MAX_SKILLS)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  preferredSkillIds?: number[];
}

// 모집글 작성/수정 공통 입력
export class RecruitmentBodyDto {
  @trim()
  @IsString()
  @IsNotEmpty({ message: '제목을 입력해 주세요' })
  @MaxLength(L.TITLE_MAX)
  title!: string;

  @trim()
  @IsString()
  @IsNotEmpty({ message: '내용을 입력해 주세요' })
  @MaxLength(L.DESCRIPTION_MAX)
  description!: string;

  @Matches(DATE_ONLY, { message: '시작일은 YYYY-MM-DD 형식이어야 해요' })
  startDate!: string;

  @Matches(DATE_ONLY, { message: '종료일은 YYYY-MM-DD 형식이어야 해요' })
  endDate!: string;

  @trim()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: '오픈채팅 링크는 https 주소여야 해요' })
  @MaxLength(L.OPEN_CHAT_URL_MAX)
  openChatUrl!: string;

  // 확정 팀원 전용 팀 채팅방 링크 (문의용 openChatUrl 과 별도)
  @trim()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: '팀 채팅방 링크는 https 주소여야 해요' })
  @MaxLength(L.OPEN_CHAT_URL_MAX)
  teamChatUrl!: string;

  @IsArray()
  @ArrayMinSize(1, { message: '모집 역할을 1개 이상 설정해 주세요' })
  @ArrayMaxSize(L.MAX_ROLES)
  @ValidateNested({ each: true })
  @Type(() => RoleSlotDto)
  roles!: RoleSlotDto[];

  @IsArray()
  @ArrayMaxSize(L.MAX_SKILLS)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  requiredSkillIds: number[] = [];

  @IsArray()
  @ArrayMaxSize(L.MAX_SKILLS)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  preferredSkillIds: number[] = [];

  @IsArray()
  @ArrayMaxSize(L.MAX_INTERESTS)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  interestIds: number[] = [];
}

// 모집글 작성: 작성자가 맡을 역할을 함께 지정 (그 역할의 확정 인원 1명으로 시작)
export class CreateRecruitmentDto extends RecruitmentBodyDto {
  @IsInt({ message: '작성자가 맡을 역할을 선택해 주세요' })
  @Min(1)
  authorRoleId!: number;
}

// 모집글 수정: 작성자 역할은 바꿀 수 없다
export class UpdateRecruitmentDto extends RecruitmentBodyDto {}

// 지원/제안 공통: 한 줄 메시지는 최대 50자
export class ApplicationMessageDto {
  @IsInt()
  @Min(1)
  roleId!: number;

  @trimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(APPLICATION_MESSAGE_MAX, { message: `한 줄 메시지는 ${APPLICATION_MESSAGE_MAX}자 이내로 입력해 주세요` })
  message?: string | null;
}

export class ApplyDto extends ApplicationMessageDto {}

export class ProposeDto extends ApplicationMessageDto {
  @IsUUID()
  targetUserId!: string;
}

// 모집글 목록: status=OPEN(모집 중) / DONE(마감+완료). 같은 분류 안은 OR, 분류끼리 AND
export class RecruitmentListQuery extends PageRequest {
  @IsOptional()
  @IsIn(['OPEN', 'DONE'])
  status?: 'OPEN' | 'DONE';

  @trim()
  @IsOptional()
  @IsString()
  @MaxLength(L.SEARCH_KEYWORD_MAX)
  q?: string;

  @toIntArray()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.MAX_ROLES)
  @IsInt({ each: true })
  roleIds?: number[];

  @toIntArray()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.MAX_SKILLS)
  @IsInt({ each: true })
  skillIds?: number[];

  @toIntArray()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.MAX_INTERESTS)
  @IsInt({ each: true })
  interestIds?: number[];

  // true 면 내가 작성한 글만
  @toBoolean()
  @IsOptional()
  @IsBoolean()
  mine?: boolean;
}

// 내 지원/제안 목록: box=sent(내가 보낸 것) / received(내가 받은 것)
export class ApplicationListQuery extends PageRequest {
  @IsIn(['sent', 'received'], { message: 'box 는 sent 또는 received 여야 해요' })
  box!: 'sent' | 'received';

  @IsOptional()
  @IsIn(APPLICATION_STATUSES)
  status?: ApplicationStatus;
}

// 모집글의 지원/제안 목록(작성자/운영진용)
export class RecruitmentApplicationsQuery extends PageRequest {
  @IsOptional()
  @IsIn(APPLICATION_STATUSES)
  status?: ApplicationStatus;
}

// ===== 응답 타입 =====
export type RecruitmentStatus = 'OPEN' | 'CLOSED' | 'COMPLETED';
export type ApplicationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELED' | 'REMOVED' | 'LEFT';
export type ApplicationKind = 'APPLY' | 'PROPOSE';
// MANUAL = 받은 사람이 직접 거절, CLOSED = 마감/삭제/정원 마감으로 자동 정리 (화면에서는 '모집 마감')
export type RejectReason = 'MANUAL' | 'CLOSED';

export interface RoleSlotResponse {
  roleId: number;
  roleName: string;
  capacity: number; // 작성자 포함 정원
  confirmedCount: number; // 확정 인원 (작성자 포함)
  full: boolean;
  // 역할별 필수/우대 기술 (상세 조회에서만 채워짐. 역할별로 정하지 않았으면 빈 배열)
  requiredSkills?: SkillRef[];
  preferredSkills?: SkillRef[];
}

export interface SkillRef {
  id: number;
  name: string;
}

export interface RecruitmentListItem {
  id: string;
  title: string;
  status: RecruitmentStatus;
  startDate: string;
  endDate: string;
  author: PublicUser;
  roles: RoleSlotResponse[];
  totalCapacity: number;
  totalConfirmed: number;
  createdAt: string;
}

export interface RecruitmentMemberResponse {
  user: PublicUser;
  roleId: number;
  roleName: string;
  isLeader: boolean; // 팀장(모집글 작성자) 여부
}

export interface RecruitmentDetail {
  id: string;
  title: string;
  description: string;
  status: RecruitmentStatus;
  startDate: string;
  endDate: string;
  author: PublicUser;
  roles: RoleSlotResponse[];
  totalCapacity: number;
  totalConfirmed: number;
  requiredSkills: SkillRef[];
  preferredSkills: SkillRef[];
  interests: { id: number; name: string }[];
  members: RecruitmentMemberResponse[];
  authorRoleId: number | null; // 팀장이 맡은 역할
  openChatUrl: string; // 문의용 오픈채팅 (누구나 볼 수 있음)
  // 팀 채팅방 링크: 작성자/운영진은 항상, 확정 팀원은 모집이 마감(CLOSED)된 뒤에만
  teamChatUrl: string | null;
  canManage: boolean; // 현재 사용자가 수정/삭제/마감 가능한지
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationResponse {
  id: string;
  recruitmentId: string;
  recruitmentTitle: string;
  kind: ApplicationKind;
  status: ApplicationStatus;
  rejectReason: RejectReason | null; // status 가 REJECTED 일 때만 값이 있음
  roleId: number;
  roleName: string;
  message: string | null;
  sender: PublicUser;
  receiver: PublicUser;
  createdAt: string;
  respondedAt: string | null;
}

export interface AcceptResult {
  application: ApplicationResponse;
  recruitmentStatus: RecruitmentStatus; // 정원이 모두 차면 CLOSED
  roleFull: boolean;
}
