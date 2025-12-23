const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/database');

// Simple admin authentication middleware
const authenticateAdmin = (req, res, next) => {
    if (req.session && req.session.isAdmin) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized - Admin login required' });
    }
};

// Admin login
router.post('/login', async (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Password required' });
        }

        // Get admin password from environment
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

        // Simple password comparison (in production, use hashed passwords)
        if (password === adminPassword) {
            req.session.isAdmin = true;
            res.json({ success: true, message: 'Logged in successfully' });
        } else {
            res.status(401).json({ error: 'Invalid password' });
        }

    } catch (error) {
        console.error('Error during admin login:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Admin logout
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Logged out successfully' });
});

// Check if admin is logged in
router.get('/check', (req, res) => {
    res.json({ isAdmin: req.session && req.session.isAdmin === true });
});

// Get all videos with detailed statistics
router.get('/videos', authenticateAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                v.id,
                v.video_id,
                v.title,
                v.channel_name,
                v.fetched_at,
                v.has_transcript,
                v.last_comment_date,
                COUNT(DISTINCT c.id) as comment_count,
                COUNT(DISTINCT t.id) as transcript_count,
                vs.overall_sentiment,
                vs.positive_percentage,
                vs.negative_percentage,
                vs.neutral_percentage
            FROM videos v
            LEFT JOIN comments c ON v.id = c.video_id
            LEFT JOIN transcripts t ON v.id = t.video_id
            LEFT JOIN video_sentiments vs ON v.id = vs.video_id
            GROUP BY v.id, vs.id
            ORDER BY v.fetched_at DESC
        `);

        res.json({ videos: result.rows });

    } catch (error) {
        console.error('Error fetching admin videos:', error);
        res.status(500).json({ error: 'Failed to fetch videos' });
    }
});

// Get database statistics
router.get('/stats', authenticateAdmin, async (req, res) => {
    try {
        const stats = {};

        // Total videos
        const videosResult = await db.query('SELECT COUNT(*) as count FROM videos');
        stats.totalVideos = parseInt(videosResult.rows[0].count);

        // Total comments
        const commentsResult = await db.query('SELECT COUNT(*) as count FROM comments');
        stats.totalComments = parseInt(commentsResult.rows[0].count);

        // Total transcripts
        const transcriptsResult = await db.query('SELECT COUNT(*) as count FROM transcripts');
        stats.totalTranscripts = parseInt(transcriptsResult.rows[0].count);

        // Sentiment keywords
        const keywordsResult = await db.query('SELECT COUNT(*) as count FROM sentiment_keywords');
        stats.totalKeywords = parseInt(keywordsResult.rows[0].count);

        // Sentiment analysis count
        const sentimentResult = await db.query('SELECT COUNT(*) as count FROM comment_sentiments');
        stats.analyzedComments = parseInt(sentimentResult.rows[0].count);

        // Database size (PostgreSQL specific)
        const sizeResult = await db.query(`
            SELECT pg_size_pretty(pg_database_size(current_database())) as size
        `);
        stats.databaseSize = sizeResult.rows[0].size;

        res.json(stats);

    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Delete a specific video and all associated data
router.delete('/video/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Get video info before deleting
        const videoResult = await db.query('SELECT * FROM videos WHERE id = $1', [id]);

        if (videoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const video = videoResult.rows[0];

        // Delete video (cascade will delete comments, transcripts, sentiments)
        await db.query('DELETE FROM videos WHERE id = $1', [id]);

        console.log(`Admin deleted video: ${video.title} (ID: ${id})`);

        res.json({
            success: true,
            message: 'Video and all associated data deleted successfully',
            deletedVideo: video.title
        });

    } catch (error) {
        console.error('Error deleting video:', error);
        res.status(500).json({ error: 'Failed to delete video' });
    }
});

// Delete comments for a specific video
router.delete('/video/:id/comments', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const videoResult = await db.query('SELECT title FROM videos WHERE id = $1', [id]);
        if (videoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const video = videoResult.rows[0];

        // Delete comments (cascade will delete replies and comment sentiments)
        const result = await db.query('DELETE FROM comments WHERE video_id = $1', [id]);

        // Update video sentiment to reflect no comments
        await db.query('DELETE FROM video_sentiments WHERE video_id = $1', [id]);

        console.log(`Admin deleted comments for video: ${video.title} (${result.rowCount} comments)`);

        res.json({
            success: true,
            message: `Deleted ${result.rowCount} comments for "${video.title}"`,
            deletedCount: result.rowCount
        });

    } catch (error) {
        console.error('Error deleting comments:', error);
        res.status(500).json({ error: 'Failed to delete comments' });
    }
});

// Delete transcripts for a specific video
router.delete('/video/:id/transcripts', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const videoResult = await db.query('SELECT title FROM videos WHERE id = $1', [id]);
        if (videoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const video = videoResult.rows[0];

        // Delete transcripts
        const result = await db.query('DELETE FROM transcripts WHERE video_id = $1', [id]);

        // Update video flag
        await db.query('UPDATE videos SET has_transcript = FALSE WHERE id = $1', [id]);

        console.log(`Admin deleted transcripts for video: ${video.title} (${result.rowCount} segments)`);

        res.json({
            success: true,
            message: `Deleted ${result.rowCount} transcript segments for "${video.title}"`,
            deletedCount: result.rowCount
        });

    } catch (error) {
        console.error('Error deleting transcripts:', error);
        res.status(500).json({ error: 'Failed to delete transcripts' });
    }
});

// Delete sentiment analysis for a specific video
router.delete('/video/:id/sentiment', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const videoResult = await db.query('SELECT title FROM videos WHERE id = $1', [id]);
        if (videoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const video = videoResult.rows[0];

        // Delete comment sentiments
        const commentSentimentsResult = await db.query(`
            DELETE FROM comment_sentiments
            WHERE comment_id IN (
                SELECT id FROM comments WHERE video_id = $1
            )
        `, [id]);

        // Delete video sentiment
        await db.query('DELETE FROM video_sentiments WHERE video_id = $1', [id]);

        console.log(`Admin deleted sentiment for video: ${video.title}`);

        res.json({
            success: true,
            message: `Deleted sentiment analysis for "${video.title}"`,
            deletedCommentSentiments: commentSentimentsResult.rowCount
        });

    } catch (error) {
        console.error('Error deleting sentiment:', error);
        res.status(500).json({ error: 'Failed to delete sentiment' });
    }
});

// Purge all data or specific data types
router.post('/purge', authenticateAdmin, async (req, res) => {
    try {
        const { type } = req.body; // 'all', 'comments', 'transcripts', 'sentiment'

        let message = '';

        switch (type) {
            case 'all':
                await db.query('TRUNCATE videos CASCADE');
                message = 'All data purged successfully (videos, comments, transcripts, sentiments)';
                break;

            case 'comments':
                await db.query('TRUNCATE comments CASCADE');
                message = 'All comments and related data purged successfully';
                break;

            case 'transcripts':
                await db.query('TRUNCATE transcripts CASCADE');
                await db.query('UPDATE videos SET has_transcript = FALSE');
                message = 'All transcripts purged successfully';
                break;

            case 'sentiment':
                await db.query('TRUNCATE comment_sentiments, video_sentiments CASCADE');
                message = 'All sentiment analysis data purged successfully';
                break;

            case 'sentiment_keywords':
                await db.query('TRUNCATE sentiment_keywords CASCADE');
                message = 'All sentiment keywords purged successfully';
                break;

            default:
                return res.status(400).json({ error: 'Invalid purge type' });
        }

        console.log(`Admin purged data: ${type}`);

        res.json({ success: true, message });

    } catch (error) {
        console.error('Error purging data:', error);
        res.status(500).json({ error: 'Failed to purge data' });
    }
});

// Re-analyze sentiment for all comments
router.post('/reanalyze-sentiment', authenticateAdmin, async (req, res) => {
    try {
        // Delete existing sentiment data
        await db.query('TRUNCATE comment_sentiments, video_sentiments CASCADE');

        res.json({
            success: true,
            message: 'Sentiment data cleared. Re-fetch videos to re-analyze sentiment.'
        });

    } catch (error) {
        console.error('Error clearing sentiment:', error);
        res.status(500).json({ error: 'Failed to clear sentiment data' });
    }
});

module.exports = router;
