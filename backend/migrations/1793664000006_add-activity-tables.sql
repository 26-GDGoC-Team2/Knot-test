CREATE TABLE IF NOT EXISTS activity_scores (
  user_id       UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  project_count INTEGER     NOT NULL DEFAULT 0,
  session_count INTEGER     NOT NULL DEFAULT 0,
  contest_count INTEGER     NOT NULL DEFAULT 0,
  study_count   INTEGER     NOT NULL DEFAULT 0,
  total_score   INTEGER     NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS participation_records (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type   TEXT        NOT NULL CHECK (activity_type IN ('PROJECT','SESSION','CONTEST','STUDY')),
  activity_name   TEXT        NOT NULL,
  participated_at TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_participation_records_user_id ON participation_records(user_id);
