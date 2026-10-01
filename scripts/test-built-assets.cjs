'use strict';

// Run after `npm run build`. Vite's default /assets URLs work on a web server
// but resolve to the drive root when Electron loads dist/index.html via file://.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');

const dist = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
const index = path.join(dist, 'index.html');
const html = fs.readFileSync(index, 'utf8');
const assets = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["'][^>]*>/g)]
  .map((match) => match[1]);

assert.ok(assets.some((asset) => asset.endsWith('.js')), 'The build must include a JavaScript entry point.');
assert.ok(assets.some((asset) => asset.endsWith('.css')), 'The build must include a stylesheet.');
for (const asset of assets) {
  assert.ok(asset.startsWith('./'), `Packaged asset must be relative to index.html: ${asset}`);
  const resolved = fileURLToPath(new URL(asset, pathToFileURL(index)));
  const relative = path.relative(dist, resolved);
  assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative), `Asset escaped dist/: ${asset}`);
  assert.ok(fs.statSync(resolved).isFile(), `Packaged asset is missing: ${asset}`);
}

console.log(`Production file:// asset checks passed (${assets.length} bundled assets).`);
