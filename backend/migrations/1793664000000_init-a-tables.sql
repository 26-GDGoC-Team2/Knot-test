-- Up Migration
-- knot 스키마 초안(knot_schema_draft.sql) 중 [A] 담당 테이블만 포함
-- [B] 테이블(알림/활동/이력/감사로그/아카이브/공모전)은 B개발자와 협의 후 별도 마이그레이션으로 추가

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
-- CREATE EXTENSION IF NOT EXISTS vector;    -- pgvector 사용 여부 미정

-- ===== 회원 / 인증 =====
CREATE TYPE user_role   AS ENUM ('MEMBER', 'ADMIN');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'WITHDRAWN');

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub        TEXT        NOT NULL UNIQUE,
  email             TEXT        NOT NULL UNIQUE,           -- 소문자로 저장 (식별은 google_sub)
  name            TEXT        NOT NULL,
  role              user_role   NOT NULL DEFAULT 'MEMBER',
  status            user_status NOT NULL DEFAULT 'ACTIVE',
  completed         BOOLEAN     NOT NULL DEFAULT FALSE,
  join_verified_at  TIMESTAMPTZ,
  withdrawn_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE UNIQUE INDEX uq_refresh_tokens_hash ON refresh_tokens(token_hash);  -- 해시로 조회

CREATE TABLE join_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_enc    TEXT    NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  changed_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_join_codes_active ON join_codes(active) WHERE active;

-- ===== 선택 목록과 연결 테이블 =====
CREATE TABLE roles (
  id    SMALLSERIAL PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE skills (
  id         SERIAL PRIMARY KEY,
  name       TEXT    NOT NULL,
  name_norm  TEXT    NOT NULL UNIQUE,
  is_custom  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE interest_areas (
  id    SMALLSERIAL PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE profile_roles (
  user_id  UUID     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id  SMALLINT NOT NULL REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE profile_skills (
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id  INT  NOT NULL REFERENCES skills(id),
  PRIMARY KEY (user_id, skill_id)
);

CREATE TABLE profile_interests (
  user_id      UUID     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interest_id  SMALLINT NOT NULL REFERENCES interest_areas(id),
  PRIMARY KEY (user_id, interest_id)
);

-- ===== 프로필과 프로젝트 경험 =====
CREATE TABLE profiles (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio             TEXT,
  github_url      TEXT,
  available       BOOLEAN NOT NULL DEFAULT TRUE,
  available_from  DATE,
  bio_embedding   REAL[],
  embedding_stale BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_available ON profiles(available, available_from);

CREATE TYPE project_type AS ENUM ('OFFICIAL', 'MATCHED', 'PERSONAL');

CREATE TABLE project_experiences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            project_type NOT NULL DEFAULT 'PERSONAL',
  started_on      DATE,
  ended_on        DATE,
  role_desc       TEXT,
  description     TEXT,
  link            TEXT,
  is_public       BOOLEAN NOT NULL DEFAULT FALSE,
  recruitment_id  UUID,
  embedding       REAL[],
  embedding_stale BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_experiences_user ON project_experiences(user_id, is_public);

CREATE TABLE project_experience_skills (
  experience_id  UUID NOT NULL REFERENCES project_experiences(id) ON DELETE CASCADE,
  skill_id       INT  NOT NULL REFERENCES skills(id),
  PRIMARY KEY (experience_id, skill_id)
);

-- ===== 모집글과 지원·제안 =====
CREATE TYPE recruitment_status AS ENUM ('OPEN', 'CLOSED', 'COMPLETED');

CREATE TABLE recruitments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       UUID NOT NULL REFERENCES users(id),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  status          recruitment_status NOT NULL DEFAULT 'OPEN',
  open_chat_url   TEXT NOT NULL,
  embedding       REAL[],
  embedding_stale BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,                            -- 소프트 삭제: 값이 있으면 목록/상세에서 숨김 (지원/제안 이력 보존)
  CONSTRAINT chk_recruitment_period CHECK (end_date >= start_date)
);
-- 목록(상태별 최신순)과 내 모집글 조회. 삭제된 글은 인덱스에서 제외
CREATE INDEX idx_recruitments_status ON recruitments(status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_recruitments_author ON recruitments(author_id, status) WHERE deleted_at IS NULL;

CREATE TABLE recruitment_roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruitment_id  UUID     NOT NULL REFERENCES recruitments(id) ON DELETE CASCADE,
  role_id         SMALLINT NOT NULL REFERENCES roles(id),
  capacity        SMALLINT NOT NULL,
  confirmed_count SMALLINT NOT NULL DEFAULT 0,
  UNIQUE (recruitment_id, role_id),
  CONSTRAINT chk_capacity CHECK (capacity > 0 AND confirmed_count <= capacity)
);

CREATE TABLE recruitment_skills (
  recruitment_id  UUID    NOT NULL REFERENCES recruitments(id) ON DELETE CASCADE,
  skill_id        INT     NOT NULL REFERENCES skills(id),
  required        BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (recruitment_id, skill_id)
);

CREATE TABLE recruitment_interests (
  recruitment_id  UUID     NOT NULL REFERENCES recruitments(id) ON DELETE CASCADE,
  interest_id     SMALLINT NOT NULL REFERENCES interest_areas(id),
  PRIMARY KEY (recruitment_id, interest_id)
);

CREATE TABLE recruitment_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruitment_id  UUID     NOT NULL REFERENCES recruitments(id) ON DELETE CASCADE,
  role_id         SMALLINT NOT NULL REFERENCES roles(id),
  user_id         UUID     NOT NULL REFERENCES users(id),
  confirmed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recruitment_id, user_id)
);

CREATE TYPE application_kind   AS ENUM ('APPLY', 'PROPOSE');
CREATE TYPE application_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELED');

CREATE TABLE applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruitment_id  UUID     NOT NULL REFERENCES recruitments(id) ON DELETE CASCADE,
  role_id         SMALLINT NOT NULL REFERENCES roles(id),
  kind            application_kind   NOT NULL,
  sender_id       UUID     NOT NULL REFERENCES users(id),
  receiver_id     UUID     NOT NULL REFERENCES users(id),
  message         TEXT,
  status          application_status NOT NULL DEFAULT 'PENDING',
  responded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 한 줄 메시지의 실제 제한(기본 50자)은 서비스 설정값으로 검사한다. DB는 상한만 넉넉하게 둠
  CONSTRAINT chk_message_len CHECK (message IS NULL OR char_length(message) <= 200),
  CONSTRAINT chk_not_self    CHECK (sender_id <> receiver_id)
);
-- 대기 중인 지원은 모집글당 1건 (역할 무관). 거절/취소된 뒤에는 다시 지원 가능
CREATE UNIQUE INDEX uq_pending_apply
  ON applications(recruitment_id, sender_id)
  WHERE status = 'PENDING' AND kind = 'APPLY';
-- 같은 사람에게 같은 모집글로 대기 중인 제안은 1건 (작성자는 여러 명에게 제안 가능)
CREATE UNIQUE INDEX uq_pending_propose
  ON applications(recruitment_id, receiver_id)
  WHERE status = 'PENDING' AND kind = 'PROPOSE';
CREATE INDEX idx_applications_receiver ON applications(receiver_id, status);
CREATE INDEX idx_applications_sender   ON applications(sender_id, status);
CREATE INDEX idx_applications_recruitment ON applications(recruitment_id, status);  -- 모집글 관리(들어온 지원 목록)

-- ===== 검색/필터용 역방향 인덱스 (역할/기술/관심 분야 -> 회원/모집글) =====
-- PK 가 (user_id, X) 순서라 X 로 찾을 때는 아래 인덱스가 필요
CREATE INDEX idx_profile_roles_role         ON profile_roles(role_id, user_id);
CREATE INDEX idx_profile_skills_skill       ON profile_skills(skill_id, user_id);
CREATE INDEX idx_profile_interests_interest ON profile_interests(interest_id, user_id);
CREATE INDEX idx_recruitment_roles_role         ON recruitment_roles(role_id, recruitment_id);
CREATE INDEX idx_recruitment_skills_skill       ON recruitment_skills(skill_id, recruitment_id);
CREATE INDEX idx_recruitment_interests_interest ON recruitment_interests(interest_id, recruitment_id);
CREATE INDEX idx_users_status ON users(status);

ALTER TABLE project_experiences
  ADD CONSTRAINT fk_experience_recruitment
  FOREIGN KEY (recruitment_id) REFERENCES recruitments(id) ON DELETE SET NULL;

-- Down Migration
-- 생성의 역순으로 제거 (확장 pgcrypto는 다른 곳에서도 쓸 수 있어 유지)
ALTER TABLE project_experiences DROP CONSTRAINT IF EXISTS fk_experience_recruitment;

DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS recruitment_members;
DROP TABLE IF EXISTS recruitment_interests;
DROP TABLE IF EXISTS recruitment_skills;
DROP TABLE IF EXISTS recruitment_roles;
DROP TABLE IF EXISTS recruitments;
DROP TABLE IF EXISTS project_experience_skills;
DROP TABLE IF EXISTS project_experiences;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS profile_interests;
DROP TABLE IF EXISTS profile_skills;
DROP TABLE IF EXISTS profile_roles;
DROP TABLE IF EXISTS interest_areas;
DROP TABLE IF EXISTS skills;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS join_codes;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS users;

DROP TYPE IF EXISTS application_status;
DROP TYPE IF EXISTS application_kind;
DROP TYPE IF EXISTS recruitment_status;
DROP TYPE IF EXISTS project_type;
DROP TYPE IF EXISTS user_status;
DROP TYPE IF EXISTS user_role;
