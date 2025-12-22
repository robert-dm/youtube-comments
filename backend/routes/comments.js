const express = require('express');
const router = express.Router();
const db = require('../config/database');
const youtube = require('../services/youtube');
const sentimentAnalyzer = require('../services/sentiment');

router.post('/fetch-comments', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'YouTube URL is required' });
        }

        const videoId = youtube.extractVideoId(url);
        if (!videoId) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        const videoDetails = await youtube.getVideoDetails(videoId);
        if (!videoDetails) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const existingVideo = await db.query(
            'SELECT id, has_transcript, last_comment_date FROM videos WHERE video_id = $1',
            [videoId]
        );

        let dbVideoId;
        let hasTranscript = false;
        let isUpdate = false;

        if (existingVideo.rows.length > 0) {
            dbVideoId = existingVideo.rows[0].id;
            hasTranscript = existingVideo.rows[0].has_transcript || false;
            isUpdate = true;

            await db.query(
                'UPDATE videos SET title = $1, channel_name = $2, fetched_at = CURRENT_TIMESTAMP WHERE id = $3',
                [videoDetails.title, videoDetails.channelName, dbVideoId]
            );
        } else {
            const insertResult = await db.query(
                'INSERT INTO videos (video_id, title, channel_name) VALUES ($1, $2, $3) RETURNING id',
                [videoId, videoDetails.title, videoDetails.channelName]
            );
            dbVideoId = insertResult.rows[0].id;
        }

        const comments = await youtube.getAllComments(videoId);

        const commentIdMap = new Map();
        let newCommentsCount = 0;

        for (const comment of comments) {
            const result = await db.query(
                `INSERT INTO comments (video_id, comment_id, author, text, published_at, like_count, parent_id)
                 VALUES ($1, $2, $3, $4, $5, $6, NULL)
                 ON CONFLICT (comment_id) DO UPDATE SET
                 author = EXCLUDED.author,
                 text = EXCLUDED.text,
                 published_at = EXCLUDED.published_at,
                 like_count = EXCLUDED.like_count
                 RETURNING id, (xmax = 0) AS inserted`,
                [dbVideoId, comment.commentId, comment.author, comment.text, comment.publishedAt, comment.likeCount]
            );

            commentIdMap.set(comment.commentId, result.rows[0].id);
            if (result.rows[0].inserted) {
                newCommentsCount++;
            }
        }

        for (const comment of comments) {
            if (comment.parentId) {
                const parentDbId = commentIdMap.get(comment.parentId);
                const currentDbId = commentIdMap.get(comment.commentId);

                if (parentDbId && currentDbId) {
                    await db.query(
                        'UPDATE comments SET parent_id = $1 WHERE id = $2',
                        [parentDbId, currentDbId]
                    );
                }
            }
        }

        if (comments.length > 0) {
            const latestComment = comments.reduce((latest, comment) => {
                return new Date(comment.publishedAt) > new Date(latest.publishedAt) ? comment : latest;
            });

            await db.query(
                'UPDATE videos SET last_comment_date = $1 WHERE id = $2',
                [latestComment.publishedAt, dbVideoId]
            );
        }

        let transcriptCount = 0;
        let transcriptStatus = 'existing';

        if (!hasTranscript) {
            const transcript = await youtube.getTranscript(videoId);

            if (transcript && transcript.length > 0) {
                for (const segment of transcript) {
                    await db.query(
                        'INSERT INTO transcripts (video_id, text, start_time, duration, language) VALUES ($1, $2, $3, $4, $5)',
                        [dbVideoId, segment.text, segment.offset / 1000, segment.duration / 1000, segment.language || 'unknown']
                    );
                    transcriptCount++;
                }

                await db.query(
                    'UPDATE videos SET has_transcript = TRUE WHERE id = $1',
                    [dbVideoId]
                );
                transcriptStatus = 'fetched';
            } else {
                transcriptStatus = 'unavailable';
            }
        } else {
            const existingTranscripts = await db.query(
                'SELECT COUNT(*) as count FROM transcripts WHERE video_id = $1',
                [dbVideoId]
            );
            transcriptCount = parseInt(existingTranscripts.rows[0].count);
        }

        // Perform sentiment analysis on all comments
        console.log('Starting sentiment analysis for', comments.length, 'comments...');
        const sentimentResults = [];

        for (const comment of comments) {
            const dbCommentId = commentIdMap.get(comment.commentId);
            if (!dbCommentId) continue;

            const sentiment = await sentimentAnalyzer.analyzeComment(comment.text);
            sentimentResults.push({
                commentId: dbCommentId,
                ...sentiment
            });
        }

        // Save all sentiment results in bulk
        if (sentimentResults.length > 0) {
            await sentimentAnalyzer.saveBulkCommentSentiments(sentimentResults);
        }

        // Calculate and save video-level sentiment
        const videoSentiment = await sentimentAnalyzer.calculateVideoSentiment(dbVideoId);

        console.log('Sentiment analysis complete:', videoSentiment);

        res.json({
            success: true,
            video: videoDetails,
            isUpdate: isUpdate,
            totalComments: comments.length,
            newComments: isUpdate ? newCommentsCount : comments.length,
            transcriptSegments: transcriptCount,
            transcriptStatus: transcriptStatus,
            sentiment: videoSentiment
        });

    } catch (error) {
        console.error('Error in fetch-comments:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch comments' });
    }
});

router.get('/videos', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT id, video_id, title, channel_name, fetched_at FROM videos ORDER BY fetched_at DESC'
        );

        res.json({ videos: result.rows });
    } catch (error) {
        console.error('Error fetching videos:', error);
        res.status(500).json({ error: 'Failed to fetch videos' });
    }
});

module.exports = router;
