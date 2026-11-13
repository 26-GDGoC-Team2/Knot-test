import { Injectable, Logger } from '@nestjs/common';
import { NotificationRepository, SettingColumn } from './notification.repository';
import { SubscribePushDto, UpdateNotificationSettingsDto } from './notification.dto';

// 알림 종류별 제목/문구 (프론트는 본문 한 줄을 보여 준다)
const NOTIFICATION_TEXT: Record<string, { title: string; body: string }> = {
  APPLICATION_RECEIVED: { title: '새 지원', body: '새 지원이 도착했어요' },
  PROPOSAL_RECEIVED: { title: '새 제안', body: '팀 참여 제안을 받았어요' },
  APPLICATION_ACCEPTED: { title: '수락', body: '요청이 수락되었어요' },
  APPLICATION_REJECTED: { title: '거절', body: '요청이 거절되었어요' },
  RECRUITMENT_CLOSED: { title: '모집 마감', body: '모집이 마감되었어요' },
  RECRUITMENT_NEW: { title: '새 모집글', body: '관심 분야·역할에 맞는 새 모집글이 올라왔어요' },
};

// 알림 종류별로 확인할 설정 스위치 (지원/제안/마감 = 지원 알림, 새 모집글 = 모집 알림, 권한/수료 안내 = 운영진 안내)
const SETTING_COLUMN: Record<string, SettingColumn> = {
  APPLICATION_RECEIVED: 'application_noti',
  PROPOSAL_RECEIVED: 'application_noti',
  APPLICATION_ACCEPTED: 'application_noti',
  APPLICATION_REJECTED: 'application_noti',
  RECRUITMENT_CLOSED: 'application_noti',
  RECRUITMENT_NEW: 'recruitment_noti',
  ROLE_CHANGED: 'system_noti',
  SYSTEM: 'system_noti',
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notificationRepository: NotificationRepository,
  ) {}

  // 푸시 구독 등록
  async subscribePush(userId: string, dto: SubscribePushDto) {
    await this.notificationRepository.upsertPushSubscription(userId, dto);
    return { message: '푸시 알림 구독이 완료됐어요.' };
  }

  // 푸시 구독 해지
  async unsubscribePush(userId: string, endpoint: string) {
    await this.notificationRepository.deletePushSubscription(userId, endpoint);
    return { message: '푸시 알림 구독이 해지됐어요.' };
  }

  // 알림 설정 조회
  async getSettings(userId: string) {
    const settings = await this.notificationRepository.findSettings(userId);
    return settings;
  }

  // 알림 설정 수정
  async updateSettings(userId: string, dto: UpdateNotificationSettingsDto) {
    const fields: Record<string, any> = {};
    if (dto.pushEnabled !== undefined) fields['push_enabled'] = dto.pushEnabled;
    if (dto.recruitmentNoti !== undefined) fields['recruitment_noti'] = dto.recruitmentNoti;
    if (dto.applicationNoti !== undefined) fields['application_noti'] = dto.applicationNoti;
    if (dto.systemNoti !== undefined) fields['system_noti'] = dto.systemNoti;
    if (dto.recruitmentRange !== undefined) fields['recruitment_range'] = dto.recruitmentRange;
    await this.notificationRepository.upsertSettings(userId, fields);
    return { message: '알림 설정이 업데이트됐어요.' };
  }

  // 알림 목록 조회
  async getNotifications(userId: string) {
    return this.notificationRepository.findNotifications(userId);
  }

  // 알림 읽음 처리
  async markAsRead(notificationId: string, userId: string) {
    await this.notificationRepository.markAsRead(notificationId, userId);
    return { message: '알림을 읽음 처리했어요.' };
  }

  // 알림 삭제 (UUID 타입으로 수정)
  async deleteNotification(notificationId: string, userId: string): Promise<{ message: string }> {
    await this.notificationRepository.deleteNotification(notificationId, userId);
    return { message: '알림을 삭제했어요.' };
  }

  // 알림 전체 삭제 (UUID 타입으로 수정)
  async deleteAllNotifications(userId: string): Promise<{ message: string }> {
    await this.notificationRepository.deleteAllNotifications(userId);
    return { message: '알림을 모두 삭제했어요.' };
  }

  // 알림 전체 읽음 처리 (UUID 타입으로 수정)
  async markAllAsRead(userId: string): Promise<{ message: string }> {
    await this.notificationRepository.markAllAsRead(userId);
    return { message: '모든 알림을 읽음 처리했어요.' };
  }

  // 알림 생성 — 지원/제안/수락/거절 이벤트 발생 시 호출. 종류(type)에 맞는 제목·문구를 함께 저장한다
  async createNotification(
    userId: string,
    type: string,
    recruitmentId: string | null,
    link: string | null,
    applicationId: string | null = null,
    textOverride?: { title: string; body: string },
  ): Promise<void> {
    const text = textOverride ?? NOTIFICATION_TEXT[type];
    await this.notificationRepository.createNotification(
      userId,
      type,
      recruitmentId,
      link,
      text?.title ?? null,
      text?.body ?? null,
      applicationId,
      SETTING_COLUMN[type] ?? null,
    );
  }

  // 아래 send* 메서드는 부가 기능이라 실패해도 예외를 던지지 않고 로그만 남긴다 (이미 끝난 처리를 되돌리지 않기 위해)

  // 새 모집글: 관심 분야/역할이 맞는 부원에게 (작성자 제외, 각자의 알림 설정 반영)
  async sendNewRecruitment(recruitmentId: string, authorId: string): Promise<void> {
    try {
      const text = NOTIFICATION_TEXT.RECRUITMENT_NEW;
      const n = await this.notificationRepository.createForMatchingMembers(
        recruitmentId, authorId, `/recruitment/${recruitmentId}`, text.title, text.body,
      );
      this.logger.log(`새 모집글 알림 ${n}명 (recruitment=${recruitmentId})`);
    } catch (e) {
      this.logger.warn(`새 모집글 알림 실패 (recruitment=${recruitmentId}): ${e instanceof Error ? e.message : e}`);
    }
  }

  // 모집 마감: 마감으로 거절된 지원자·제안 받은 사람에게
  async sendRecruitmentClosed(recruitmentId: string, items: { userId: string; applicationId: string }[]): Promise<void> {
    try {
      const text = NOTIFICATION_TEXT.RECRUITMENT_CLOSED;
      await this.notificationRepository.createForApplications(
        items, 'RECRUITMENT_CLOSED', recruitmentId, `/recruitment/${recruitmentId}`,
        text.title, text.body, SETTING_COLUMN.RECRUITMENT_CLOSED,
      );
    } catch (e) {
      this.logger.warn(`모집 마감 알림 실패 (recruitment=${recruitmentId}): ${e instanceof Error ? e.message : e}`);
    }
  }

  // 운영진 안내(권한 변경 ROLE_CHANGED / 수료 지정 SYSTEM): 해당 부원에게
  async sendAdminNotice(userId: string, type: 'ROLE_CHANGED' | 'SYSTEM', title: string, body: string): Promise<void> {
    try {
      await this.createNotification(userId, type, null, null, null, { title, body });
    } catch (e) {
      this.logger.warn(`운영진 안내 알림 실패 (type=${type}): ${e instanceof Error ? e.message : e}`);
    }
  }

  // 수락 취소·거절 취소 때, 그 지원/제안 건에 대해 보냈던 알림을 숨긴다
  async hideByApplication(applicationId: string, type: string): Promise<void> {
    await this.notificationRepository.hideByApplication(applicationId, type);
  }
}
