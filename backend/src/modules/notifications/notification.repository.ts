import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database.service';
import { SubscribePushDto } from './notification.dto';

@Injectable()
export class NotificationRepository {
  constructor(private readonly database: DatabaseService) {}

  // 푸시 구독 저장
  async upsertPushSubscription(userId: string, dto: SubscribePushDto) {
    await this.database.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, endpoint)
       DO UPDATE SET p256dh = $3, auth = $4, updated_at = now()`,
      [userId, dto.endpoint, dto.p256dh, dto.auth],
    );
  }

  // 푸시 구독 삭제
  async deletePushSubscription(userId: string, endpoint: string) {
    await this.database.query(
      `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
      [userId, endpoint],
    );
  }

  // 알림 설정 조회
  async findSettings(userId: string) {
    const result = await this.database.query(
      `SELECT * FROM notification_settings WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  // 알림 설정 수정
  async upsertSettings(userId: string, fields: Record<string, any>) {
    const keys = Object.keys(fields);
    const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [userId, ...Object.values(fields)];
    await this.database.query(
      `INSERT INTO notification_settings (user_id, ${keys.join(', ')})
       VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})
       ON CONFLICT (user_id)
       DO UPDATE SET ${setClauses}, updated_at = now()`,
      values,
    );
  }

  // 알림 목록 조회
  async findNotifications(userId: string) {
    const result = await this.database.query(
      `SELECT * FROM notifications WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days' ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows;
  }

  // 알림 읽음 처리
  async markAsRead(notificationId: string, userId: string) {
    await this.database.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [notificationId, userId],
    );
  }
async deleteNotification(notificationId: number, userId: number): Promise<void> {
  await this.database.query(
    `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
    [notificationId, userId]
  );
}

async deleteAllNotifications(userId: number): Promise<void> {
  await this.database.query(
    `DELETE FROM notifications WHERE user_id = $1`,
    [userId]
  );
}
// 알림 전체 읽음 처리
async markAllAsRead(userId: number): Promise<void> {
  await this.database.query(
    `UPDATE notifications SET is_read = true WHERE user_id = $1`,
    [userId]
  );
}
}