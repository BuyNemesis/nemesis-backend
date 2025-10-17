const fetch = require('node-fetch');
const FormData = require('form-data');
const { Blob } = require('buffer');

// Queue for processing config uploads
class UploadQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.processInterval = 60000; // 1 minute
        this.webhook = process.env.CLOUD_WEBHOOK;
        
        // Start processing loop
        setInterval(() => this.processQueue(), this.processInterval);
    }

    async add(config) {
        this.queue.push(config);
        console.log(`Added config to queue. Current queue size: ${this.queue.length}`);
    }

    async processQueue() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;

        try {
            const config = this.queue.shift();
            console.log(`Processing config upload from queue. Remaining: ${this.queue.length}`);

            const formData = new FormData();

            // Add file if present
            if (config.file) {
                formData.append('file', Buffer.from(config.file.buffer), {
                    filename: config.file.originalname,
                    contentType: 'text/plain'
                });
            }

            // Add other fields
            if (config.content) {
                formData.append('content', config.content);
            }
            if (config.embeds) {
                formData.append('embeds', JSON.stringify(config.embeds));
            }

            // Add channel id
            formData.append('channel_id', config.channelId);

            const response = await fetch(this.webhook, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Discord webhook error:', response.status, errorText);
                throw new Error(`Discord webhook error: ${errorText}`);
            }

            console.log('Config uploaded successfully');

        } catch (error) {
            console.error('Error processing config from queue:', error);
            // Could implement retry logic here if needed
        } finally {
            this.processing = false;
        }
    }
}

module.exports = new UploadQueue();