// The trailer's servers: the game's client/ at /, this folder at /film/, and the real game hub
// (server/hub.js) on the same port, in this process, so the recorder can set the game's state directly.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Hub, PAGES } from '../../server/hub.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..'), WEB = path.join(ROOT, 'client');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.m4a': 'audio/mp4' };

export async function filmServer(port) {
  const hub = new Hub(undefined, { requireFullCrew: false });
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url === '/seats') return res.end(JSON.stringify(hub.seats()));
    if (url === '/') url = '/index.html';
    url = PAGES[url] || url;
    const file = url.startsWith('/film/') ? path.join(HERE, url.slice(6)) : path.join(WEB, url);
    fs.readFile(file, (e, d) => { if (e) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(d); });
  });
  new WebSocketServer({ server }).on('connection', ws => {
    const c = { send: d => { if (ws.readyState === 1) ws.send(d, { binary: typeof d !== 'string' }); } };
    hub.add(c); ws.on('close', () => hub.remove(c)); ws.on('message', (d, b) => hub.message(c, b ? d : d.toString(), b));
  });
  await new Promise(r => server.listen(port, r));
  return { server, hub, game: hub.game, close: () => server.close() };
}
// A seat taken by nobody in particular, so a desk shows its crew-mate connected.
export function ghost(hub, role) { const c = { send() {}, close() {} }; hub.add(c); hub.message(c, JSON.stringify({ t: 'hello', role }), false); return c; }
