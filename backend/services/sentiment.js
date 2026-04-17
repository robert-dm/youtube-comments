const db = require('../config/database');

class SentimentAnalyzer {
    constructor() {
        this.keywords = null;
        this.config = null;
        this.lastCacheUpdate = null;
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    async loadKeywordsAndConfig() {
        const now = Date.now();
        if (this.keywords && this.config && this.lastCacheUpdate && (now - this.lastCacheUpdate < this.cacheTimeout)) {
            return;
        }

        // Load active keywords
        const keywordsResult = await db.query(
            'SELECT keyword, weight, category FROM sentiment_keywords WHERE is_active = TRUE'
        );
        this.keywords = keywordsResult.rows;

        // Load configuration
        const configResult = await db.query('SELECT config_key, config_value FROM sentiment_config');
        this.config = {};
        configResult.rows.forEach(row => {
            this.config[row.config_key] = row.config_value;
        });

        this.lastCacheUpdate = now;
    }

    async analyzeComment(commentText) {
        await this.loadKeywordsAndConfig();

        const caseSensitive = this.config.case_sensitive === 'true';
        const textToAnalyze = caseSensitive ? commentText : commentText.toLowerCase();

        let rawScore = 0;
        const matchedKeywords = [];

        // Find all matching keywords
        for (const keywordData of this.keywords) {
            const keyword = caseSensitive ? keywordData.keyword : keywordData.keyword.toLowerCase();

            // Count occurrences of this keyword
            const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            const matches = textToAnalyze.match(regex);

            if (matches && matches.length > 0) {
                const count = matches.length;
                const weightedScore = parseFloat(keywordData.weight) * count;
                rawScore += weightedScore;

                matchedKeywords.push({
                    keyword: keywordData.keyword,
                    weight: parseFloat(keywordData.weight),
                    count: count,
                    contribution: weightedScore
                });
            }
        }

        // Normalize score to -100 to +100 range
        const normalizationFactor = parseFloat(this.config.normalization_factor || 10.0);
        const normalizedScore = Math.max(-100, Math.min(100, rawScore * normalizationFactor));

        // Determine sentiment based on thresholds
        const positiveThreshold = parseFloat(this.config.positive_threshold || 5.0);
        const negativeThreshold = parseFloat(this.config.negative_threshold || -5.0);

        let sentiment;
        if (rawScore >= positiveThreshold) {
            sentiment = 'positive';
        } else if (rawScore <= negativeThreshold) {
            sentiment = 'negative';
        } else {
            sentiment = 'neutral';
        }

        return {
            rawScore: parseFloat(rawScore.toFixed(2)),
            normalizedScore: parseFloat(normalizedScore.toFixed(2)),
            sentiment,
            matchedKeywords
        };
    }

    async saveBulkCommentSentiments(sentiments) {
        if (!sentiments || sentiments.length === 0) return;

        const values = [];
        const params = [];
        let paramIndex = 1;

        for (const sentiment of sentiments) {
            values.push(
                `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`
            );
            params.push(
                sentiment.commentId,
                sentiment.rawScore,
                sentiment.normalizedScore,
                sentiment.sentiment,
                JSON.stringify(sentiment.matchedKeywords)
            );
            paramIndex += 5;
        }

        const query = `
            INSERT INTO comment_sentiments (comment_id, raw_score, normalized_score, sentiment, matched_keywords)
            VALUES ${values.join(', ')}
            ON CONFLICT (comment_id)
            DO UPDATE SET
                raw_score = EXCLUDED.raw_score,
                normalized_score = EXCLUDED.normalized_score,
                sentiment = EXCLUDED.sentiment,
                matched_keywords = EXCLUDED.matched_keywords,
                analyzed_at = CURRENT_TIMESTAMP
        `;

        await db.query(query, params);
    }

    async calculateVideoSentiment(videoId) {
        // Get all comment sentiments for this video
        const result = await db.query(`
            SELECT cs.sentiment, cs.raw_score
            FROM comment_sentiments cs
            INNER JOIN comments c ON cs.comment_id = c.id
            WHERE c.video_id = $1
        `, [videoId]);

        const sentiments = result.rows;
        const totalComments = sentiments.length;

        if (totalComments === 0) {
            return null;
        }

        // Count sentiments by category
        let positiveCount = 0;
        let negativeCount = 0;
        let neutralCount = 0;
        let totalScore = 0;

        sentiments.forEach(s => {
            totalScore += parseFloat(s.raw_score);
            if (s.sentiment === 'positive') positiveCount++;
            else if (s.sentiment === 'negative') negativeCount++;
            else neutralCount++;
        });

        // Calculate percentages
        const positivePercentage = ((positiveCount / totalComments) * 100).toFixed(2);
        const negativePercentage = ((negativeCount / totalComments) * 100).toFixed(2);
        const neutralPercentage = ((neutralCount / totalComments) * 100).toFixed(2);
        const averageScore = (totalScore / totalComments).toFixed(2);

        // Determine overall sentiment
        let overallSentiment;
        const dominantPercentage = Math.max(positivePercentage, negativePercentage, neutralPercentage);

        if (dominantPercentage < 40) {
            overallSentiment = 'mixed';
        } else if (positivePercentage >= dominantPercentage) {
            overallSentiment = 'positive';
        } else if (negativePercentage >= dominantPercentage) {
            overallSentiment = 'negative';
        } else {
            overallSentiment = 'neutral';
        }

        // Save to database
        await db.query(`
            INSERT INTO video_sentiments (
                video_id, total_comments, positive_count, negative_count, neutral_count,
                positive_percentage, negative_percentage, neutral_percentage,
                average_score, overall_sentiment
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (video_id)
            DO UPDATE SET
                total_comments = EXCLUDED.total_comments,
                positive_count = EXCLUDED.positive_count,
                negative_count = EXCLUDED.negative_count,
                neutral_count = EXCLUDED.neutral_count,
                positive_percentage = EXCLUDED.positive_percentage,
                negative_percentage = EXCLUDED.negative_percentage,
                neutral_percentage = EXCLUDED.neutral_percentage,
                average_score = EXCLUDED.average_score,
                overall_sentiment = EXCLUDED.overall_sentiment,
                analyzed_at = CURRENT_TIMESTAMP
        `, [
            videoId,
            totalComments,
            positiveCount,
            negativeCount,
            neutralCount,
            positivePercentage,
            negativePercentage,
            neutralPercentage,
            averageScore,
            overallSentiment
        ]);

        return {
            totalComments,
            positiveCount,
            negativeCount,
            neutralCount,
            positivePercentage: parseFloat(positivePercentage),
            negativePercentage: parseFloat(negativePercentage),
            neutralPercentage: parseFloat(neutralPercentage),
            averageScore: parseFloat(averageScore),
            overallSentiment
        };
    }

    async getVideoSentiment(videoId) {
        const result = await db.query(
            'SELECT * FROM video_sentiments WHERE video_id = $1',
            [videoId]
        );
        return result.rows[0] || null;
    }

    async getAllKeywords() {
        const result = await db.query(
            'SELECT * FROM sentiment_keywords ORDER BY category, weight DESC'
        );
        return result.rows;
    }

    async getConfig() {
        const result = await db.query('SELECT * FROM sentiment_config ORDER BY config_key');
        return result.rows;
    }

    async updateKeyword(id, data) {
        const { keyword, weight, category, is_active } = data;
        const result = await db.query(
            `UPDATE sentiment_keywords
             SET keyword = COALESCE($1, keyword),
                 weight = COALESCE($2, weight),
                 category = COALESCE($3, category),
                 is_active = COALESCE($4, is_active)
             WHERE id = $5
             RETURNING *`,
            [keyword, weight, category, is_active, id]
        );

        // Invalidate cache
        this.lastCacheUpdate = null;

        return result.rows[0];
    }

    async addKeyword(keyword, weight, category) {
        const result = await db.query(
            'INSERT INTO sentiment_keywords (keyword, weight, category) VALUES ($1, $2, $3) RETURNING *',
            [keyword, weight, category]
        );

        // Invalidate cache
        this.lastCacheUpdate = null;

        return result.rows[0];
    }

    async deleteKeyword(id) {
        await db.query('DELETE FROM sentiment_keywords WHERE id = $1', [id]);

        // Invalidate cache
        this.lastCacheUpdate = null;
    }

    async updateConfig(configKey, configValue) {
        const result = await db.query(
            `UPDATE sentiment_config
             SET config_value = $1
             WHERE config_key = $2
             RETURNING *`,
            [configValue, configKey]
        );

        // Invalidate cache
        this.lastCacheUpdate = null;

        return result.rows[0];
    }
}

module.exports = new SentimentAnalyzer();
