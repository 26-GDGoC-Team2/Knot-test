-- Up Migration
-- 알림이 어느 지원/제안 건에 대한 것인지 연결하고, 숨김 시각을 저장한다.
-- 수락 취소 → 그 지원의 '수락' 알림 숨김, 거절 취소 → '거절' 알림 숨김 (삭제하지 않고 목록에서만 뺀다)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS hidden_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_application_id
  ON notifications (application_id) WHERE application_id IS NOT NULL;

-- Down Migration
DROP INDEX IF EXISTS idx_notifications_application_id;
ALTER TABLE notifications
  DROP COLUMN IF EXISTS hidden_at,
  DROP COLUMN IF EXISTS application_id;
