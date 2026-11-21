import test from 'node:test';
import assert from 'node:assert/strict';
import {addDays} from '../hotel.mjs';
import {fresh,hydrate,TYPES,getRule,rateFor,availableCount,quoteStay,bulkRule,validateStay,reserve,changeStatus,blockRoom,unblock,channelMap,feedRows,toCSV,parseCSV,importPreview} from '../workspace-core.mjs';
const start='2026-11-21',future='2027-06-10',later='2027-06-11';
const data=()=>fresh(start);
const candidate=(roomId='102',checkIn=future,checkOut=later)=>({guest:'Test Traveler',email:'',guests:2,roomId,checkIn,checkOut,status:'Confirmed',channel:'Direct'});

test('inventory subtracts confirmed stays and scheduled maintenance',()=>{
  const state=data();
  assert.equal(availableCount(state,'Classic',start),1);
  assert.equal(availableCount(state,'Deluxe',start),1);
  assert.equal(availableCount(state,'Suite',start),1);
});
test('bookings for adjacent stays can use the same room without overlap',()=>{
  let state=reserve(data(),candidate('102',future,later));
  assert.equal(validateStay(state,candidate('102',later,'2027-06-12')),null);
  assert.match(validateStay(state,candidate('102',future,'2027-06-12')),/already reserved/i);
});
test('cancelled rooms return to inventory',()=>{
  let state=reserve(data(),candidate());
  const booking=state.bookings.at(-1);
  assert.equal(availableCount(state,'Classic',future),2);
  state=changeStatus(state,booking.id,'Cancelled');
  assert.equal(availableCount(state,'Classic',future),3);
});
test('check-in and check-out require the correct lifecycle',()=>{
  let state=reserve(data(),candidate());
  const id=state.bookings.at(-1).id;
  assert.throws(()=>changeStatus(state,id,'Checked out'),/check in/i);
  state=changeStatus(state,id,'Checked in');
  state=changeStatus(state,id,'Checked out');
  assert.equal(state.bookings.find(x=>x.id===id).status,'Checked out');
});
test('bulk rate and restriction updates apply inclusively across selected dates',()=>{
  const state=bulkRule(data(),{type:'Classic',from:future,to:'2027-06-12',rate:19800,minStay:3,stopSell:false,cta:false,ctd:false});
  assert.equal(getRule(state,'Classic',future).minStay,3);
  assert.equal(getRule(state,'Classic','2027-06-12').rate,19800);
  assert.equal(rateFor(state,'Classic','2027-06-13'),15200);
  assert.equal(quoteStay(state,'Classic',future,'2027-06-13'),59400);
  assert.match(validateStay(state,candidate('102',future,later)),/minimum stay/i);
});
test('stop sell, closed arrival, and closed departure reject inappropriate stays',()=>{
  let state=bulkRule(data(),{type:'Classic',from:future,to:future,rate:'',minStay:1,stopSell:true,cta:false,ctd:false});
  assert.match(validateStay(state,candidate()),/sales are closed/i);
  state=bulkRule(data(),{type:'Classic',from:future,to:future,rate:'',minStay:1,stopSell:false,cta:true,ctd:false});
  assert.match(validateStay(state,candidate()),/arrival is closed/i);
  state=bulkRule(data(),{type:'Classic',from:later,to:later,rate:'',minStay:1,stopSell:false,cta:false,ctd:true});
  assert.match(validateStay(state,candidate()),/departure is closed/i);
});
test('room block excludes only affected nights and cannot conflict with reservations',()=>{
  let state=blockRoom(data(),{roomId:'102',start:future,end:'2027-06-12',reason:'Repairs'});
  assert.equal(availableCount(state,'Classic',future),2);
  assert.match(validateStay(state,candidate()),/blocked for maintenance/i);
  assert.equal(availableCount(state,'Classic','2027-06-12'),3);
  state=unblock(state,state.blocks[0].id);
  assert.equal(availableCount(state,'Classic',future),3);
  let booked=reserve(data(),candidate());
  assert.throws(()=>blockRoom(booked,{roomId:'102',start:future,end:later,reason:'Repairs'}),/existing reservations/i);
});
test('channel mapping changes offline feed pricing and keeps restrictions visible',()=>{
  let state=channelMap(data(),'Booking.com','Classic','ROOMTYPE-CLASSIC',10);
  state=bulkRule(state,{type:'Classic',from:future,to:future,rate:20000,minStay:2,stopSell:false,cta:true,ctd:false});
  const rows=feedRows(state,'Booking.com',future,1);
  assert.equal(rows.length,TYPES.length);
  assert.deepEqual(rows[0],{channel:'Booking.com',roomType:'Classic',remoteId:'ROOMTYPE-CLASSIC',date:future,available:3,rate:22000,minStay:2,stopSell:'no',cta:'yes',ctd:'no'});
  assert.equal(rows[1].remoteId,'');
});
test('channel CSV preview checks inventory and duplicates before commit',()=>{
  const csv='channel,externalRef,guest,checkIn,checkOut,roomType,email,guests\nBooking.com,EXT-42,New Guest,2027-06-10,2027-06-11,Classic,guest@example.com,2\nBooking.com,EXT-42,Duplicate Guest,2027-06-10,2027-06-11,Classic,guest@example.com,2';
  const view=importPreview(data(),csv);
  assert.equal(view.accepted.length,1);
  assert.equal(view.rejected.length,1);
  assert.match(view.rejected[0].error,/duplicate/i);
  assert.equal(data().bookings.length,13);
  assert.equal(view.staged.bookings.length,14);
});
test('CSV parser preserves quoted delimiters and prevents formula-leading exports',()=>{
  assert.deepEqual(parseCSV('a,b\n"x,y","said ""hi"""'),[['a','b'],['x,y','said "hi"']]);
  const csv=toCSV([{guest:'=HYPERLINK("bad")',note:'safe, comma'}]);
  assert.match(csv,/"'=HYPERLINK/);
  assert.match(csv,/"safe, comma"/);
  assert.throws(()=>parseCSV('"unclosed'),/unterminated/i);
});
test('bad rules, invalid mapping and corrupt blocks cannot be restored',()=>{
  const d=data();
  d.rules['Suite|2027-01-01']={rate:-1,minStay:2,stopSell:false,cta:false,ctd:false};
  assert.throws(()=>hydrate(d),/invalid rate/i);
  const e=data();e.blocks.push({id:'X',roomId:'NOPE',start:future,end:later});
  assert.throws(()=>hydrate(e),/invalid room blocks/i);
  const f=data();f.mappings['Booking.com|Classic']={remoteId:'X',adjustment:600};
  assert.throws(()=>hydrate(f),/invalid channel mapping/i);
});
