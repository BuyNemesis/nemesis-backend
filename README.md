# Nemesis Storage API

A Node.js storage API server for managing game configuration files with metadata support.

## Features

- 📁 **Config Storage**: Store .ini configuration files with metadata
- 🔍 **Search & Filter**: Search by name, author, tags, and description
- 📊 **Download Tracking**: Track download counts and usage statistics
- 🏷️ **Tag System**: Organize configs with custom tags
- 📝 **Metadata**: Rich metadata including author, description, upload date
- 🔒 **File Validation**: Only .ini files accepted, size limits enforced
- 🌐 **CORS Support**: Cross-origin requests for web integration

## API Endpoints

### Config Management

- `POST /api/store-config` - Upload config with metadata
- `GET /api/config/:id` - Get config with metadata
- `GET /api/config/:id/content` - Get config content only
- `GET /api/configs` - List all configs
- `GET /api/configs/search` - Search configs with filters
- `DELETE /api/config/:id` - Delete config

### Legacy File Operations

- `GET /api/files/:type` - List files by type
- `GET /api/file/:type/:name` - Download file
- `POST /api/upload/:type` - Upload file
- `DELETE /api/file/:type/:name` - Delete file

### Health & Status

- `GET /health` - Server health check

## Quick Start

### Installation

```bash
npm install
```

### Development

```bash
npm start
```

### Production (Render.com)

The server is configured for automatic deployment on Render.com with the included `render.yaml` configuration.

## Environment Variables

- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment (development/production)

## File Structure

```
├── storage-server.js          # Main server file
├── package.json               # Dependencies
├── render.yaml                # Render.com deployment config
├── config/                    # Config files storage (auto-created)
├── media/                     # Media files storage (auto-created)
└── logs/                      # Server logs (auto-created)
```

## Config Metadata Format

Each config includes:

```json
{
  "id": "unique-timestamp-id",
  "name": "Config Name",
  "description": "Config description",
  "author": "Author name",
  "tags": ["tag1", "tag2"],
  "filename": "actual-filename.ini",
  "originalName": "original-filename.ini",
  "size": 1024,
  "uploadDate": "2025-10-19T12:00:00.000Z",
  "downloadCount": 0
}
```

## API Usage Examples

### Upload Config

```javascript
const formData = new FormData();
formData.append("file", configFile);
formData.append("name", "My Config");
formData.append("description", "Best config for HvH");
formData.append("author", "ConfigMaster");
formData.append("tags", "aimbot,esp,hvh");

fetch("/api/store-config", {
  method: "POST",
  body: formData,
});
```

### Search Configs

```javascript
// Search by query, author, and tags
fetch("/api/configs/search?q=aimbot&author=ConfigMaster&tags=hvh")
  .then((res) => res.json())
  .then((data) => console.log(data.configs));
```

### Download Config

```javascript
fetch(`/api/config/${configId}/content`)
  .then((res) => res.text())
  .then((configContent) => {
    // Use config content
  });
```

## CORS Configuration

The server allows requests from:

- `https://nemesis-backend-yv3w.onrender.com`
- `http://localhost:3000`
- `http://localhost:10000`
- Any request with no origin (mobile apps, Postman, etc.)

## File Limits

- **File Types**: Only `.ini` files accepted
- **File Size**: No specific limit set (handled by multer)
- **Storage**: Files stored in `/config` and `/media` directories

## Deployment

### Render.com

1. Connect your GitHub repository
2. Render will automatically detect the `render.yaml` configuration
3. Environment variables are set automatically
4. The server will start on the configured port

### Manual Deployment

1. Clone the repository
2. Run `npm install`
3. Set environment variables
4. Run `npm start`

## Development

### Project Structure

- `storage-server.js` - Main Express.js server
- Automatic directory creation on startup
- File validation and error handling
- Comprehensive logging

### Adding New Features

1. Add routes to `storage-server.js`
2. Update this README
3. Test locally before deploying

## Health Monitoring

Visit `/health` endpoint to check server status:

```json
{
  "status": "OK",
  "timestamp": "2025-10-19T12:00:00.000Z",
  "version": "1.0.0",
  "endpoints": {...}
}
```

## Security

- File type validation (only .ini files)
- CORS protection
- Input validation and sanitization
- Error handling without exposing internals

## License

MIT License - See LICENSE file for details
