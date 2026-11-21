import test from 'node:test';
import assert from 'node:assert/strict';
test('operational workspace renders its six views and reservation editor',async()=>{
  const handlers={};
  const root={innerHTML:'',addEventListener(name,cb){handlers[name]=cb;}};
  globalThis.document={
    title:'',body:{classList:{toggle(){}}},getElementById(id){return id==='root'?root:null;},
    querySelector(){return null;},
  };
  globalThis.localStorage={getItem(){return null;},setItem(){}};
  globalThis.window={addEventListener(){}};
  await import('../workspace.js');
  assert.match(root.innerHTML,/Inventory matrix/);
  assert.match(root.innerHTML,/Nightly rate/);
  function click(data){
    const el={dataset:data, classList:{contains(){return false;}},closest(s){
      if(s==='[data-nav]'&&data.nav)return this;
      if(s==='[data-action]'&&data.action)return this;
      return null;
    }};
    handlers.click({target:el,preventDefault(){}});
  }
  for(const [key,text] of [
    ['overview','Upcoming arrivals'],['calendar','Room allocation'],
    ['reservations','Booking register'],['distribution','Channel room mapping'],
    ['operations','Maintenance blocks'],['inventory','Inventory matrix']]){
    click({nav:key});assert.match(root.innerHTML,new RegExp(text),key);
  }
  click({nav:'distribution'});
  assert.match(root.innerHTML,/Calendar exchange/);
  click({action:'import-ical'});
  assert.match(root.innerHTML,/Import iCalendar/);
  click({action:'close-modal'});
  click({action:'export-ical'});
  assert.match(root.innerHTML,/Export room calendar/);
  click({action:'close-modal'});
  click({action:'new-booking'});
  assert.match(root.innerHTML,/New reservation/);
  const emailInput=root.innerHTML.match(/<input name="email"[^>]*>/)?.[0];
  const refInput=root.innerHTML.match(/<input name="externalRef"[^>]*>/)?.[0];
  assert.ok(emailInput&&!emailInput.includes('required'),'email must be optional');
  assert.ok(refInput&&!refInput.includes('required'),'externalRef must be optional');
  click({action:'close-modal'});
  assert.doesNotMatch(root.innerHTML,/role="dialog"/);
  click({action:'bulk-rule'});
  assert.match(root.innerHTML,/Minimum stay/);
});
