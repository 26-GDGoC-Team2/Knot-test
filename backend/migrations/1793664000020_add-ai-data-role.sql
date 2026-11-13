-- Up Migration
-- 프론트 요청: 희망/모집 역할에 'AI/Data' 추가 (이름은 정확히 "AI/Data"). 이미 있으면 그대로 둔다.
INSERT INTO roles (name) VALUES ('AI/Data') ON CONFLICT (name) DO NOTHING;

-- Down Migration
-- 프로필·모집글 등에서 쓰는 중이면 지우지 않는다 (FK 오류 방지)
DELETE FROM roles r
WHERE r.name = 'AI/Data'
  AND NOT EXISTS (SELECT 1 FROM profile_roles x WHERE x.role_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM recruitment_roles x WHERE x.role_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM applications x WHERE x.role_id = r.id);
