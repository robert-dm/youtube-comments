const API_BASE = 'http://localhost:3000/api';

let elements = {};

function initializeElements() {
    elements = {
        youtubeUrl: document.getElementById('youtube-url'),
        fetchBtn: document.getElementById('fetch-btn'),
        fetchStatus: document.getElementById('fetch-status'),
        searchQuery: document.getElementById('search-query'),
        searchStatus: document.getElementById('search-status'),
        resultsContainer: document.getElementById('results-container'),
        loadVideosBtn: document.getElementById('load-videos-btn'),
        videosContainer: document.getElementById('videos-container'),
        loadingOverlay: document.getElementById('loading-overlay'),
        includeTranscript: document.getElementById('include-transcript')
    };

    if (elements.loadingOverlay) {
        elements.loadingOverlay.classList.add('hidden');
    }
}

function showLoading(show = true) {
    if (!elements.loadingOverlay) return;

    if (show) {
        elements.loadingOverlay.classList.remove('hidden');
    } else {
        elements.loadingOverlay.classList.add('hidden');
    }
}

function showStatus(element, message, type = 'info') {
    element.textContent = message;
    element.className = `status-message ${type}`;
    setTimeout(() => {
        element.textContent = '';
        element.className = 'status-message';
    }, 5000);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString();
}

function highlightText(text, query) {
    if (!query) return text;

    const words = query.trim().split(/\s+/);
    let highlighted = text;

    words.forEach(word => {
        const regex = new RegExp(`(${word})`, 'gi');
        highlighted = highlighted.replace(regex, '<mark>$1</mark>');
    });

    return highlighted;
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function createTranscriptElement(transcript, searchQuery = '') {
    const transcriptDiv = document.createElement('div');
    transcriptDiv.className = 'comment result-transcript';

    const badge = document.createElement('span');
    badge.className = 'result-badge transcript-badge';
    badge.textContent = 'TRANSCRIPT';
    transcriptDiv.appendChild(badge);

    const videoInfo = document.createElement('div');
    videoInfo.className = 'video-info';
    const timeInSeconds = Math.floor(transcript.startTime);
    const videoUrl = `https://youtube.com/watch?v=${transcript.videoId}&t=${timeInSeconds}s`;
    videoInfo.innerHTML = `
        <strong>${transcript.videoTitle}</strong> by ${transcript.channelName}
        <a href="${videoUrl}" target="_blank" class="video-link">▶ ${formatTime(transcript.startTime)}</a>
    `;
    transcriptDiv.appendChild(videoInfo);

    const transcriptText = document.createElement('div');
    transcriptText.className = 'comment-text';
    transcriptText.innerHTML = highlightText(transcript.text, searchQuery);
    transcriptDiv.appendChild(transcriptText);

    return transcriptDiv;
}

function createCommentElement(comment, searchQuery = '') {
    const commentDiv = document.createElement('div');
    commentDiv.className = 'comment result-comment';

    const badge = document.createElement('span');
    badge.className = 'result-badge comment-badge';
    badge.textContent = 'COMMENT';
    commentDiv.appendChild(badge);

    if (comment.parent) {
        const parentDiv = document.createElement('div');
        parentDiv.className = 'parent-comment';
        parentDiv.innerHTML = `
            <div class="comment-author">Parent: ${comment.parent.author}</div>
            <div class="comment-text">${comment.parent.text.substring(0, 100)}...</div>
        `;
        commentDiv.appendChild(parentDiv);
    }

    const videoInfo = document.createElement('div');
    videoInfo.className = 'video-info';
    videoInfo.innerHTML = `
        <strong>${comment.videoTitle}</strong> by ${comment.channelName}
        <a href="https://youtube.com/watch?v=${comment.videoId}" target="_blank" class="video-link">Watch Video</a>
    `;
    commentDiv.appendChild(videoInfo);

    const commentHeader = document.createElement('div');
    commentHeader.className = 'comment-header';
    commentHeader.innerHTML = `
        <span class="comment-author">${comment.author}</span>
        <span class="comment-date">${formatDate(comment.publishedAt)}</span>
        <span class="comment-likes">👍 ${comment.likeCount}</span>
    `;
    commentDiv.appendChild(commentHeader);

    const commentText = document.createElement('div');
    commentText.className = 'comment-text';
    commentText.innerHTML = highlightText(comment.text, searchQuery);
    commentDiv.appendChild(commentText);

    if (comment.replies && comment.replies.length > 0) {
        const repliesDiv = document.createElement('div');
        repliesDiv.className = 'replies';

        const repliesHeader = document.createElement('div');
        repliesHeader.className = 'replies-header';
        repliesHeader.innerHTML = `
            <button class="toggle-replies">${comment.replies.length} ${comment.replies.length === 1 ? 'Reply' : 'Replies'}</button>
        `;
        repliesDiv.appendChild(repliesHeader);

        const repliesContainer = document.createElement('div');
        repliesContainer.className = 'replies-container hidden';

        comment.replies.forEach(reply => {
            const replyDiv = document.createElement('div');
            replyDiv.className = 'reply';
            replyDiv.innerHTML = `
                <div class="comment-header">
                    <span class="comment-author">${reply.author}</span>
                    <span class="comment-date">${formatDate(reply.publishedAt)}</span>
                    <span class="comment-likes">👍 ${reply.likeCount}</span>
                </div>
                <div class="comment-text">${highlightText(reply.text, searchQuery)}</div>
            `;
            repliesContainer.appendChild(replyDiv);
        });

        repliesDiv.appendChild(repliesContainer);
        commentDiv.appendChild(repliesDiv);

        repliesHeader.querySelector('.toggle-replies').addEventListener('click', () => {
            repliesContainer.classList.toggle('hidden');
        });
    }

    return commentDiv;
}

async function fetchComments() {
    const url = elements.youtubeUrl.value.trim();

    if (!url) {
        showStatus(elements.fetchStatus, 'Please enter a YouTube URL', 'error');
        return;
    }

    try {
        showLoading(true);
        elements.fetchBtn.disabled = true;

        const response = await fetch(`${API_BASE}/fetch-comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch comments');
        }

        let message = '';
        if (data.isUpdate) {
            message = `Updated "${data.video.title}": ${data.newComments} new comment${data.newComments !== 1 ? 's' : ''} added (${data.totalComments} total).`;
        } else {
            message = `Fetched "${data.video.title}": ${data.totalComments} comments`;
        }

        if (data.transcriptStatus === 'fetched') {
            message += ` + ${data.transcriptSegments} transcript segments`;
        } else if (data.transcriptStatus === 'existing') {
            message += ` (transcript already saved)`;
        } else if (data.transcriptStatus === 'unavailable') {
            message += ` (no transcript available)`;
        }

        showStatus(elements.fetchStatus, message, 'success');

        elements.youtubeUrl.value = '';

    } catch (error) {
        showStatus(elements.fetchStatus, error.message, 'error');
    } finally {
        showLoading(false);
        elements.fetchBtn.disabled = false;
    }
}

async function searchComments() {
    const query = elements.searchQuery.value.trim();

    if (!query) {
        elements.resultsContainer.innerHTML = `
            <div class="empty-state">
                <svg class="empty-icon" width="120" height="120" viewBox="0 0 120 120" fill="none">
                    <rect x="20" y="30" width="60" height="40" rx="4" fill="#E8EAF0"/>
                    <circle cx="75" cy="75" r="30" stroke="#A0A3BD" stroke-width="6" fill="none"/>
                    <path d="M95 95L110 110" stroke="#A0A3BD" stroke-width="6" stroke-linecap="round"/>
                </svg>
                <p class="empty-text">Enter a search query to find comments and transcripts.</p>
            </div>
        `;
        return;
    }

    try {
        showLoading(true);

        const response = await fetch(`${API_BASE}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Search failed');
        }

        elements.resultsContainer.innerHTML = '';

        const totalResults = data.totalCount || 0;

        if (totalResults === 0) {
            elements.resultsContainer.innerHTML = '<p class="no-results">No results found matching your search.</p>';
        } else {
            const resultsHeader = document.createElement('h3');
            resultsHeader.textContent = `Found ${totalResults} result${totalResults !== 1 ? 's' : ''} (${data.commentCount} comments, ${data.transcriptCount} transcript segments)`;
            elements.resultsContainer.appendChild(resultsHeader);

            data.commentResults.forEach(comment => {
                elements.resultsContainer.appendChild(createCommentElement(comment, query));
            });

            data.transcriptResults.forEach(transcript => {
                elements.resultsContainer.appendChild(createTranscriptElement(transcript, query));
            });
        }

        showStatus(elements.searchStatus, `Found ${totalResults} result${totalResults !== 1 ? 's' : ''}`, 'success');

    } catch (error) {
        showStatus(elements.searchStatus, error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function loadVideos() {
    try {
        showLoading(true);

        const response = await fetch(`${API_BASE}/videos`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load videos');
        }

        elements.videosContainer.innerHTML = '';

        if (data.videos.length === 0) {
            elements.videosContainer.innerHTML = '<p class="no-results">No videos fetched yet.</p>';
        } else {
            const videosList = document.createElement('div');
            videosList.className = 'videos-list';

            data.videos.forEach(video => {
                const videoDiv = document.createElement('div');
                videoDiv.className = 'video-item';
                videoDiv.innerHTML = `
                    <div class="video-title">${video.title}</div>
                    <div class="video-channel">${video.channel_name}</div>
                    <div class="video-date">Fetched: ${formatDate(video.fetched_at)}</div>
                    <a href="https://youtube.com/watch?v=${video.video_id}" target="_blank" class="video-link">Watch on YouTube</a>
                `;
                videosList.appendChild(videoDiv);
            });

            elements.videosContainer.appendChild(videosList);
        }

    } catch (error) {
        elements.videosContainer.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    } finally {
        showLoading(false);
    }
}

function initializeEventListeners() {
    if (!elements.fetchBtn) return;

    elements.fetchBtn.addEventListener('click', fetchComments);
    elements.youtubeUrl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') fetchComments();
    });

    elements.searchQuery.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchComments();
    });

    elements.searchQuery.addEventListener('input', (e) => {
        if (e.target.value.trim()) {
            searchComments();
        }
    });

    elements.loadVideosBtn.addEventListener('click', loadVideos);
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing YouTube Comments Search...');
    initializeElements();
    initializeEventListeners();
    console.log('Application ready!');
});
