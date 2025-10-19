const FormData = require('form-data');

// Use built-in fetch for Node.js >=18 or node-fetch for older versions
const fetch = globalThis.fetch || require('node-fetch');

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
        
        console.log('Processing upload:', { hasFile: !!file, content, configId });
        
        if (!process.env.CLOUD_WEBHOOK) {
            throw new Error('CLOUD_WEBHOOK environment variable not set');
        }

        const formData = new FormData();
        
        // Create guaranteed non-empty content
        const defaultContent = `📁 New config uploaded: ${file?.originalname || 'config.ini'}`;
        let finalContent = (content && content.trim()) ? content.trim() : defaultContent;
        
        // Ensure content is never empty
        if (!finalContent || finalContent.length === 0) {
            finalContent = '📁 Config upload notification';
        }
        
        console.log('Discord content:', finalContent, 'Length:', finalContent.length);
        
        // Add content directly to form (not as payload_json)
        formData.append('content', finalContent);
        
        // Add file if present
        if (file) {
            formData.append('files[0]', file.buffer, file.originalname);
            console.log('Added file to Discord:', file.originalname);
        }
        
        // Don't use payload_json when uploading files - Discord ignores it

        // Upload to Discord via webhook
        console.log('Sending to Discord webhook:', process.env.CLOUD_WEBHOOK ? 'SET' : 'NOT SET');
        const response = await fetch(process.env.CLOUD_WEBHOOK, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        console.log('Discord response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.log('Discord error response:', errorText);
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