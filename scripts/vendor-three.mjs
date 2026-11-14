// Copy the three files of three.js the client imports into client/vendor/, so the pages can be
// served from the client/ folder alone (no build step, on a laptop or on Cloudflare).
// Run after bumping the three version in package.json:  npm run vendor
import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(ROOT, 'node_modules', 'three');
const to = path.join(ROOT, 'client', 'vendor', 'three');
for (const f of ['build/three.module.js', 'build/three.core.js', 'examples/jsm/webxr/VRButton.js']) {
  mkdirSync(path.dirname(path.join(to, f)), { recursive: true });
  cpSync(path.join(from, f), path.join(to, f));
}
console.log('client/vendor/three/ updated');
