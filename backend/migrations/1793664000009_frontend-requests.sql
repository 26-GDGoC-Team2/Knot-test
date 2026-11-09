-- Up Migration
-- 프론트 요청 반영: 팀 채팅방 링크, 거절 이유(직접/자동 구분), 역할 목록 4개(기획/디자인/FE/BE)

-- 1) 팀 채팅방 링크: 확정 팀원 전용. 기존 글은 NULL (작성/수정 API 에서는 필수 입력)
ALTER TABLE recruitments ADD COLUMN team_chat_url TEXT;

-- 2) 거절 이유: MANUAL = 받은 사람이 직접 거절, CLOSED = 마감/삭제/정원 마감으로 자동 정리
CREATE TYPE application_reject_reason AS ENUM ('MANUAL', 'CLOSED');
ALTER TABLE applications ADD COLUMN reject_reason application_reject_reason;
-- 기존 거절 건은 구분할 수 없으므로 직접 거절로 둔다
UPDATE applications SET reject_reason = 'MANUAL' WHERE status = 'REJECTED';
ALTER TABLE applications ADD CONSTRAINT chk_reject_reason
  CHECK ((status = 'REJECTED') = (reject_reason IS NOT NULL));

-- 3) 역할: PM -> 기획, AI/앱 제거. AI/앱을 이미 모집글/지원에서 쓰고 있으면 FK 오류로 실패한다 (데이터 보호)
UPDATE roles SET name = '기획' WHERE name = 'PM';
DELETE FROM profile_roles WHERE role_id IN (SELECT id FROM roles WHERE name IN ('AI', '앱'));
DELETE FROM roles WHERE name IN ('AI', '앱');

-- Down Migration
INSERT INTO roles (name) VALUES ('AI'), ('앱') ON CONFLICT (name) DO NOTHING;
UPDATE roles SET name = 'PM' WHERE name = '기획';

ALTER TABLE applications DROP CONSTRAINT IF EXISTS chk_reject_reason;
ALTER TABLE applications DROP COLUMN IF EXISTS reject_reason;
DROP TYPE IF EXISTS application_reject_reason;

ALTER TABLE recruitments DROP COLUMN IF EXISTS team_chat_url;
