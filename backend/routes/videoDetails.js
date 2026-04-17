const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Get detailed video information with all comments and sentiment
router.get('/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;

        // Get video info
        const videoResult = await db.query(
            'SELECT * FROM videos WHERE video_id = $1',
            [videoId]
        );

        if (videoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const video = videoResult.rows[0];

        // Get video sentiment summary
        const sentimentResult = await db.query(
            'SELECT * FROM video_sentiments WHERE video_id = $1',
            [video.id]
        );

        const sentiment = sentimentResult.rows[0] || null;

        // Get all comments with their sentiment (only top-level comments first)
        const commentsResult = await db.query(`
            SELECT
                c.id,
                c.comment_id,
                c.author,
                c.text,
                c.published_at,
                c.like_count,
                c.parent_id,
                cs.sentiment,
                cs.raw_score,
                cs.normalized_score,
                cs.matched_keywords
            FROM comments c
            LEFT JOIN comment_sentiments cs ON c.id = cs.comment_id
            WHERE c.video_id = $1 AND c.parent_id IS NULL
            ORDER BY c.published_at DESC
        `, [video.id]);

        // Get all replies
        const repliesResult = await db.query(`
            SELECT
                c.id,
                c.comment_id,
                c.author,
                c.text,
                c.published_at,
                c.like_count,
                c.parent_id,
                cs.sentiment,
                cs.raw_score,
                cs.normalized_score
            FROM comments c
            LEFT JOIN comment_sentiments cs ON c.id = cs.comment_id
            WHERE c.video_id = $1 AND c.parent_id IS NOT NULL
            ORDER BY c.published_at ASC
        `, [video.id]);

        // Group replies by parent comment
        const repliesMap = {};
        repliesResult.rows.forEach(reply => {
            if (!repliesMap[reply.parent_id]) {
                repliesMap[reply.parent_id] = [];
            }
            repliesMap[reply.parent_id].push(reply);
        });

        // Attach replies to parent comments
        const comments = commentsResult.rows.map(comment => ({
            ...comment,
            replies: repliesMap[comment.id] || []
        }));

        // Calculate sentiment distribution
        const allComments = [...commentsResult.rows, ...repliesResult.rows];
        const sentimentDistribution = {
            positive: allComments.filter(c => c.sentiment === 'positive').length,
            negative: allComments.filter(c => c.sentiment === 'negative').length,
            neutral: allComments.filter(c => c.sentiment === 'neutral').length,
            total: allComments.length
        };

        res.json({
            video: {
                videoId: video.video_id,
                title: video.title,
                channelName: video.channel_name,
                fetchedAt: video.fetched_at,
                hasTranscript: video.has_transcript
            },
            sentiment,
            sentimentDistribution,
            comments,
            totalComments: allComments.length,
            topLevelComments: comments.length,
            totalReplies: repliesResult.rows.length
        });

    } catch (error) {
        console.error('Error fetching video details:', error);
        res.status(500).json({ error: 'Failed to fetch video details' });
    }
});

module.exports = router;
