const db = require('../config/database');

class LLMSentimentAnalyzer {
    constructor() {
        this.config = null;
        this.client = null;
        this.lastConfigLoad = null;
        this.configCacheTTL = 60 * 1000; // 1 minute
    }

    async loadConfig() {
        const now = Date.now();
        if (this.config && this.lastConfigLoad && (now - this.lastConfigLoad < this.configCacheTTL)) {
            return this.config;
        }

        const result = await db.query(
            "SELECT config_key, config_value FROM sentiment_config WHERE config_key LIKE 'llm_%'"
        );

        this.config = {};
        result.rows.forEach(row => {
            this.config[row.config_key] = row.config_value;
        });

        this.lastConfigLoad = now;
        this.client = null; // Reset client on config reload
        return this.config;
    }

    async isEnabled() {
        const config = await this.loadConfig();
        return config.llm_enabled === 'true' && config.llm_provider && config.llm_api_key;
    }

    getClient() {
        if (this.client) return this.client;

        const provider = this.config.llm_provider;
        const apiKey = this.config.llm_api_key;

        if (provider === 'openai') {
            const OpenAI = require('openai');
            this.client = new OpenAI({ apiKey });
        } else if (provider === 'anthropic') {
            const Anthropic = require('@anthropic-ai/sdk');
            this.client = new Anthropic({ apiKey });
        }

        return this.client;
    }

    async analyzeComment(commentText) {
        const config = await this.loadConfig();
        const provider = config.llm_provider;
        const model = config.llm_model;

        const prompt = `Analyze the sentiment of this YouTube comment. Respond ONLY with a JSON object (no markdown, no code blocks) with these exact fields:
- "sentiment": one of "positive", "negative", or "neutral"
- "score": a number from -10 to 10 (negative = negative sentiment, positive = positive sentiment)
- "confidence": a number from 0 to 1

Comment: "${commentText.replace(/"/g, '\\"').substring(0, 500)}"`;

        try {
            let result;

            if (provider === 'openai') {
                result = await this.callOpenAI(model, prompt);
            } else if (provider === 'anthropic') {
                result = await this.callAnthropic(model, prompt);
            } else {
                throw new Error(`Unknown LLM provider: ${provider}`);
            }

            const parsed = JSON.parse(result);

            const rawScore = parseFloat(parsed.score) || 0;
            const normalizedScore = Math.max(-100, Math.min(100, rawScore * 10));

            return {
                rawScore: parseFloat(rawScore.toFixed(2)),
                normalizedScore: parseFloat(normalizedScore.toFixed(2)),
                sentiment: parsed.sentiment || 'neutral',
                confidence: parseFloat(parsed.confidence) || 0.5,
                matchedKeywords: [{
                    keyword: `LLM (${provider}/${model})`,
                    weight: rawScore,
                    count: 1,
                    contribution: rawScore,
                    confidence: parseFloat(parsed.confidence) || 0.5
                }]
            };

        } catch (error) {
            console.error(`LLM sentiment error (${provider}):`, error.message);
            return {
                rawScore: 0,
                normalizedScore: 0,
                sentiment: 'neutral',
                confidence: 0,
                matchedKeywords: [{
                    keyword: `LLM Error (${provider})`,
                    weight: 0,
                    count: 1,
                    contribution: 0,
                    error: error.message
                }]
            };
        }
    }

    async callOpenAI(model, prompt) {
        const client = this.getClient();
        const response = await client.chat.completions.create({
            model: model || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You are a sentiment analysis assistant. Respond only with valid JSON.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0,
            max_tokens: 100
        });

        return response.choices[0].message.content.trim();
    }

    async callAnthropic(model, prompt) {
        const client = this.getClient();
        const response = await client.messages.create({
            model: model || 'claude-haiku-4-5-20251001',
            max_tokens: 100,
            messages: [
                { role: 'user', content: prompt }
            ],
            system: 'You are a sentiment analysis assistant. Respond only with valid JSON.'
        });

        return response.content[0].text.trim();
    }

    async analyzeBatch(comments, batchSize = 10) {
        const results = [];
        for (let i = 0; i < comments.length; i += batchSize) {
            const batch = comments.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(c => this.analyzeComment(c.text))
            );
            for (let j = 0; j < batch.length; j++) {
                results.push({
                    commentId: batch[j].id,
                    ...batchResults[j]
                });
            }
        }
        return results;
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
        const result = await db.query(`
            SELECT cs.sentiment, cs.raw_score
            FROM comment_sentiments cs
            INNER JOIN comments c ON cs.comment_id = c.id
            WHERE c.video_id = $1
        `, [videoId]);

        const sentiments = result.rows;
        const totalComments = sentiments.length;

        if (totalComments === 0) return null;

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

        const positivePercentage = parseFloat(((positiveCount / totalComments) * 100).toFixed(2));
        const negativePercentage = parseFloat(((negativeCount / totalComments) * 100).toFixed(2));
        const neutralPercentage = parseFloat(((neutralCount / totalComments) * 100).toFixed(2));
        const averageScore = parseFloat((totalScore / totalComments).toFixed(2));

        let overallSentiment;
        const opinionatedCount = positiveCount + negativeCount;

        if (opinionatedCount === 0) {
            overallSentiment = 'neutral';
        } else {
            const positiveRatio = positiveCount / opinionatedCount;
            if (positiveRatio >= 0.6) {
                overallSentiment = 'positive';
            } else if (positiveRatio <= 0.4) {
                overallSentiment = 'negative';
            } else {
                overallSentiment = 'mixed';
            }
        }

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
            videoId, totalComments, positiveCount, negativeCount, neutralCount,
            positivePercentage, negativePercentage, neutralPercentage,
            averageScore, overallSentiment
        ]);

        return {
            totalComments,
            positiveCount, negativeCount, neutralCount,
            positivePercentage: parseFloat(positivePercentage),
            negativePercentage: parseFloat(negativePercentage),
            neutralPercentage: parseFloat(neutralPercentage),
            averageScore: parseFloat(averageScore),
            overallSentiment
        };
    }

    invalidateConfig() {
        this.config = null;
        this.client = null;
        this.lastConfigLoad = null;
    }
}

module.exports = new LLMSentimentAnalyzer();
