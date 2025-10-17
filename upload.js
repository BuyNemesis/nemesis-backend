const express = require('express');
const router = express.Router();
const FormData = require('form-data');
const uploadQueue = require('./uploadQueue');
const multer = require('multer');

// Set up multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Secure webhook proxy endpoint with file support
router.post('/api/service/upload', upload.single('file'), async (req, res) => {
    try {
        if (!process.env.CLOUD_WEBHOOK) {
            return res.status(500).json({ error: 'Webhook not configured' });
        }

        // Validate request
        if (req.file) {
            // Only allow .ini files
            if (!req.file.originalname.toLowerCase().endsWith('.ini')) {
                return res.status(400).json({ error: 'Only .ini files are allowed' });
            }
            // Check file size (max 1MB)
            if (req.file.size > 1024 * 1024) {
                return res.status(400).json({ error: 'File too large' });
            }
        }

        // Validate content and embeds
        if (req.body) {
            if (req.body.content && req.body.content.length > 2000) {
                return res.status(400).json({ error: 'Content too long' });
            }
            if (req.body.embeds) {
                try {
                    const embeds = JSON.parse(req.body.embeds);
                    if (!Array.isArray(embeds) || embeds.length > 1) {
                        return res.status(400).json({ error: 'Invalid embeds format' });
                    }
                } catch (e) {
                    return res.status(400).json({ error: 'Invalid embeds format' });
                }
            }
        }

        // Add to upload queue
        await uploadQueue.add({
            file: req.file,
            content: req.body?.content,
            embeds: req.body?.embeds,
            channelId: process.env.CONFIGS_CHANNEL_ID2 || '1426403948281200650'
        });

        return res.json({ 
            success: true, 
            message: 'Config queued for upload', 
            queueTime: new Date().toISOString() 
        });

    } catch (error) {
        console.error('Error queueing config upload:', error);
        return res.status(500).json({ 
            error: 'Failed to queue config upload',
            message: error.message 
        });
    }
});

module.exports = router;