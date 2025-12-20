# YouTube Comments Search

A web application that fetches YouTube video comments and enables full-text search across them.

## Features

- Fetch all comments from any YouTube video (including replies)
- Full-text search with PostgreSQL
- Display search results with highlighted matches
- View comment threads with parent-child relationships
- Track fetched video history
- Responsive design

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL with full-text search
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **API**: YouTube Data API v3

## Prerequisites

Before you begin, ensure you have the following installed:

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- A YouTube Data API key (see setup below)

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up YouTube API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **YouTube Data API v3**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "YouTube Data API v3"
   - Click "Enable"
4. Create credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the generated API key
   - (Optional) Restrict the key to YouTube Data API v3 for security

### 3. Set Up PostgreSQL Database

Create a new PostgreSQL database:

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE youtube_comments_search;

# Exit psql
\q
```

Run the schema file to create tables:

```bash
psql -U postgres -d youtube_comments_search -f database/schema.sql
```

### 4. Configure Environment Variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=youtube_comments_search
DB_USER=your_postgres_username
DB_PASSWORD=your_postgres_password

YOUTUBE_API_KEY=your_youtube_api_key_here
```

### 5. Start the Application

```bash
npm start
```

The application will be available at `http://localhost:3000`

## Usage

### Fetching Comments

1. Open the application in your browser
2. Enter a YouTube video URL in the "Fetch Comments" section
3. Click "Fetch Comments"
4. Wait for the application to retrieve all comments (this may take a few moments for videos with many comments)

### Searching Comments

1. After fetching comments, enter search keywords in the "Search Comments" section
2. Click "Search"
3. View results with highlighted matches, including:
   - Comment author
   - Published date and time
   - Comment text with search terms highlighted
   - Like count
   - Replies (expandable)

### Viewing Video History

1. Click "Load Video History" to see all fetched videos
2. Click on video links to view them on YouTube

## API Endpoints

### POST /api/fetch-comments
Fetches comments from a YouTube video and stores them in the database.

**Request:**
```json
{
  "url": "https://youtube.com/watch?v=VIDEO_ID"
}
```

**Response:**
```json
{
  "success": true,
  "video": {
    "videoId": "VIDEO_ID",
    "title": "Video Title",
    "channelName": "Channel Name"
  },
  "commentCount": 150
}
```

### POST /api/search
Searches for comments matching the query.

**Request:**
```json
{
  "query": "search term"
}
```

**Response:**
```json
{
  "query": "search term",
  "count": 10,
  "results": [...]
}
```

### GET /api/videos
Returns list of all fetched videos.

**Response:**
```json
{
  "videos": [...]
}
```

## Database Schema

### videos Table
- `id`: Primary key
- `video_id`: YouTube video ID (unique)
- `title`: Video title
- `channel_name`: Channel name
- `fetched_at`: Timestamp

### comments Table
- `id`: Primary key
- `video_id`: Foreign key to videos
- `comment_id`: YouTube comment ID (unique)
- `author`: Comment author name
- `text`: Comment text
- `published_at`: Published timestamp
- `like_count`: Number of likes
- `parent_id`: Foreign key to parent comment (for replies)
- `text_searchable`: Full-text search vector

## Important Notes

### YouTube API Quota
- Daily quota: 10,000 units
- Each commentThreads request: 1 unit
- Fetching comments from videos with thousands of comments will use multiple requests

### Limitations
- Comments must be enabled on the video
- Age-restricted videos may not be accessible
- Private videos cannot be accessed
- Very large comment threads may take time to fetch

## Troubleshooting

### Database Connection Errors
- Verify PostgreSQL is running
- Check database credentials in `.env`
- Ensure database exists and schema is applied

### YouTube API Errors
- Verify API key is correct
- Check if API quota is exceeded
- Ensure YouTube Data API v3 is enabled in Google Cloud Console

### No Search Results
- Ensure comments have been fetched first
- Try different search terms
- Check database has data: `SELECT COUNT(*) FROM comments;`

## License

MIT
