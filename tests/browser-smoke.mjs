import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

const port=process.env.PORT||4173;
const base='http://127.0.0.1:'+port;
mkdirSync('artifacts/browser',{recursive:true});
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:'inherit'});
async function poll(){
  for(let i=0;i<60;i++){
    if(server.exitCode!==null)throw new Error('HOMA server crashed.');
    try{const res=await fetch(base+'/app');if(res.status===200)return;}catch{}
    await delay(300);
  }
  throw new Error('App did not start.');
}
let browser;
try {
 await poll();
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/app',{waitUntil:'networkidle'});
 if(await page.locator('h1').count()===0){console.error('BROWSER PAGE ERRORS:',errors);console.error('BODY:',(await page.locator('body').innerHTML()).slice(0,1600));throw new Error('Dashboard did not render.');}
 assert.equal(await page.locator('h1').innerText(),'Control desk');
 assert.ok(await page.locator('.queue-row').count()>0);
 assert.equal(await page.locator('.desk-headline small').innerText(),'Demo data · Browser only · No connected channels');
 await page.screenshot({path:'artifacts/browser/01-control-desk-desktop.png',fullPage:true});
 console.log('PASS control desk, action queue and browser-only status');

 await page.locator('button[data-nav="inventory"]').click();
 await page.getByRole('heading',{name:'Inventory matrix'}).waitFor();
 await page.screenshot({path:'artifacts/browser/02-inventory-desktop.png',fullPage:true});
 await page.locator('[data-action="edit-rule"][data-type="Classic"]').first().click();
 await page.getByRole('dialog').waitFor();
 await page.locator('[name="rate"]').fill('22000');
 await page.locator('.dialog button[type="submit"]').click();
 assert.equal(await page.getByRole('dialog').count(),0);
 assert.match(await page.locator('body').innerText(),/22[ \s]000 DA/);
 console.log('PASS rate change from inventory grid');

 await page.locator('button[data-nav="performance"]').click();
 await page.getByRole('heading',{name:'Performance'}).waitFor();
 await page.getByRole('heading',{name:'Daily availability & revenue'}).waitFor();
 const perfColumns=await page.locator('.reports-layout > .surface .register thead th').allInnerTexts();
 assert.ok(perfColumns.some(s=>s.includes('Booked revenue')),'Missing revenue column');
 const revenueColVisible=await page.locator('.reports-layout > .surface .register thead th').last().evaluate(el=>{
   const table=el.closest('.table-scroll');
   return el.getBoundingClientRect().right <= table.getBoundingClientRect().right+2;
 });
 assert.ok(revenueColVisible,'Revenue column is hidden behind desktop horizontal scrolling');
 await page.screenshot({path:'artifacts/browser/03-performance-desktop.png',fullPage:true});
 console.log('PASS performance reporting');

 await page.locator('button[data-nav="operations"]').click();
 await page.getByRole('heading',{name:'Physical room directory'}).waitFor();
 await page.locator('[data-action="edit-room"][data-id="203"]').click();
 await page.locator('.dialog select[name="status"]').selectOption('Ready');
 await page.locator('.dialog button[type="submit"]').click();
 assert.equal(await page.getByRole('dialog').count(),0);
 console.log('PASS physical room maintenance status changes');

 await page.locator('.topbar [data-action="new-booking"]').click();
 await page.locator('.dialog [name="guest"]').fill('QA Travel Guest');
 await page.locator('.dialog [name="checkIn"]').fill('2027-06-15');
 await page.locator('.dialog [name="checkOut"]').fill('2027-06-17');
 await page.locator('.dialog [name="roomId"]').selectOption('103');
 await page.locator('.dialog [name="guests"]').fill('2');
 await page.locator('.dialog button[type="submit"]').click();
 assert.equal(await page.getByRole('dialog').count(),0);
 await page.locator('button[data-nav="reservations"]').click();
 await page.locator('#booking-search').fill('QA Travel Guest');
 await page.getByText('QA Travel Guest').first().waitFor();
 console.log('PASS reservation created and searchable');

 await page.locator('.topbar [data-action="new-booking"]').click();
 await page.locator('.dialog [name="guest"]').fill('Conflict Guest');
 await page.locator('.dialog [name="checkIn"]').fill('2027-06-15');
 await page.locator('.dialog [name="checkOut"]').fill('2027-06-17');
 await page.locator('.dialog [name="roomId"]').selectOption('103');
 await page.locator('.dialog button[type="submit"]').click();
 await page.locator('.dialog .form-error').waitFor();
 assert.match(await page.locator('.dialog .form-error').innerText(),/already reserved/i);
 console.log('PASS booking conflict rejected without closing dialog');
 await page.keyboard.press('Escape');

 await page.locator('button[data-nav="overview"]').click();
 await page.setViewportSize({width:390,height:844});
 const docWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
 assert.ok(docWidth<=390,'Whole page should not scroll horizontally on mobile; width='+docWidth);
 await page.locator('.mobile-menu-toggle').click();
 await page.locator('button[data-nav="distribution"]').click();
 await page.getByRole('heading',{name:'Channel distribution'}).waitFor();
 await page.locator('.mobile-menu-toggle').click();
 await page.locator('button[data-nav="overview"]').click();
 await page.getByRole('heading',{name:'Control desk'}).waitFor();
 await page.screenshot({path:'artifacts/browser/04-control-desk-mobile.png',fullPage:true});
 assert.equal(await page.getByRole('heading',{name:'Control desk'}).count(),1);
 console.log('PASS mobile layout without page-wide horizontal overflow');
 assert.deepEqual(errors,[]);
 console.log('BROWSER QA COMPLETE: zero uncaught JS errors');
} finally {
 if(browser)await browser.close();
 server.kill();
}
