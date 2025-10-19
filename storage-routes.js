const express = require('express');
const multer = require('multer');
const ConfigStorage = require('./config-storage');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const configStorage = new ConfigStorage();

// Set up multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (!file.originalname.toLowerCase().endsWith('.ini')) {
            return cb(new Error('Only .ini files are allowed'), false);
        }
        cb(null, true);
    }
});

// Middleware to check storage availability
function checkStorageAvailability(req, res, next) {
    if (!configStorage.isStorageAvailable()) {
        return res.status(503).json({
            error: 'Storage service unavailable',
            message: 'Ubuntu storage server is not accessible',
            fallback: 'Using local Discord storage only'
        });
    }
    next();
}

// Upload config to storage server
router.post('/upload', upload.single('config'), checkStorageAvailability, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No config file provided' });
        }

        const { name, description, author, tags } = req.body;
        
        const configData = {
            content: req.file.buffer.toString('utf8'),
            filename: req.file.originalname,
            name: name || req.file.originalname.replace('.ini', ''),
            description: description || '',
            author: author || 'Anonymous',
            tags: tags ? tags.split(',').map(t => t.trim()) : []
        };

        const result = await configStorage.storeConfigFromBuffer(configData);
        
        console.log(`✅ Config uploaded to storage: ${result.configId}`);
        
        res.json({
            success: true,
            message: 'Config uploaded successfully',
            configId: result.configId,
            filename: result.filename,
            storageUrl: `${configStorage.baseUrl}/api/config/${result.configId}`,
            metadata: result.metadata
        });
    } catch (error) {
        console.error('❌ Error uploading config to storage:', error);
        res.status(500).json({
            error: 'Failed to upload config',
            message: error.message,
            fallback: 'Consider using Discord upload instead'
        });
    }
});

// Get config by ID
router.get('/config/:id', checkStorageAvailability, async (req, res) => {
    try {
        const configId = req.params.id;
        const result = await configStorage.getConfig(configId);
        
        res.json({
            success: true,
            config: result
        });
    } catch (error) {
        console.error('❌ Error retrieving config:', error);
        if (error.message.includes('404')) {
            res.status(404).json({ error: 'Config not found' });
        } else {
            res.status(500).json({
                error: 'Failed to retrieve config',
                message: error.message
            });
        }
    }
});

// Get config content only
router.get('/config/:id/content', checkStorageAvailability, async (req, res) => {
    try {
        const configId = req.params.id;
        const content = await configStorage.getConfigContent(configId);
        
        res.set('Content-Type', 'text/plain');
        res.send(content);
    } catch (error) {
        console.error('❌ Error retrieving config content:', error);
        if (error.message.includes('404')) {
            res.status(404).json({ error: 'Config not found' });
        } else {
            res.status(500).json({
                error: 'Failed to retrieve config content',
                message: error.message
            });
        }
    }
});

// List all configs
router.get('/configs', checkStorageAvailability, async (req, res) => {
    try {
        const result = await configStorage.listConfigs();
        
        res.json({
            success: true,
            configs: result.configs,
            total: result.total
        });
    } catch (error) {
        console.error('❌ Error listing configs:', error);
        res.status(500).json({
            error: 'Failed to list configs',
            message: error.message
        });
    }
});

// Search configs
router.get('/configs/search', checkStorageAvailability, async (req, res) => {
    try {
        const { q, author, tags } = req.query;
        const result = await configStorage.searchConfigs({ q, author, tags });
        
        res.json({
            success: true,
            configs: result.configs,
            total: result.total,
            query: result.query
        });
    } catch (error) {
        console.error('❌ Error searching configs:', error);
        res.status(500).json({
            error: 'Failed to search configs',
            message: error.message
        });
    }
});

// Delete config
router.delete('/config/:id', checkStorageAvailability, async (req, res) => {
    try {
        const configId = req.params.id;
        const result = await configStorage.deleteConfig(configId);
        
        res.json({
            success: true,
            message: 'Config deleted successfully'
        });
    } catch (error) {
        console.error('❌ Error deleting config:', error);
        if (error.message.includes('404')) {
            res.status(404).json({ error: 'Config not found' });
        } else {
            res.status(500).json({
                error: 'Failed to delete config',
                message: error.message
            });
        }
    }
});

// Storage status endpoint
router.get('/status', (req, res) => {
    const status = configStorage.getStatus();
    res.json({
        storage: status,
        endpoints: {
            upload: '/api/storage/upload',
            getConfig: '/api/storage/config/:id',
            getContent: '/api/storage/config/:id/content',
            listConfigs: '/api/storage/configs',
            searchConfigs: '/api/storage/configs/search',
            deleteConfig: '/api/storage/config/:id',
            status: '/api/storage/status'
        }
    });
});

module.exports = router;