-- Up Migration
-- 새 모집글이 올라왔을 때 관심 분야/역할이 맞는 부원에게 보내는 알림 종류
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'RECRUITMENT_NEW';

-- Down Migration
-- enum 값은 PostgreSQL 에서 삭제할 수 없어 그대로 둔다
SELECT 1;
