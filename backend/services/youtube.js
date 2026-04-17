const axios = require('axios');
require('dotenv').config();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
        /youtube\.com\/embed\/([^&\n?#]+)/,
        /youtube\.com\/v\/([^&\n?#]+)/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }

    return null;
}

async function getVideoDetails(videoId) {
    try {
        const response = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
            params: {
                part: 'snippet',
                id: videoId,
                key: YOUTUBE_API_KEY
            }
        });

        if (response.data.items && response.data.items.length > 0) {
            const video = response.data.items[0];
            return {
                videoId: videoId,
                title: video.snippet.title,
                channelName: video.snippet.channelTitle,
                publishedAt: video.snippet.publishedAt
            };
        }

        return null;
    } catch (error) {
        console.error('Error fetching video details:', error.message);
        throw new Error('Failed to fetch video details');
    }
}

async function fetchCommentsPage(videoId, pageToken = null) {
    try {
        const params = {
            part: 'snippet,replies',
            videoId: videoId,
            maxResults: 100,
            key: YOUTUBE_API_KEY,
            textFormat: 'plainText'
        };

        if (pageToken) {
            params.pageToken = pageToken;
        }

        const response = await axios.get(`${YOUTUBE_API_BASE}/commentThreads`, {
            params: params
        });

        return response.data;
    } catch (error) {
        if (error.response?.status === 403) {
            throw new Error('Comments are disabled for this video or API quota exceeded');
        }
        console.error('Error fetching comments:', error.message);
        throw new Error('Failed to fetch comments from YouTube');
    }
}

async function getAllComments(videoId) {
    const allComments = [];
    let pageToken = null;
    let hasMorePages = true;
    let pageCount = 0;

    while (hasMorePages) {
        pageCount++;
        const data = await fetchCommentsPage(videoId, pageToken);

        if (data.items) {
            for (const item of data.items) {
                const topComment = item.snippet.topLevelComment.snippet;

                allComments.push({
                    commentId: item.snippet.topLevelComment.id,
                    author: topComment.authorDisplayName,
                    text: topComment.textDisplay,
                    publishedAt: topComment.publishedAt,
                    likeCount: topComment.likeCount || 0,
                    parentId: null
                });

                if (item.replies && item.replies.comments) {
                    const parentCommentId = item.snippet.topLevelComment.id;

                    for (const reply of item.replies.comments) {
                        allComments.push({
                            commentId: reply.id,
                            author: reply.snippet.authorDisplayName,
                            text: reply.snippet.textDisplay,
                            publishedAt: reply.snippet.publishedAt,
                            likeCount: reply.snippet.likeCount || 0,
                            parentId: parentCommentId
                        });
                    }
                }
            }
        }

        console.log(`  → Fetched page ${pageCount}: ${allComments.length} comments so far...`);

        pageToken = data.nextPageToken;
        hasMorePages = !!pageToken;
    }

    console.log(`✓ Completed fetching all ${allComments.length} comments from YouTube (${pageCount} pages)`);
    return allComments;
}

async function getTranscript(videoId) {
    try {
        const ytdl = require('@distube/ytdl-core');

        console.log(`Fetching transcript for video ${videoId}...`);

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const info = await ytdl.getInfo(videoUrl);

        const captionTracks = info.player_response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

        if (!captionTracks || captionTracks.length === 0) {
            console.warn('No captions available for video:', videoId);
            return null;
        }

        console.log(`Found ${captionTracks.length} caption track(s)`);

        const preferredLanguages = ['en', 'es', 'pt', 'fr'];
        let selectedTrack = null;

        for (const lang of preferredLanguages) {
            selectedTrack = captionTracks.find(track => track.languageCode === lang);
            if (selectedTrack) break;
        }

        if (!selectedTrack) {
            selectedTrack = captionTracks[0];
        }

        console.log(`Using caption track: ${selectedTrack.name.simpleText} (${selectedTrack.languageCode})`);

        const captionUrl = selectedTrack.baseUrl;
        const response = await axios.get(captionUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.youtube.com/'
            }
        });
        const captionXml = response.data;

        if (!captionXml || captionXml.length === 0) {
            console.warn('Caption XML is empty for video:', videoId);
            return null;
        }

        const parseString = require('xml2js').parseString;
        const transcriptSegments = [];

        parseString(captionXml, (err, result) => {
            if (err || !result || !result.transcript || !result.transcript.text) {
                return;
            }

            result.transcript.text.forEach(segment => {
                if (segment._ && segment.$.start && segment.$.dur) {
                    transcriptSegments.push({
                        text: segment._.replace(/\n/g, ' ').trim(),
                        offset: parseFloat(segment.$.start) * 1000,
                        duration: parseFloat(segment.$.dur) * 1000,
                        language: selectedTrack.languageCode
                    });
                }
            });
        });

        if (transcriptSegments.length === 0) {
            console.warn('No transcript segments found');
            return null;
        }

        console.log(`✓ Found transcript in ${selectedTrack.languageCode} with ${transcriptSegments.length} segments`);

        return transcriptSegments;

    } catch (error) {
        console.error('Error fetching transcript:', error.message);
        return null;
    }
}

module.exports = {
    extractVideoId,
    getVideoDetails,
    getAllComments,
    getTranscript
};
