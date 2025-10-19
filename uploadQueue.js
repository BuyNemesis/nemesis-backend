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

        // Process one item every minute
        const processNext = async () => {
            if (this.queue.length === 0) {
                this.processing = false;
                console.log('✅ Upload queue processed');
                return;
            }

            const uploadData = this.queue.shift();
            
            try {
                await this.processUpload(uploadData);
                console.log('✅ Upload processed successfully');
                console.log(`📊 Remaining in queue: ${this.queue.length}`);
            } catch (error) {
                console.error('❌ Upload failed:', error);
                // Could implement retry logic here
            }

            // Wait 1 minute before processing next item
            setTimeout(processNext, 60000); // 60 seconds * 1000 = 1 minute
        };

        // Start processing queue
        await processNext();
    }

    async processUpload(uploadData) {
        const { file, content, embeds, channelId, configId } = uploadData;
        
        console.log('Processing upload:', { hasFile: !!file, content, configId });
        
        if (!process.env.CLOUD_WEBHOOK) {
            throw new Error('CLOUD_WEBHOOK environment variable not set');
        }

        // Create guaranteed non-empty content
        const defaultContent = `📁 New config uploaded: ${file?.originalname || 'config.ini'}`;
        let finalContent = (content && content.trim()) ? content.trim() : defaultContent;
        
        // Ensure content is never empty
        if (!finalContent || finalContent.length === 0) {
            finalContent = '📁 Config upload notification';
        }
        
        console.log('Discord content:', finalContent, 'Length:', finalContent.length);

        if (file) {
            // File upload format - use multipart/form-data
            const formData = new FormData();
            
            // Add content as a regular form field - MUST NOT use payload_json with files
            formData.append('content', finalContent);
            
            // Add file directly - form-data handles the multipart boundary
            formData.append('file', file.buffer, file.originalname);

            // For embeds with files, they must go in the content field
            if (embeds) {
                try {
                    const embedsData = typeof embeds === 'string' ? JSON.parse(embeds) : embeds;
                    // When we have a file, embeds must be part of the content field
                    formData.append('content', finalContent + '\n' + JSON.stringify(embedsData));
                } catch (e) {
                    console.warn('Invalid embeds format, skipping');
                }
            }

            console.log('Sending file to Discord webhook:', {
                filename: file.originalname,
                contentType: file.mimetype,
                size: file.buffer.length
            });

            const response = await fetch(process.env.CLOUD_WEBHOOK, {
                method: 'POST',
                body: formData,
                headers: formData.getHeaders()
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Discord webhook error:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorText
                });
                throw new Error(`Discord webhook error: ${response.status} - ${errorText}`);
            }

            console.log(`📤 Successfully uploaded file to Discord channel ${channelId}`);
            if (configId) {
                console.log(`🔗 Config ID: ${configId}`);
            }

            return await response.json();
        } else {
            // Content-only format - use JSON
            const payload = {
                content: finalContent
            };

            if (embeds) {
                try {
                    payload.embeds = typeof embeds === 'string' ? JSON.parse(embeds) : embeds;
                } catch (e) {
                    console.warn('Invalid embeds format, skipping');
                }
            }

            const response = await fetch(process.env.CLOUD_WEBHOOK, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Discord webhook error:', errorText);
                throw new Error(`Discord webhook error: ${response.status} - ${errorText}`);
            }

            console.log(`📤 Successfully sent message to Discord channel ${channelId}`);
            return await response.json();
        }
    }
}

// Export a singleton instance
module.exports = new UploadQueue();