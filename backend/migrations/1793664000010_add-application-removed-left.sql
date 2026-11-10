-- Up Migration
-- 팀원 내보내기/팀 나가기 이력을 구분하기 위해 지원 상태에 REMOVED(내보냄), LEFT(스스로 나감) 추가
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'REMOVED';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'LEFT';

-- Down Migration
-- enum 값은 삭제할 수 없어 남겨 두고, 새 상태의 행만 기존 상태(CANCELED)로 되돌린다
UPDATE applications SET status = 'CANCELED' WHERE status::text IN ('REMOVED', 'LEFT');
