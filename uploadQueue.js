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

        const formData = new FormData();
        
        // Create guaranteed non-empty content
        const defaultContent = `📁 New config uploaded: ${file?.originalname || 'config.ini'}`;
        let finalContent = (content && content.trim()) ? content.trim() : defaultContent;
        
        // Ensure content is never empty
        if (!finalContent || finalContent.length === 0) {
            finalContent = '📁 Config upload notification';
        }
        
        console.log('Discord content:', finalContent, 'Length:', finalContent.length);
        
        // Discord webhook with files requires payload_json format
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
        
        formData.append('payload_json', JSON.stringify(payload));
        
        // Add file if present (using correct Discord format)
        if (file) {
            formData.append('files[0]', file.buffer, file.originalname);
            console.log('Added file to Discord:', file.originalname);
        }
        
        // Try a completely different approach - test without file first
        console.log('Testing Discord webhook without file first...');
        
        // Test 1: Send just content, no file
        const testResponse = await fetch(process.env.CLOUD_WEBHOOK, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: finalContent
            })
        });
        
        console.log('Test response (content only):', testResponse.status);
        
        if (testResponse.ok) {
            console.log('✅ Content-only message works!');
            // Now try with file if content works
            if (file) {
                console.log('Now testing with file...');
                
                const formData = new FormData();
                
                // Discord webhook file upload format - must use payload_json with files
                const payload = {
                    content: finalContent
                };
                
                // Discord webhook format for files
                const { Readable } = require('stream');
                const fileStream = Readable.from(file.buffer);
                
                formData.append('content', finalContent);
                formData.append('file', fileStream, {
                    filename: file.originalname,
                    contentType: 'application/octet-stream',
                    knownLength: file.buffer.length
                });
                
                console.log('Discord FormData fields:', {
                    payload: JSON.stringify(payload),
                    fileName: file.originalname,
                    fileSize: file.buffer.length
                });
                
                const fileResponse = await fetch(process.env.CLOUD_WEBHOOK, {
                    method: 'POST',
                    body: formData,
                    headers: formData.getHeaders()
                });
                
                console.log('File upload response:', fileResponse.status);
                
                if (!fileResponse.ok) {
                    const errorText = await fileResponse.text();
                    console.log('File upload error:', errorText);
                    throw new Error(`Discord webhook with file error: ${fileResponse.status} - ${errorText}`);
                }
                
                return await fileResponse.json();
            } else {
                // If we have no file, just return the testResponse
                console.log(`📤 Successfully uploaded to Discord channel ${channelId}`);
                if (configId) {
                    console.log(`🔗 Config ID: ${configId}`);
                }
                return await testResponse.json();
            }
        } else {
            const errorText = await testResponse.text();
            console.log('Content-only test failed:', errorText);
            throw new Error(`Discord webhook error: ${testResponse.status} - ${errorText}`);
        }
    }
}

// Export a singleton instance
module.exports = new UploadQueue();