-- ================================================================
-- B 담당 테이블 마이그레이션
-- 알림 · 활동 · 운영진 · 아카이브 · 공모전
-- ================================================================

-- 알림 설정 (유저별 알림 on/off)
CREATE TABLE notification_settings (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Web Push 구독 정보 (브라우저별)
CREATE TABLE push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 알림 목록
CREATE TYPE notification_type AS ENUM (
  'APPLICATION_RECEIVED',
  'APPLICATION_ACCEPTED',
  'APPLICATION_REJECTED',
  'RECRUITMENT_CLOSED',
  'ROLE_CHANGED',
  'SYSTEM'
);

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  link        TEXT,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- 가입 코드 발급 이력
CREATE TABLE join_code_histories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash    TEXT NOT NULL,
  issued_by    UUID NOT NULL REFERENCES users(id),
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 역할 변경 이력
CREATE TABLE role_histories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_by  UUID NOT NULL REFERENCES users(id),
  old_role    TEXT NOT NULL,
  new_role    TEXT NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_role_histories_user_id ON role_histories(user_id);

-- 감사 로그
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT,
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- 활동 점수 설정 (운영진이 조정)
CREATE TABLE activity_score_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL UNIQUE,
  score       INT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 참여 기록
CREATE TABLE participation_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type  TEXT NOT NULL,
  reference_id UUID,
  score_delta  INT NOT NULL DEFAULT 0,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_participation_records_user_id ON participation_records(user_id);

-- 활동 점수 집계
CREATE TABLE activity_scores (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_score  INT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 클럽 프로젝트 (아카이브)
CREATE TABLE club_projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT,
  github_url   TEXT,
  demo_url     TEXT,
  thumbnail_url TEXT,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 공모전 정보
CREATE TABLE opportunities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  organizer    TEXT,
  description  TEXT,
  url          TEXT,
  start_date   DATE,
  end_date     DATE,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_opportunities_end_date ON opportunities(end_date);