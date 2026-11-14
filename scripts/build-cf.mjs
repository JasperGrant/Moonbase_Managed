// Assemble dist/ for Cloudflare: the client, shared/, and the three files of three.js the
// client imports. The Node server serves these same paths straight from the source tree.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const three = path.join(ROOT, 'node_modules', 'three');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
cpSync(path.join(ROOT, 'client'), DIST, { recursive: true });
cpSync(path.join(ROOT, 'shared'), path.join(DIST, 'shared'), { recursive: true });
for (const f of ['build/three.module.js', 'build/three.core.js', 'examples/jsm/webxr/VRButton.js']) {
  const to = path.join(DIST, 'vendor', 'three', f);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(path.join(three, f), to);
}
console.log('dist/ ready');
