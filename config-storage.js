// Config Storage Integration for Windows Backend
// Connects to Ubuntu Storage Server for config management

const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');

class ConfigStorage {
    constructor(storageApiUrl = process.env.STORAGE_API_URL) {
        this.baseUrl = storageApiUrl || 'http://localhost:3001';
        this.healthCheckUrl = `${this.baseUrl}/health`;
        this.isAvailable = false;
        this.lastHealthCheck = 0;
        this.healthCheckInterval = 30000; // 30 seconds
        
        // Start health checking
        this.checkHealth();
        setInterval(() => this.checkHealth(), this.healthCheckInterval);
    }

    async checkHealth() {
        try {
            const response = await fetch(this.healthCheckUrl, { timeout: 5000 });
            this.isAvailable = response.ok;
            this.lastHealthCheck = Date.now();
            
            if (this.isAvailable) {
                console.log('✅ Storage API is healthy');
            } else {
                console.log('⚠️ Storage API returned non-OK status');
            }
        } catch (error) {
            this.isAvailable = false;
            this.lastHealthCheck = Date.now();
            console.log('❌ Storage API health check failed:', error.message);
        }
    }

    async makeRequest(method, endpoint, body = null, isFormData = false) {
        if (!this.isAvailable) {
            throw new Error('Storage API is not available');
        }

        const options = {
            method,
            timeout: 10000
        };

        if (body && !isFormData) {
            options.headers = { 'Content-Type': 'application/json' };
            options.body = JSON.stringify(body);
        } else if (body && isFormData) {
            options.body = body;
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, options);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Storage API error: ${response.status} - ${errorText}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        } else {
            return await response.text();
        }
    }

    // Store a config file with metadata
    async storeConfig(configData) {
        const { filePath, name, description, author, tags } = configData;
        
        if (!fs.existsSync(filePath)) {
            throw new Error(`Config file not found: ${filePath}`);
        }

        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));
        formData.append('name', name || '');
        formData.append('description', description || '');
        formData.append('author', author || 'Anonymous');
        formData.append('tags', Array.isArray(tags) ? tags.join(',') : (tags || ''));

        return await this.makeRequest('POST', '/api/store-config', formData, true);
    }

    // Store config from buffer/content
    async storeConfigFromBuffer(configData) {
        const { content, filename, name, description, author, tags } = configData;
        
        const formData = new FormData();
        formData.append('file', Buffer.from(content), filename);
        formData.append('name', name || '');
        formData.append('description', description || '');
        formData.append('author', author || 'Anonymous');
        formData.append('tags', Array.isArray(tags) ? tags.join(',') : (tags || ''));

        return await this.makeRequest('POST', '/api/store-config', formData, true);
    }

    // Get config by ID with metadata
    async getConfig(configId) {
        return await this.makeRequest('GET', `/api/config/${configId}`);
    }

    // Get only config content
    async getConfigContent(configId) {
        return await this.makeRequest('GET', `/api/config/${configId}/content`);
    }

    // List all configs
    async listConfigs() {
        return await this.makeRequest('GET', '/api/configs');
    }

    // Search configs
    async searchConfigs(query = {}) {
        const params = new URLSearchParams();
        if (query.q) params.append('q', query.q);
        if (query.author) params.append('author', query.author);
        if (query.tags) params.append('tags', query.tags);
        
        const endpoint = params.toString() ? `/api/configs/search?${params}` : '/api/configs/search';
        return await this.makeRequest('GET', endpoint);
    }

    // Delete config
    async deleteConfig(configId) {
        return await this.makeRequest('DELETE', `/api/config/${configId}`);
    }

    // Check if storage is available
    isStorageAvailable() {
        return this.isAvailable;
    }

    // Get storage status
    getStatus() {
        return {
            available: this.isAvailable,
            lastCheck: new Date(this.lastHealthCheck).toISOString(),
            baseUrl: this.baseUrl
        };
    }
}

module.exports = ConfigStorage;