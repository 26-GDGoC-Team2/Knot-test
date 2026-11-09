ALTER TABLE notification_settings 
ADD COLUMN IF NOT EXISTS recruitment_range TEXT NOT NULL DEFAULT 'ALL';
