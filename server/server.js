// Moonbase server: serves the pages, holds the one true game state, and puts the
// 1.3 s Earth-Moon delay on everything that crosses between the astronaut and mission control.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from './game.js';
import { CFG, ROLES } from '../shared/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ico': 'image/x-icon',
};
const MOUNTS = [
  ['/shared/', path.join(ROOT, 'shared')],
  ['/vendor/three/', path.join(ROOT, 'node_modules', 'three')],
  ['/', path.join(ROOT, 'client')],
];

function serve(req, res) {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (url === '/') url = '/index.html';
  const [prefix, dir] = MOUNTS.find(([p]) => url.startsWith(p));
  const file = path.join(dir, url.slice(prefix.length));
  if (file !== dir && !file.startsWith(dir + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found: ' + url); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
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

const game = new Game();
const wss = new WebSocketServer({ server });
const clients = () => [...wss.clients].filter(c => c.readyState === 1 && c.role);
const crew = () => [...new Set(clients().map(c => c.role))];
const isControl = role => role === 'ops' || role === 'all';

// The delay only applies while a mission is running, so the lobby stays snappy.
const lag = () => (game.phase === 'run' ? CFG.delayMs : 0);
const later = (ms, fn) => (ms > 0 ? setTimeout(fn, ms) : fn());
const send = (ws, data, opts) => { if (ws.readyState === 1) ws.send(data, opts); };

function sendTo(roles, obj, ms) {
  const msg = JSON.stringify(obj);
  for (const c of clients()) if (roles.includes(c.role)) later(ms, () => send(c, msg));
}

wss.on('connection', ws => {
  ws.role = null;
  ws.on('error', () => {});
  ws.on('message', (data, isBinary) => {
    if (!ws.role && isBinary) return;

    // Binary frames are radio audio. Astronaut <-> Mission Ops only, always delayed.
    if (isBinary) {
      if (data.length > 64000) return;
      const to = ws.role === 'astronaut' ? ['ops', 'all'] : isControl(ws.role) ? ['astronaut'] : [];
      for (const c of clients()) if (c !== ws && to.includes(c.role)) setTimeout(() => send(c, data, { binary: true }), CFG.delayMs);
      return;
    }

    let m;
    try { m = JSON.parse(data.toString()); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'hello') { if (ROLES[m.role]) ws.role = m.role; return; }
    if (!ws.role) return;

    if (ws.role === 'astronaut') {
      if (m.t === 'pose' && [m.x, m.z, m.ry].every(Number.isFinite)) game.astro = { x: m.x, z: m.z, ry: m.ry };
      else if (m.t === 'act') game.act(m.id, m.a);
      else if (m.t === 'ptt') sendTo(['ops', 'all'], { t: 'ptt', from: 'astronaut', on: !!m.on }, CFG.delayMs);
      return;
    }

    // Everything below comes from Earth, so it reaches the Moon one light-delay later.
    if (m.t === 'rover' && (ws.role === 'tech' || ws.role === 'all')) {
      const throttle = Math.max(-1, Math.min(1, Number(m.throttle) || 0));
      const steer = Math.max(-1, Math.min(1, Number(m.steer) || 0));
      later(lag(), () => { if (game.phase === 'run') Object.assign(game.rover, { throttle, steer }); });
    } else if (isControl(ws.role)) {
      if (m.t === 'loadout') game.setLoadout(m.vehicle, m.gear);
      else if (m.t === 'start') game.start();
      else if (m.t === 'reset') game.reset();
      else if (m.t === 'ptt') sendTo(['astronaut'], { t: 'ptt', from: 'ops', on: !!m.on }, CFG.delayMs);
      else if (m.t === 'patch') {
        const ms = lag();
        later(ms, () => sendTo(['ops', 'all'], { t: 'term', line: game.patch(m.code) }, ms));
      }
    }
  });
});

// Simulation loop. The astronaut sees the present; mission control sees 1.3 s ago.
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  game.tick(Math.min(0.5, (now - last) / 1000));
  last = now;
  const who = crew();
  for (const c of clients()) {
    const msg = JSON.stringify(game.view(c.role, who));
    later(c.role === 'astronaut' ? 0 : lag(), () => send(c, msg));
  }
}, CFG.tickMs);

server.listen(PORT, '0.0.0.0', () => {
  const scheme = secure ? 'https' : 'http';
  console.log(`\nMoonbase server running (${secure ? 'HTTPS' : 'HTTP, no certs found'})\n`);
  console.log(`  This computer:  ${scheme}://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`  Same Wi-Fi:     ${scheme}://${n.address}:${PORT}`);
  if (!secure) console.log('\n  VR and the microphone need HTTPS or localhost. See README: "Getting the Quest connected".');
  console.log('');
});
