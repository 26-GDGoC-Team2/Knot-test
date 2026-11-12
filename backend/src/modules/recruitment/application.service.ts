// 지원/제안 비즈니스 로직: 생성 검증(REQ-013~014), 수락/거절/취소(REQ-019~020)
// 알림(C4): 커밋 이후에 B 담당 알림 서비스를 호출할 자리를 TODO(C4)로 표시했다.
import { Injectable, Logger } from '@nestjs/common';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../common/app.exception';
import { DatabaseService, isUniqueViolation, Queryable } from '../../common/database.service';
import { PageResponse } from '../../common/pagination';
import { toPublicUser } from '../users/user.dto';
import { NotificationService } from '../notifications/notification.service';
import { ApplicationRepository, ApplicationRow } from './application.repository';
import type {
  AcceptResult,
  ApplicationListQuery,
  ApplicationResponse,
  ApplyDto,
  ProposeDto,
  RecruitmentApplicationsQuery,
} from './recruitment.dto';
import { RecruitmentRepository, RecruitmentLock } from './recruitment.repository';
import { RecruitmentService } from './recruitment.service';

const toResponse = (r: ApplicationRow): ApplicationResponse => ({
  id: r.id,
  recruitmentId: r.recruitmentId,
  recruitmentTitle: r.recruitmentTitle,
  kind: r.kind,
  status: r.status,
  rejectReason: r.rejectReason,
  roleId: r.roleId,
  roleName: r.roleName,
  message: r.message,
  sender: toPublicUser({ id: r.senderId, name: r.senderName, status: r.senderStatus }),
  receiver: toPublicUser({ id: r.receiverId, name: r.receiverName, status: r.receiverStatus }),
  createdAt: r.createdAt,
  respondedAt: r.respondedAt,
});

@Injectable()
export class ApplicationService {
  private readonly logger = new Logger(ApplicationService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly recruitments: RecruitmentRepository,
    private readonly applications: ApplicationRepository,
    private readonly recruitmentService: RecruitmentService,
    private readonly notificationService: NotificationService,
  ) {}

  // 지원: 회원이 모집글의 특정 역할에 지원한다 (받는 사람 = 작성자)
  async apply(actorId: string, recruitmentId: string, dto: ApplyDto): Promise<ApplicationResponse> {
    const { id, receiverId } = await this.database.transaction(async (tx) => {
      await this.recruitmentService.requireActiveActor(actorId, tx);
      // FOR SHARE: 마감/수락(FOR UPDATE)과 직렬화되어 마감 직후에 대기 건이 생기는 것을 막는다
      const rec = await this.lockOpenRecruitment(recruitmentId, tx);

      if (rec.authorId === actorId) throw new BadRequestError('본인이 올린 모집글에는 지원할 수 없어요');
      if (await this.recruitments.isMember(recruitmentId, actorId, tx)) throw new ConflictError('이미 참여 중인 모집글이에요');
      await this.assertRoleHasRoom(recruitmentId, dto.roleId, tx);

      const id = await this.insertOrConflict(
        { recruitmentId, roleId: dto.roleId, kind: 'APPLY', senderId: actorId, receiverId: rec.authorId, message: dto.message ?? null },
        '이미 지원한 모집글이에요',
        tx,
      );
      return { id, receiverId: rec.authorId };
    });
    // 커밋 후 작성자에게 새 지원 알림
    await this.notify(receiverId, 'APPLICATION_RECEIVED', recruitmentId, id);
    return this.loadResponse(id);
  }

  // 알림은 이미 끝난 처리를 되돌리지 않는 부가 기능이라, 저장에 실패해도 요청은 성공시키고 로그만 남긴다
  // applicationId: 알림을 지원/제안 건에 연결해 두면, 수락 취소·거절 취소 때 그 알림만 숨길 수 있다
  private async notify(userId: string, type: string, recruitmentId: string, applicationId: string): Promise<void> {
    try {
      await this.notificationService.createNotification(
        userId,
        type,
        recruitmentId,
        `/recruitment/${recruitmentId}`,
        applicationId,
      );
    } catch (e) {
      this.logger.warn(`알림 저장 실패 (type=${type}, recruitment=${recruitmentId}): ${e instanceof Error ? e.message : e}`);
    }
  }

  // 수락 취소·거절 취소 후 그 건에 보냈던 알림(수락/거절)을 숨긴다. 실패해도 취소 자체는 성공시킨다
  private async hideNotification(applicationId: string, type: string): Promise<void> {
    try {
      await this.notificationService.hideByApplication(applicationId, type);
    } catch (e) {
      this.logger.warn(`알림 숨김 실패 (application=${applicationId}, type=${type}): ${e instanceof Error ? e.message : e}`);
    }
  }

  // 제안: 작성자가 부원에게 특정 역할을 제안한다 (받는 사람 = 대상 회원)
  async propose(actorId: string, recruitmentId: string, dto: ProposeDto): Promise<ApplicationResponse> {
    const id = await this.database.transaction(async (tx) => {
      await this.recruitmentService.requireActiveActor(actorId, tx);
      const rec = await this.lockOpenRecruitment(recruitmentId, tx);

      if (rec.authorId !== actorId) throw new ForbiddenError('모집글 작성자만 제안할 수 있어요');
      if (dto.targetUserId === actorId) throw new BadRequestError('본인에게는 제안할 수 없어요');

      const target = await this.recruitments.findUserBrief(dto.targetUserId, tx);
      if (!target || target.status !== 'ACTIVE') throw new BadRequestError('제안할 수 없는 회원이에요');
      if (await this.recruitments.isMember(recruitmentId, dto.targetUserId, tx)) throw new ConflictError('이미 참여 중인 회원이에요');
      await this.assertRoleHasRoom(recruitmentId, dto.roleId, tx);

      return this.insertOrConflict(
        { recruitmentId, roleId: dto.roleId, kind: 'PROPOSE', senderId: actorId, receiverId: dto.targetUserId, message: dto.message ?? null },
        '이미 같은 회원에게 제안한 모집글이에요',
        tx,
      );
    });
    // 커밋 후 제안 받은 회원에게 알림
    await this.notify(dto.targetUserId, 'PROPOSAL_RECEIVED', recruitmentId, id);
    return this.loadResponse(id);
  }

  // 수락(REQ-019~020): 받은 사람만 수락할 수 있다.
  // 정원이 1명 남았을 때 동시에 여러 건을 수락해도 초과되지 않도록 하나의 트랜잭션에서
  // 모집글 행 -> 역할 행 -> 지원 행 순서로 잠근다(FOR UPDATE).
  async accept(actorId: string, applicationId: string): Promise<AcceptResult> {
    const result = await this.database.transaction(async (tx) => {
      await this.recruitmentService.requireActiveActor(actorId, tx);

      // 1) 모집글 행 잠금: 같은 모집글의 수락/마감/수정/삭제가 한 줄로 처리된다
      const recruitmentId = await this.applications.findRecruitmentId(applicationId, tx);
      if (!recruitmentId) throw new NotFoundError('지원/제안을 찾을 수 없어요');
      const rec = await this.recruitments.lockActive(recruitmentId, 'UPDATE', tx);
      if (!rec) throw new NotFoundError('모집글을 찾을 수 없어요');

      // 2) 지원 행 잠금 + 받은 사람/상태 확인 (잠금 후 다시 읽으므로 동시 처리 결과가 반영됨)
      const app = await this.applications.lockById(applicationId, tx);
      if (!app) throw new NotFoundError('지원/제안을 찾을 수 없어요');
      if (app.receiverId !== actorId) {
        if (app.senderId === actorId) throw new ForbiddenError('받은 사람만 수락할 수 있어요');
        throw new NotFoundError('지원/제안을 찾을 수 없어요');
      }
      if (app.status !== 'PENDING') throw new ConflictError('이미 처리된 요청이에요');
      if (rec.status !== 'OPEN') throw new ConflictError('마감된 모집글이에요');

      // 3) 팀원이 될 회원 확인 (지원이면 보낸 사람, 제안이면 받은 사람)
      const memberId = app.kind === 'APPLY' ? app.senderId : app.receiverId;
      const member = await this.recruitments.findUserBrief(memberId, tx);
      if (!member || member.status !== 'ACTIVE') throw new ConflictError('탈퇴한 회원이라 수락할 수 없어요');
      if (await this.recruitments.isMember(recruitmentId, memberId, tx)) throw new ConflictError('이미 참여 중인 회원이에요');

      // 4) 역할 행 잠금 + 정원 확인, 증가는 "정원 미만일 때만" 조건으로 한 번 더 막는다
      const role = await this.recruitments.findRoleLocked(recruitmentId, app.roleId, tx);
      if (!role) throw new ConflictError('모집 역할이 변경되어 수락할 수 없어요');
      if (role.confirmedCount >= role.capacity) throw new ConflictError('이미 정원이 가득 찬 역할이에요');
      if (!(await this.recruitments.incrementConfirmed(recruitmentId, app.roleId, tx))) {
        throw new ConflictError('이미 정원이 가득 찬 역할이에요');
      }

      // 5) 확정 팀원 등록 + 지원 상태 변경
      await this.recruitments.addMember(recruitmentId, app.roleId, memberId, tx);
      if (!(await this.applications.resolvePending(applicationId, 'ACCEPTED', tx))) {
        throw new ConflictError('이미 처리된 요청이에요');
      }
      // 같은 회원의 이 모집글 내 다른 대기 지원/제안은 취소
      await this.applications.cancelOtherPendingOfUser(recruitmentId, memberId, tx);

      // 6) 정원 정산: 찬 역할의 남은 대기 건 거절, 모두 찼으면 자동 마감 + 일괄 거절
      const settled = await this.recruitmentService.settleCapacity(tx, recruitmentId);
      return { applicationId, recruitmentId, settled, roleId: app.roleId, senderId: app.senderId, receiverId: app.receiverId, kind: app.kind };
    });

    this.logger.log(
      `수락 (application=${result.applicationId}, recruitment=${result.recruitmentId}, 자동마감=${result.settled.closed})`,
    );
    // 커밋 후 수락 알림: 요청을 보낸 사람에게 (지원이면 지원자, 제안이면 제안한 작성자).
    // 수락하는 사람은 항상 받은 사람이므로 알림 대상은 보낸 사람(senderId)이다
    await this.notify(result.senderId, 'APPLICATION_ACCEPTED', result.recruitmentId, result.applicationId);
    // 정원이 모두 차서 자동 마감됐다면, 거절된 나머지 대기자에게 마감 알림
    await this.notificationService.sendRecruitmentClosed(result.recruitmentId, result.settled.closedRejected);
    return {
      application: await this.loadResponse(result.applicationId),
      recruitmentStatus: result.settled.closed ? 'CLOSED' : 'OPEN',
      roleFull: result.settled.fullRoleIds.includes(result.roleId),
    };
  }

  // 거절: 받은 사람만
  async reject(actorId: string, applicationId: string): Promise<ApplicationResponse> {
    // 거절 전 보낸 사람 ID를 미리 조회
    const app = await this.applications.findRow(applicationId);
    if (!app) throw new NotFoundError('지원/제안을 찾을 수 없어요');
    const notifyUserId = app.senderId;
    const recruitmentId = app.recruitmentId;

    await this.resolveAsParty(actorId, applicationId, 'receiver', 'REJECTED', '받은 사람만 거절할 수 있어요');
    // 커밋 후 보낸 사람에게 거절 알림
    await this.notify(notifyUserId, 'APPLICATION_REJECTED', recruitmentId, applicationId);
    return this.loadResponse(applicationId);
  }

  // 수락/거절 취소: 받은 사람이 자신의 응답을 대기(PENDING)로 되돌린다.
  // 모집 중(OPEN)일 때만 가능하고, 마감 후에는 팀이 확정된 것이므로 막는다.
  // 수락 취소는 확정 팀원에서 빠지고, 거절 취소는 직접 거절한 건만 가능(자동 정리된 건은 불가).
  async revert(actorId: string, applicationId: string): Promise<ApplicationResponse> {
    const from = await this.database.transaction(async (tx) => {
      await this.recruitmentService.requireActiveActor(actorId, tx);

      // 잠금 순서: 모집글 -> 지원 -> 역할 (수락과 동일)
      const recruitmentId = await this.applications.findRecruitmentId(applicationId, tx);
      if (!recruitmentId) throw new NotFoundError('지원/제안을 찾을 수 없어요');
      const rec = await this.recruitments.lockActive(recruitmentId, 'UPDATE', tx);
      if (!rec) throw new NotFoundError('모집글을 찾을 수 없어요');

      const app = await this.applications.lockById(applicationId, tx);
      if (!app) throw new NotFoundError('지원/제안을 찾을 수 없어요');
      if (app.receiverId !== actorId) {
        if (app.senderId === actorId) throw new ForbiddenError('받은 사람만 응답을 취소할 수 있어요');
        throw new NotFoundError('지원/제안을 찾을 수 없어요');
      }
      if (rec.status !== 'OPEN') throw new ConflictError('마감된 모집글은 바꿀 수 없어요');

      const memberId = app.kind === 'APPLY' ? app.senderId : app.receiverId;

      const from = app.status; // 위에서 대기로 되돌릴 수 있는 상태만 통과시킨다
      if (from !== 'ACCEPTED' && from !== 'REJECTED') throw new ConflictError('수락 또는 거절한 요청만 되돌릴 수 있어요');
      if (from === 'ACCEPTED') {
        // 확정 팀원에서 제거하고 역할 확정 인원을 되돌린다
        const memberRole = await this.recruitments.findMemberRole(recruitmentId, memberId, tx);
        if (memberRole !== app.roleId) throw new ConflictError('이미 팀원 정보가 바뀌어 취소할 수 없어요');
        await this.recruitments.findRoleLocked(recruitmentId, app.roleId, tx);
        if (!(await this.recruitments.removeMember(recruitmentId, memberId, tx))) {
          throw new ConflictError('이미 처리된 요청이에요');
        }
        if (!(await this.recruitments.decrementConfirmed(recruitmentId, app.roleId, tx))) {
          throw new ConflictError('팀원 정보가 올바르지 않아요');
        }
      } else {
        if (app.rejectReason !== 'MANUAL') throw new ConflictError('모집 마감으로 정리된 요청은 되돌릴 수 없어요');
        // 다시 대기로 돌아가도 되는 상태인지 확인 (자리가 남아 있고, 대상 회원이 활동 중이며 아직 팀원이 아님)
        const member = await this.recruitments.findUserBrief(memberId, tx);
        if (!member || member.status !== 'ACTIVE') throw new ConflictError('탈퇴한 회원이라 되돌릴 수 없어요');
        if (await this.recruitments.isMember(recruitmentId, memberId, tx)) throw new ConflictError('이미 참여 중인 회원이에요');
        await this.assertRoleHasRoom(recruitmentId, app.roleId, tx);
      }

      try {
        if (!(await this.applications.revertToPending(applicationId, from, tx))) {
          throw new ConflictError('이미 처리된 요청이에요');
        }
      } catch (e) {
        // 그 사이 같은 상대가 다시 보낸 대기 건이 있으면 중복
        if (isUniqueViolation(e)) throw new ConflictError('같은 상대와 이미 대기 중인 요청이 있어요');
        throw e;
      }
      return from;
    });
    // 커밋 후 알림 숨김: 수락 취소 → 수락(매칭) 알림, 거절 취소 → 거절 알림
    await this.hideNotification(applicationId, from === 'ACCEPTED' ? 'APPLICATION_ACCEPTED' : 'APPLICATION_REJECTED');
    return this.loadResponse(applicationId);
  }

  // 취소: 보낸 사람만
  async cancel(actorId: string, applicationId: string): Promise<ApplicationResponse> {
    await this.resolveAsParty(actorId, applicationId, 'sender', 'CANCELED', '보낸 사람만 취소할 수 있어요');
    return this.loadResponse(applicationId);
  }

  // 내 지원/제안 목록
  async listMine(actorId: string, query: ApplicationListQuery): Promise<PageResponse<ApplicationResponse>> {
    const { items, total } = await this.applications.listByUser(actorId, query.box, query.status, {
      limit: query.limit,
      offset: query.offset,
    });
    return PageResponse.of(items.map(toResponse), total, query);
  }

  // 모집글에 걸린 지원/제안 목록 (작성자 또는 운영진)
  async listForRecruitment(
    actorId: string,
    recruitmentId: string,
    query: RecruitmentApplicationsQuery,
  ): Promise<PageResponse<ApplicationResponse>> {
    const actor = await this.recruitmentService.requireActiveActor(actorId, this.database);
    const rec = await this.recruitments.findDetailRow(recruitmentId);
    if (!rec) throw new NotFoundError('모집글을 찾을 수 없어요');
    this.recruitmentService.assertCanManage(actor, rec.authorId);

    const { items, total } = await this.applications.listByRecruitment(recruitmentId, query.status, {
      limit: query.limit,
      offset: query.offset,
    });
    return PageResponse.of(items.map(toResponse), total, query);
  }

  // ===== 내부 헬퍼 =====

  // 모집글을 공유 잠금으로 읽고, 모집 중(OPEN)이 아니면 거부
  private async lockOpenRecruitment(recruitmentId: string, tx: Queryable): Promise<RecruitmentLock> {
    const rec = await this.recruitments.lockActive(recruitmentId, 'SHARE', tx);
    if (!rec) throw new NotFoundError('모집글을 찾을 수 없어요');
    if (rec.status !== 'OPEN') throw new ConflictError('이미 마감된 모집글이에요');
    return rec;
  }

  // 모집글에 있는 역할이고 정원이 남아 있는지 확인
  private async assertRoleHasRoom(recruitmentId: string, roleId: number, tx: Queryable): Promise<void> {
    const roles = await this.recruitments.findRoles(recruitmentId, false, tx);
    const role = roles.find((r) => r.roleId === roleId);
    if (!role) throw new BadRequestError('이 모집글에 없는 역할이에요');
    if (role.confirmedCount >= role.capacity) throw new ConflictError('이미 정원이 가득 찬 역할이에요');
  }

  // 저장하고, 대기 중 중복(부분 유니크 인덱스 위반)이면 409 로 변환
  private async insertOrConflict(
    v: Parameters<ApplicationRepository['insert']>[0],
    duplicateMessage: string,
    tx: Queryable,
  ): Promise<string> {
    try {
      return await this.applications.insert(v, tx);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError(duplicateMessage);
      throw e;
    }
  }

  // 거절/취소 공통: 해당 당사자인지 확인하고 대기 상태일 때만 변경
  private async resolveAsParty(
    actorId: string,
    applicationId: string,
    party: 'sender' | 'receiver',
    status: 'REJECTED' | 'CANCELED',
    forbiddenMessage: string,
  ): Promise<void> {
    await this.database.transaction(async (tx) => {
      await this.recruitmentService.requireActiveActor(actorId, tx);
      const app = await this.applications.lockById(applicationId, tx);
      if (!app) throw new NotFoundError('지원/제안을 찾을 수 없어요');

      const isParty = (party === 'sender' ? app.senderId : app.receiverId) === actorId;
      if (!isParty) {
        // 관련 없는 사람에게는 존재 여부를 알리지 않는다
        if (app.senderId === actorId || app.receiverId === actorId) throw new ForbiddenError(forbiddenMessage);
        throw new NotFoundError('지원/제안을 찾을 수 없어요');
      }
      if (!(await this.applications.resolvePending(applicationId, status, tx))) {
        throw new ConflictError('이미 처리된 요청이에요');
      }
    });
  }

  private async loadResponse(id: string): Promise<ApplicationResponse> {
    const row = await this.applications.findRow(id);
    if (!row) throw new NotFoundError('지원/제안을 찾을 수 없어요');
    return toResponse(row);
  }
}
