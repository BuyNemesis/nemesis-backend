// Load environment variables (for local development)
require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Ensure cache directory exists
const CACHE_DIR = path.join(__dirname, 'config_cache');
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR);
}

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

// CORS middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Use environment variables for sensitive data (secure for deployment)
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID || '1424944848187953174';
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
        const response = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages?limit=100`, {
            headers: {
                'Authorization': `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error(`Discord API error: ${response.status} ${response.statusText}`);
        }
        const messages = await response.json();
        console.log(`Fetched ${messages.length} messages`);
        // Parse messages in the format: first line = review, second line = rating
        const allValidReviews = messages
            .filter(msg => {
                if (!msg.content || msg.author.bot) {
                    console.log('Filtered out:', msg.author.bot ? 'bot message' : 'no content');
                    return false;
                }
                const lines = msg.content.trim().split('\n');
                return lines.length >= 2 && lines[1].includes('/5');
            })
            .map(msg => {
                const lines = msg.content.trim().split('\n');
                const reviewText = lines[0];
                const ratingLine = lines[1];
                // Extract rating (e.g., "4/5" -> 4, "0/5" -> 0)
                const ratingMatch = ratingLine.match(/(\d+)\/5/);
                const rating = ratingMatch ? parseInt(ratingMatch[1]) : null;
                if (rating === null || rating < 0) {
                    return null;
                }
                return {
                    id: msg.id,
                    author: {
                        username: msg.author.username,
                        avatar: msg.author.avatar ? 
                            `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png` :
                            `https://cdn.discordapp.com/embed/avatars/${msg.author.discriminator % 5}.png`
                    },
                    content: reviewText,
                    rating: Math.min(rating, 5),
                    timestamp: msg.timestamp
                };
            })
            .filter(review => review !== null)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const totalReviews = allValidReviews.length;
        const paginatedReviews = allValidReviews.slice(offset, offset + limit);
        console.log(`Parsed ${totalReviews} valid reviews, returning ${paginatedReviews.length} (offset: ${offset})`);
        res.json({
            reviews: paginatedReviews,
            totalCount: totalReviews,
            hasMore: offset + limit < totalReviews
        });
    } catch (error) {
        console.error('Error fetching Discord messages:', error);
        res.status(500).json({
            error: 'Failed to fetch reviews',
            message: error.message
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

// Feature videos endpoint - fetch MP4 files from SITE_RELATED_MEDIA channel
app.get('/api/feature-videos', async (req, res) => {
    try {
        const FEATURE_VIDEOS_CHANNEL_ID = process.env.SITE_RELATED_MEDIA || '1427220027232485447';
        
        console.log(`Fetching feature videos from Discord channel ${FEATURE_VIDEOS_CHANNEL_ID}`);
        
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
            
            // Check for MP4 and PNG attachments
            if (msg.attachments && msg.attachments.length > 0) {
                msg.attachments.forEach(attachment => {
                    const fname = (attachment.filename || '').toLowerCase();
                    const ctype = (attachment.content_type || '').toLowerCase();
                    
                    // MP4 video files OR PNG image files
                    if (fname.endsWith('.mp4') || fname.endsWith('.png')) {
                        videos.push({
                            name: attachment.filename, // e.g., "Aimbot.mp4", "ESP.png", "NO_ESP.png"
                            url: attachment.url, // Direct Discord CDN URL
                            messageId: msg.id,
                            timestamp: msg.timestamp
                        });
                        console.log(`Found feature media: ${attachment.filename}`);
                    }
                });
            }
        });
        
        // Sort by date (newest first)
        videos.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        console.log(`Returning ${videos.length} feature videos`);

        res.json({ videos });
    } catch (error) {
        console.error('Error fetching feature videos from Discord:', error);
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

        // The channel name itself contains the status emoji
        const emoji = channelName.match(/[🟢🔴🟡]/)?.[0] || '⚫';
        
        // Map emoji to color
        const colorMap = {
            '🟢': 'green',
            '🔴': 'red',
            '🟡': 'yellow',
            '⚫': 'gray'
        };

        res.json({
            status: emoji,
            color: colorMap[emoji],
            timestamp: new Date().toISOString()
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

// Endpoint to fetch all config files from the configs channels
app.get('/api/configs', async (req, res) => {
    try {
        const offset = parseInt(req.query.offset) || 0;
        const limit = parseInt(req.query.limit) || 12;
        let allConfigs = [];

        // Fetch from both channels in parallel
        try {
            const [response1, response2] = await Promise.all([
                fetch(`https://discord.com/api/v10/channels/${CONFIGS_CHANNEL_ID}/messages?limit=100`, {
                    headers: {
                        'Authorization': `Bot ${BOT_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }),
                fetch(`https://discord.com/api/v10/channels/${CONFIGS_CHANNEL_ID2}/messages?limit=100`, {
                    headers: {
                        'Authorization': `Bot ${BOT_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                })
            ]);

            if (!response1.ok || !response2.ok) {
                throw new Error('Failed to fetch from one or both channels');
            }

            // Get messages from both channels
            const [messages1, messages2] = await Promise.all([
                response1.json(),
                response2.json()
            ]);

            // Process messages from both channels
            [messages1, messages2].forEach(messages => {
                if (Array.isArray(messages)) {
                    messages.forEach(msg => {
                        if (msg.attachments && Array.isArray(msg.attachments)) {
                            msg.attachments.forEach(attachment => {
                                if (attachment.filename && attachment.filename.toLowerCase().endsWith('.ini')) {
                                    allConfigs.push({
                                        filename: attachment.filename,
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
            });

        } catch (fetchError) {
            console.error('Error fetching configs from channels:', fetchError);
            throw fetchError;
        }

        // Sort by date (newest first)
        allConfigs.sort((a, b) => new Date(b.date) - new Date(a.date));

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
        console.log('🔄 Initializing config cache...');
        
        // Start the server immediately and initialize cache in background
        setTimeout(async () => {
            try {
                const response = await fetch(`https://discord.com/api/v10/channels/${CONFIGS_CHANNEL_ID}/messages?limit=100`, {
                    headers: {
                        'Authorization': `Bot ${BOT_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`Discord API error: ${response.status} ${response.statusText}`);
                }

                const messages = await response.json();
                let cacheCount = 0;
                
                // Process configs in parallel batches
                const batchSize = 5;
                for (let i = 0; i < messages.length; i += batchSize) {
                    const batch = messages.slice(i, i + batchSize);
                    await Promise.all(batch.map(async (msg) => {
                        if (msg.attachments) {
                            for (const attachment of msg.attachments) {
                                if (attachment.filename.toLowerCase().endsWith('.ini')) {
                                    try {
                                        const configResponse = await fetch(attachment.url);
                                        if (configResponse.ok) {
                                            const content = await configResponse.text();
                                            const cacheKey = `${msg.id}_${attachment.filename}`;
                                            const cachePath = path.join(CACHE_DIR, cacheKey);
                                            fs.writeFileSync(cachePath, content, 'utf8');
                                            cacheCount++;
                                        }
                                    } catch (err) {
                                        console.warn(`⚠️ Failed to cache config ${attachment.filename}:`, err.message);
                                    }
                                }
                            }
                        }
                    }));
                }
                
                console.log(`✅ Cache initialized with ${cacheCount} configs`);
            } catch (error) {
                console.error('❌ Error during background cache initialization:', error);
            }
        }, 0);
        
    } catch (error) {
        console.error('❌ Error initializing cache:', error);
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

        // First check cache
        const cachedFiles = fs.readdirSync(CACHE_DIR);
        let requestedConfig = cachedFiles.find(f => f.includes(configId));

        // If not in cache, try to fetch from Discord and cache it
        if (!requestedConfig) {
            console.log(`🔍 Config ${configId} not found in cache, fetching from Discord...`);
            const response = await fetch(`https://discord.com/api/v10/channels/${CONFIGS_CHANNEL_ID}/messages?limit=100`, {
                headers: {
                    'Authorization': `Bot ${BOT_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const messages = await response.json();
                for (const msg of messages) {
                    if (msg.attachments) {
                        for (const attachment of msg.attachments) {
                            if (attachment.filename.toLowerCase().endsWith('.ini') && 
                                (attachment.filename.includes(configId) || msg.id === configId)) {
                                const configResponse = await fetch(attachment.url);
                                if (configResponse.ok) {
                                    const content = await configResponse.text();
                                    const cacheKey = `${msg.id}_${attachment.filename}`;
                                    const cachePath = path.join(CACHE_DIR, cacheKey);
                                    fs.writeFileSync(cachePath, content, 'utf8');
                                    requestedConfig = cacheKey;
                                    console.log(`💾 Cached new config: ${cacheKey}`);
                                    break;
                                }
                            }
                        }
                    }
                    if (requestedConfig) break;
                }
            }
        }

        if (!requestedConfig) {
            return res.status(404).json({ 
                error: 'Config not found',
                message: 'Config not found in cache or Discord channel'
            });
        }

        const configPath = path.join(CACHE_DIR, requestedConfig);
        const configContent = fs.readFileSync(configPath, 'utf8');

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

        const configPath = path.join(CACHE_DIR, requestedConfig);
        const configContent = fs.readFileSync(configPath, 'utf8');

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
app.listen(PORT, () => {
    console.log(`🚀 Discord Reviews API running on port ${PORT}`);
    console.log(`📝 Reviews Channel ID: ${CHANNEL_ID}`);
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
