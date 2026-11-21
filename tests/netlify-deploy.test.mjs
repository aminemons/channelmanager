import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
test('Netlify release contains only public assets and works at /app', () => {
  execFileSync(process.execPath, [join(root, 'scripts', 'build-netlify.mjs')], { cwd: root });
  const dir=join(root,'dist');
  const files=readdirSync(dir).sort();
  assert.deepEqual(files, ['_redirects','app.js','favicon.svg','hotel.mjs','index.html','styles.css'].sort());
  const redirects=readFileSync(join(dir,'_redirects'),'utf8');
  assert.match(redirects,/\/app \/index\.html 200/);
  const html=readFileSync(join(dir,'index.html'),'utf8');
  for (const path of ['/styles.css','/favicon.svg','/app.js']) assert.ok(html.includes(path),`Missing ${path}`);
  for (const asset of ['app.js','hotel.mjs','styles.css','favicon.svg']) assert.ok(existsSync(join(dir,asset)));
  assert.match(readFileSync(join(dir,'app.js'),'utf8'),/location\.pathname==\='/app\'/);
});
