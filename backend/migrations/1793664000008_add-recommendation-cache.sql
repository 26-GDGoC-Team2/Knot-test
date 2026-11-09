CREATE TABLE IF NOT EXISTS recommendation_cache (
  recruitment_id  UUID        NOT NULL,
  role_id         UUID        NOT NULL,
  result          JSONB       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (recruitment_id, role_id)
);