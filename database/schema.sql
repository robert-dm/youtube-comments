-- YouTube Comments Search Database Schema

-- Create database (run separately if needed)
-- CREATE DATABASE youtube_comments_search;

-- Table for storing YouTube videos
CREATE TABLE IF NOT EXISTS videos (
    id SERIAL PRIMARY KEY,
    video_id VARCHAR(20) UNIQUE NOT NULL,
    title VARCHAR(500),
    channel_name VARCHAR(200),
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for storing comments and replies
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
    comment_id VARCHAR(50) UNIQUE NOT NULL,
    author VARCHAR(200) NOT NULL,
    text TEXT NOT NULL,
    published_at TIMESTAMP NOT NULL,
    like_count INTEGER DEFAULT 0,
    parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    text_searchable tsvector
);

-- Create index for full-text search
CREATE INDEX IF NOT EXISTS comments_search_idx ON comments USING GIN(text_searchable);

-- Create index for video_id lookups
CREATE INDEX IF NOT EXISTS comments_video_id_idx ON comments(video_id);

-- Create index for parent_id to speed up reply queries
CREATE INDEX IF NOT EXISTS comments_parent_id_idx ON comments(parent_id);

-- Function to automatically update the text_searchable column
CREATE OR REPLACE FUNCTION comments_search_trigger() RETURNS trigger AS $$
BEGIN
    NEW.text_searchable := to_tsvector('english', COALESCE(NEW.text, '') || ' ' || COALESCE(NEW.author, ''));
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Trigger to update text_searchable on insert or update
DROP TRIGGER IF EXISTS comments_search_update ON comments;
CREATE TRIGGER comments_search_update
    BEFORE INSERT OR UPDATE ON comments
    FOR EACH ROW
    EXECUTE FUNCTION comments_search_trigger();
