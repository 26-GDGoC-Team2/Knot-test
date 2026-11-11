-- notification_settings 테이블에 알림 종류별 on/off 컬럼 추가
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS recruitment_noti BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS application_noti BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS system_noti      BOOLEAN NOT NULL DEFAULT TRUE;

-- notifications 테이블 title, body 컬럼을 nullable로 변경 (type 기반 자동 생성 방식으로 전환)
ALTER TABLE notifications
  ALTER COLUMN title DROP NOT NULL,
  ALTER COLUMN body  DROP NOT NULL;
