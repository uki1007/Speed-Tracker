import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';

const db = new Database('speedtests.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS speedtests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    download_mbps REAL,
    upload_mbps REAL,
    ping_ms REAL
  )
`);

try {
  db.exec('ALTER TABLE speedtests ADD COLUMN upload_mbps REAL');
} catch (e) {
  // Ignore if column already exists
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use('/api/upload', express.raw({ type: '*/*', limit: '20mb' }));

  // API Routes
  app.get('/api/speedtests', (req, res) => {
    const stmt = db.prepare('SELECT * FROM speedtests ORDER BY timestamp DESC LIMIT 100');
    const tests = stmt.all();
    res.json(tests);
  });

  app.post('/api/speedtests', (req, res) => {
    const { download_mbps, upload_mbps, ping_ms } = req.body;
    const stmt = db.prepare('INSERT INTO speedtests (download_mbps, upload_mbps, ping_ms) VALUES (?, ?, ?)');
    const info = stmt.run(download_mbps, upload_mbps, ping_ms);
    
    const newTest = db.prepare('SELECT * FROM speedtests WHERE id = ?').get(info.lastInsertRowid);
    res.json(newTest);
  });

  app.delete('/api/speedtests', (req, res) => {
    db.prepare('DELETE FROM speedtests').run();
    res.json({ success: true });
  });

  // Payload for download test (5MB)
  const payload = crypto.randomBytes(5 * 1024 * 1024);
  app.get('/api/payload', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send(payload);
  });

  // Upload endpoint
  app.post('/api/upload', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send('ok');
  });

  // Ping endpoint
  app.get('/api/ping', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send('pong');
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
