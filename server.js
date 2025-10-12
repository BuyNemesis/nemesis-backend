const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const CHANNEL_ID = process.env.DEVELOPMENT_CHANNEL || process.env.RENDER_CHANNEL_ID || '1426388284501659678';
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!DISCORD_TOKEN) {
  console.warn('Warning: DISCORD_BOT_TOKEN is not set. The API will return empty results.');
}

function safeGet(obj, path, fallback) {
  try { return path.split('.').reduce((s,k)=>s && s[k], obj) || fallback; } catch(e){ return fallback; }
}

function parsePatchMessage(content) {
  // Normalize line endings and split
  const lines = content.replace(/\r/g,'').split('\n').map(l=>l.trim()).filter(l=>l.length>0);
  if (lines.length < 3) return null; // not a valid patch message

  const dateLine = lines[0];
  const versionLine = lines[1];
  const titleLine = lines[2];
  const detailLines = lines.slice(3).map(l=>l.replace(/^[-*\u2022]\s?/, '').trim()).filter(Boolean);

  // Try to create an ISO date if possible
  let parsedDate = dateLine;
  try {
    // Accept formats like 10/10/2025 or 2025-10-10
    const parts = dateLine.split('/');
    if (parts.length === 3) {
      const [m,d,y] = parts.map(p=>parseInt(p,10));
      if (!isNaN(m) && !isNaN(d) && !isNaN(y)) {
        parsedDate = new Date(y, m-1, d).toISOString().split('T')[0];
      }
    } else {
      const dt = new Date(dateLine);
      if (!isNaN(dt.getTime())) parsedDate = dt.toISOString().split('T')[0];
    }
  } catch(e) { /* ignore */ }

  return {
    date: parsedDate,
    version: versionLine,
    title: titleLine,
    details: detailLines
  };
}

app.get('/api/patchnotes', async (req, res) => {
  try {
    if (!DISCORD_TOKEN) return res.json({ notes: [] });

    const url = `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages?limit=50`;
    const r = await fetch(url, {
      headers: { Authorization: `Bot ${DISCORD_TOKEN}`, Accept: 'application/json' }
    });

    if (!r.ok) {
      const txt = await r.text();
      console.error('Discord API error:', r.status, txt);
      return res.status(502).json({ error: 'Discord API error', details: txt });
    }

    const msgs = await r.json();

    // messages are returned in descending order (newest first)
    const notes = [];
    for (const m of msgs) {
      const content = safeGet(m, 'content', '').toString();
      const parsed = parsePatchMessage(content);
      if (parsed) {
        notes.push(Object.assign({}, parsed, { discordId: m.id, ts: m.timestamp }));
      }
    }

    // sort by Discord timestamp desc
    notes.sort((a,b)=> new Date(b.ts) - new Date(a.ts));

    res.json({ notes });
  } catch (err) {
    console.error('Server error', err);
    res.status(500).json({ error: 'server error' });
  }
});

app.get('/health', (req, res)=> res.json({ ok: true, channel: CHANNEL_ID }));

app.listen(PORT, ()=> console.log(`Patchnotes backend listening on ${PORT} — channel ${CHANNEL_ID}`));
