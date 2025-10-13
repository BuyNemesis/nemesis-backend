// Load environment variables (for local development)
require('dotenv').config();

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
const BUYER_MEDIA_CHANNEL_ID = process.env.BUYER_MEDIA_CHANNEL_ID || '1426388792012705874';

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

// Patchnotes endpoint - read plaintext patchnotes from the development channel
app.get('/api/patchnotes', async (req, res) => {
    try {
        const DEV_CHANNEL = process.env.DEVELOPMENT_CHANNEL || process.env.DEVELOPMENT_CHANNEL_ID || process.env.DEVELOPMENT_CHANNEL_ID || '1426388284501659678';
        console.log(`Fetching patchnotes from channel ${DEV_CHANNEL}`);

        const response = await fetch(`https://discord.com/api/v10/channels/${DEV_CHANNEL}/messages?limit=50`, {
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
        res.json({ notes });
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
                    name: '🕒 Time', 
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
                name: '🔗 Referrer', 
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
    if (userAgent.includes('Edg')) return '🟦 Edge';
    if (userAgent.includes('Opera')) return '🔴 Opera';
    return '❓ Unknown Browser';
}

        if (!response.ok) {
            console.error('Discord webhook error:', response.status, await response.text());
            return res.status(500).json({ error: 'Failed to send webhook' });
        }

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        hasToken: !!BOT_TOKEN,
        environment: process.env.NODE_ENV || 'development'
    });
});
// Endpoint to count .ini files in the configs channel
app.get('/api/configs', async (req, res) => {
    try {
        let iniCount = 0;
        let lastMessageId = undefined;
        let keepFetching = true;
        while (keepFetching) {
            let url = `https://discord.com/api/v10/channels/${CONFIGS_CHANNEL_ID}/messages?limit=100`;
            if (lastMessageId) {
                url += `&before=${lastMessageId}`;
            }
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bot ${BOT_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            const messages = await response.json();
            console.log('Fetched messages:', JSON.stringify(messages, null, 2));
            if (!Array.isArray(messages) || messages.length === 0) {
                break;
            }
            for (const msg of messages) {
                if (msg.attachments && Array.isArray(msg.attachments)) {
                    console.log('Message ID:', msg.id, 'Attachments:', msg.attachments);
                    for (const att of msg.attachments) {
                        if (att.filename && att.filename.toLowerCase().endsWith('.ini')) {
                            console.log('Found .ini file:', att.filename);
                            iniCount++;
                        }
                    }
                }
            }
            if (messages.length < 100) {
                keepFetching = false;
            } else {
                lastMessageId = messages[messages.length - 1].id;
            }
        }
        res.json({ count: iniCount });
    } catch (error) {
        console.error('Error fetching configs:', error);
        res.status(500).json({ error: 'Failed to fetch configs', message: error.message });
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
            '/api/media': 'Active'
        },
        bot_token: !!BOT_TOKEN,
        guild_id: process.env.GUILD_ID || '1426384773131010070',
        buyer_media_channel_id: BUYER_MEDIA_CHANNEL_ID,
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
    console.log(`📺 Reviews Channel ID: ${CHANNEL_ID}`);
    console.log(`🎬 Buyer Media Channel ID: ${BUYER_MEDIA_CHANNEL_ID}`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
    console.log(`📝 Reviews endpoint: http://localhost:${PORT}/api/reviews`);
    console.log(`🎥 Media endpoint: http://localhost:${PORT}/api/media`);
    console.log(`🌐 Website: http://localhost:${PORT}/`);
    console.log('🔒 Bot token loaded securely from environment variables');
});
