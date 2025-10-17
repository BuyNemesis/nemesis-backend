const fs = require('fs');
const FormData = require('form-data');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function pushConfig() {
    try {
        // Create form data
        const formData = new FormData();

        // Add metadata
        formData.append('content', 'Config Test Upload');
        // Add webhook data as a single JSON string
        formData.append('payload_json', JSON.stringify({
            content: 'Config Test Upload',
            embeds: [{
                title: "Testing Queue System",
                description: "Config upload test via queue",
                color: 0xE8BBF9 // Purple color
            }]
        }));

        console.log('Sending request to backend queue...');
        const response = await fetch('https://nemesis-backend-yv3w.onrender.com/api/service/upload', {
            method: 'POST',
            headers: formData.getHeaders(),
            body: formData
        });

        const result = await response.json();
        console.log('Upload response:', result);

        if (result.success) {
            console.log('✅ Config queued successfully');
            console.log('Queue time:', result.queueTime);
        } else {
            console.error('❌ Upload failed:', result.error);
        }

    } catch (error) {
        console.error('Error:', error);
        if (error.response) {
            const text = await error.response.text();
            console.error('Error response:', text);
        }
    }
}

pushConfig();