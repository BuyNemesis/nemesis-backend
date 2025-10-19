const FormData = require('form-data');

// Simple upload queue implementation
class UploadQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
    }

    async add(uploadData) {
        this.queue.push(uploadData);
        console.log(`📋 Added to upload queue. Queue length: ${this.queue.length}`);
        
        if (!this.processing) {
            this.processQueue();
        }
    }

    async processQueue() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;
        console.log('🔄 Processing upload queue...');

        while (this.queue.length > 0) {
            const uploadData = this.queue.shift();
            
            try {
                await this.processUpload(uploadData);
                console.log('✅ Upload processed successfully');
            } catch (error) {
                console.error('❌ Upload failed:', error);
                // Could implement retry logic here
            }
        }

        this.processing = false;
        console.log('✅ Upload queue processed');
    }

    async processUpload(uploadData) {
        const { file, content, embeds, channelId, configId } = uploadData;
        
        if (!process.env.CLOUD_WEBHOOK) {
            throw new Error('CLOUD_WEBHOOK environment variable not set');
        }

        const formData = new FormData();
        
        // Add file if present
        if (file) {
            formData.append('files[0]', file.buffer, file.originalname);
        }
        
        // Create payload (webhooks don't need channel_id)
        const payload = {
            content: content || `📁 New config uploaded: ${file?.originalname || 'config.ini'}`
        };
        
        if (embeds) {
            try {
                payload.embeds = typeof embeds === 'string' ? JSON.parse(embeds) : embeds;
            } catch (e) {
                console.warn('Invalid embeds format, skipping');
            }
        }
        
        formData.append('payload_json', JSON.stringify(payload));

        // Upload to Discord via webhook
        const response = await fetch(process.env.CLOUD_WEBHOOK, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Discord webhook error: ${response.status} - ${errorText}`);
        }

        console.log(`📤 Successfully uploaded to Discord channel ${channelId}`);
        
        if (configId) {
            console.log(`🔗 Config ID: ${configId}`);
        }

        return await response.json();
    }
}

// Export a singleton instance
module.exports = new UploadQueue();