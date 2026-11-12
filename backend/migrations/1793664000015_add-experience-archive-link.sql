-- Up Migration
-- 아카이브에서 가져온 경험의 출처. 같은 회원이 같은 아카이브를 두 번 가져오지 못하게 막는다.
-- 아카이브가 삭제돼도 가져간 경험은 남기고 출처만 비운다.
ALTER TABLE project_experiences
  ADD COLUMN IF NOT EXISTS archive_id UUID REFERENCES club_projects(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_experiences_user_archive
  ON project_experiences (user_id, archive_id) WHERE archive_id IS NOT NULL;

-- 본인이 삭제한 '동아리원 팀(MATCHED)' 경험 기록.
-- 마감 처리가 다시 실행돼도 삭제한 경험이 되살아나지 않게 한다.
CREATE TABLE IF NOT EXISTS deleted_matched_experiences (
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recruitment_id UUID        NOT NULL REFERENCES recruitments(id) ON DELETE CASCADE,
  deleted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, recruitment_id)
);

-- Down Migration
DROP TABLE IF EXISTS deleted_matched_experiences;
DROP INDEX IF EXISTS uq_experiences_user_archive;
ALTER TABLE project_experiences DROP COLUMN IF EXISTS archive_id;
