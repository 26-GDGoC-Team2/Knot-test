CREATE TABLE IF NOT EXISTS club_projects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  description TEXT,
  category    TEXT,
  tech_stacks TEXT[]      NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE club_projects ADD COLUMN IF NOT EXISTS cohort INTEGER;

CREATE TABLE IF NOT EXISTS club_project_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES club_projects(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  name        TEXT        NOT NULL,
  role        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_project_members_project_id ON club_project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_club_projects_cohort ON club_projects(cohort);