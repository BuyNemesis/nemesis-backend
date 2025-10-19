// Load environment variables (for local development)
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// Use built-in fetch for Node.js >=18 or node-fetch for older versions
const fetch = globalThis.fetch || require('node-fetch');

// Storage API configuration
const STORAGE_API = process.env.STORAGE_API_URL || 'http://localhost:3001';

// Log the storage API URL (without sensitive parts)
console.log('📡 Storage API URL:', STORAGE_API.replace(/\/\/[^@]+@/, '//****@'));

// Flag to track storage API availability
let storageApiAvailable = false;

// Helper function for storage operations with retries
async function storageApi(method, path, body = null, retries = 3) {
    // If storage API is known to be down and this isn't a health check
    if (!storageApiAvailable && path !== '/health') {
        throw new Error('Storage API is currently unavailable');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    for (let i = 0; i < retries; i++) {
        try {
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            };
            if (body) {
                options.body = JSON.stringify(body);
            }
            
            const fullUrl = `${STORAGE_API}${path}`;
            console.log(`📡 Storage API Request: ${method} ${fullUrl}`);
            
            const response = await fetch(fullUrl, options);
            clearTimeout(timeoutId);
            
            // For non-200 responses, throw error with details
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Storage API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log(`✅ Storage API Success: ${method} ${path}`);
            
            // Mark storage as available on successful request
            storageApiAvailable = true;
            
            return data;
        } catch (error) {
            clearTimeout(timeoutId);
            
            // Handle specific error types
            if (error.name === 'AbortError') {
                console.error(`❌ Storage API request timed out after 5 seconds`);
            } else if (error.code === 'ECONNREFUSED' || error.code === 'UND_ERR_CONNECT_TIMEOUT') {
                console.error(`❌ Storage API connection failed - server may be down`);
            } else {
                console.error(`❌ Storage API attempt ${i + 1}/${retries} failed:`, error);
            }
            
            // On final retry, mark storage as unavailable
            if (i === retries - 1) {
                storageApiAvailable = false;
                throw new Error('Storage API is unreachable after multiple attempts');
            }
            
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
    }
}

// Use local cache for temporary storage
const CACHE_DIR = path.join(__dirname, 'cache');
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Use memory cache for configs and feature media to reduce disk I/O
const memoryCache = {
    configs: new Map(),
    featureMedia: new Map(),
    lastUpdated: {
        configs: 0,
        featureMedia: 0
    }
};

// Helper function to ensure storage API is accessible
async function ensureStorageAccess() {
    try {
        console.log('🔄 Testing storage API connectivity...');
        
        // Test storage API connectivity with health check
        await storageApi('GET', '/health');
        console.log('✅ Storage API is accessible');
        
        storageApiAvailable = true;
        return true;
    } catch (error) {
        console.error('❌ Storage API error:', error.message);
        console.log('⚠️ Falling back to Discord storage only');
        storageApiAvailable = false;
        return false;
    }
}

// Initialize storage API connection
ensureStorageAccess().catch(error => {
    console.error('Failed to initialize storage API:', error);
    console.log('⚠️ Starting server in fallback mode (using Discord storage only)');
    storageApiAvailable = false;
});

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const FormData = require('form-data');

// Helper function to provide specific guidance based on error status
function getStorageErrorHelp(status, errorText) {
    switch (status) {
        case 400:
            return 'The request was malformed. Check file format and form field names.';
        case 401:
            return 'Authentication failed. Verify API credentials are set correctly.';
        case 403:
            return 'Permission denied. Check if the storage server is allowing uploads.';
        case 404:
            return 'Upload endpoint not found. Verify storage API URL is correct.';
        case 413:
            return 'File too large for storage server. Check server file size limits.';
        case 415:
            return 'File type not supported. Ensure file is a valid .ini config.';
        case 500:
            if (errorText.includes('disk')) {
                return 'Storage server disk error. Check server disk space and permissions.';
            }
            if (errorText.includes('multer')) {
                return 'File upload handling failed. Verify multipart/form-data format.';
            }
            return 'Internal server error. Check storage server logs for details.';
        case 502:
            return 'Storage server unavailable. Check if storage service is running.';
        case 504:
            return 'Storage server timeout. Check server load and network connectivity.';
        default:
            return 'Unknown error. Check both client and server logs for details.';
    }
}

// Import storage routes
const storageRoutes = require('./storage');

// Set up multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const app = express();

// CORS middleware with file upload support
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, Postman)
        if (!origin) return callback(null, true);
        
        // Allow localhost on any port
        if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
            return callback(null, true);
        }
        
        // Allow production domains
        const allowedDomains = ['https://nemesis.cc', 'https://www.nemesis.cc'];
        if (allowedDomains.includes(origin)) {
            return callback(null, true);
        }
        
        // Allow any other origin (for development/testing)
        callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
    credentials: true
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Use environment variables for sensitive data (secure for deployment)
const BOT_TOKEN = process.env.BOT_TOKEN;
const REVIEWS_CHANNEL_ID = process.env.REVIEWS_CHANNEL_ID || '1426384776108093502';
const CONFIGS_CHANNEL_ID = process.env.CONFIGS_CHANNEL_ID;
const CONFIGS_CHANNEL_ID2 = process.env.CONFIGS_CHANNEL_ID2 || '1426403948281200650';
const BUYER_MEDIA_CHANNEL_ID = process.env.BUYER_MEDIA_CHANNEL_ID || '1426388792012705874';
const STATUS_CHANNEL_ID = process.env.STATUS_CHANNEL_ID || '1426384774167269502';

// Endpoint to get live status from Discord channel
app.get('/api/live-status', async (req, res) => {
    try {
        const response = await fetch(`https://discord.com/api/v10/channels/${STATUS_CHANNEL_ID}`, {
            headers: {
                'Authorization': `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Discord API error: ${response.status} ${response.statusText}`);
        }

        const channel = await response.json();
        const channelName = channel.name || '';

        // Extract emoji from channel name
        let status = {
            emoji: '⚫',
            color: 'gray', // default color
            text: 'Unknown'
        };

        // Check for status emojis in channel name
        if (channelName.includes('🟢')) {
            status.emoji = '🟢';
            status.color = 'green';
            status.text = 'Online';
        } else if (channelName.includes('🔴')) {
            status.emoji = '🔴';
            status.color = 'red';
            status.text = 'Offline';
        } else if (channelName.includes('🟡')) {
            status.emoji = '🟡';
            status.color = 'yellow';
            status.text = 'Maintenance';
        } else if (channelName.includes('🔵')) {
            status.emoji = '🔵';
            status.color = 'blue';
            status.text = 'Updating';
        }

        res.json(status);
    } catch (error) {
        console.error('Error fetching live status:', error);
        res.status(500).json({
            error: 'Failed to fetch status',
            message: error.message
        });
    }
});

// Validate required environment variables
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN environment variable is required!');
    console.error('💡 Set it in Render dashboard or create a .env file locally');
    process.exit(1);
}
if (!CONFIGS_CHANNEL_ID) {
    console.error('❌ CONFIGS_CHANNEL_ID environment variable is required!');
    console.error('💡 Set it in Render dashboard or create a .env file locally');
    process.exit(1);
}

console.log('✅ Bot token loaded from environment variables');
console.log('✅ Configs channel ID loaded from environment variables');
console.log('✅ Buyer media channel ID loaded from environment variables');
console.log('🔒 Token is secure and hidden');

// Endpoint to get total config count from both channels
app.get('/api/configs-count', async (req, res) => {
    try {
        // Function to safely fetch and count configs from a channel
        const getChannelConfigCount = async (channelId) => {
            try {
                const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=100`, {
                    headers: {
                        'Authorization': `Bot ${BOT_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    console.error(`Failed to fetch configs from channel ${channelId}: ${response.status}`);
                    return 0;
                }

                const messages = await response.json();
                if (!Array.isArray(messages)) {
                    console.error(`Invalid response from channel ${channelId}`);
                    return 0;
                }

                return messages.reduce((count, msg) => {
                    if (msg.attachments) {
                        return count + msg.attachments.filter(att => 
                            att.filename && att.filename.toLowerCase().endsWith('.ini')
                        ).length;
                    }
                    return count;
                }, 0);
            } catch (err) {
                console.error(`Error counting configs in channel ${channelId}:`, err);
                return 0;
            }
        };

                // Only get count from CONFIGS_CHANNEL_ID2
        const count = await getChannelConfigCount(CONFIGS_CHANNEL_ID2);
        console.log(`Config count from channel ${CONFIGS_CHANNEL_ID2}: ${count}`);

        res.json({
            count: count,
            channel: CONFIGS_CHANNEL_ID2
        });
    } catch (error) {
        console.error('Error getting config counts:', error);
        res.status(500).json({ error: 'Failed to count configs', message: error.message });
    }
});

// Endpoint to get Discord server member count
app.get('/api/members', async (req, res) => {
    try {
        const GUILD_ID = process.env.GUILD_ID || '1426384773131010070'; // Updated server ID
        const url = `https://discord.com/api/v10/guilds/${GUILD_ID}`;
        
        console.log('🔍 Debug Info:');
        console.log(`Guild ID: ${GUILD_ID}`);
        console.log(`Bot Token Present: ${!!BOT_TOKEN}`);
        console.log(`API URL: ${url}`);
        
        console.log('Making request with token:', BOT_TOKEN ? `${BOT_TOKEN.slice(0,5)}...` : 'NO TOKEN');
        const response = await fetch(`${url}?with_counts=true`, {
            method: 'GET',
            headers: {
                'Authorization': `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'DiscordBot (https://nemesis-backend-yv3w.onrender.com, 1.0.0)'
            }
        });

        const data = await response.json();
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        console.log('Discord API Response:', data);

        if (!response.ok) {
            throw new Error(`Discord API Error (${response.status}): ${JSON.stringify(data)}`);
        }

        if (!data.member_count && !data.approximate_member_count) {
            console.warn('Warning: No member count found in Discord response:', data);
        }

        // Prefer member_count if available, fallback to approximate_member_count
        const count = data.member_count || data.approximate_member_count || 0;
        console.log(`[MEMBER COUNT] Current server members: ${count}`);
        
        res.json({ 
            count,
            guild_id: GUILD_ID,
            approximate: !data.member_count && !!data.approximate_member_count
        });
    } catch (error) {
        console.error('❌ Error Details:');
        console.error('Error fetching member count:', error);
        console.error('Stack trace:', error.stack);
        console.error('Guild ID:', GUILD_ID);
        console.error('Bot token length:', BOT_TOKEN ? BOT_TOKEN.length : 0);
        
        res.status(500).json({ 
            error: 'Failed to fetch member count', 
            message: error.message,
            details: error.stack,
            guild_id: GUILD_ID,
            timestamp: new Date().toISOString(),
            hasToken: !!BOT_TOKEN
        });
    }
});

// Reviews endpoint (restored, fixed)
app.get('/api/reviews', async (req, res) => {
    try {
        const offset = parseInt(req.query.offset) || 0;
        const limit = parseInt(req.query.limit) || 6;
        console.log(`Fetching reviews from Discord... offset: ${offset}, limit: ${limit}`);
        
        const response = await fetch(`https://discord.com/api/v10/channels/${REVIEWS_CHANNEL_ID}/messages?limit=100`, {
            headers: {
                'Authorization': `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.error(`Discord API error: Status ${response.status}`);
            throw new Error('Failed to fetch reviews from Discord');
        }
        
        const messages = await response.json();
        console.log(`Fetched ${messages.length} messages`);
        
        if (!Array.isArray(messages)) {
            console.error('Invalid response from Discord: not an array');
            throw new Error('Invalid response from Discord');
        }
        
        // Parse messages in the format: first line = review, second line = rating
        const allValidReviews = messages
            .filter(msg => {
                // Must have content and not be from a bot
                if (!msg.content || !msg.author || msg.author.bot) {
                    return false;
                }
                
                const lines = msg.content.trim().split('\n');
                // Must have at least 2 lines and second line must contain a rating
                return lines.length >= 2 && lines[1].includes('/5');
            })
            .map(msg => {
                const lines = msg.content.trim().split('\n');
                const reviewText = lines[0];
                const ratingLine = lines[1];
                
                // Extract rating (e.g., "4/5" -> 4)
                const ratingMatch = ratingLine.match(/(\d+)\/5/);
                if (!ratingMatch) {
                    return null;
                }
                
                const rating = parseInt(ratingMatch[1], 10);
                if (isNaN(rating) || rating < 0 || rating > 5) {
                    return null;
                }
                
                return {
                    id: msg.id,
                    author: {
                        username: msg.author.username || 'Anonymous',
                        avatar: msg.author.avatar ? 
                            `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png` :
                            `https://cdn.discordapp.com/embed/avatars/${(msg.author.discriminator || 0) % 5}.png`
                    },
                    content: reviewText.trim(),
                    rating: rating,
                    timestamp: msg.timestamp
                };
            })
            .filter(review => review !== null)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
        const totalReviews = allValidReviews.length;
        const paginatedReviews = allValidReviews.slice(offset, offset + limit);
        
        console.log(`Found ${totalReviews} valid reviews, returning ${paginatedReviews.length} reviews (offset: ${offset})`);
        
        // Send the response with reviews array, even if empty
        res.json({
            reviews: paginatedReviews,
            totalCount: totalReviews,
            hasMore: offset + limit < totalReviews
        });
        
    } catch (error) {
        console.error('Error in /api/reviews:', error);
        // Send a more detailed error response
        res.status(500).json({
            error: 'Failed to fetch reviews',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Media endpoint - fetch MP4 attachments and Streamable links from buyer media channel
app.get('/api/media', async (req, res) => {
    try {
        const offset = parseInt(req.query.offset) || 0;
        const limit = parseInt(req.query.limit) || 12;
        
        console.log(`Fetching media from Discord... offset: ${offset}, limit: ${limit}`);
        
        const response = await fetch(`https://discord.com/api/v10/channels/${BUYER_MEDIA_CHANNEL_ID}/messages?limit=100`, {
            headers: {
                'Authorization': `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Discord API error: ${response.status} ${response.statusText}`);
        }

        const messages = await response.json();
        console.log(`Fetched ${messages.length} messages from buyer media channel`);

        const streamableRegex = /streamable\.com\/([a-zA-Z0-9]+)/gi;
        
        const allVideos = [];
        const allPhotos = [];
        
        messages.forEach(msg => {
            if (msg.author.bot) return;
            
            // Extract title from message content (first line)
            const titleLine = msg.content ? msg.content.split('\n')[0].trim() : '';
            const title = titleLine && !titleLine.includes('http') ? titleLine : 'Nemesis Gameplay';
            
            // Check for MP4 attachments (direct Discord CDN links)
            if (msg.attachments && msg.attachments.length > 0) {
                msg.attachments.forEach(attachment => {
                    const fname = (attachment.filename || '').toLowerCase();
                    const ctype = (attachment.content_type || '').toLowerCase();
                    // Video attachments
                    if (ctype.startsWith('video/') || fname.endsWith('.mp4')) {
                        allVideos.push({
                            type: 'mp4',
                            videoUrl: attachment.url, // Direct Discord CDN URL
                            title: title,
                            author: msg.author.username,
                            date: msg.timestamp,
                            messageId: msg.id,
                            thumbnail: attachment.proxy_url || attachment.url
                        });
                    }
                    // Image attachments (photos/screenshots)
                    else if (ctype.startsWith('image/') || fname.match(/\.(png|jpe?g|webp|gif)$/)) {
                        allPhotos.push({
                            imageUrl: attachment.url,
                            title: title,
                            author: msg.author.username,
                            date: msg.timestamp,
                            messageId: msg.id,
                            thumbnail: attachment.proxy_url || attachment.url
                        });
                    }
                });
            }
            
            // Also check for Streamable links in message content
            if (msg.content) {
                const matches = [...msg.content.matchAll(streamableRegex)];
                matches.forEach(match => {
                    allVideos.push({
                        type: 'streamable',
                        streamableId: match[1],
                        title: title,
                        author: msg.author.username,
                        date: msg.timestamp,
                        messageId: msg.id
                    });
                });

                // Check for inline image links (discord CDN or direct image URLs)
                const imageUrlRegex = /(https?:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net|i\.imgur\.com|i\.redd\.it|pbs\.twimg\.com)[^\s)]+\.(?:png|jpe?g|webp|gif))/gi;
                const imageMatches = [...msg.content.matchAll(imageUrlRegex)];
                imageMatches.forEach(m => {
                    allPhotos.push({
                        imageUrl: m[1],
                        title: title,
                        author: msg.author.username,
                        date: msg.timestamp,
                        messageId: msg.id,
                        thumbnail: m[1]
                    });
                });
            }
        });
        
        // Sort by date (newest first)
        allVideos.sort((a, b) => new Date(b.date) - new Date(a.date));
        allPhotos.sort((a, b) => new Date(b.date) - new Date(a.date));

        const totalVideos = allVideos.length;
        const totalPhotos = allPhotos.length;

        const paginatedVideos = allVideos.slice(offset, offset + limit);
        const paginatedPhotos = allPhotos.slice(offset, offset + limit);

        console.log(`Found ${totalVideos} videos and ${totalPhotos} photos; returning ${paginatedVideos.length} videos and ${paginatedPhotos.length} photos (offset: ${offset})`);

        res.json({
            videos: paginatedVideos,
            photos: paginatedPhotos,
            totalVideos,
            totalPhotos,
            hasMoreVideos: offset + limit < totalVideos,
            hasMorePhotos: offset + limit < totalPhotos
        });
    } catch (error) {
        console.error('Error fetching media from Discord:', error);
        res.status(500).json({
            error: 'Failed to fetch media',
            message: error.message
        });
    }
});

// In-memory cache for feature videos/images
let featureMediaCache = {
    data: [],
    lastUpdated: 0,
    updating: false
};

// Refresh interval in milliseconds (5 minutes)
const FEATURE_MEDIA_CACHE_REFRESH_INTERVAL = 5 * 60 * 1000;

// Function to refresh feature media cache
async function refreshFeatureMediaCache() {
    if (featureMediaCache.updating) return;
    featureMediaCache.updating = true;

    try {
        const FEATURE_VIDEOS_CHANNEL_ID = process.env.SITE_RELATED_MEDIA || '1427220027232485447';
        
        console.log(`Refreshing feature media cache from channel ${FEATURE_VIDEOS_CHANNEL_ID}`);
        
        const response = await fetch(`https://discord.com/api/v10/channels/${FEATURE_VIDEOS_CHANNEL_ID}/messages?limit=100`, {
            headers: {
                'Authorization': `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Discord API error: ${response.status} ${response.statusText}`);
        }

        const messages = await response.json();
        console.log(`Fetched ${messages.length} messages from feature videos channel`);

        const videos = [];
        
        messages.forEach(msg => {
            if (msg.author.bot) return;
            
            if (msg.attachments && msg.attachments.length > 0) {
                msg.attachments.forEach(attachment => {
                    const fname = (attachment.filename || '').toLowerCase();
                    const ctype = (attachment.content_type || '').toLowerCase();
                    
                    if (fname.endsWith('.mp4') || fname.endsWith('.png')) {
                        videos.push({
                            name: attachment.filename,
                            url: attachment.url,
                            type: fname.endsWith('.mp4') ? 'video' : 'image',
                            messageId: msg.id,
                            timestamp: msg.timestamp
                        });
                    }
                });
            }
        });
        
        // Sort by date (newest first)
        videos.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Update cache
        featureMediaCache.data = videos;
        featureMediaCache.lastUpdated = Date.now();
        featureMediaCache.updating = false;

        console.log(`✨ Feature media cache refreshed with ${videos.length} items`);
    } catch (error) {
        console.error('Error refreshing feature media cache:', error);
        featureMediaCache.updating = false;
    }
}

// Setup periodic cache refresh
setInterval(refreshFeatureMediaCache, FEATURE_MEDIA_CACHE_REFRESH_INTERVAL);

// Feature videos endpoint - now with caching
app.get('/api/feature-videos', async (req, res) => {
    try {
        // Check if cache needs refresh
        const now = Date.now();
        if (now - featureMediaCache.lastUpdated > FEATURE_MEDIA_CACHE_REFRESH_INTERVAL) {
            await refreshFeatureMediaCache();
        }

        // Use cached data
        const videos = featureMediaCache.data;
        
        console.log(`Returning ${videos.length} feature videos/images from cache`);

        res.json({ 
            videos,
            fromCache: true,
            lastUpdated: new Date(featureMediaCache.lastUpdated).toISOString()
        });
    } catch (error) {
        console.error('Error in /api/feature-videos:', error);
        
        // If there's an error but we have cached data, return that instead
        if (featureMediaCache.data.length > 0) {
            console.log(`[FALLBACK] Serving ${featureMediaCache.data.length} feature videos/images from cache`);
            
            return res.json({
                videos: featureMediaCache.data,
                fromCache: true,
                lastUpdated: new Date(featureMediaCache.lastUpdated).toISOString(),
                fallback: true
            });
        }

        res.status(500).json({
            error: 'Failed to fetch feature videos',
            message: error.message
        });
    }
});

// Patchnotes endpoint - read plaintext patchnotes from the development channel
app.get('/api/patchnotes', async (req, res) => {
    try {
        const type = req.query.type || 'website'; // default to website
        
        // Different channels for different types of patch notes
        let channelId;
        if (type === 'cheat') {
            channelId = process.env.CHEAT_DEVELOPMENT || '1426388284501659678'; // CHEAT_DEVELOPMENT channel
        } else {
            channelId = process.env.WEBSITE_DEVELOPMENT || '1427127741245030493'; // WEBSITE_DEVELOPMENT channel
        }
        
        console.log(`Fetching ${type} patchnotes from channel ${channelId}`);

        const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=50`, {
            headers: {
                'Authorization': `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const txt = await response.text();
            console.error('Discord API error while fetching patchnotes:', response.status, txt);
            return res.status(502).json({ error: 'Discord API error', status: response.status, details: txt });
        }

        const messages = await response.json();

        // Parse messages into notes; expected format (per message):
        // Line 1: date (e.g. 10/12/2025)
        // Line 2: version (e.g. v1.0.0)
        // Line 3: title/summary
        // Line 4+: details
        const notes = [];
        for (const msg of messages) {
            if (!msg.content || msg.author?.bot) continue;
            const lines = msg.content.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length < 3) continue;
            const date = lines[0];
            const version = lines[1];
            const title = lines[2];
            const details = lines.slice(3).map(l => l.replace(/^[-*\u2022]\s?/, '').trim()).filter(Boolean);
            // extract exact time from Discord message timestamp (ISO)
            let time = '';
            try {
                if (msg.timestamp) {
                    const d = new Date(msg.timestamp);
                    // format as HH:MM:SSZ (UTC)
                    time = d.toISOString().split('T')[1].split('.')[0] + 'Z';
                }
            } catch (e) {
                time = '';
            }
            notes.push({ date, version, title, details, discordId: msg.id, ts: msg.timestamp, time });
        }

        notes.sort((a, b) => new Date(b.ts) - new Date(a.ts));
        res.json({ notes, type });
    } catch (error) {
        console.error('Error in /api/patchnotes:', error);
        res.status(500).json({ error: 'Failed to fetch patchnotes', message: error.message });
    }
});

// Site visit tracking endpoint
app.post('/api/visit', async (req, res) => {
    try {
        const WEBHOOK_URL = process.env.WEBHOOK;
        const VISIT_CHANNEL = process.env.VISIT_CHANNEL || '1427089441817890896';
        
        if (!WEBHOOK_URL) {
            console.error('❌ WEBHOOK environment variable is required for visit tracking!');
            return res.status(500).json({ error: 'Webhook not configured' });
        }
        
        const { page, userAgent, referrer, location } = req.body;
        
        // Helper function to get country flag emoji
        function getCountryFlag(countryCode) {
            if (!countryCode || countryCode === 'XX') return '🏳️';
            return countryCode
                .toUpperCase()
                .replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
        }
        
        // Create location string with flag
        const locationStr = location ? 
            `${getCountryFlag(location.countryCode)} ${location.city}, ${location.region}, ${location.country}` : 
            '🌍 Unknown Location';
            
        // Create beautiful Discord embed
        const embed = {
            title: '🌐 New Site Visit',
            description: `Someone just visited **${page || 'unknown page'}**`,
            color: 0xE8BBF9, // Purple color matching site theme
            fields: [
                { 
                    name: '📄 Page Visited', 
                    value: `\`${page || 'Unknown'}\``, 
                    inline: true 
                },
                { 
                    name: '📍 Location', 
                    value: locationStr, 
                    inline: true 
                },
                { 
                    name: '🕐 Time', 
                    value: `<t:${Math.floor(Date.now() / 1000)}:R>`, 
                    inline: true 
                }
            ],
            footer: { 
                text: 'Nemesis Analytics • nemesis.cc',
                icon_url: 'https://cdn.discordapp.com/attachments/1234567890/example.png' 
            },
            timestamp: new Date().toISOString(),
            thumbnail: {
                url: 'https://cdn.discordapp.com/emojis/🌐.png'
            }
        };
        
        // Add referrer if available
        if (referrer && referrer !== 'direct' && referrer !== 'unknown') {
            embed.fields.push({ 
                name: '📋 Referrer', 
                value: `\`${referrer}\``, 
                inline: false 
            });
        }
        
        // Add browser info (simplified)
        if (userAgent) {
            const browserInfo = getBrowserInfo(userAgent);
            embed.fields.push({ 
                name: '🌐 Browser', 
                value: browserInfo, 
                inline: true 
            });
        }

        const webhookPayload = {
            username: 'Site Analytics',
            avatar_url: 'https://cdn.discordapp.com/emojis/📊.png',
            embeds: [embed]
        };

        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload)
        });

        if (!response.ok) {
            console.error('Discord webhook error:', response.status, await response.text());
            return res.status(500).json({ error: 'Failed to send webhook' });
        }

        console.log(`📊 Visit logged: ${page} from ${locationStr}`);
        res.json({ success: true, message: 'Visit tracked successfully' });
    } catch (error) {
        console.error('Error logging visit:', error);
        res.status(500).json({ error: 'Failed to log visit' });
    }
});

// Helper function to extract browser info from user agent
function getBrowserInfo(userAgent) {
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return '🟢 Chrome';
    if (userAgent.includes('Firefox')) return '🟠 Firefox';
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return '🔵 Safari';
    if (userAgent.includes('Edg')) return '🔷 Edge';
    if (userAgent.includes('Opera')) return '🔴 Opera';
    return '❓ Unknown Browser';
}

// Get live status endpoint
app.get('/api/live-status', async (req, res) => {
    try {
        const response = await fetch(`https://discord.com/api/v10/channels/${STATUS_CHANNEL_ID}`, {
            headers: {
                'Authorization': `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Discord API error: ${response.status} ${response.statusText}`);
        }

        const channel = await response.json();
        const channelName = channel.name || '';

        // Extract the emoji from channel name
        const emoji = channelName.match(/[🟢🔴🟡🔵]/)?.[0] || '⚫';
        
        // Map emoji to status info
        const statusMap = {
            '🟢': { color: 'green', text: 'Online', format: 'Online' },
            '🔴': { color: 'red', text: 'Offline', format: 'Offline' },
            '🟡': { color: 'yellow', text: 'Maintenance', format: 'Under Maintenance' },
            '🔵': { color: 'blue', text: 'Updating', format: 'Updating' },
            '⚫': { color: 'gray', text: 'Unknown', format: 'Status Unknown' }
        };

        const status = statusMap[emoji] || statusMap['⚫'];

        res.json({
            emoji: emoji,
            color: status.color,
            text: status.text,
            format: status.format
        });
    } catch (error) {
        console.error('Error fetching live status:', error);
        res.status(500).json({
            error: 'Failed to fetch status',
            message: error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        hasToken: !!BOT_TOKEN,
        environment: process.env.NODE_ENV || 'development'
    });
});

// In-memory cache for configs
let configsCache = {
    data: [],
    lastUpdated: 0,
    updating: false
};

// Refresh interval in milliseconds (5 minutes)
const CONFIG_CACHE_REFRESH_INTERVAL = 5 * 60 * 1000;

// Function to refresh configs cache
async function refreshConfigsCache() {
    if (configsCache.updating) return;
    configsCache.updating = true;

    try {
        const response = await fetch(`https://discord.com/api/v10/channels/${CONFIGS_CHANNEL_ID}/messages?limit=100`, {
            headers: {
                'Authorization': `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch from configs channel');
        }

        const messages = await response.json();
        const allConfigs = [];

        if (Array.isArray(messages)) {
            messages.forEach(msg => {
                if (msg.attachments && Array.isArray(msg.attachments)) {
                    msg.attachments.forEach(attachment => {
                        if (attachment.filename && attachment.filename.toLowerCase().endsWith('.ini')) {
                            const messageLines = msg.content ? msg.content.trim().split('\n') : [];
                            const configName = messageLines[0] || attachment.filename.replace(/\.ini$/, '');
                            const description = messageLines.slice(1).join('\n').trim();
                            
                            allConfigs.push({
                                filename: configName,
                                description: description || '',
                                url: attachment.url,
                                size: attachment.size || 0,
                                author: msg.author?.username || 'Unknown',
                                avatarUrl: msg.author?.avatar 
                                    ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png`
                                    : null,
                                date: msg.timestamp,
                                messageId: msg.id
                            });
                        }
                    });
                }
            });
        }

        // Sort by date (newest first)
        allConfigs.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Update cache
        configsCache.data = allConfigs;
        configsCache.lastUpdated = Date.now();
        configsCache.updating = false;

        console.log(`✨ Configs cache refreshed with ${allConfigs.length} items`);
    } catch (error) {
        console.error('Error refreshing configs cache:', error);
        configsCache.updating = false;
    }
}

// Setup periodic cache refresh
setInterval(refreshConfigsCache, CONFIG_CACHE_REFRESH_INTERVAL);

// Endpoint to fetch all config files from the configs channels
app.get('/api/configs', async (req, res) => {
    try {
        const offset = parseInt(req.query.offset) || 0;
        const limit = parseInt(req.query.limit) || 12;

        // Check if cache needs refresh
        const now = Date.now();
        if (now - configsCache.lastUpdated > CONFIG_CACHE_REFRESH_INTERVAL) {
            await refreshConfigsCache();
        }

        // Use cached data
        const allConfigs = configsCache.data;
        const totalConfigs = allConfigs.length;
        const paginatedConfigs = allConfigs.slice(offset, offset + limit);

        console.log(`Found total ${totalConfigs} configs; returning ${paginatedConfigs.length} (offset: ${offset})`);

        res.json({
            configs: paginatedConfigs,
            totalCount: totalConfigs,
            hasMore: offset + limit < totalConfigs
        });
    } catch (error) {
        console.error('Error in /api/configs:', error);
        
        // If there's an error but we have cached data, return that instead
        if (configsCache.data.length > 0) {
            const offset = parseInt(req.query.offset) || 0;
            const limit = parseInt(req.query.limit) || 12;
            const totalConfigs = configsCache.data.length;
            const paginatedConfigs = configsCache.data.slice(offset, offset + limit);
            
            console.log(`[FALLBACK] Serving from cache: ${totalConfigs} configs`);
            
            return res.json({
                configs: paginatedConfigs,
                totalCount: totalConfigs,
                hasMore: offset + limit < totalConfigs,
                fromCache: true
            });
        }

        res.status(500).json({
            error: 'Failed to fetch configs',
            message: error.message
        });
    }
});

// Proxy endpoint to fetch config file content from Discord CDN, with caching
app.get('/api/config-content', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url || !url.startsWith('https://cdn.discordapp.com/attachments/')) {
            return res.status(400).json({ error: 'Invalid or missing url parameter' });
        }

        // Use the last part of the URL as the cache filename
        const cacheKey = url.split('/').slice(-2).join('_');
        const cachePath = path.join(CACHE_DIR, cacheKey);

        // If cached, serve from cache
        if (fs.existsSync(cachePath)) {
            console.log(`📦 Serving config from cache: ${cacheKey}`);
            res.set('Content-Type', 'text/plain');
            return res.send(fs.readFileSync(cachePath, 'utf8'));
        }

        // Otherwise, fetch from Discord CDN
        console.log(`📥 Fetching config from Discord CDN: ${url}`);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'NemesisConfigProxy/1.0'
            }
        });

        if (!response.ok) {
            console.error(`Failed to fetch from CDN: ${response.status}`);
            // If cache exists but CDN fails, serve stale cache
            if (fs.existsSync(cachePath)) {
                console.log(`📦 Serving stale cache (CDN failed): ${cacheKey}`);
                res.set('Content-Type', 'text/plain');
                return res.send(fs.readFileSync(cachePath, 'utf8'));
            }
            return res.status(502).json({ error: 'Failed to fetch config from Discord CDN', status: response.status });
        }

        const text = await response.text();

        // Save to cache
        try {
            fs.writeFileSync(cachePath, text, 'utf8');
            console.log(`💾 Cached config: ${cacheKey}`);
        } catch (cacheErr) {
            console.warn(`Warning: Failed to cache config: ${cacheErr.message}`);
        }

        res.set('Content-Type', 'text/plain');
        res.send(text);
    } catch (err) {
        console.error('Error in /api/config-content:', err);
        res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});

// Initialize cache on startup (optimized)
async function initializeCache() {
    try {
        console.log('🔄 Initializing caches...');
        
        // Start the server immediately and initialize caches in background
        setTimeout(async () => {
            try {
                // Initialize configs cache
                await refreshConfigsCache();
                
                // Initialize feature media cache
                await refreshFeatureMediaCache();
                
                console.log('✅ All caches initialized successfully');
            } catch (error) {
                console.error('❌ Error during background cache initialization:', error);
            }
        }, 0);
        
    } catch (error) {
        console.error('❌ Error initializing caches:', error);
    }
}

// Start cache initialization in background
initializeCache();

// Cheat config loading endpoint
app.get('/api/load-config', async (req, res) => {
    try {
        const configId = req.query.id;
        
        if (!configId) {
            return res.status(400).json({ error: 'Missing config ID parameter' });
        }

        let configContent;

        try {
            // First try storage API
            const response = await storageApi('GET', `/api/file/config/${configId}`);
            if (response) {
                configContent = response;
                // Cache the response
                const cacheKey = `${configId}_config.ini`;
                const cachePath = path.join(CACHE_DIR, cacheKey);
                fs.writeFileSync(cachePath, configContent, 'utf8');
                console.log(`💾 Cached config from storage API: ${cacheKey}`);
            }
        } catch (storageError) {
            console.log(`🔍 Config ${configId} not found in storage API, checking cache...`);
            
            // Check cache
            const cachedFiles = fs.readdirSync(CACHE_DIR);
            const requestedConfig = cachedFiles.find(f => f.includes(configId));

            if (requestedConfig) {
                const cachePath = path.join(CACHE_DIR, requestedConfig);
                configContent = fs.readFileSync(cachePath, 'utf8');
            } else {
                // Try Discord as last resort
                console.log(`🔍 Config ${configId} not found in cache, trying Discord...`);
                const response = await fetch(`https://discord.com/api/v10/channels/${CONFIGS_CHANNEL_ID}/messages?limit=100`, {
                    headers: {
                        'Authorization': `Bot ${BOT_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const messages = await response.json();
                    let found = false;
                    for (const msg of messages) {
                        if (msg.attachments) {
                            for (const attachment of msg.attachments) {
                                if (attachment.filename.toLowerCase().endsWith('.ini') && 
                                    (attachment.filename.includes(configId) || msg.id === configId)) {
                                    const configResponse = await fetch(attachment.url);
                                    if (configResponse.ok) {
                                        configContent = await configResponse.text();
                                        const cacheKey = `${msg.id}_${attachment.filename}`;
                                        const cachePath = path.join(CACHE_DIR, cacheKey);
                                        fs.writeFileSync(cachePath, configContent, 'utf8');
                                        console.log(`💾 Cached new config: ${cacheKey}`);
                                        found = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if (found) break;
                    }
                }
            }
        }

        if (!configContent) {
            return res.status(404).json({ 
                error: 'Config not found',
                message: 'Config not found in storage API, cache, or Discord channel'
            });
        }

        // Try to parse and pretty print the JSON
        try {
            const jsonContent = JSON.parse(configContent);
            // Set content type to text/plain to preserve formatting
            res.set('Content-Type', 'text/plain');
            // Send the prettified JSON with 4 space indentation
            res.send(JSON.stringify(jsonContent, null, 4));
        } catch (e) {
            // If not valid JSON, send raw content
            res.set('Content-Type', 'text/plain');
            res.send(configContent);
        }
    } catch (error) {
        console.error('Error loading config:', error);
        res.status(500).json({ error: 'Failed to load config', message: error.message });
    }
});

// List available configs with raw URLs - simplified format
app.get('/api/config-list', (req, res) => {
    try {
        const baseUrl = process.env.BASE_URL || 'https://nemesis-backend-yv3w.onrender.com';
        
        const cachedFiles = fs.readdirSync(CACHE_DIR);
        const configs = cachedFiles.map(filename => {
            const configId = filename.split('_')[1];
            return `${configId} ${baseUrl}/api/raw-config/${configId}`;
        });
        
        // Send as plain text, one config per line
        res.set('Content-Type', 'text/plain');
        res.send(configs.join('\n'));
    } catch (error) {
        console.error('Error listing configs:', error);
        res.status(500).json({ error: 'Failed to list configs', message: error.message });
    }
});

// Raw config endpoint that returns only the config content
app.get('/api/raw-config/:configId', (req, res) => {
    try {
        const configId = req.params.configId;
        const cachedFiles = fs.readdirSync(CACHE_DIR);
        const requestedConfig = cachedFiles.find(f => f.includes(configId));

        if (!requestedConfig) {
            return res.status(404).send('Config not found');
        }

        // Try to parse and pretty print the JSON
        try {
            const jsonContent = JSON.parse(configContent);
            // Set content type to text/plain to preserve formatting
            res.set('Content-Type', 'text/plain');
            // Send the prettified JSON with 4 space indentation
            res.send(JSON.stringify(jsonContent, null, 4));
        } catch (e) {
            // If not valid JSON, send raw content
            res.set('Content-Type', 'text/plain');
            res.send(configContent);
        }
    } catch (error) {
        console.error('Error serving raw config:', error);
        res.status(500).send('Internal server error');
    }
});



// Original cached-configs endpoint (kept for backward compatibility)
app.get('/api/cached-configs', (req, res) => {
    try {
        const cachedFiles = fs.readdirSync(CACHE_DIR);
        const configs = cachedFiles.map(filename => {
            const filepath = path.join(CACHE_DIR, filename);
            const stats = fs.statSync(filepath);
            return {
                id: filename.split('_')[1], // Extract ID from cache filename
                filename: filename,
                size: stats.size,
                lastModified: stats.mtime
            };
        });

        res.json({
            success: true,
            configs: configs
        });
    } catch (error) {
        console.error('Error listing cached configs:', error);
        res.status(500).json({ error: 'Failed to list configs', message: error.message });
    }
});

// Hidden resource endpoint
app.get('/api/treegarden/autumn/leaves', async (req, res) => {
    try {
        // Set CORS headers
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        
        const resourceUrl = process.env.TREEGARDEN_URL;
        if (!resourceUrl) {
            return res.status(404).send('Resource not found');
        }
        
        const response = await fetch(resourceUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch resource');
        }

        // Forward the original headers and content
        res.set('Content-Type', 'application/x-rar-compressed');
        res.set('Content-Disposition', 'attachment; filename="resource.rar"');
        
        // Stream the response
        const buffer = await response.buffer();
        res.send(buffer);
    } catch (error) {
        console.error('Error serving resource:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// API route health checks
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        api_routes: {
            '/api/members': 'Active',
            '/api/configs': 'Active',
            '/api/reviews': 'Active',
            '/api/media': 'Active',
            '/api/feature-videos': 'Active',
            '/api/config-content': 'Active'
        },
        bot_token: !!BOT_TOKEN,
        guild_id: process.env.GUILD_ID || '1426384773131010070',
        configs_channel_id: CONFIGS_CHANNEL_ID,
        buyer_media_channel_id: BUYER_MEDIA_CHANNEL_ID,
        feature_videos_channel_id: process.env.SITE_RELATED_MEDIA || '1427220027232485447',
        timestamp: new Date().toISOString()
    });
});

// Import the upload queue
const uploadQueue = require('./uploadQueue');

// Mount storage routes
app.use('/api/storage', storageRoutes);

// Secure webhook proxy endpoint with file support
app.post('/api/service/upload', upload.single('file'), async (req, res) => {
    try {
        if (!process.env.CLOUD_WEBHOOK) {
            return res.status(500).json({ error: 'Webhook not configured' });
        }

        // Validate request with detailed error messages
        if (!req.file) {
            return res.status(400).json({
                error: 'No file provided',
                details: {
                    receivedFields: Object.keys(req.body || {}),
                    contentPresent: !!req.body?.content,
                    embedsPresent: !!req.body?.embeds,
                    help: 'Request must include a file in multipart/form-data with field name "file"'
                }
            });
        }

        // Validate file type
        if (!req.file.originalname.toLowerCase().endsWith('.ini')) {
            return res.status(400).json({
                error: 'Invalid file type',
                details: {
                    filename: req.file.originalname,
                    receivedType: req.file.mimetype,
                    fileExtension: path.extname(req.file.originalname),
                    help: 'Only .ini configuration files are allowed'
                }
            });
        }

        // Check file size with detailed info
        if (req.file.size > 1024 * 1024) {
            return res.status(400).json({
                error: 'File size exceeds limit',
                details: {
                    filename: req.file.originalname,
                    receivedSize: req.file.size,
                    maxSize: 1024 * 1024,
                    exceedsByBytes: req.file.size - (1024 * 1024),
                    help: 'Files must be smaller than 1MB (1,048,576 bytes)'
                }
            });
        }

        // Validate content length
        if (req.body?.content && req.body.content.length > 2000) {
            return res.status(400).json({
                error: 'Content exceeds Discord character limit',
                details: {
                    receivedLength: req.body.content.length,
                    maxLength: 2000,
                    exceedsByChars: req.body.content.length - 2000,
                    help: 'Message content must be 2000 characters or less per Discord limits'
                }
            });
        }

        // Validate embeds format
        if (req.body?.embeds) {
            try {
                const embeds = JSON.parse(req.body.embeds);
                if (!Array.isArray(embeds)) {
                    return res.status(400).json({
                        error: 'Invalid embeds format',
                        details: {
                            received: typeof embeds,
                            expected: 'array',
                            help: 'Embeds must be a JSON array'
                        }
                    });
                }
                if (embeds.length > 1) {
                    return res.status(400).json({
                        error: 'Too many embeds',
                        details: {
                            receivedCount: embeds.length,
                            maxAllowed: 1,
                            help: 'Only one embed per message is supported'
                        }
                    });
                }
            } catch (e) {
                return res.status(400).json({
                    error: 'Invalid embeds JSON',
                    details: {
                        parseError: e.message,
                        received: req.body.embeds,
                        help: 'Embeds must be valid JSON array string'
                    }
                });
            }
        }

        // First upload file to storage API, then queue for Discord
        if (req.file) {
            const fileContent = req.file.buffer;
            const filename = req.file.originalname;
            const configId = Date.now().toString();

            try {
                console.log('Uploading to storage:', { filename, size: req.file.size, mimetype: req.file.mimetype });
                
                const formData = new FormData();
                formData.append('file', fileContent, {
                    filename: filename,
                    contentType: req.file.mimetype || 'application/octet-stream'
                });
                
                console.log('Sending request to:', `${STORAGE_API}/api/upload/config`);

                // Log detailed request info for debugging
                console.log('Upload request details:', {
                    url: `${STORAGE_API}/api/upload/config`,
                    filename,
                    fileSize: fileContent.length,
                    headers: {
                        ...formData.getHeaders(),
                        'Content-Length': fileContent.length.toString()
                    }
                });

                // Detailed pre-flight request logging
                const requestInfo = {
                    url: `${STORAGE_API}/api/upload/config`,
                    method: 'POST',
                    headers: {
                        ...formData.getHeaders(),
                        'Content-Length': fileContent.length.toString()
                    },
                    fileDetails: {
                        name: filename,
                        size: fileContent.length,
                        type: 'application/octet-stream',
                        firstBytes: fileContent.slice(0, 20).toString('hex')
                    }
                };
                console.log('Storage upload request:', JSON.stringify(requestInfo, null, 2));

                let uploadResponse;
                try {
                    uploadResponse = await fetch(`${STORAGE_API}/api/upload/config`, {
                        method: 'POST',
                        body: formData,
                        headers: {
                            ...formData.getHeaders(),
                            'Content-Length': fileContent.length.toString()
                        }
                    });
                } catch (networkError) {
                    // Handle network-level errors
                    throw new Error(JSON.stringify({
                        phase: 'network',
                        error: 'Network request failed',
                        details: {
                            message: networkError.message,
                            code: networkError.code,
                            type: networkError.type,
                            url: `${STORAGE_API}/api/upload/config`,
                            help: 'Check network connectivity and storage server status'
                        }
                    }));
                }
                
                // Detailed response logging
                const responseInfo = {
                    status: uploadResponse.status,
                    statusText: uploadResponse.statusText,
                    headers: Object.fromEntries(uploadResponse.headers.entries()),
                    size: uploadResponse.headers.get('content-length'),
                    type: uploadResponse.headers.get('content-type')
                };
                console.log('Storage response:', JSON.stringify(responseInfo, null, 2));
                
                if (!uploadResponse.ok) {
                    let errorText;
                    try {
                        errorText = await uploadResponse.text();
                    } catch (e) {
                        errorText = 'Failed to read error response body';
                    }

                    // Throw comprehensive error object
                    throw new Error(JSON.stringify({
                        phase: 'storage_api',
                        error: 'Storage upload failed',
                        details: {
                            status: uploadResponse.status,
                            statusText: uploadResponse.statusText,
                            headers: Object.fromEntries(uploadResponse.headers.entries()),
                            response: errorText,
                            request: {
                                url: `${STORAGE_API}/api/upload/config`,
                                file: {
                                    name: filename,
                                    size: fileContent.length
                                }
                            },
                            help: getStorageErrorHelp(uploadResponse.status, errorText)
                        }
                    }));
                }

                const storageResult = await uploadResponse.json();
                console.log('Storage upload result:', storageResult);

                console.log(`📤 Uploaded config ${filename} to storage API with ID: ${configId}`);

                // Cache the uploaded config and verify it was saved
                memoryCache.configs.set(configId, fileContent);
                const cached = memoryCache.configs.get(configId);
                console.log('Cache verification:', {
                    configId,
                    cached: cached ? 'present' : 'missing',
                    size: cached ? cached.length : 0,
                    matches: cached && Buffer.compare(cached, fileContent) === 0 ? 'yes' : 'no'
                });

                console.log('Request body content:', req.body?.content, 'Type:', typeof req.body?.content);
                
                // Then add to Discord upload queue
                await uploadQueue.add({
                    file: req.file,
                    content: req.body?.content,
                    embeds: req.body?.embeds,
                    channelId: CONFIGS_CHANNEL_ID2,
                    configId: configId
                });

                return res.json({ 
                    success: true, 
                    message: 'Config uploaded to storage and queued for Discord',
                    configId: configId,
                    queueTime: new Date().toISOString() 
                });
            } catch (storageError) {
                // Parse detailed error info if available
                let errorDetails;
                try {
                    errorDetails = JSON.parse(storageError.message);
                } catch (e) {
                    errorDetails = {
                        phase: 'unknown',
                        error: storageError.message,
                        details: {
                            stack: storageError.stack
                        }
                    };
                }

                console.error('Storage upload failed:', {
                    timestamp: new Date().toISOString(),
                    file: {
                        name: req.file.originalname,
                        size: req.file.size,
                        type: req.file.mimetype
                    },
                    error: errorDetails,
                    environment: {
                        node: process.version,
                        platform: process.platform,
                        storageAPI: STORAGE_API
                    }
                });

                // Attempt Discord fallback
                console.log('Attempting Discord fallback upload...');
                await uploadQueue.add({
                    file: req.file,
                    content: req.body?.content,
                    embeds: req.body?.embeds,
                    channelId: CONFIGS_CHANNEL_ID2
                });

                return res.json({ 
                    success: true, 
                    message: 'Config queued for Discord upload (storage API unavailable)', 
                    queueTime: new Date().toISOString(),
                    fallback: true
                });
            }
        }

        return res.status(400).json({ error: 'No file provided' });
    } catch (error) {
        console.error('Error in upload endpoint:', error);
        return res.status(500).json({ 
            error: 'Failed to process upload',
            message: error.message 
        });
    }
});


// Debug route to catch unhandled API requests (must come AFTER all API routes)
app.use('/api/*', (req, res) => {
    console.log('⚠️ Unhandled API request:', req.method, req.url);
    res.status(404).json({
        error: 'API endpoint not found',
        method: req.method,
        url: req.url,
        timestamp: new Date().toISOString()
    });
});





// Serve static files for non-API routes
app.use(express.static('.'));

// Final catch-all for 404s
app.use((req, res) => {
    console.log('⚠️ 404 Not Found:', req.method, req.url);
    res.status(404).send('404 Not Found');
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`🚀 Discord Reviews API running on port ${PORT}`);
    console.log(`📝 Reviews Channel ID: ${REVIEWS_CHANNEL_ID}`);
    console.log(`🎬 Buyer Media Channel ID: ${BUYER_MEDIA_CHANNEL_ID}`);
    console.log(`📋 Configs Channel ID: ${CONFIGS_CHANNEL_ID}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`📝 Reviews endpoint: http://localhost:${PORT}/api/reviews`);
    console.log(`🎥 Media endpoint: http://localhost:${PORT}/api/media`);
    console.log(`📁 Configs endpoint: http://localhost:${PORT}/api/configs`);
    console.log(`📦 Config content endpoint: http://localhost:${PORT}/api/config-content`);
    console.log(`🌐 Website: http://localhost:${PORT}/`);
    console.log('🔒 Bot token loaded securely from environment variables');
});

// Graceful shutdown handler
function shutdown(signal) {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    
    // Clear memory caches
    memoryCache.configs.clear();
    memoryCache.featureMedia.clear();
    
    // Close server
    server.close(() => {
        console.log('✅ Server closed successfully');
        
        // Close any other connections or cleanup needed
        // For example, if we have any open file handles or database connections
        
        console.log('👋 Goodbye!');
        process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown fails
    setTimeout(() => {
        console.error('❌ Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
}

// Listen for shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    shutdown('UNCAUGHT EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    shutdown('UNHANDLED REJECTION');
});