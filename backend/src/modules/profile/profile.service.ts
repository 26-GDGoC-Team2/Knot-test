// 프로필 비즈니스 로직: 등록/수정(REQ-004~005), 프로젝트 경험(REQ-006~008), 부원 검색(REQ-010)
import { Injectable, Logger } from '@nestjs/common';
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError, ForbiddenError } from '../../common/app.exception';
import { isRealDate } from '../../common/date-util';
import { DatabaseService, Queryable } from '../../common/database.service';
import { PageResponse } from '../../common/pagination';
import { PROFILE_LIMITS } from './profile.constants';
import type {
  ExperienceResponse,
  ExperienceVisibilityDto,
  ImportExperienceDto,
  MemberListItem,
  MemberSearchQuery,
  ProfileOptions,
  ProfileResponse,
  SaveExperienceDto,
  SaveProfileDto,
} from './profile.dto';
import { ProfileRepository, ProfileRow } from './profile.repository';

// 직접 입력 기술의 중복 판별용 이름: 공백 제거 + 소문자 (DB의 name_norm 규칙과 동일)
function normalizeSkill(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase();
}

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly repo: ProfileRepository,
  ) {}

  // 프로필 입력 화면용 선택 목록
  getOptions(): Promise<ProfileOptions> {
    return this.repo.listOptions();
  }

  // 프로필 등록/수정. 전체 교체 방식이며 모든 변경이 하나의 트랜잭션이다.
  async saveMyProfile(userId: string, dto: SaveProfileDto): Promise<ProfileResponse> {
    // 트랜잭션 전에 끝낼 수 있는 입력 검증
    if (dto.skillIds.length + dto.customSkills.length === 0) {
      throw new BadRequestError('기술 스택을 1개 이상 선택하거나 입력해 주세요');
    }
    if (dto.availableFrom != null && !isRealDate(dto.availableFrom)) {
      throw new BadRequestError('참여 가능 시작일이 올바른 날짜가 아니에요');
    }

    await this.database.transaction(async (tx) => {
      // 같은 회원의 동시 수정을 직렬화하고, 탈퇴 회원은 거부
      if (!(await this.repo.lockActiveUser(userId, tx))) throw new UnauthorizedError();

      await this.assertAllExist('roles', dto.roleIds, '존재하지 않는 희망 역할이 있어요', tx);
      await this.assertAllExist('skills', dto.skillIds, '존재하지 않는 기술이 있어요', tx);
      await this.assertAllExist('interest_areas', dto.interestIds, '존재하지 않는 관심 분야가 있어요', tx);

      // 직접 입력 기술: 정규화 이름이 같으면 기존 항목을 재사용하고 입력 내 중복도 합친다
      const skillIds = new Set(dto.skillIds);
      const seenNorm = new Set<string>();
      for (const raw of dto.customSkills) {
        const name = raw.replace(/\s+/g, ' ').trim();
        const norm = normalizeSkill(name);
        if (norm === '' || seenNorm.has(norm)) continue;
        seenNorm.add(norm);
        skillIds.add(await this.repo.upsertCustomSkill(name, norm, tx));
      }
      const finalSkillIds = [...skillIds];
      if (finalSkillIds.length === 0) throw new BadRequestError('기술 스택을 1개 이상 선택하거나 입력해 주세요');
      // 초과 시 예외로 롤백되므로 방금 만든 직접 입력 기술도 함께 취소된다
      if ((await this.repo.countCustomSkills(finalSkillIds, tx)) > PROFILE_LIMITS.MAX_CUSTOM_SKILLS) {
        throw new BadRequestError(`직접 입력한 기술은 최대 ${PROFILE_LIMITS.MAX_CUSTOM_SKILLS}개까지 가능해요`);
      }

      await this.repo.updateUserName(userId, dto.name, tx);
      await this.repo.upsertProfile(
        userId,
        {
          bio: dto.bio ?? null,
          githubUrl: dto.githubUrl ?? null,
          available: dto.available,
          availableFrom: dto.availableFrom ?? null,
        },
        tx,
      );
      await this.repo.replaceRoles(userId, dto.roleIds, tx);
      await this.repo.replaceSkills(userId, finalSkillIds, tx);
      await this.repo.replaceInterests(userId, dto.interestIds, tx);
    });

    this.logger.log(`프로필 저장 (user=${userId})`);
    return this.getProfile(userId, userId);
  }

  // 프로필 조회. 본인이면 전체 프로젝트, 타인이면 공개로 설정한 프로젝트 전부 (개수 제한 없음)
  async getProfile(viewerId: string, targetId: string): Promise<ProfileResponse> {
    const profile = await this.repo.findProfile(targetId);
    if (!profile || profile.status !== 'ACTIVE') throw new NotFoundError('프로필을 찾을 수 없어요');

    const isMine = viewerId === targetId;
    const experiences = await this.repo.listExperiences(targetId, !isMine);
    return this.toProfileResponse(profile, experiences, isMine);
  }

  // 프로젝트 경험 등록 (직접 입력 프로젝트만)
  async createExperience(userId: string, dto: SaveExperienceDto): Promise<ExperienceResponse> {
    this.assertExperiencePeriod(dto);
    const id = await this.database.transaction(async (tx) => {
      if (!(await this.repo.lockActiveUser(userId, tx))) throw new UnauthorizedError();
      if ((await this.repo.countExperiences(userId, tx)) >= PROFILE_LIMITS.MAX_EXPERIENCES) {
        throw new BadRequestError(`프로젝트는 최대 ${PROFILE_LIMITS.MAX_EXPERIENCES}개까지 등록할 수 있어요`);
      }
      await this.assertAllExist('skills', dto.skillIds, '존재하지 않는 기술이 있어요', tx);
      const newId = await this.repo.insertPersonalExperience(userId, this.toExperienceValues(dto), tx);
      await this.repo.replaceExperienceSkills(newId, dto.skillIds, tx);
      return newId;
    });
    return this.loadExperience(id, userId);
  }

  // 프로젝트 경험 수정. 본인 경험이면 종류(본인 입력/동아리 프로젝트/동아리원 팀)와 상관없이 수정할 수 있다
  async updateExperience(userId: string, id: string, dto: SaveExperienceDto): Promise<ExperienceResponse> {
    this.assertExperiencePeriod(dto);
    await this.database.transaction(async (tx) => {
      if (!(await this.repo.lockActiveUser(userId, tx))) throw new UnauthorizedError();
      if (!(await this.repo.lockExperience(id, userId, tx))) throw new NotFoundError('프로젝트를 찾을 수 없어요');
      await this.assertAllExist('skills', dto.skillIds, '존재하지 않는 기술이 있어요', tx);
      await this.repo.updateExperience(id, this.toExperienceValues(dto), tx);
      await this.repo.replaceExperienceSkills(id, dto.skillIds, tx);
    });
    return this.loadExperience(id, userId);
  }

  // 아카이브 프로젝트를 내 경험으로 복사 (원본 아카이브는 바뀌지 않는다)
  // 참여 부원만 가능하고, 같은 아카이브는 한 번만 가져올 수 있다
  async importExperience(userId: string, dto: ImportExperienceDto): Promise<ExperienceResponse> {
    const id = await this.database.transaction(async (tx) => {
      if (!(await this.repo.lockActiveUser(userId, tx))) throw new UnauthorizedError();

      const src = await this.repo.findArchiveForImport(dto.archiveId, userId, tx);
      if (!src) throw new NotFoundError('아카이브를 찾을 수 없어요');
      if (!src.isMember) throw new ForbiddenError('이 프로젝트의 참여 부원만 가져올 수 있어요');
      if ((await this.repo.countExperiences(userId, tx)) >= PROFILE_LIMITS.MAX_EXPERIENCES) {
        throw new BadRequestError(`프로젝트는 최대 ${PROFILE_LIMITS.MAX_EXPERIENCES}개까지 등록할 수 있어요`);
      }

      // 중복(사용자+아카이브)이면 INSERT 가 비어 돌아온다
      const newId = await this.repo.insertImportedExperience(userId, src, tx);
      if (!newId) throw new ConflictError('이미 가져온 프로젝트예요');

      // 기술은 기본 목록에 있는 것만 복사한다 (이름 정규화는 직접 입력 기술과 같은 규칙)
      const norms = [...new Set((src.techStacks ?? []).map(normalizeSkill).filter((n) => n !== ''))];
      await this.repo.replaceExperienceSkills(newId, await this.repo.findSkillIdsByNorm(norms, tx), tx);
      return newId;
    });
    this.logger.log(`아카이브 경험 가져오기 (user=${userId}, archive=${dto.archiveId})`);
    return this.loadExperience(id, userId);
  }

  // 공개 여부만 변경. 동아리/팀 프로젝트를 포함해 모든 종류에 허용
  async setExperienceVisibility(userId: string, id: string, dto: ExperienceVisibilityDto): Promise<ExperienceResponse> {
    await this.database.transaction(async (tx) => {
      if (!(await this.repo.lockActiveUser(userId, tx))) throw new UnauthorizedError();
      if (!(await this.repo.lockExperience(id, userId, tx))) throw new NotFoundError('프로젝트를 찾을 수 없어요');
      await this.repo.setExperienceVisibility(id, dto.isPublic, tx);
    });
    return this.loadExperience(id, userId);
  }

  // 프로젝트 경험 삭제. 본인 경험이면 종류와 상관없이 삭제할 수 있다
  async deleteExperience(userId: string, id: string): Promise<void> {
    await this.database.transaction(async (tx) => {
      if (!(await this.repo.lockActiveUser(userId, tx))) throw new UnauthorizedError();
      const exp = await this.repo.lockExperience(id, userId, tx);
      if (!exp) throw new NotFoundError('프로젝트를 찾을 수 없어요');
      // 동아리원 팀 경험은 삭제 기록을 남겨, 모집글 마감이 다시 처리돼도 되살아나지 않게 한다
      if (exp.type === 'MATCHED' && exp.recruitmentId) {
        await this.repo.recordDeletedMatched(userId, exp.recruitmentId, tx);
      }
      await this.repo.deleteExperience(id, tx);
    });
  }

  // 부원 목록 검색 (REQ-010)
  async searchMembers(query: MemberSearchQuery): Promise<PageResponse<MemberListItem>> {
    const sort = query.resolveSort(
      { name: 'u.name', updatedAt: 'p.updated_at', availableFrom: 'p.available_from' },
      { column: 'p.updated_at', direction: 'desc' },
    );
    const keyword = query.q?.trim();
    const { items, total } = await this.repo.searchMembers(
      {
        q: keyword ? keyword : undefined,
        roleIds: query.roleIds,
        skillIds: query.skillIds,
        interestIds: query.interestIds,
        available: query.available,
      },
      { limit: query.limit, offset: query.offset },
      sort,
    );
    return PageResponse.of(items, total, query);
  }

  // ===== 내부 헬퍼 =====

  // 전달된 id가 모두 실제로 존재하는지 확인 (중복 id는 DTO에서 이미 막음)
  private async assertAllExist(
    table: 'roles' | 'skills' | 'interest_areas',
    ids: number[],
    message: string,
    db: Queryable,
  ): Promise<void> {
    if (ids.length === 0) return;
    const found = await this.repo.findExistingIds(table, ids, db);
    if (found.length !== new Set(ids).size) throw new BadRequestError(message);
  }

  private assertExperiencePeriod(dto: SaveExperienceDto): void {
    for (const d of [dto.startedOn, dto.endedOn]) {
      if (d != null && !isRealDate(d)) throw new BadRequestError('프로젝트 기간이 올바른 날짜가 아니에요');
    }
    // 'YYYY-MM-DD' 문자열은 사전순 비교가 날짜순과 같다
    if (dto.startedOn && dto.endedOn && dto.endedOn < dto.startedOn) {
      throw new BadRequestError('종료일은 시작일 이후여야 해요');
    }
  }

  private toExperienceValues(dto: SaveExperienceDto) {
    return {
      name: dto.name,
      startedOn: dto.startedOn ?? null,
      endedOn: dto.endedOn ?? null,
      roleDesc: dto.roleDesc ?? null,
      description: dto.description ?? null,
      link: dto.link ?? null,
      isPublic: dto.isPublic,
    };
  }

  private async loadExperience(id: string, userId: string): Promise<ExperienceResponse> {
    const exp = await this.repo.findExperience(id, userId);
    if (!exp) throw new NotFoundError('프로젝트를 찾을 수 없어요');
    return exp;
  }

  private toProfileResponse(p: ProfileRow, experiences: ExperienceResponse[], isMine: boolean): ProfileResponse {
    return {
      userId: p.userId,
      name: p.name,
      bio: p.bio,
      githubUrl: p.githubUrl,
      available: p.available,
      availableFrom: p.availableFrom,
      roles: p.roles,
      skills: p.skills,
      interests: p.interests,
      experiences,
      graduationCohort: p.graduationCohort ?? null,
      isMine,
      updatedAt: p.updatedAt,
    };
  }
}
