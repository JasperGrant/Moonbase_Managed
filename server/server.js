// Moonbase server for a laptop: serves the pages and runs the game over one WebSocket.
// The game rules and the 1.3 s delay are in hub.js, shared with the Cloudflare worker.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Hub, PAGES } from './hub.js';
import { CFG } from '../client/shared/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ico': 'image/x-icon',
};
const WEB = path.join(ROOT, 'client'); // everything the pages need is in here, three.js included

const hub = new Hub(undefined, { requireFullCrew: process.env.SOLO ? false : undefined, adminKey: process.env.ADMIN_KEY }); // SOLO=1: ready up alone. ADMIN_KEY=x: lock /admin

function serve(req, res) {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (url === '/') url = '/index.html';
  if (url === '/seats') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(hub.seats())); return; }
  url = PAGES[url] || url;
  const file = path.join(WEB, url);
  if (!file.startsWith(WEB + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found: ' + url); return; }
    // Everything is re-read on every load so an edit shows at once, except the big things that never change
    // between edits: models, photos and the theme song, which every page fetches.
    const keep = url.startsWith('/assets/') || url.startsWith('/vendor/');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': keep ? 'max-age=3600' : 'no-store' });
    res.end(data);
  });
}

// HTTPS when certs/key.pem and certs/cert.pem exist (npm run cert), plain HTTP otherwise.
const keyFile = path.join(ROOT, 'certs', 'key.pem');
const certFile = path.join(ROOT, 'certs', 'cert.pem');
const secure = fs.existsSync(keyFile) && fs.existsSync(certFile);
const server = secure
  ? https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, serve)
  : http.createServer(serve);

const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  const client = {
    send: data => { if (ws.readyState === 1) ws.send(data, { binary: typeof data !== 'string' }); },
    close: () => { try { ws.close(4000, 'kicked'); } catch {} setTimeout(() => { try { ws.terminate(); } catch {} }, 1000); },
  };
  hub.add(client);
  ws.on('error', () => {});
  ws.on('close', () => hub.remove(client));
  ws.on('message', (data, isBinary) => hub.message(client, isBinary ? data : data.toString(), isBinary));
});
setInterval(() => hub.tick(), CFG.tickMs);

server.listen(PORT, '0.0.0.0', () => {
  const scheme = secure ? 'https' : 'http';
  console.log(`\nMoonbase server running (${secure ? 'HTTPS' : 'HTTP, no certs found'})\n`);
  console.log(`  This computer:  ${scheme}://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`  Same Wi-Fi:     ${scheme}://${n.address}:${PORT}`);
  if (!secure) console.log('\n  VR and the microphone need HTTPS or localhost. See README: "Getting the Quest connected".');
  console.log('');
});
