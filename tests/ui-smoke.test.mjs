import test from 'node:test';
import assert from 'node:assert/strict';

// Dependency-free UI smoke test: execute the real application against a minimal DOM shell.
// This catches rendering exceptions in every workspace route; not a substitute for E2E browser tests.
test('marketing page, app dashboard, and all management views render', async () => {
  const handlers = {};
  const root = { innerHTML: '', addEventListener: (name, callback) => { handlers[name] = callback; }};
  globalThis.document = {
    title: '',
    body: {classList: {toggle(){}}},
    getElementById: id => id === 'root' ? root : null,
    querySelector: () => null,
  };
  globalThis.localStorage = { getItem: () => null, setItem(){} };
  globalThis.location = { pathname: '/app' };
  globalThis.history = { pushState(){} };
  globalThis.window = { addEventListener(){}, scrollTo(){} };
  await import('../app.js');
  assert.match(root.innerHTML, /A clear view of your day/);
  assert.match(root.innerHTML, /New reservation/);
  function tab(name) {
    const target={closest(sel){return sel==='[data-tab]'?{dataset:{tab:name}}:null}};
    handlers.click({target,preventDefault(){}});
    assert.ok(root.innerHTML.length > 2000,`${name} should render substantive content`);
  }
  for (const name of ['calendar','reservations','rooms','channels','guests','reports','settings','overview']) tab(name);
  assert.match(root.innerHTML, /Occupancy outlook/);
  tab('channels');
  assert.match(root.innerHTML, /Not connected/);
  assert.doesNotMatch(root.innerHTML, /<span class="badge badge-green"><span class="badge-dot"><\/span>Connected<\/span>/);
  const nav={closest(sel){return sel==='[data-nav]'?{dataset:{nav:'site'}}:null}};
  handlers.click({target:nav,preventDefault(){}});
  assert.match(root.innerHTML, /More care/);
  assert.match(root.innerHTML, /Explore the live demo/);
});