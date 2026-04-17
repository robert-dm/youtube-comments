const express = require('express');
const router = express.Router();
const sentimentAnalyzer = require('../services/sentiment');

// Get all sentiment keywords
router.get('/keywords', async (req, res) => {
    try {
        const keywords = await sentimentAnalyzer.getAllKeywords();
        res.json({ keywords });
    } catch (error) {
        console.error('Error fetching keywords:', error);
        res.status(500).json({ error: 'Failed to fetch keywords' });
    }
});

// Add new sentiment keyword
router.post('/keywords', async (req, res) => {
    try {
        const { keyword, weight, category } = req.body;

        if (!keyword || weight === undefined || !category) {
            return res.status(400).json({ error: 'Keyword, weight, and category are required' });
        }

        if (!['positive', 'negative', 'neutral'].includes(category)) {
            return res.status(400).json({ error: 'Category must be positive, negative, or neutral' });
        }

        const newKeyword = await sentimentAnalyzer.addKeyword(keyword, weight, category);
        res.json({ keyword: newKeyword, message: 'Keyword added successfully' });
    } catch (error) {
        console.error('Error adding keyword:', error);
        res.status(500).json({ error: 'Failed to add keyword' });
    }
});

// Update existing sentiment keyword
router.put('/keywords/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { keyword, weight, category, is_active } = req.body;

        const updatedKeyword = await sentimentAnalyzer.updateKeyword(id, {
            keyword,
            weight,
            category,
            is_active
        });

        if (!updatedKeyword) {
            return res.status(404).json({ error: 'Keyword not found' });
        }

        res.json({ keyword: updatedKeyword, message: 'Keyword updated successfully' });
    } catch (error) {
        console.error('Error updating keyword:', error);
        res.status(500).json({ error: 'Failed to update keyword' });
    }
});

// Delete sentiment keyword
router.delete('/keywords/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await sentimentAnalyzer.deleteKeyword(id);
        res.json({ message: 'Keyword deleted successfully' });
    } catch (error) {
        console.error('Error deleting keyword:', error);
        res.status(500).json({ error: 'Failed to delete keyword' });
    }
});

// Get sentiment configuration
router.get('/config', async (req, res) => {
    try {
        const config = await sentimentAnalyzer.getConfig();
        res.json({ config });
    } catch (error) {
        console.error('Error fetching config:', error);
        res.status(500).json({ error: 'Failed to fetch configuration' });
    }
});

// Update sentiment configuration
router.put('/config/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        if (value === undefined) {
            return res.status(400).json({ error: 'Value is required' });
        }

        const updatedConfig = await sentimentAnalyzer.updateConfig(key, value);

        if (!updatedConfig) {
            return res.status(404).json({ error: 'Configuration key not found' });
        }

        res.json({ config: updatedConfig, message: 'Configuration updated successfully' });
    } catch (error) {
        console.error('Error updating config:', error);
        res.status(500).json({ error: 'Failed to update configuration' });
    }
});

// Get sentiment for a specific video
router.get('/video/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;

        // Get internal database ID from video_id
        const db = require('../config/database');
        const videoResult = await db.query(
            'SELECT id FROM videos WHERE video_id = $1',
            [videoId]
        );

        if (videoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const dbVideoId = videoResult.rows[0].id;
        const sentiment = await sentimentAnalyzer.getVideoSentiment(dbVideoId);

        if (!sentiment) {
            return res.status(404).json({ error: 'Sentiment analysis not found for this video' });
        }

        res.json({ sentiment });
    } catch (error) {
        console.error('Error fetching video sentiment:', error);
        res.status(500).json({ error: 'Failed to fetch sentiment' });
    }
});

// Get sentiment overview for all videos
router.get('/overview', async (req, res) => {
    try {
        const db = require('../config/database');
        const result = await db.query('SELECT * FROM sentiment_overview');
        res.json({ videos: result.rows });
    } catch (error) {
        console.error('Error fetching sentiment overview:', error);
        res.status(500).json({ error: 'Failed to fetch sentiment overview' });
    }
});

module.exports = router;
