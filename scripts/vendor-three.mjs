// Copy the files of three.js (and cannon-es) the client imports into client/vendor/, so the pages can be
// served from the client/ folder alone (no build step, on a laptop or on Cloudflare).
// Run after bumping the three version in package.json:  npm run vendor
import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(ROOT, 'node_modules', 'three');
const to = path.join(ROOT, 'client', 'vendor', 'three');
for (const f of [
  'build/three.module.js', 'build/three.core.js', 'examples/jsm/webxr/VRButton.js',
  // client/assets/models/*.glb: GLTFLoader with the meshopt decoder (the bake uses EXT_meshopt_compression, not Draco)
  'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/utils/BufferGeometryUtils.js', 'examples/jsm/libs/meshopt_decoder.module.js',
  // client/stations.js: the tools' bevelled bodies
  'examples/jsm/geometries/RoundedBoxGeometry.js',
]) {
  mkdirSync(path.dirname(path.join(to, f)), { recursive: true });
  cpSync(path.join(from, f), path.join(to, f));
}
console.log('client/vendor/three/ updated');

// cannon-es: the physics for the tools (client/physics.js). One plain ES module, no WASM.
mkdirSync(path.join(ROOT, 'client', 'vendor', 'cannon-es'), { recursive: true });
cpSync(path.join(ROOT, 'node_modules', 'cannon-es', 'dist', 'cannon-es.js'), path.join(ROOT, 'client', 'vendor', 'cannon-es', 'cannon-es.js'));
console.log('client/vendor/cannon-es/ updated');
