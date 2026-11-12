-- Up Migration
-- 알림이 어느 모집글에 대한 것인지 저장 (알림 생성 쿼리가 이미 이 칸을 쓰고 있음). 모집글이 지워져도 알림은 남긴다.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS recruitment_id UUID REFERENCES recruitments(id) ON DELETE SET NULL;

-- 작성자가 부원에게 보낸 '제안'을 받았을 때의 알림 종류 (기존 값: APPLICATION_RECEIVED/ACCEPTED/REJECTED 등)
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'PROPOSAL_RECEIVED';

-- Down Migration
-- enum 값은 PostgreSQL 에서 삭제할 수 없어 그대로 둔다
ALTER TABLE notifications DROP COLUMN IF EXISTS recruitment_id;
