import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database.service';
import { SubscribePushDto } from './notification.dto';

// 알림 설정 스위치 칸 (SQL 에 직접 쓰므로 이 목록만 허용)
export type SettingColumn = 'application_noti' | 'recruitment_noti' | 'system_noti' | null;

// 받는 사람의 해당 스위치가 켜져 있는지 (설정 행이 없으면 켜진 것으로 본다)
const settingGate = (userExpr: string, col: SettingColumn): string =>
  col ? `COALESCE((SELECT s.${col} FROM notification_settings s WHERE s.user_id = ${userExpr}), TRUE)` : 'TRUE';

// 본문 앞에 모집글 제목을 붙인다 (모집글이 없거나 문구가 없으면 생략)
const BODY_SQL = (bodyPh: string, recPh: string): string =>
  `CASE WHEN ${bodyPh}::text IS NULL THEN NULL
        ELSE COALESCE('[' || (SELECT r.title FROM recruitments r WHERE r.id = ${recPh}::uuid) || '] ', '') || ${bodyPh}::text END`;

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
      `SELECT * FROM notifications
        WHERE user_id = $1 AND hidden_at IS NULL AND created_at > NOW() - INTERVAL '30 days'
        ORDER BY created_at DESC`,
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

  // 알림 삭제 (UUID 타입으로 수정)
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    await this.database.query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [notificationId, userId],
    );
  }

  // 알림 전체 삭제 (UUID 타입으로 수정)
  async deleteAllNotifications(userId: string): Promise<void> {
    await this.database.query(
      `DELETE FROM notifications WHERE user_id = $1`,
      [userId],
    );
  }

  // 알림 전체 읽음 처리 (UUID 타입으로 수정)
  async markAllAsRead(userId: string): Promise<void> {
    await this.database.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1`,
      [userId],
    );
  }

  // 알림 생성. 본문 앞에는 모집글 제목을 붙인다 (모집글이 없으면 문구만).
  // settingColumn: 받는 사람의 알림 설정 스위치가 꺼져 있으면 저장하지 않는다 (설정 행이 없으면 켜진 것으로 본다)
  async createNotification(
    userId: string,
    type: string,
    recruitmentId: string | null,
    link: string | null,
    title: string | null = null,
    body: string | null = null,
    applicationId: string | null = null,
    settingColumn: SettingColumn = null,
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO notifications (user_id, type, recruitment_id, title, body, link, application_id, is_read, created_at)
       SELECT $1::uuid, $2::notification_type, $3::uuid, $4::text,
              ${BODY_SQL('$5', '$3')},
              $6::text, $7::uuid, false, now()
       WHERE ${settingGate('$1::uuid', settingColumn)}`,
      [userId, type, recruitmentId, title, body, link, applicationId],
    );
  }

  // 여러 지원/제안 건의 상대방에게 같은 알림을 한 번에 저장 (모집 마감 등). 저장한 건수 반환
  async createForApplications(
    items: { userId: string; applicationId: string }[],
    type: string,
    recruitmentId: string,
    link: string | null,
    title: string | null,
    body: string | null,
    settingColumn: SettingColumn = null,
  ): Promise<number> {
    if (items.length === 0) return 0;
    const r = await this.database.query(
      `INSERT INTO notifications (user_id, type, recruitment_id, title, body, link, application_id, is_read, created_at)
       SELECT t.user_id, $1::notification_type, $2::uuid, $3::text,
              ${BODY_SQL('$4', '$2')},
              $5::text, t.application_id, false, now()
       FROM unnest($6::uuid[], $7::uuid[]) AS t(user_id, application_id)
       WHERE ${settingGate('t.user_id', settingColumn)}`,
      [type, recruitmentId, title, body, link, items.map((i) => i.userId), items.map((i) => i.applicationId)],
    );
    return r.rowCount ?? 0;
  }

  // 새 모집글 알림: 작성자를 뺀 활성·인증 회원 중 '모집 알림' 스위치가 켜져 있고 알림 범위에 맞는 사람에게 저장.
  // 범위: INTEREST = 관심 분야가 하나라도 겹침, ROLE = 희망 역할이 하나라도 겹침, 그 외(BOTH/ALL/없음) = 둘 중 하나만 겹쳐도 됨
  async createForMatchingMembers(
    recruitmentId: string,
    authorId: string,
    link: string | null,
    title: string | null,
    body: string | null,
  ): Promise<number> {
    const r = await this.database.query(
      `WITH target AS (
         SELECT u.id AS user_id,
                EXISTS (SELECT 1 FROM profile_interests pi
                          JOIN recruitment_interests ri ON ri.interest_id = pi.interest_id
                         WHERE pi.user_id = u.id AND ri.recruitment_id = $1::uuid) AS interest_match,
                EXISTS (SELECT 1 FROM profile_roles pr
                          JOIN recruitment_roles rr ON rr.role_id = pr.role_id
                         WHERE pr.user_id = u.id AND rr.recruitment_id = $1::uuid) AS role_match,
                COALESCE(s.recruitment_range, 'BOTH') AS scope
           FROM users u
           LEFT JOIN notification_settings s ON s.user_id = u.id
          WHERE u.status = 'ACTIVE' AND u.join_verified_at IS NOT NULL AND u.id <> $2::uuid
            AND COALESCE(s.recruitment_noti, TRUE)
       )
       INSERT INTO notifications (user_id, type, recruitment_id, title, body, link, is_read, created_at)
       SELECT t.user_id, 'RECRUITMENT_NEW'::notification_type, $1::uuid, $3::text,
              ${BODY_SQL('$4', '$1')},
              $5::text, false, now()
         FROM target t
        WHERE CASE t.scope WHEN 'INTEREST' THEN t.interest_match
                           WHEN 'ROLE' THEN t.role_match
                           ELSE (t.interest_match OR t.role_match) END`,
      [recruitmentId, authorId, title, body, link],
    );
    return r.rowCount ?? 0;
  }

  // 지원/제안 건에 연결된 특정 종류의 알림을 목록에서 숨긴다 (수락 취소·거절 취소). 이미 숨긴 알림은 건드리지 않는다
  async hideByApplication(applicationId: string, type: string): Promise<number> {
    const r = await this.database.query(
      `UPDATE notifications SET hidden_at = now()
        WHERE application_id = $1 AND type = $2 AND hidden_at IS NULL`,
      [applicationId, type],
    );
    return r.rowCount ?? 0;
  }
}
