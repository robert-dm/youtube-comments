const express = require('express');
const router = express.Router();
const db = require('../config/database');

router.post('/search', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        const searchQuery = query.trim().split(/\s+/).join(' & ');

        const result = await db.query(
            `SELECT
                c.id,
                c.comment_id,
                c.author,
                c.text,
                c.published_at,
                c.like_count,
                c.parent_id,
                parent.id as parent_db_id,
                parent.author as parent_author,
                parent.text as parent_text,
                parent.published_at as parent_published_at,
                v.video_id,
                v.title as video_title,
                v.channel_name,
                ts_rank(c.text_searchable, to_tsquery('english', $1)) as rank
             FROM comments c
             LEFT JOIN comments parent ON c.parent_id = parent.id
             LEFT JOIN videos v ON c.video_id = v.id
             WHERE c.text_searchable @@ to_tsquery('english', $1)
             ORDER BY rank DESC, c.published_at DESC
             LIMIT 100`,
            [searchQuery]
        );

        const resultsWithReplies = [];
        const processedIds = new Set();

        for (const row of result.rows) {
            if (processedIds.has(row.id)) {
                continue;
            }

            const repliesResult = await db.query(
                'SELECT id, comment_id, author, text, published_at, like_count FROM comments WHERE parent_id = $1 ORDER BY published_at ASC',
                [row.id]
            );

            const commentData = {
                id: row.id,
                commentId: row.comment_id,
                author: row.author,
                text: row.text,
                publishedAt: row.published_at,
                likeCount: row.like_count,
                videoId: row.video_id,
                videoTitle: row.video_title,
                channelName: row.channel_name,
                replies: repliesResult.rows.map(reply => ({
                    id: reply.id,
                    commentId: reply.comment_id,
                    author: reply.author,
                    text: reply.text,
                    publishedAt: reply.published_at,
                    likeCount: reply.like_count
                }))
            };

            if (row.parent_id) {
                commentData.parent = {
                    id: row.parent_db_id,
                    author: row.parent_author,
                    text: row.parent_text,
                    publishedAt: row.parent_published_at
                };
            }

            resultsWithReplies.push(commentData);
            processedIds.add(row.id);
        }

        const transcriptResult = await db.query(
            `SELECT
                t.id,
                t.text,
                t.start_time,
                t.duration,
                v.video_id,
                v.title as video_title,
                v.channel_name,
                ts_rank(t.text_searchable, to_tsquery('english', $1)) as rank
             FROM transcripts t
             LEFT JOIN videos v ON t.video_id = v.id
             WHERE t.text_searchable @@ to_tsquery('english', $1)
             ORDER BY rank DESC
             LIMIT 50`,
            [searchQuery]
        );

        const transcriptMatches = transcriptResult.rows.map(row => ({
            id: row.id,
            text: row.text,
            startTime: row.start_time,
            duration: row.duration,
            videoId: row.video_id,
            videoTitle: row.video_title,
            channelName: row.channel_name,
            type: 'transcript'
        }));

        res.json({
            query: query,
            commentCount: resultsWithReplies.length,
            transcriptCount: transcriptMatches.length,
            totalCount: resultsWithReplies.length + transcriptMatches.length,
            commentResults: resultsWithReplies,
            transcriptResults: transcriptMatches
        });

    } catch (error) {
        console.error('Error in search:', error);
        res.status(500).json({ error: 'Search failed: ' + error.message });
    }
});

module.exports = router;
