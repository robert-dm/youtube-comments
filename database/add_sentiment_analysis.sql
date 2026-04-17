-- Sentiment Analysis Tables Migration
-- This migration adds configurable sentiment analysis functionality

-- 1. Sentiment Keywords Table
-- Stores keywords/phrases and their sentiment weights
CREATE TABLE IF NOT EXISTS sentiment_keywords (
    id SERIAL PRIMARY KEY,
    keyword VARCHAR(100) NOT NULL UNIQUE,
    weight DECIMAL(4, 2) NOT NULL, -- Range: -10.00 to +10.00
    category VARCHAR(20) NOT NULL, -- 'positive', 'negative', 'neutral'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster keyword lookups
CREATE INDEX idx_sentiment_keywords_active ON sentiment_keywords(is_active) WHERE is_active = TRUE;

-- 2. Sentiment Configuration Table
-- Stores configurable parameters for sentiment calculation
CREATE TABLE IF NOT EXISTS sentiment_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(50) NOT NULL UNIQUE,
    config_value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Comment Sentiments Table
-- Stores sentiment analysis results for each comment
CREATE TABLE IF NOT EXISTS comment_sentiments (
    id SERIAL PRIMARY KEY,
    comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    raw_score DECIMAL(10, 2) NOT NULL, -- Sum of all keyword weights found
    normalized_score DECIMAL(5, 2) NOT NULL, -- Normalized to -100 to +100
    sentiment VARCHAR(20) NOT NULL, -- 'positive', 'negative', 'neutral'
    matched_keywords JSONB, -- Array of matched keywords with their weights
    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comment_id)
);

-- Index for querying sentiments by comment
CREATE INDEX idx_comment_sentiments_comment_id ON comment_sentiments(comment_id);
CREATE INDEX idx_comment_sentiments_sentiment ON comment_sentiments(sentiment);

-- 4. Video Sentiments Table
-- Stores aggregated sentiment for each video
CREATE TABLE IF NOT EXISTS video_sentiments (
    id SERIAL PRIMARY KEY,
    video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
    total_comments INTEGER NOT NULL DEFAULT 0,
    positive_count INTEGER NOT NULL DEFAULT 0,
    negative_count INTEGER NOT NULL DEFAULT 0,
    neutral_count INTEGER NOT NULL DEFAULT 0,
    positive_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    negative_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    neutral_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    average_score DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    overall_sentiment VARCHAR(20) NOT NULL, -- 'positive', 'negative', 'neutral', 'mixed'
    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(video_id)
);

-- Index for querying video sentiments
CREATE INDEX idx_video_sentiments_video_id ON video_sentiments(video_id);
CREATE INDEX idx_video_sentiments_overall ON video_sentiments(overall_sentiment);

-- Insert default sentiment configuration
INSERT INTO sentiment_config (config_key, config_value, description) VALUES
('positive_threshold', '5.0', 'Minimum score to classify comment as positive'),
('negative_threshold', '-5.0', 'Maximum score to classify comment as negative'),
('normalization_factor', '10.0', 'Factor to normalize scores to -100 to +100 range'),
('case_sensitive', 'false', 'Whether keyword matching should be case-sensitive'),
('min_confidence', '0.5', 'Minimum confidence level for sentiment classification')
ON CONFLICT (config_key) DO NOTHING;

-- Insert default sentiment keywords (starter set - admin can modify these)
INSERT INTO sentiment_keywords (keyword, weight, category) VALUES
-- Positive keywords
('love', 10.0, 'positive'),
('great', 8.0, 'positive'),
('awesome', 9.0, 'positive'),
('amazing', 9.0, 'positive'),
('excellent', 8.5, 'positive'),
('fantastic', 9.0, 'positive'),
('wonderful', 8.0, 'positive'),
('perfect', 9.5, 'positive'),
('best', 9.0, 'positive'),
('good', 6.0, 'positive'),
('nice', 5.0, 'positive'),
('helpful', 7.0, 'positive'),
('thanks', 6.0, 'positive'),
('thank you', 7.0, 'positive'),
('appreciate', 7.5, 'positive'),
('brilliant', 9.0, 'positive'),
('outstanding', 9.5, 'positive'),
('superb', 9.0, 'positive'),
('like', 4.0, 'positive'),
('enjoyed', 7.0, 'positive'),

-- Negative keywords
('hate', -10.0, 'negative'),
('terrible', -9.0, 'negative'),
('awful', -9.0, 'negative'),
('horrible', -9.0, 'negative'),
('bad', -7.0, 'negative'),
('worst', -10.0, 'negative'),
('poor', -6.0, 'negative'),
('disappointed', -7.0, 'negative'),
('disappointing', -7.0, 'negative'),
('useless', -8.0, 'negative'),
('waste', -8.0, 'negative'),
('boring', -6.0, 'negative'),
('stupid', -8.0, 'negative'),
('sucks', -8.0, 'negative'),
('dislike', -6.0, 'negative'),
('pathetic', -9.0, 'negative'),
('garbage', -9.0, 'negative'),
('trash', -8.0, 'negative'),
('annoying', -7.0, 'negative'),
('frustrating', -7.0, 'negative'),

-- Neutral keywords (can be used to identify neutral comments)
('okay', 0.0, 'neutral'),
('ok', 0.0, 'neutral'),
('fine', 0.0, 'neutral'),
('average', 0.0, 'neutral'),
('meh', 0.0, 'neutral')
ON CONFLICT (keyword) DO NOTHING;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_sentiment_keywords_updated_at ON sentiment_keywords;
CREATE TRIGGER update_sentiment_keywords_updated_at
    BEFORE UPDATE ON sentiment_keywords
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sentiment_config_updated_at ON sentiment_config;
CREATE TRIGGER update_sentiment_config_updated_at
    BEFORE UPDATE ON sentiment_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- View for easy sentiment analysis overview
CREATE OR REPLACE VIEW sentiment_overview AS
SELECT
    v.video_id,
    v.title,
    v.channel_name,
    v.published_at,
    vs.total_comments,
    vs.positive_count,
    vs.negative_count,
    vs.neutral_count,
    vs.positive_percentage,
    vs.negative_percentage,
    vs.neutral_percentage,
    vs.average_score,
    vs.overall_sentiment,
    vs.analyzed_at
FROM videos v
LEFT JOIN video_sentiments vs ON v.id = vs.video_id
ORDER BY vs.analyzed_at DESC;
