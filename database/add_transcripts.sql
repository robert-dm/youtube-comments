-- Migration: Add transcripts table for storing video transcripts

-- Table for storing video transcripts
CREATE TABLE IF NOT EXISTS transcripts (
    id SERIAL PRIMARY KEY,
    video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    start_time DECIMAL(10, 3),
    duration DECIMAL(10, 3),
    language VARCHAR(10),
    text_searchable tsvector
);

-- Create index for full-text search on transcripts
CREATE INDEX IF NOT EXISTS transcripts_search_idx ON transcripts USING GIN(text_searchable);

-- Create index for video_id lookups
CREATE INDEX IF NOT EXISTS transcripts_video_id_idx ON transcripts(video_id);

-- Function to automatically update the text_searchable column
CREATE OR REPLACE FUNCTION transcripts_search_trigger() RETURNS trigger AS $$
BEGIN
    NEW.text_searchable := to_tsvector('english', COALESCE(NEW.text, ''));
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Trigger to update text_searchable on insert or update
DROP TRIGGER IF EXISTS transcripts_search_update ON transcripts;
CREATE TRIGGER transcripts_search_update
    BEFORE INSERT OR UPDATE ON transcripts
    FOR EACH ROW
    EXECUTE FUNCTION transcripts_search_trigger();
