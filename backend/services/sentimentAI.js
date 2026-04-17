const Sentiment = require('sentiment');
const db = require('../config/database');

class AISentimentAnalyzer {
    constructor() {
        // Use local sentiment analysis library (works offline, supports multiple languages)
        this.sentiment = new Sentiment();

        // Multilingual sentiment lexicons
        this.spanishLexicon = {
            // Negative words
            'malo': -3,
            'terrible': -4,
            'horrible': -4,
            'pésimo': -5,
            'malísimo': -5,
            'peor': -4,
            'basura': -4,
            'odio': -5,
            'aburrido': -3,
            'decepcionante': -3,
            'decepcionado': -3,
            'inútil': -4,
            'ridículo': -3,
            'tonto': -3,
            'tontamente': -3,
            'estúpido': -4,
            'cansado': -2,
            'cansados': -2,
            'molesto': -2,
            'molesta': -2,
            'fastidioso': -3,
            'desastre': -4,
            'patético': -4,
            'baja calidad': -3,
            'bajísima calidad': -5,
            'mala calidad': -3,
            'no me gusta': -3,
            'no sirve': -3,
            'porquería': -4,
            'muy malo': -4,
            'calidad baja': -3,

            // Positive words
            'excelente': 4,
            'increíble': 4,
            'maravilloso': 4,
            'fantástico': 4,
            'genial': 3,
            'bueno': 2,
            'muy bueno': 4,
            'perfecto': 5,
            'magnífico': 4,
            'hermoso': 3,
            'bonito': 2,
            'mejor': 3,
            'gracias': 2,
            'muchas gracias': 3,
            'me encanta': 4,
            'me gusta': 3,
            'amor': 3,
            'amo': 4,
            'brillante': 3,
            'espectacular': 4,
            'impresionante': 4,
            'estupendo': 3,
            'interesante': 2,
            'interesantes': 2
        };

        console.log('AI Sentiment Analyzer initialized (Multilingual - Local Processing)');
        console.log('Supports: English, Spanish, Portuguese');
    }

    async analyzeComment(commentText) {
        try {
            // Analyze with base sentiment (English)
            const baseResult = this.sentiment.analyze(commentText);

            // Also analyze with Spanish lexicon
            const spanishResult = this.sentiment.analyze(commentText, {
                extras: this.spanishLexicon
            });

            // Use the result with higher absolute score (more confident)
            const result = Math.abs(spanishResult.score) > Math.abs(baseResult.score)
                ? spanishResult
                : baseResult;

            // Calculate sentiment
            let sentiment;
            let rawScore = result.comparative * 10; // Scale to -10 to +10

            if (result.score > 0) {
                sentiment = 'positive';
            } else if (result.score < 0) {
                sentiment = 'negative';
            } else {
                sentiment = 'neutral';
            }

            // Calculate confidence based on score magnitude
            const confidence = Math.min(1, Math.abs(result.comparative) * 2);

            // Normalize to -100 to +100 scale
            const normalizedScore = parseFloat((rawScore * 10).toFixed(2));

            return {
                rawScore: parseFloat(rawScore.toFixed(2)),
                normalizedScore: Math.max(-100, Math.min(100, normalizedScore)),
                sentiment: sentiment,
                confidence: parseFloat(confidence.toFixed(4)),
                matchedKeywords: [{
                    keyword: 'AI Analysis (Local)',
                    weight: rawScore,
                    count: 1,
                    contribution: rawScore,
                    confidence: confidence,
                    details: {
                        score: result.score,
                        comparative: result.comparative,
                        positive: result.positive,
                        negative: result.negative,
                        tokens: result.tokens.length
                    }
                }]
            };

        } catch (error) {
            console.error('Error in AI sentiment analysis:', error.message);

            // Fallback to neutral if analysis fails
            return {
                rawScore: 0,
                normalizedScore: 0,
                sentiment: 'neutral',
                confidence: 0,
                matchedKeywords: [{
                    keyword: 'AI Error - Fallback',
                    weight: 0,
                    count: 1,
                    contribution: 0,
                    error: error.message
                }]
            };
        }
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
}

module.exports = new AISentimentAnalyzer();
