// 모집글 비즈니스 로직: 작성/수정/마감/삭제(REQ-009, 011~012), 조회, 정원 정산(자동 마감/일괄 거절)
// 알림(C4): B 담당 알림 서비스와 호출 방식이 합의되면, 각 트랜잭션 커밋 "이후"에 호출할 자리를 TODO(C4)로 표시했다.
import { Injectable, Logger } from '@nestjs/common';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../common/app.exception';
import { isRealDate, todayKst } from '../../common/date-util';
import { DatabaseService, Queryable } from '../../common/database.service';
import { PageResponse } from '../../common/pagination';
import { toPublicUser } from '../users/user.dto';
import { ApplicationRepository } from './application.repository';
import type {
  CreateRecruitmentDto,
  RecruitmentBodyDto,
  RecruitmentDetail,
  RecruitmentListItem,
  RecruitmentListQuery,
  RoleSlotResponse,
  UpdateRecruitmentDto,
} from './recruitment.dto';
import { RecruitmentRepository, RoleSlotRow, UserBrief } from './recruitment.repository';

// 마감 여부: 상태가 OPEN 이 아니거나, 종료일(한국 시간)이 지났으면 마감으로 본다
const isClosedNow = (status: string, endDate: string): boolean => status !== 'OPEN' || endDate < todayKst();

const toSlot = (r: { roleId: number; roleName: string; capacity: number; confirmedCount: number }): RoleSlotResponse => ({
  roleId: r.roleId,
  roleName: r.roleName,
  capacity: r.capacity,
  confirmedCount: r.confirmedCount,
  full: r.confirmedCount >= r.capacity,
});

export interface SettleResult {
  closed: boolean; // 모든 역할이 차서 모집글이 CLOSED 로 바뀌었는지
  fullRoleIds: number[];
}

@Injectable()
export class RecruitmentService {
  private readonly logger = new Logger(RecruitmentService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly repo: RecruitmentRepository,
    private readonly applications: ApplicationRepository,
  ) {}

  // ===== 작성 / 수정 / 마감 / 삭제 =====

  // 모집글 작성. 작성자는 선택한 역할의 확정 인원 1명으로 시작한다 (예: 4명 모집이면 1/4)
  async create(actorId: string, dto: CreateRecruitmentDto): Promise<RecruitmentDetail> {
    const id = await this.database.transaction(async (tx) => {
      await this.requireActiveActor(actorId, tx);
      await this.validateBody(dto, tx);

      if (!dto.roles.some((r) => r.roleId === dto.authorRoleId)) {
        throw new BadRequestError('작성자가 맡을 역할은 모집 역할 중에서 선택해야 해요');
      }
      // 작성자 1명만으로 정원이 모두 차는 모집글은 의미가 없다
      if (dto.roles.reduce((sum, r) => sum + r.capacity, 0) < 2) {
        throw new BadRequestError('작성자 외에 모집할 인원이 1명 이상 있어야 해요');
      }

      const newId = await this.repo.insert(actorId, this.toFields(dto), tx);
      await this.repo.insertRoles(newId, dto.roles, tx);
      // 작성자를 확정 팀원으로 등록하고 해당 역할 확정 인원을 1로 시작
      if (!(await this.repo.incrementConfirmed(newId, dto.authorRoleId, tx))) {
        throw new BadRequestError('작성자 역할의 정원이 올바르지 않아요');
      }
      await this.repo.addMember(newId, dto.authorRoleId, actorId, tx);
      await this.repo.replaceSkills(newId, dto.requiredSkillIds, dto.preferredSkillIds, tx);
      await this.repo.replaceInterests(newId, dto.interestIds, tx);
      return newId;
    });
    this.logger.log(`모집글 작성 (id=${id}, author=${actorId})`);
    return this.get(actorId, id);
  }

  // 모집글 수정. 작성자 또는 운영진, 모집 중(OPEN)일 때만 가능
  async update(actorId: string, id: string, dto: UpdateRecruitmentDto): Promise<RecruitmentDetail> {
    await this.database.transaction(async (tx) => {
      const actor = await this.requireActiveActor(actorId, tx);
      const rec = await this.repo.lockActive(id, 'UPDATE', tx);
      if (!rec) throw new NotFoundError('모집글을 찾을 수 없어요');
      this.assertCanManage(actor, rec.authorId);
      if (rec.status !== 'OPEN') throw new ConflictError('모집 중인 글만 수정할 수 있어요');
      await this.validateBody(dto, tx);

      const current = await this.repo.findRoles(id, true, tx);
      const byRole = new Map(current.map((r) => [r.roleId, r]));
      const nextIds = new Set(dto.roles.map((r) => r.roleId));

      // 쓰기 전에 규칙을 모두 검사한다 (확정 인원이 있는 역할은 삭제 불가, 정원은 확정 인원 미만으로 줄일 수 없음)
      for (const cur of current) {
        if (!nextIds.has(cur.roleId) && cur.confirmedCount > 0) {
          throw new BadRequestError(`'${cur.roleName}' 역할은 확정된 인원이 있어 삭제할 수 없어요`);
        }
      }
      for (const slot of dto.roles) {
        const cur = byRole.get(slot.roleId);
        if (cur && slot.capacity < cur.confirmedCount) {
          throw new BadRequestError(`'${cur.roleName}' 정원은 확정 인원(${cur.confirmedCount}명)보다 줄일 수 없어요`);
        }
      }

      // 삭제되는 역할: 대기 중인 지원/제안을 거절하고 역할 제거
      for (const cur of current) {
        if (!nextIds.has(cur.roleId)) {
          await this.applications.rejectPending(id, cur.roleId, tx);
          await this.repo.deleteRole(cur.id, tx);
        }
      }
      const added: { roleId: number; capacity: number }[] = [];
      for (const slot of dto.roles) {
        const cur = byRole.get(slot.roleId);
        if (!cur) added.push(slot);
        else if (cur.capacity !== slot.capacity) await this.repo.updateRoleCapacity(cur.id, slot.capacity, tx);
      }
      if (added.length > 0) await this.repo.insertRoles(id, added, tx);

      await this.repo.updateFields(id, this.toFields(dto), tx);
      await this.repo.replaceSkills(id, dto.requiredSkillIds, dto.preferredSkillIds, tx);
      await this.repo.replaceInterests(id, dto.interestIds, tx);
      // 정원을 줄여서 가득 찬 역할/모집글이 생길 수 있으므로 정산
      await this.settleCapacity(tx, id);
    });
    return this.get(actorId, id);
  }

  // 수동 마감: OPEN -> CLOSED, 대기 중인 지원/제안은 일괄 거절
  async close(actorId: string, id: string): Promise<RecruitmentDetail> {
    const rejected = await this.database.transaction(async (tx) => {
      const actor = await this.requireActiveActor(actorId, tx);
      const rec = await this.repo.lockActive(id, 'UPDATE', tx);
      if (!rec) throw new NotFoundError('모집글을 찾을 수 없어요');
      this.assertCanManage(actor, rec.authorId);
      if (rec.status !== 'OPEN') throw new ConflictError('이미 마감된 모집글이에요');
      await this.repo.setStatus(id, 'CLOSED', tx);
      return this.applications.rejectPending(id, null, tx);
    });
    this.logger.log(`모집글 마감 (id=${id}, 대기 건 거절 ${rejected}건)`);
    // TODO(C4): 커밋 후 거절된 지원/제안자에게 알림
    return this.get(actorId, id);
  }

  // 마감 후 팀원 내보내기: 팀장(작성자)만, 마감(CLOSED) 상태에서만 가능.
  // 역할 자리가 하나 비고 모집글은 다시 '모집 중'(OPEN)이 된다.
  async removeMember(actorId: string, id: string, targetUserId: string): Promise<RecruitmentDetail> {
    await this.database.transaction(async (tx) => {
      await this.requireActiveActor(actorId, tx);
      // 모집글 행 -> 역할 행 순서로 잠근다 (잠금 순서 규칙)
      const rec = await this.repo.lockActive(id, 'UPDATE', tx);
      if (!rec) throw new NotFoundError('모집글을 찾을 수 없어요');
      if (rec.authorId !== actorId) throw new ForbiddenError('팀장만 팀원을 내보낼 수 있어요');
      if (targetUserId === rec.authorId) throw new BadRequestError('팀장은 내보낼 수 없어요');
      if (!isClosedNow(rec.status, rec.endDate)) {
        throw new ConflictError('마감된 모집글에서만 팀원을 내보낼 수 있어요 (모집 중에는 수락 취소를 이용해 주세요)');
      }

      const roleId = await this.repo.findMemberRole(id, targetUserId, tx);
      if (roleId === null) throw new NotFoundError('팀원을 찾을 수 없어요');
      // 역할 행을 잠근 뒤 인원 감소 (확정 인원이 0 이하로 내려가는 비정상 상태 방지)
      await this.repo.findRoleLocked(id, roleId, tx);
      if (!(await this.repo.removeMember(id, targetUserId, tx))) throw new ConflictError('이미 처리된 요청이에요');
      if (!(await this.repo.decrementConfirmed(id, roleId, tx))) throw new ConflictError('팀원 정보가 올바르지 않아요');
      // 빠진 팀원의 수락 이력은 REMOVED(내보냄)로 남겨 다시 되돌릴 수 없게 한다
      await this.applications.endAccepted(id, targetUserId, 'REMOVED', tx);
      await this.repo.setStatus(id, 'OPEN', tx);
    });
    this.logger.log(`팀원 내보내기 (recruitment=${id})`);
    // TODO(C4): 커밋 후 내보낸 팀원에게 알림
    return this.get(actorId, id);
  }

  // 팀 나가기: 확정 팀원 본인이 스스로 나간다. 팀장은 불가(모집글 삭제를 이용), 모집 중/마감 상태 모두 가능.
  // 역할 자리가 하나 비고, 마감 상태였다면 모집글은 다시 '모집 중'(OPEN)이 된다.
  async leave(actorId: string, id: string): Promise<RecruitmentDetail> {
    await this.database.transaction(async (tx) => {
      await this.requireActiveActor(actorId, tx);
      // 모집글 행 -> 역할 행 순서로 잠근다 (잠금 순서 규칙)
      const rec = await this.repo.lockActive(id, 'UPDATE', tx);
      if (!rec) throw new NotFoundError('모집글을 찾을 수 없어요');
      if (rec.authorId === actorId) throw new BadRequestError('팀장은 팀을 나갈 수 없어요 (모집글 삭제를 이용해 주세요)');
      if (rec.status === 'COMPLETED') throw new ConflictError('완료된 모집글에서는 팀을 나갈 수 없어요');

      const roleId = await this.repo.findMemberRole(id, actorId, tx);
      if (roleId === null) throw new NotFoundError('참여 중인 팀원이 아니에요');
      // 역할 행을 잠근 뒤 인원 감소 (확정 인원이 0 이하로 내려가는 비정상 상태 방지)
      await this.repo.findRoleLocked(id, roleId, tx);
      if (!(await this.repo.removeMember(id, actorId, tx))) throw new ConflictError('이미 처리된 요청이에요');
      if (!(await this.repo.decrementConfirmed(id, roleId, tx))) throw new ConflictError('팀원 정보가 올바르지 않아요');
      await this.applications.endAccepted(id, actorId, 'LEFT', tx);
      // 마감된 글이면 자리가 비었으므로 다시 모집 중으로
      if (rec.status === 'CLOSED') await this.repo.setStatus(id, 'OPEN', tx);
    });
    this.logger.log(`팀 나가기 (recruitment=${id})`);
    // TODO(C4): 커밋 후 팀장에게 알림
    return this.get(actorId, id);
  }

  // 삭제(소프트 삭제): 어느 상태에서나 가능, 대기 중인 지원/제안은 일괄 거절
  async remove(actorId: string, id: string): Promise<void> {
    const rejected = await this.database.transaction(async (tx) => {
      const actor = await this.requireActiveActor(actorId, tx);
      const rec = await this.repo.lockActive(id, 'UPDATE', tx);
      if (!rec) throw new NotFoundError('모집글을 찾을 수 없어요');
      this.assertCanManage(actor, rec.authorId);
      await this.repo.softDelete(id, tx);
      return this.applications.rejectPending(id, null, tx);
    });
    this.logger.log(`모집글 삭제 (id=${id}, 대기 건 거절 ${rejected}건)`);
    // TODO(C4): 커밋 후 거절된 지원/제안자에게 알림
  }

  // ===== 조회 =====

  async get(viewerId: string, id: string): Promise<RecruitmentDetail> {
    const row = await this.repo.findDetailRow(id);
    if (!row) throw new NotFoundError('모집글을 찾을 수 없어요');
    const [viewer, roles, skills, interests, members] = await Promise.all([
      this.repo.findUserBrief(viewerId),
      this.repo.findRoles(id, false),
      this.repo.findSkills(id),
      this.repo.findInterests(id),
      this.repo.listMembers(id),
    ]);
    const canManage = !!viewer && viewer.status === 'ACTIVE' && (viewer.id === row.authorId || viewer.role === 'ADMIN');
    const isMember = members.some((m) => m.userId === viewerId);
    const slots = roles.map(toSlot);

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      author: toPublicUser({ id: row.authorId, name: row.authorName, status: row.authorStatus }),
      roles: slots,
      totalCapacity: slots.reduce((s, r) => s + r.capacity, 0),
      totalConfirmed: slots.reduce((s, r) => s + r.confirmedCount, 0),
      requiredSkills: skills.required,
      preferredSkills: skills.preferred,
      interests,
      members: members.map((m) => ({
        user: toPublicUser({ id: m.userId, name: m.name, status: m.status }),
        roleId: m.roleId,
        roleName: m.roleName,
        isLeader: m.userId === row.authorId,
      })),
      authorRoleId: members.find((m) => m.userId === row.authorId)?.roleId ?? null,
      // 문의용 오픈채팅은 누구나 볼 수 있다
      openChatUrl: row.openChatUrl,
      // 팀 채팅방은 작성자/운영진은 항상, 확정 팀원은 팀이 확정(마감)된 뒤에만
      teamChatUrl: canManage || (isMember && isClosedNow(row.status, row.endDate)) ? row.teamChatUrl : null,
      canManage,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async list(viewerId: string, query: RecruitmentListQuery): Promise<PageResponse<RecruitmentListItem>> {
    const sort = query.resolveSort(
      { createdAt: 'r.created_at', startDate: 'r.start_date', endDate: 'r.end_date' },
      { column: 'r.created_at', direction: 'desc' },
    );
    const keyword = query.q?.trim();
    const { items, total } = await this.repo.search(
      {
        status: query.status,
        q: keyword ? keyword : undefined,
        roleIds: query.roleIds,
        skillIds: query.skillIds,
        interestIds: query.interestIds,
        authorId: query.mine ? viewerId : undefined,
      },
      { limit: query.limit, offset: query.offset },
      sort,
    );
    return PageResponse.of(
      items.map((r) => {
        const roles = r.roles.map(toSlot);
        return {
          id: r.id,
          title: r.title,
          status: r.status,
          startDate: r.startDate,
          endDate: r.endDate,
          author: toPublicUser({ id: r.authorId, name: r.authorName, status: r.authorStatus }),
          roles,
          totalCapacity: roles.reduce((s, x) => s + x.capacity, 0),
          totalConfirmed: roles.reduce((s, x) => s + x.confirmedCount, 0),
          createdAt: r.createdAt,
        };
      }),
      total,
      query,
    );
  }

  // ===== 트랜잭션 안에서 다른 서비스도 쓰는 공용 로직 =====

  // 현재 DB 기준으로 활성 회원인지 확인하고 역할을 돌려준다 (탈퇴 회원은 401)
  async requireActiveActor(userId: string, db: Queryable): Promise<UserBrief> {
    const u = await this.repo.findUserBrief(userId, db);
    if (!u || u.status !== 'ACTIVE') throw new UnauthorizedError();
    return u;
  }

  // 작성자 본인 또는 운영진만 관리(수정/삭제/마감/지원 목록 조회) 가능
  assertCanManage(actor: UserBrief, authorId: string): void {
    if (actor.id !== authorId && actor.role !== 'ADMIN') throw new ForbiddenError('작성자 또는 운영진만 할 수 있어요');
  }

  // 정원 정산 (모집글 행을 FOR UPDATE 로 잠근 트랜잭션 안에서만 호출):
  //  1) 정원이 찬 역할에 남은 대기 지원/제안은 거절
  //  2) 모든 역할이 찼으면 모집글을 CLOSED 로 바꾸고 남은 대기 건을 일괄 거절
  async settleCapacity(tx: Queryable, recruitmentId: string): Promise<SettleResult> {
    const roles: RoleSlotRow[] = await this.repo.findRoles(recruitmentId, false, tx);
    const full = roles.filter((r) => r.confirmedCount >= r.capacity);
    for (const r of full) await this.applications.rejectPending(recruitmentId, r.roleId, tx);

    const closed = roles.length > 0 && full.length === roles.length;
    if (closed) {
      await this.repo.setStatus(recruitmentId, 'CLOSED', tx);
      await this.applications.rejectPending(recruitmentId, null, tx);
    }
    return { closed, fullRoleIds: full.map((r) => r.roleId) };
  }

  // ===== 내부 헬퍼 =====

  private toFields(dto: RecruitmentBodyDto) {
    return {
      title: dto.title,
      description: dto.description,
      startDate: dto.startDate,
      endDate: dto.endDate,
      openChatUrl: dto.openChatUrl,
      teamChatUrl: dto.teamChatUrl,
    };
  }

  // 작성/수정 공통 입력 검증 (날짜, 중복, 존재 여부)
  private async validateBody(dto: RecruitmentBodyDto, db: Queryable): Promise<void> {
    if (!isRealDate(dto.startDate) || !isRealDate(dto.endDate)) {
      throw new BadRequestError('모집 기간이 올바른 날짜가 아니에요');
    }
    // 'YYYY-MM-DD' 문자열은 사전순 비교가 날짜순과 같다
    if (dto.endDate < dto.startDate) throw new BadRequestError('종료일은 시작일 이후여야 해요');

    const roleIds = dto.roles.map((r) => r.roleId);
    if (new Set(roleIds).size !== roleIds.length) throw new BadRequestError('같은 역할을 중복해서 설정할 수 없어요');

    const overlap = dto.requiredSkillIds.filter((id) => dto.preferredSkillIds.includes(id));
    if (overlap.length > 0) throw new BadRequestError('필수 기술과 우대 기술에 같은 기술을 넣을 수 없어요');

    await this.assertAllExist('roles', roleIds, '존재하지 않는 모집 역할이 있어요', db);
    await this.assertAllExist('skills', [...dto.requiredSkillIds, ...dto.preferredSkillIds], '존재하지 않는 기술이 있어요', db);
    await this.assertAllExist('interest_areas', dto.interestIds, '존재하지 않는 관심 분야가 있어요', db);
  }

  private async assertAllExist(
    table: 'roles' | 'skills' | 'interest_areas',
    ids: number[],
    message: string,
    db: Queryable,
  ): Promise<void> {
    if (ids.length === 0) return;
    const unique = new Set(ids);
    const found = await this.repo.findExistingIds(table, [...unique], db);
    if (found.length !== unique.size) throw new BadRequestError(message);
  }
}
