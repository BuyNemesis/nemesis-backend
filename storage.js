const express = require('express');
const router = express.Router();

// Use built-in fetch for Node.js >=18 or node-fetch for older versions
const fetch = globalThis.fetch || require('node-fetch');

// Storage API configuration
const STORAGE_API = process.env.STORAGE_API_URL || 'http://localhost:3001';

// Helper function for storage operations with retries
async function storageApi(method, path, body = null, retries = 3) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

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
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Storage API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log(`✅ Storage API Success: ${method} ${path}`);
            
            return data;
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (i === retries - 1) {
                throw new Error('Storage API is unreachable after multiple attempts');
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
    }
}

// Storage health check
router.get('/health', async (req, res) => {
    try {
        const response = await storageApi('GET', '/health');
        res.json(response);
    } catch (error) {
        console.error('Storage health check failed:', error);
        res.status(503).json({ 
            error: 'Storage API unavailable', 
            message: error.message 
        });
    }
});

// Get all configs from storage
router.get('/configs', async (req, res) => {
    try {
        const response = await storageApi('GET', '/api/configs');
        res.json(response);
    } catch (error) {
        console.error('Error fetching configs from storage:', error);
        res.status(500).json({ 
            error: 'Failed to fetch configs from storage', 
            message: error.message 
        });
    }
});

// Get specific config by ID
router.get('/config/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const response = await storageApi('GET', `/api/config/${id}`);
        res.json(response);
    } catch (error) {
        console.error(`Error fetching config ${req.params.id}:`, error);
        res.status(500).json({ 
            error: 'Failed to fetch config from storage', 
            message: error.message 
        });
    }
});

// Store new config
router.post('/store-config', async (req, res) => {
    try {
        const response = await storageApi('POST', '/api/store-config', req.body);
        res.json(response);
    } catch (error) {
        console.error('Error storing config:', error);
        res.status(500).json({ 
            error: 'Failed to store config', 
            message: error.message 
        });
    }
});

// Search configs
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        const response = await storageApi('GET', `/api/search?q=${encodeURIComponent(q)}`);
        res.json(response);
    } catch (error) {
        console.error('Error searching configs:', error);
        res.status(500).json({ 
            error: 'Failed to search configs', 
            message: error.message 
        });
    }
});

// Delete config
router.delete('/config/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const response = await storageApi('DELETE', `/api/config/${id}`);
        res.json(response);
    } catch (error) {
        console.error(`Error deleting config ${req.params.id}:`, error);
        res.status(500).json({ 
            error: 'Failed to delete config', 
            message: error.message 
        });
    }
});

module.exports = router;