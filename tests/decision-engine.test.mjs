import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,reserve,blockRoom,channelMap,bulkRule} from '../workspace-core.mjs';
import {dashboardNumbers,mappingAudit,rateComparison,workQueue,scheduledArrivals} from '../decision-engine.mjs';

const day='2026-11-21';
test('forward booked KPIs use reservation room-nights, not total booking value',()=>{
  const s=fresh(day);
  const k=dashboardNumbers(s,day,14);
  assert.equal(k.days,14);
  assert.equal(k.rooms,7); // One of eight physical rooms is permanently under maintenance.
  assert.equal(k.inventoryRoomNights,98);
  assert.equal(k.occupiedRoomNights,19);
  assert.equal(k.availableRoomNights,79);
  assert.equal(k.occupancy,19.4);
  assert.ok(k.roomRevenue>0);
  assert.equal(k.adr,Math.round(k.roomRevenue/k.occupiedRoomNights));
  assert.equal(k.revpar,Math.round(k.roomRevenue/k.inventoryRoomNights));
  assert.equal(k.details.length,14);
  assert.equal(k.channelMix.reduce((sum,c)=>sum+c.revenue,0),k.roomRevenue);
});
test('booking or cancellation changes forward occupancy and revenue consistently',()=>{
  let s=fresh(day);
  const before=dashboardNumbers(s,'2027-06-01',2);
  assert.equal(before.occupiedRoomNights,0);
  s=reserve(s,{id:'',guest:'Future Guest',roomId:'102',checkIn:'2027-06-01',checkOut:'2027-06-03',status:'Confirmed',channel:'Direct',guests:2,email:'',rate:35000});
  const after=dashboardNumbers(s,'2027-06-01',2);
  assert.equal(after.occupiedRoomNights,2);
  assert.equal(after.roomRevenue,70000);
  assert.equal(after.adr,35000);
  assert.equal(after.inventoryRoomNights,before.inventoryRoomNights);
});
test('maintenance dates reduce denominator and do not create fictitious revenue',()=>{
  let s=fresh(day);
  s=blockRoom(s,{roomId:'102',start:'2027-06-01',end:'2027-06-03',reason:'Refurbishment'});
  const r=dashboardNumbers(s,'2027-06-01',2);
  assert.equal(r.inventoryRoomNights,12);
  assert.equal(r.occupiedRoomNights,0);
  assert.equal(r.adr,0);
  assert.equal(r.revpar,0);
});
test('channel audit counts only locally configured mappings, never live connection',()=>{
  let s=fresh(day);
  const before=mappingAudit(s);
  assert.equal(before.mapped,0);
  assert.equal(before.total,9);
  assert.equal(before.byChannel.length,3);
  assert.equal(before.byChannel[0].connection,'No live API connection');
  s=channelMap(s,'Booking.com','Classic','BKG-123',7);
  const after=mappingAudit(s);
  assert.equal(after.mapped,1);
  assert.equal(after.byChannel[0].configured,1);
  assert.deepEqual(after.byChannel[0].missing,['Deluxe','Suite']);
});
test('rate comparison shows deliberate channel markups without presenting them as OTA rates',()=>{
  let s=channelMap(fresh(day),'Expedia','Classic','EX-456',15);
  s=bulkRule(s,{type:'Classic',from:'2027-06-01',to:'2027-06-01',rate:20000,minStay:1,stopSell:false,cta:false,ctd:false});
  const row=rateComparison(s,'2027-06-01')[0];
  assert.equal(row.base,20000);
  assert.equal(row.channels.find(x=>x.channel==='Expedia').rate,23000);
  assert.equal(row.channels.find(x=>x.channel==='Expedia').spread,3000);
  assert.equal(row.channels.find(x=>x.channel==='Expedia').mapped,true);
  assert.equal(row.channels.find(x=>x.channel==='Booking.com').mapped,false);
});
test('work queue is derived from bookings, mapping configuration and real availability',()=>{
  const s=fresh(day);
  const tasks=workQueue(s,day);
  assert.ok(tasks.some(x=>x.action==='reservations'));
  assert.ok(tasks.filter(x=>x.action==='distribution').length===3);
  assert.ok(tasks.every(x=>x.level&&x.title&&x.action));
  const arr=scheduledArrivals(s,day,7);
  assert.ok(arr.length>0);
  assert.ok(arr.every(x=>x.checkIn>=day&&x.status==='Confirmed'));
});
test('report windows reject pathological ranges',()=>{
  const s=fresh(day);
  assert.throws(()=>dashboardNumbers(s,day,10000),/invalid reporting window/i);
  assert.throws(()=>rateComparison(s,'2026-02-31'),/invalid comparison date/i);
});
