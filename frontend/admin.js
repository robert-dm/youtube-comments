const API_BASE = 'http://localhost:3000/api';

let isAdmin = false;

// Check if already logged in
async function checkAdminStatus() {
    try {
        const response = await fetch(`${API_BASE}/admin/check`, {
            credentials: 'include'
        });
        const data = await response.json();

        if (data.isAdmin) {
            showDashboard();
        } else {
            showLogin();
        }
    } catch (error) {
        console.error('Error checking admin status:', error);
        showLogin();
    }
}

function showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('admin-dashboard').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    isAdmin = true;
    loadDashboardData();
}

// Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = document.getElementById('admin-password').value;
    const errorDiv = document.getElementById('login-error');

    try {
        const response = await fetch(`${API_BASE}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (response.ok) {
            showDashboard();
        } else {
            errorDiv.textContent = data.error || 'Login failed';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = 'Error: ' + error.message;
        errorDiv.style.display = 'block';
    }
});

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
        await fetch(`${API_BASE}/admin/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        showLogin();
    } catch (error) {
        console.error('Logout error:', error);
    }
});

// Load dashboard data
async function loadDashboardData() {
    loadStatistics();
    loadVideos();
}

// Load statistics
async function loadStatistics() {
    try {
        const response = await fetch(`${API_BASE}/admin/stats`, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Failed to fetch statistics');
        }

        const stats = await response.json();

        document.getElementById('stat-videos').textContent = stats.totalVideos.toLocaleString();
        document.getElementById('stat-comments').textContent = stats.totalComments.toLocaleString();
        document.getElementById('stat-transcripts').textContent = stats.totalTranscripts.toLocaleString();
        document.getElementById('stat-size').textContent = stats.databaseSize;

    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// Load videos
async function loadVideos() {
    try {
        const tbody = document.getElementById('videos-tbody');
        tbody.innerHTML = '<tr><td colspan="6" class="loading-row">Loading videos...</td></tr>';

        const response = await fetch(`${API_BASE}/admin/videos`, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Failed to fetch videos');
        }

        const data = await response.json();

        if (data.videos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">No videos found</td></tr>';
            return;
        }

        tbody.innerHTML = '';

        data.videos.forEach(video => {
            const row = document.createElement('tr');

            const sentimentEmoji = {
                'positive': '😊',
                'negative': '😞',
                'neutral': '😐',
                'mixed': '🤔'
            };

            const sentimentBadge = video.overall_sentiment
                ? `<span class="sentiment-badge sentiment-${video.overall_sentiment}">
                    ${sentimentEmoji[video.overall_sentiment]} ${video.overall_sentiment}
                   </span>`
                : '<span class="text-muted">Not analyzed</span>';

            row.innerHTML = `
                <td class="video-title-cell">
                    <strong>${video.title}</strong>
                    <div class="video-id-small">${video.video_id}</div>
                </td>
                <td>${video.channel_name}</td>
                <td>
                    <div>${video.comment_count} comments</div>
                    ${video.transcript_count > 0 ? `<div class="text-small">${video.transcript_count} transcripts</div>` : ''}
                </td>
                <td>${sentimentBadge}</td>
                <td>${new Date(video.fetched_at).toLocaleString()}</td>
                <td class="actions-cell">
                    <div class="dropdown">
                        <button class="btn-actions-dropdown">⋮ Actions</button>
                        <div class="dropdown-content">
                            <button class="dropdown-item" onclick="purgeVideoData(${video.id}, 'comments', '${video.title.replace(/'/g, "\\'")}')">
                                💬 Purge Comments
                            </button>
                            <button class="dropdown-item" onclick="purgeVideoData(${video.id}, 'transcripts', '${video.title.replace(/'/g, "\\'")}')">
                                📝 Purge Transcripts
                            </button>
                            <button class="dropdown-item" onclick="purgeVideoData(${video.id}, 'sentiment', '${video.title.replace(/'/g, "\\'")}')">
                                😊 Purge Sentiment
                            </button>
                            <hr class="dropdown-divider">
                            <button class="dropdown-item danger" onclick="deleteVideo(${video.id}, '${video.title.replace(/'/g, "\\'")}')">
                                🗑️ Delete Video
                            </button>
                        </div>
                    </div>
                </td>
            `;

            tbody.appendChild(row);
        });

    } catch (error) {
        console.error('Error loading videos:', error);
        document.getElementById('videos-tbody').innerHTML =
            '<tr><td colspan="6" class="error-row">Error loading videos</td></tr>';
    }
}

// Delete video
async function deleteVideo(id, title) {
    if (!confirm(`Are you sure you want to delete "${title}" and all its data?\n\nThis will permanently remove:\n- The video entry\n- All comments\n- All transcripts\n- All sentiment analysis\n\nThis action cannot be undone!`)) {
        return;
    }

    try {
        const overlay = document.getElementById('loading-overlay');
        overlay.classList.remove('hidden');

        const response = await fetch(`${API_BASE}/admin/video/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        const data = await response.json();

        if (response.ok) {
            alert(`✓ Deleted: ${data.deletedVideo}`);
            loadDashboardData();
        } else {
            alert('Error: ' + data.error);
        }

    } catch (error) {
        alert('Error deleting video: ' + error.message);
    } finally {
        document.getElementById('loading-overlay').classList.add('hidden');
    }
}

// Purge data for a specific video
async function purgeVideoData(id, type, title) {
    const messages = {
        'comments': `Delete all comments for "${title}"?\n\nThis will remove:\n- All comments and replies\n- Comment sentiment data\n\nVideo will remain but comments must be re-fetched.`,
        'transcripts': `Delete all transcripts for "${title}"?\n\nYou can re-fetch them by re-fetching the video.`,
        'sentiment': `Delete sentiment analysis for "${title}"?\n\nYou can re-analyze by re-fetching the video.`
    };

    if (!confirm(messages[type])) {
        return;
    }

    try {
        const overlay = document.getElementById('loading-overlay');
        overlay.classList.remove('hidden');

        const response = await fetch(`${API_BASE}/admin/video/${id}/${type}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        const data = await response.json();

        if (response.ok) {
            alert('✓ ' + data.message);
            loadDashboardData();
        } else {
            alert('Error: ' + data.error);
        }

    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        document.getElementById('loading-overlay').classList.add('hidden');
    }
}

// Purge data
async function confirmPurge(type) {
    const messages = {
        'sentiment': 'Delete all sentiment analysis data?\n\nThis will remove all comment and video sentiment scores. You can re-analyze by re-fetching videos.',
        'transcripts': 'Delete all transcript data?\n\nThis will remove all video transcripts. You can re-fetch them by re-fetching videos.',
        'comments': 'Delete ALL comments from ALL videos?\n\nThis will remove all comments, replies, and sentiment data. Videos will remain but comments must be re-fetched.',
        'all': '⚠️ DELETE EVERYTHING? ⚠️\n\nThis will PERMANENTLY DELETE:\n- All videos\n- All comments\n- All transcripts\n- All sentiment analysis\n\nTHIS CANNOT BE UNDONE!\n\nType "DELETE ALL" to confirm:'
    };

    if (type === 'all') {
        const confirmation = prompt(messages[type]);
        if (confirmation !== 'DELETE ALL') {
            alert('Deletion cancelled');
            return;
        }
    } else {
        if (!confirm(messages[type])) {
            return;
        }
    }

    try {
        const overlay = document.getElementById('loading-overlay');
        overlay.classList.remove('hidden');

        const response = await fetch(`${API_BASE}/admin/purge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ type })
        });

        const data = await response.json();

        if (response.ok) {
            alert('✓ ' + data.message);
            loadDashboardData();
        } else {
            alert('Error: ' + data.error);
        }

    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        document.getElementById('loading-overlay').classList.add('hidden');
    }
}

// Refresh button
document.getElementById('refresh-btn').addEventListener('click', loadDashboardData);

// Initialize
document.addEventListener('DOMContentLoaded', checkAdminStatus);
