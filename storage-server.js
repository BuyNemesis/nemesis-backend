const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();

// Enhanced CORS configuration
app.use(cors({
    origin: function(origin, callback) {
        const allowedOrigins = [
            'https://nemesis-backend-yv3w.onrender.com',
            'http://localhost:3000',
            'http://localhost:10000',
            'https://floriferous-involucral-socorro.ngrok-free.dev'
        ];
        
        // Allow requests with no origin (like mobile apps, curl, Postman)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.log(`Blocked request from origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Choose destination based on file type
        const dest = file.originalname.endsWith('.ini') ? '/home/cayden/nemesis/config' : '/home/cayden/nemesis/media';
        cb(null, dest);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} from ${req.ip}`);
    next();
});

// Get file listing
app.get('/api/files/:type', (req, res) => {
    const type = req.params.type; // 'media' or 'config'
    
    if (type !== 'config' && type !== 'media') {
        console.error(`Invalid type requested: ${type}`);
        return res.status(400).json({ error: 'Invalid type. Must be "config" or "media"' });
    }
    
    const dir = type === 'config' ? '/home/cayden/nemesis/config' : '/home/cayden/nemesis/media';
    
    try {
        if (!fs.existsSync(dir)) {
            console.log(`Creating directory: ${dir}`);
            fs.mkdirSync(dir, { recursive: true });
        }
        
        const files = fs.readdirSync(dir);
        console.log(`Listed ${files.length} files from ${type} directory`);
        res.json({ files });
    } catch (error) {
        console.error(`Error listing files in ${dir}:`, error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Download file
app.get('/api/file/:type/:name', (req, res) => {
    const { type, name } = req.params;
    const dir = type === 'config' ? '/home/cayden/nemesis/config' : '/home/cayden/nemesis/media';
    const filePath = path.join(dir, name);
    
    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        res.sendFile(filePath);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Upload file
app.post('/api/upload/:type', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({ 
        success: true, 
        filename: req.file.filename,
        path: req.file.path
    });
});

// Delete file
app.delete('/api/file/:type/:name', (req, res) => {
    const { type, name } = req.params;
    const dir = type === 'config' ? '/home/cayden/nemesis/config' : '/home/cayden/nemesis/media';
    const filePath = path.join(dir, name);
    
    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Enhanced config-specific endpoints

// Store config with metadata
app.post('/api/store-config', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No config file uploaded' });
        }

        if (!req.file.originalname.toLowerCase().endsWith('.ini')) {
            return res.status(400).json({ error: 'Only .ini files are allowed' });
        }

        const { name, description, author, tags } = req.body;
        const configId = Date.now().toString();
        const filename = `${configId}_${req.file.originalname}`;
        
        // Store config file
        const configPath = path.join('/home/cayden/nemesis/config', filename);
        fs.writeFileSync(configPath, req.file.buffer);
        
        // Store metadata
        const metadata = {
            id: configId,
            name: name || req.file.originalname.replace('.ini', ''),
            description: description || '',
            author: author || 'Anonymous',
            tags: tags ? tags.split(',').map(t => t.trim()) : [],
            filename: filename,
            originalName: req.file.originalname,
            size: req.file.size,
            uploadDate: new Date().toISOString(),
            downloadCount: 0
        };
        
        const metadataPath = path.join('/home/cayden/nemesis/config', `${configId}_metadata.json`);
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        
        console.log(`Stored config: ${filename} with metadata`);
        
        res.json({
            success: true,
            configId: configId,
            filename: filename,
            metadata: metadata
        });
    } catch (error) {
        console.error('Error storing config:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get config by ID with metadata
app.get('/api/config/:id', (req, res) => {
    try {
        const configId = req.params.id;
        const metadataPath = path.join('/home/cayden/nemesis/config', `${configId}_metadata.json`);
        
        if (!fs.existsSync(metadataPath)) {
            return res.status(404).json({ error: 'Config not found' });
        }
        
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        const configPath = path.join('/home/cayden/nemesis/config', metadata.filename);
        
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({ error: 'Config file not found' });
        }
        
        // Increment download count
        metadata.downloadCount++;
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        
        const configContent = fs.readFileSync(configPath, 'utf8');
        
        res.json({
            metadata: metadata,
            content: configContent
        });
    } catch (error) {
        console.error('Error retrieving config:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get config content only
app.get('/api/config/:id/content', (req, res) => {
    try {
        const configId = req.params.id;
        const metadataPath = path.join('/home/cayden/nemesis/config', `${configId}_metadata.json`);
        
        if (!fs.existsSync(metadataPath)) {
            return res.status(404).json({ error: 'Config not found' });
        }
        
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        const configPath = path.join('/home/cayden/nemesis/config', metadata.filename);
        
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({ error: 'Config file not found' });
        }
        
        // Increment download count
        metadata.downloadCount++;
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        
        const configContent = fs.readFileSync(configPath, 'utf8');
        
        res.set('Content-Type', 'text/plain');
        res.send(configContent);
    } catch (error) {
        console.error('Error retrieving config content:', error);
        res.status(500).json({ error: error.message });
    }
});

// List all configs with metadata
app.get('/api/configs', (req, res) => {
    try {
        const configDir = '/home/cayden/nemesis/config';
        const files = fs.readdirSync(configDir);
        const metadataFiles = files.filter(f => f.endsWith('_metadata.json'));
        
        const configs = metadataFiles.map(file => {
            try {
                const metadata = JSON.parse(fs.readFileSync(path.join(configDir, file), 'utf8'));
                return metadata;
            } catch (error) {
                console.error(`Error reading metadata file ${file}:`, error);
                return null;
            }
        }).filter(Boolean);
        
        // Sort by upload date (newest first)
        configs.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
        
        res.json({
            configs: configs,
            total: configs.length
        });
    } catch (error) {
        console.error('Error listing configs:', error);
        res.status(500).json({ error: error.message });
    }
});

// Search configs
app.get('/api/configs/search', (req, res) => {
    try {
        const { q, author, tags } = req.query;
        const configDir = '/home/cayden/nemesis/config';
        const files = fs.readdirSync(configDir);
        const metadataFiles = files.filter(f => f.endsWith('_metadata.json'));
        
        let configs = metadataFiles.map(file => {
            try {
                const metadata = JSON.parse(fs.readFileSync(path.join(configDir, file), 'utf8'));
                return metadata;
            } catch (error) {
                console.error(`Error reading metadata file ${file}:`, error);
                return null;
            }
        }).filter(Boolean);
        
        // Apply filters
        if (q) {
            const query = q.toLowerCase();
            configs = configs.filter(config => 
                config.name.toLowerCase().includes(query) ||
                config.description.toLowerCase().includes(query) ||
                config.tags.some(tag => tag.toLowerCase().includes(query))
            );
        }
        
        if (author) {
            configs = configs.filter(config => 
                config.author.toLowerCase().includes(author.toLowerCase())
            );
        }
        
        if (tags) {
            const searchTags = tags.split(',').map(t => t.trim().toLowerCase());
            configs = configs.filter(config =>
                searchTags.some(searchTag => 
                    config.tags.some(configTag => configTag.toLowerCase().includes(searchTag))
                )
            );
        }
        
        // Sort by upload date (newest first)
        configs.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
        
        res.json({
            configs: configs,
            total: configs.length,
            query: { q, author, tags }
        });
    } catch (error) {
        console.error('Error searching configs:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete config by ID
app.delete('/api/config/:id', (req, res) => {
    try {
        const configId = req.params.id;
        const metadataPath = path.join('/home/cayden/nemesis/config', `${configId}_metadata.json`);
        
        if (!fs.existsSync(metadataPath)) {
            return res.status(404).json({ error: 'Config not found' });
        }
        
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        const configPath = path.join('/home/cayden/nemesis/config', metadata.filename);
        
        // Delete both files
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
        fs.unlinkSync(metadataPath);
        
        console.log(`Deleted config: ${configId}`);
        
        res.json({ success: true, message: 'Config deleted successfully' });
    } catch (error) {
        console.error('Error deleting config:', error);
        res.status(500).json({ error: error.message });
    }
});

// Initialize storage directories
app.post('/init', (req, res) => {
    const { paths } = req.body;
    if (!Array.isArray(paths)) {
        return res.status(400).json({ error: 'paths must be an array' });
    }
    
    try {
        paths.forEach(type => {
            const dir = type === 'configs' ? '/home/cayden/nemesis/config' : 
                       type === 'media' ? '/home/cayden/nemesis/media' : null;
            
            if (!dir) {
                console.warn(`Unknown path type: ${type}`);
                return;
            }
            
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`Created directory: ${dir}`);
            } else {
                console.log(`Directory exists: ${dir}`);
            }
        });
        res.json({ success: true, message: 'Storage directories initialized' });
    } catch (error) {
        console.error('Error initializing directories:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        endpoints: {
            files: '/api/files/:type',
            file: '/api/file/:type/:name',
            upload: '/api/upload/:type',
            storeConfig: '/api/store-config',
            getConfig: '/api/config/:id',
            getConfigContent: '/api/config/:id/content',
            listConfigs: '/api/configs',
            searchConfigs: '/api/configs/search',
            deleteConfig: '/api/config/:id'
        }
    });
});

// Ensure storage directories exist on startup
function ensureDirectories() {
    const dirs = [
        '/home/cayden/nemesis/config',
        '/home/cayden/nemesis/media'
    ];
    
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            console.log(`Creating directory: ${dir}`);
            fs.mkdirSync(dir, { recursive: true });
        } else {
            console.log(`Directory exists: ${dir}`);
        }
    });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Storage API starting up...`);
    
    // Ensure directories exist
    try {
        ensureDirectories();
        console.log('✅ Storage directories verified');
    } catch (error) {
        console.error('❌ Error creating directories:', error);
    }
    
    console.log(`\n🚀 Storage API running on port ${PORT}`);
    console.log('\nAvailable endpoints:');
    console.log('- GET  /health');
    console.log('- GET  /api/files/:type');
    console.log('- GET  /api/file/:type/:name');
    console.log('- POST /api/upload/:type');
    console.log('- DELETE /api/file/:type/:name');
    console.log('\nConfig-specific endpoints:');
    console.log('- POST /api/store-config');
    console.log('- GET  /api/config/:id');
    console.log('- GET  /api/config/:id/content');
    console.log('- GET  /api/configs');
    console.log('- GET  /api/configs/search');
    console.log('- DELETE /api/config/:id');
    
    console.log('\nAllowed origins:');
    console.log('- https://nemesis-backend-yv3w.onrender.com');
    console.log('- http://localhost:3000');
    console.log('- http://localhost:10000');
});