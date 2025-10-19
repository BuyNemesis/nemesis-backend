# 🚀 GitHub Push Folder - Windows Backend with Storage Integration

## Purpose

This folder contains all the files needed to upload to GitHub for Render.com deployment of the **Windows Backend Server with Ubuntu Storage Integration**.

## Architecture

- **Windows Backend** (this deployment) → Handles Discord API, reviews, media, configs
- **Ubuntu Storage Server** (separate, running locally) → Handles file storage via ngrok tunnel
- **Integration** → Backend proxies storage requests to Ubuntu server

## Files to Upload to GitHub

### ✅ **Ready to Upload**

1. **`server.js`** - Windows backend with storage integration (1551 lines)
2. **`routes/storage.js`** - Storage API proxy routes
3. **`uploadQueue.js`** - Discord upload queue management
4. **`package.json`** - Dependencies with storage client
5. **`render.yaml`** - Render.com deployment configuration
6. **`README.md`** - API documentation
7. **`.gitignore`** - File exclusion rules

### 📁 **Backup Files (old-files/)**

- `ubuntu-storage-server.js` - Original Ubuntu storage server
- `ubuntu-package.json` - Original Ubuntu dependencies

## How to Use

1. **Copy entire push folder contents to your GitHub repository**
2. **Commit and push to GitHub**
3. **Connect GitHub repo to Render.com**
4. **Set environment variables in Render dashboard:**
   - `STORAGE_API_URL=https://floriferous-involucral-socorro.ngrok-free.dev`
   - `BOT_TOKEN=your_discord_bot_token`
   - All other Discord channel IDs and webhooks

## Key Features

### Backend API Endpoints:

- **Discord Integration**: `/api/reviews`, `/api/media`, `/api/configs`
- **Storage Proxy**: `/api/storage/*` (proxies to Ubuntu server)
- **Upload Queue**: `/api/service/upload` (storage + Discord)
- **Health Checks**: `/health`, `/api/health`

### Storage Integration:

- ✅ Ubuntu server connectivity testing
- ✅ Automatic fallback to Discord-only mode
- ✅ Retry logic with exponential backoff
- ✅ Memory caching for performance
- ✅ Queue system for uploads

## Environment Variables Required

```env
# Discord Bot
BOT_TOKEN=your_bot_token
GUILD_ID=1426384773131010070

# Storage Integration
STORAGE_API_URL=https://floriferous-involucral-socorro.ngrok-free.dev

# Discord Channels
REVIEWS_CHANNEL_ID=1426384776108093502
CONFIGS_CHANNEL_ID=your_configs_channel
CONFIGS_CHANNEL_ID2=1426403948281200650
BUYER_MEDIA_CHANNEL_ID=1426388792012705874
STATUS_CHANNEL_ID=1426384774167269502

# Webhooks
WEBHOOK=your_discord_webhook
CLOUD_WEBHOOK=your_upload_webhook
```

## Deployment Notes

- **Type**: Windows Backend Server (not Ubuntu storage)
- **Dependencies**: Discord API integration + Storage proxy
- **Storage**: Proxies to Ubuntu server via ngrok
- **Fallback**: Works without storage server (Discord-only mode)

## Last Updated

October 19, 2025 - Reorganized for Windows Backend deployment

---

**Instructions**: Upload entire contents to GitHub repository for Render deployment!
