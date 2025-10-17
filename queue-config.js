const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const FormData = require('form-data');

async function queueConfig() {
    try {
        // Read the config file
        const fileData = fs.readFileSync('Ragecheattest (1).ini');
        
        // Create form data
        const formData = new FormData();
        formData.append('file', Buffer.from(fileData), {
            filename: 'Ragecheattest (1).ini',
            contentType: 'text/plain'
        });
        formData.append('content', 'Test config upload');
        formData.append('embeds', JSON.stringify([{
            title: "Config Upload Test",
            description: "Testing the queue system with file upload",
            color: 0xE8BBF9
        }]));

        console.log('Sending request to queue...');
        const response = await fetch('https://nemesis-backend-yv3w.onrender.com/api/service/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        console.log('Queue response:', result);

    } catch (error) {
        console.error('Error:', error);
    }
}

queueConfig();