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

// Media endpoint - fetch Streamable links from buyer media channel
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

        // Extract Streamable links from messages
        const streamableRegex = /streamable\.com\/([a-zA-Z0-9]+)/gi;
        
        const allVideos = messages
            .filter(msg => !msg.author.bot && msg.content)
            .map(msg => {
                const matches = [...msg.content.matchAll(streamableRegex)];
                
                return matches.map(match => {
                    const streamableId = match[1];
                    // Try to extract title from message (first line before the link)
                    const lines = msg.content.split('\n');
                    const titleLine = lines.find(line => !line.includes('streamable.com'));
                    
                    return {
                        streamableId: streamableId,
                        title: titleLine?.trim() || 'Nemesis Gameplay',
                        author: msg.author.username,
                        date: msg.timestamp,
                        messageId: msg.id
                    };
                });
            })
            .flat()
            .filter(video => video !== null)
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        const totalVideos = allVideos.length;
        const paginatedVideos = allVideos.slice(offset, offset + limit);

        console.log(`Found ${totalVideos} videos, returning ${paginatedVideos.length} (offset: ${offset})`);

        res.json({
            videos: paginatedVideos,
            totalCount: totalVideos,
            hasMore: offset + limit < totalVideos
        });
    } catch (error) {
        console.error('Error fetching media from Discord:', error);
        res.status(500).json({
            error: 'Failed to fetch media',
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
