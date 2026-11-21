import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh} from '../workspace-core.mjs';
import {readICal,iCalImportPreview,writeICal} from '../calendar-exchange.mjs';

function fixture(eventLines){
 return ['BEGIN:VCALENDAR','VERSION:2.0',...eventLines,'END:VCALENDAR',''].join('\r\n');
}
const event=(id,start,end)=>[
 'BEGIN:VEVENT','UID:'+id,'DTSTART;VALUE=DATE:'+start,'DTEND;VALUE=DATE:'+end,'SUMMARY:Reserved','END:VEVENT'
];
test('exports room calendar as privacy-safe availability holds',()=>{
 const state=fresh('2026-11-21');
 const out=writeICal(state,'101');
 assert.match(out,/BEGIN:VCALENDAR/);
 assert.match(out,/DTSTART;VALUE=DATE:20261119/);
 assert.match(out,/SUMMARY:Unavailable/);
 assert.doesNotMatch(out,/Nadia|nadia@example/i);
});
test('imports all-day events into a selected room only after validation',()=>{
 const state=fresh('2026-11-21');
 const file=fixture([
 ...event('external-001','20270610','20270612'),
 ...event('external-002','20270611','20270614')
 ]);
 const parsed=readICal(file);
 assert.equal(parsed.length,2);
 const preview=iCalImportPreview(state,file,'102','Airbnb');
 assert.equal(preview.accepted.length,1);
 assert.equal(preview.rejected.length,1);
 assert.equal(state.bookings.length,13);
 assert.equal(preview.staged.bookings.length,13);
 assert.equal(preview.staged.blocks.length,1);
 assert.equal(preview.staged.blocks[0].externalRef,'external-001');
 assert.equal(preview.staged.blocks[0].source,'iCal');
});
test('calendar parser rejects invalid files, datetime events and incorrect room',()=>{
 const s=fresh('2026-11-21');
 assert.throws(()=>readICal('NOT A CALENDAR'),/not an iCalendar/i);
 const text=fixture(event('x','20270610T050000','20270611T120000'));
 const p=iCalImportPreview(s,text,'102');
 assert.equal(p.accepted.length,0);
 assert.match(p.rejected[0].error,/date-based/i);
 assert.throws(()=>iCalImportPreview(s,fixture(event('x','20270610','20270611')),'NOPE'),/valid room/i);
});
test('calendar import skips cancelled external events',()=>{
 const file=fixture([...event('x','20270610','20270611').slice(0,-1),'STATUS:CANCELLED','END:VEVENT']);
 const preview=iCalImportPreview(fresh('2026-11-21'),file,'102');
 assert.equal(preview.accepted.length,0);
 assert.equal(preview.rejected.length,0);
});

test('calendar holds are availability-only and never invent guest revenue',async()=>{
 const {dashboardNumbers}=await import('../decision-engine.mjs');
 const s=fresh('2026-11-21');
 const before=dashboardNumbers(s,'2027-06-10',2);
 const file=fixture(event('hold-uid','20270610','20270612'));
 const p=iCalImportPreview(s,file,'102','Airbnb');
 assert.equal(p.accepted.length,1);
 const after=dashboardNumbers(p.staged,'2027-06-10',2);
 assert.equal(after.roomRevenue,before.roomRevenue);
 assert.equal(after.occupiedRoomNights,before.occupiedRoomNights);
 assert.equal(after.inventoryRoomNights,before.inventoryRoomNights-2);
 assert.equal(iCalImportPreview(p.staged,file,'102','Airbnb').accepted.length,0);
 assert.equal(iCalImportPreview(p.staged,file,'102','Airbnb').rejected.length,1);
});
