const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const commentsRoutes = require('./routes/comments');
const searchRoutes = require('./routes/search');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api', commentsRoutes);
app.use('/api', searchRoutes);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('YouTube Comments Search API is ready');
});
