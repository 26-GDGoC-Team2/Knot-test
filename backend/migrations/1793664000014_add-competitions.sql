-- Up Migration
-- 위비티 웹/모바일/IT 공모전 크롤링 데이터 저장

CREATE TABLE competitions (
  id          SERIAL PRIMARY KEY,
  title       TEXT        NOT NULL,
  organizer   TEXT,
  category    TEXT,
  start_date  DATE,
  end_date    DATE        NOT NULL,
  source_url  TEXT        NOT NULL UNIQUE,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_competitions_end_date ON competitions (end_date) WHERE is_active = TRUE;
CREATE INDEX idx_competitions_category ON competitions (category) WHERE is_active = TRUE;

-- Down Migration
DROP TABLE IF EXISTS competitions;
