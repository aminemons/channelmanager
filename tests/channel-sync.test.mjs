import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {addDays, iso} from '../hotel.mjs';
import {availableCount, bulkRule, fresh, TYPES} from '../workspace-core.mjs';
import {buildAri, distributionOf, enqueue, enqueueChanges, setProviderMapping} from '../distribution.mjs';
import {applyRevision, channexClient} from '../server/channex.mjs';
import {channelWorkspace} from '../server/channel-workspace.mjs';

const today = iso(new Date());
const propertyId = randomUUID();
function mappedState() {
  let state = {...fresh(today), bookings: []};
  for (const type of TYPES) state = setProviderMapping(state, type, randomUUID(), randomUUID());
  return state;
}
function booking(state, status='new', bookingId=randomUUID()) {
  return {id:randomUUID(), attributes:{
    booking_id:bookingId, property_id:propertyId, currency:'DZD', status, ota_name:'Booking.com',
    customer:{name:'Demo',surname:'Guest'},
    rooms:[{room_type_id:distributionOf(state).mappings.Classic.roomId, checkin_date:today,
      checkout_date:addDays(today,1), amount:'10000.00', ota_unique_id:'room-A', occupancy:{adults:2}}],
  }};
}
function memoryStore() {
  let value = null;
  let counter = 0;
  return {
    async read() {return {etag:counter, value:structuredClone(value)};},
    async write(next, etag) {
      if (etag !== counter) throw Object.assign(Error('Conflict'), {status:409});
      value = structuredClone(next);
      counter++;
    },
  };
}
test('ARI uses physical room stock and sends the rate plan restrictions independently', () => {
  const state = mappedState();
  const next = bulkRule(state,{type:'Classic',from:today,to:today,rate:12345,minStay:2,stopSell:true,cta:true,ctd:false});
  const queued = enqueueChanges(state,next,today,'edit');
  const job = distributionOf(queued).jobs[0];
  assert.deepEqual([job.from,job.to],[today,today]);
  const {availability, restrictions} = buildAri(queued, propertyId, job.from, job.to);
  assert.equal(availability[0].availability, availableCount(state,'Classic',today));
  assert.equal(restrictions[0].rate, '12345.00');
  assert.equal(restrictions[0].min_stay_arrival, 2);
  assert.equal(restrictions[0].stop_sell, true);
  assert.equal(restrictions[0].closed_to_arrival, true);
  const split = enqueue(state,today,addDays(today,480),today,'full');
  assert.equal(distributionOf(split).jobs.length,2);
  assert.equal(distributionOf(split).jobs.at(-1).to,addDays(today,480));
});

test('Channex sends the documented ARI writes and keeps the returned task IDs', async () => {
  const state = mappedState();
  const mappings=Object.values(distributionOf(state).mappings);
  const calls=[];
  const provider=channexClient({mode:'staging',key:'fixture-key',propertyId},async (url,opts)=>{
    calls.push({url:new URL(url), opts});
    const path=new URL(url).pathname;
    if(path.endsWith(propertyId)) return Response.json({data:{id:propertyId,attributes:{currency:'DZD',title:'Test hotel'}}});
    if(path.endsWith('room_types')) return Response.json({data:mappings.map(m=>({id:m.roomId}))});
    if(path.endsWith('rate_plans')) return Response.json({data:mappings.map(m=>({id:m.rateId,
      relationships:{room_type:{data:{id:m.roomId}}}}))});
    return Response.json({data:[{type:'task',id:path.split('/').at(-1)}],meta:{warnings:[]}});
  });
  assert.deepEqual(await provider.send(state,today,today),['restrictions','availability']);
  assert.ok(calls.every(call=>call.url.origin==='https://staging.channex.io' && call.opts.headers['user-api-key']==='fixture-key'));
  assert.equal(JSON.parse(calls.at(-1).opts.body).values.length, 3);
});

test('applies booking creates, modifications and cancellation without reallocating on duplicate delivery', () => {
  const state = mappedState();
  const newBooking = booking(state);
  const next = applyRevision(state,newBooking,propertyId);
  assert.equal(next.bookings.length,1);
  assert.equal(availableCount(next,'Classic',today),availableCount(state,'Classic',today)-1);
  const modified = structuredClone(newBooking);
  modified.id = randomUUID();
  modified.attributes.status = 'modified';
  modified.attributes.rooms[0].checkout_date = addDays(today,2);
  const changed = applyRevision(next,modified,propertyId);
  assert.equal(changed.bookings.length,1);
  assert.equal(changed.bookings[0].checkOut,addDays(today,2));
  const cancelled = applyRevision(changed,booking(state,'cancelled',newBooking.attributes.booking_id),propertyId);
  assert.equal(cancelled.bookings[0].status,'Cancelled');
  assert.equal(availableCount(cancelled,'Classic',today),availableCount(state,'Classic',today));
});

test('shared workspace saves before acknowledging, retries ACK without a duplicate, and protects concurrent edits', async () => {
  const state = mappedState();
  const item = booking(state);
  const store=memoryStore();
  let attempts=0;
  const provider = {
    propertyId, feed:async()=>[item],
    ack:async () => {
      assert.equal((await store.read()).value.state.bookings.length,1);
      if (attempts++ === 0) throw Error('Fixture ack timeout');
    },
    send:async()=>['provider-task'],
  };
  const workspace = channelWorkspace(store,provider,'staging');
  await workspace.save(state,0);
  await assert.rejects(workspace.save(state,0),/Another update saved first/);
  assert.match((await workspace.pull()).message,/Fixture ack timeout/);
  assert.match((await workspace.pull()).message,/0 saved, 1 acknowledged/);
  const sent=await workspace.send();
  assert.equal(distributionOf(sent.state).journal[0].status,'accepted');
  assert.equal(distributionOf(sent.state).journal[0].tasks[0],'provider-task');
  assert.equal(sent.state.bookings.length,1);
});

test('an unmapped booking remains unacknowledged and a failed delivery stays available for retry', async () => {
  const state=mappedState();
  const item=booking(state);
  item.attributes.rooms[0].room_type_id=randomUUID();
  const provider={propertyId,feed:async()=>[item],ack:async()=>assert.fail('Invalid booking was acknowledged'),
    send:async()=>{throw Error('Fixture provider error');}};
  const work=channelWorkspace(memoryStore(),provider,'staging');
  await work.save(state,0);
  assert.match((await work.pull()).message,/unmapped/);
  assert.equal((await work.read()).state.bookings.length,0);
  const failed=await work.send();
  assert.equal(distributionOf(failed.state).jobs[0].status,'failed');
  assert.equal(distributionOf(failed.state).jobs[0].attempts,1);
});
