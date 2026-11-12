-- Up Migration
-- 아카이브 코드가 쓰는 category·tech_stacks 칸 추가.
-- 0007 이 CREATE TABLE IF NOT EXISTS 로 만들려 했지만 club_projects 는 0002 에서 이미 다른 칸(tags 등)으로 만들어져 있어
-- 건너뛰어졌고, 그 결과 아카이브 목록·상세·등록이 "column does not exist" 오류로 실패했다.
ALTER TABLE club_projects
  ADD COLUMN IF NOT EXISTS category    TEXT,
  ADD COLUMN IF NOT EXISTS tech_stacks TEXT[] NOT NULL DEFAULT '{}';

-- Down Migration
ALTER TABLE club_projects
  DROP COLUMN IF EXISTS tech_stacks,
  DROP COLUMN IF EXISTS category;
