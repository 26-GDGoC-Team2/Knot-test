import { Injectable } from '@nestjs/common';
import { NotificationRepository } from './notification.repository';
import { SubscribePushDto, UpdateNotificationSettingsDto } from './notification.dto';

@Injectable()
export class NotificationService {
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

  // 알림 생성 (신규 추가) — 지원/수락/거절 이벤트 발생 시 호출
  async createNotification(
    userId: string,
    type: string,
    recruitmentId: string | null,
    link: string | null,
  ): Promise<void> {
    await this.notificationRepository.createNotification(userId, type, recruitmentId, link);
  }
}
