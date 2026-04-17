-- Migration: Add last_comment_date to videos table for incremental updates

ALTER TABLE videos ADD COLUMN IF NOT EXISTS last_comment_date TIMESTAMP;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS has_transcript BOOLEAN DEFAULT FALSE;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;

-- Update existing videos to set has_transcript flag based on existing transcripts
UPDATE videos v
SET has_transcript = TRUE
WHERE EXISTS (
    SELECT 1 FROM transcripts t WHERE t.video_id = v.id
);
