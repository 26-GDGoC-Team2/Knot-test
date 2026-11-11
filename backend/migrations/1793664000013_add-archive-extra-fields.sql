-- club_projects 테이블에 진행 기간·등록자 컬럼 추가
ALTER TABLE club_projects
  ADD COLUMN IF NOT EXISTS started_at  DATE,
  ADD COLUMN IF NOT EXISTS ended_at    DATE,
  ADD COLUMN IF NOT EXISTS created_by  UUID REFERENCES users(id) ON DELETE SET NULL;

-- 결과물 링크 (GitHub·배포 등 여러 개 가능)
CREATE TABLE IF NOT EXISTS club_project_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES club_projects(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,          -- 'GitHub', '배포 사이트', '발표 자료' 등
  url        TEXT NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
