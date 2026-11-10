-- Up Migration
-- 역할별 필수·우대 기술. 모집글 단위 recruitment_skills 는 이 값들을 합친 목록으로 계속 유지한다(검색·카드·추천용).
CREATE TABLE recruitment_role_skills (
  recruitment_id  UUID     NOT NULL,
  role_id         SMALLINT NOT NULL,
  skill_id        INT      NOT NULL REFERENCES skills(id),
  required        BOOLEAN  NOT NULL DEFAULT TRUE,
  PRIMARY KEY (recruitment_id, role_id, skill_id),
  -- 역할이 모집글에서 빠지면 그 역할의 기술도 함께 삭제
  FOREIGN KEY (recruitment_id, role_id) REFERENCES recruitment_roles(recruitment_id, role_id) ON DELETE CASCADE
);

-- Down Migration
DROP TABLE IF EXISTS recruitment_role_skills;
