import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('Netlify bundle contains the operational dashboard and dependency tree',()=>{
  execFileSync(process.execPath,[join(root,'scripts','build-netlify.mjs')],{cwd:root});
  const dist=join(root,'dist'),files=readdirSync(dist).sort();
  assert.deepEqual(files,['_redirects','index.html','workspace.js','workspace-core.mjs','distribution.mjs','workspace-connection.mjs','calendar-exchange.mjs','decision-engine.mjs','hotel.mjs','workspace.css','favicon.svg'].sort());
  const html=readFileSync(join(dist,'index.html'),'utf8');
  for(const asset of ['/workspace.js','/workspace.css','/favicon.svg'])assert.ok(html.includes(asset),asset);
  assert.match(readFileSync(join(dist,'_redirects'),'utf8'),/\/app \/index\.html 200/);
  assert.ok(existsSync(join(dist,'workspace-core.mjs')));
  assert.match(readFileSync(join(dist,'workspace.js'),'utf8'),/Inventory & rates/);
});

test('dev server serves the same imported workspace modules as the Netlify artifact',()=>{
  const server=readFileSync(join(root,'scripts','serve.mjs'),'utf8');
  const source=readFileSync(join(root,'workspace.js'),'utf8');
  for(const file of ['workspace-core.mjs','distribution.mjs','workspace-connection.mjs','calendar-exchange.mjs','decision-engine.mjs','hotel.mjs']){
    assert.ok(server.includes('/'+file),'Server missing '+file);
    assert.ok(existsSync(join(root,'dist',file)),'Netlify bundle missing '+file);
    if(file!=='hotel.mjs')assert.ok(source.includes('./'+file),'Workspace missing import '+file);
  }
});
