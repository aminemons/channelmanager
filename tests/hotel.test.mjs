import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeed,nights,intersects,isAvailable,validateBooking,occupancy,amount,addDays,validateImport} from '../hotel.mjs';
const today='2026-11-21';const data=createSeed(today);
test('night count uses checkout-exclusive interval',()=>{assert.equal(nights('2026-11-21','2026-11-24'),3);assert.equal(nights('2026-11-21','2026-11-21'),0)});
test('adjacent stays do not overlap',()=>{assert.equal(intersects('2026-11-21','2026-11-23','2026-11-23','2026-11-24'),false)});
test('existing booking causes conflict but room free after checkout',()=>{assert.equal(isAvailable(data.bookings,data.rooms,'101',today,addDays(today,1)),false);assert.equal(isAvailable(data.bookings,data.rooms,'101',addDays(today,2),addDays(today,4)),true)});
test('maintenance rooms cannot be booked',()=>{assert.equal(isAvailable(data.bookings,data.rooms,'203',today,addDays(today,2)),false)});
test('a booking can retain its own dates on edit',()=>{const b=data.bookings[0];assert.equal(isAvailable(data.bookings,data.rooms,b.roomId,b.checkIn,b.checkOut,b.id),true)});
test('invalid date range and bad guest rejected',()=>{const c={guest:'A',roomId:'101',checkIn:today,checkOut:today,channel:'Direct',status:'Confirmed',guests:2,email:''};assert.match(validateBooking(c,data.bookings,data.rooms),/guest/i)});
test('occupancy uses sellable rooms',()=>{assert.equal(occupancy(data.bookings,data.rooms,today),57)});
test('gross booking value is nights times rate',()=>{assert.equal(amount(data.bookings[2],data.rooms),38000*4)});
test('import rejects malformed files',()=>{assert.throws(()=>validateImport({version:1,rooms:[],bookings:[{roomId:'unknown'}],hotelName:'X'}))});
test('seed snapshot validates',()=>{assert.equal(validateImport(data),data)});

test('backup refuses overlapping reservations for the same room',()=>{const t=structuredClone(data);t.bookings.push({...t.bookings[0],id:'RS-9999',guest:'Another Guest'});assert.throws(()=>validateImport(t),/overlapping/i)});
test('backup refuses duplicate booking identifiers',()=>{const t=structuredClone(data);t.bookings.push({...t.bookings[0],guest:'Another Guest'});assert.throws(()=>validateImport(t),/duplicate/i)});
test('cancelled reservations do not block room inventory',()=>{const t=structuredClone(data);t.bookings=t.bookings.filter(b=>b.id!=='RS-1001');t.bookings.push({...data.bookings[0],status:'Cancelled'});assert.equal(isAvailable(t.bookings,t.rooms,'101',today,addDays(today,1)),true)});
