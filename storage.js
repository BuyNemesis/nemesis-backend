const axios = require('axios');
const FormData = require('form-data');

class Storage {
    constructor() {
        this.baseUrl = process.env.STORAGE_API_URL || 'http://localhost:3001';
    }

    async listFiles(type) {
        const response = await axios.get(`${this.baseUrl}/api/files/${type}`);
        return response.data.files;
    }

    async getFile(type, name) {
        const response = await axios.get(`${this.baseUrl}/api/file/${type}/${name}`, {
            responseType: 'arraybuffer'
        });
        return response.data;
    }

    async uploadFile(type, file, filename) {
        const formData = new FormData();
        formData.append('file', file, filename);
        
        const response = await axios.post(`${this.baseUrl}/api/upload/${type}`, formData, {
            headers: formData.getHeaders()
        });
        return response.data;
    }

    async deleteFile(type, name) {
        const response = await axios.delete(`${this.baseUrl}/api/file/${type}/${name}`);
        return response.data;
    }
}

module.exports = new Storage();