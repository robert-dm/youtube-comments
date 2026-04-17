const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

const commentsRoutes = require('./routes/comments');
const searchRoutes = require('./routes/search');
const sentimentRoutes = require('./routes/sentiment');
const videoDetailsRoutes = require('./routes/videoDetails');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'youtube-comments-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api', commentsRoutes);
app.use('/api', searchRoutes);
app.use('/api/sentiment', sentimentRoutes);
app.use('/api/video', videoDetailsRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.use((err, req, res, next) => {
    console.error('Server error:', err.message);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Only listen when running locally (not on Vercel)
if (process.env.VERCEL !== '1') {
    const server = app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log('YouTube Comments Search API is ready');
    });

    // Increase timeout to 5 minutes for long-running operations
    server.timeout = 300000;
}

// Export for Vercel serverless
module.exports = app;
