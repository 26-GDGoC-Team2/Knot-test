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
async deleteNotification(notificationId: number, userId: number): Promise<void> {
  await this.notificationRepository.deleteNotification(notificationId, userId);
}

async deleteAllNotifications(userId: number): Promise<void> {
  await this.notificationRepository.deleteAllNotifications(userId);
}
async markAllAsRead(userId: number): Promise<void> {
  await this.notificationRepository.markAllAsRead(userId);
    }
}