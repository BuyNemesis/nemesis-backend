// Load environment variables (for local development)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

// Use environment variables for sensitive data (secure for deployment)
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID || '1424944848187953174';

// Validate required environment variables
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN environment variable is required!');
    console.error('💡 Set it in Railway dashboard or create a .env file locally');
    process.exit(1);
}

console.log('✅ Bot token loaded from environment variables');
console.log('🔒 Token is secure and hidden');

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
                console.log('Message content:', JSON.stringify(msg.content));
                console.log('Lines after split:', lines);
                console.log('Lines length:', lines.length);
                console.log('Second line contains /5:', lines.length >= 2 ? lines[1].includes('/5') : false);
                return lines.length >= 2 && lines[1].includes('/5');
            })
            .map(msg => {
                const lines = msg.content.trim().split('\n');
                const reviewText = lines[0];
                const ratingLine = lines[1];
                
                // Extract rating (e.g., "4/5" -> 4, "0/5" -> 0)
                const ratingMatch = ratingLine.match(/(\d+)\/5/);
                const rating = ratingMatch ? parseInt(ratingMatch[1]) : null;
                
                // Skip if rating is negative or invalid
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
                    rating: Math.min(rating, 5), // Allow 0-5, cap at 5
                    timestamp: msg.timestamp
                };
            })
            .filter(review => review !== null) // Remove invalid ratings
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Sort by newest first
        
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        hasToken: !!BOT_TOKEN,
        environment: process.env.NODE_ENV || 'development'
    });
});

// Serve static files (HTML, CSS, JS)
app.use(express.static('.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Discord Reviews API running on port ${PORT}`);
    console.log(`📺 Channel ID: ${CHANNEL_ID}`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
    console.log(`📝 Reviews endpoint: http://localhost:${PORT}/api/reviews`);
    console.log(`🌐 Website: http://localhost:${PORT}/`);
    console.log('🔒 Bot token loaded securely from environment variables');
});
