import test from 'node:test';
import assert from 'node:assert/strict';
test('operational workspace renders seven views, booking editor and room management',async()=>{
  const handlers={};
  const root={innerHTML:'',addEventListener(name,cb){handlers[name]=cb;}};
  globalThis.document={
    title:'',body:{classList:{toggle(){}}},getElementById(id){return id==='root'?root:null;},
    querySelector(){return null;},
  };
  globalThis.localStorage={getItem(){return null;},setItem(){}};
  globalThis.window={addEventListener(){}};
  await import('../workspace.js');
  assert.match(root.innerHTML,/Needs attention/);
  assert.match(root.innerHTML,/Booked room revenue/);
  function click(data){
    const el={dataset:data, classList:{contains(){return false;}},closest(s){
      if(s==='[data-nav]'&&data.nav)return this;
      if(s==='[data-action]'&&data.action)return this;
      return null;
    }};
    handlers.click({target:el,preventDefault(){}});
  }
  for(const [key,text] of [
    ['overview','Needs attention'],['calendar','Room allocation'],
    ['reservations','Booking register'],['distribution','Room & rate-plan mapping'],
    ['operations','Physical room directory'],['performance','Daily availability & revenue'],['inventory','Inventory matrix']]){
    click({nav:key});assert.match(root.innerHTML,new RegExp(text),key);
  }
  click({action:'toggle-menu'});
  assert.match(root.innerHTML,/nav-list is-open/);
  click({nav:'distribution'});
  assert.doesNotMatch(root.innerHTML,/nav-list is-open/);
  assert.match(root.innerHTML,/Manual calendar exchange/);
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
  click({action:'close-modal'});
  click({nav:'operations'});
  click({action:'edit-room',id:'101'});
  assert.match(root.innerHTML,/Edit room 101/);
  assert.match(root.innerHTML,/Base nightly rate/);
});
