import { mkdirSync, rmSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');

const assets = ['index.html', 'app.js', 'hotel.mjs', 'styles.css', 'favicon.svg'];
const html = readFileSync(join(root, 'index.html'), 'utf8');
for (const asset of assets.filter(name => name !== 'index.html')) {
  if (!html.includes(asset) && asset !== 'hotel.mjs') {
    throw new Error(`Required asset is not referenced by index.html: ${asset}`);
  }
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const asset of assets) copyFileSync(join(root, asset), join(dist, asset));

// A Netlify rewrite keeps '/app' in the address bar so the existing JS router
// renders the dashboard without changing any application or browser state.
writeFileSync(join(dist, '_redirects'), '/app /index.html 200\n/app/ /index.html 200\n');
console.log(`Netlify bundle ready: ${assets.length} assets and SPA routes in dist/`);
