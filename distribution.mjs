import {addDays, isDate, nights} from './hotel.mjs';
import {TYPES, availableCount, getRule, rateFor} from './workspace-core.mjs';

export const HORIZON = 120;
export const CHANNEX_BILLING = 'https://channex.io/pricing';
export const isRemoteId = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const stamp = () => new Date().toISOString();

export function distributionOf(state) {
  return state.distribution ?? {mappings: {}, jobs: [], journal: []};
}

export function journal(state, event) {
  const distribution = distributionOf(state);
  return {
    ...state,
    distribution: {...distribution, journal: [{at: stamp(), ...event}, ...distribution.journal].slice(0, 100)},
  };
}

export function setProviderMapping(state, type, roomId, rateId) {
  if (!TYPES.includes(type) || Boolean(roomId) !== Boolean(rateId) ||
      (roomId && (!isRemoteId(roomId) || !isRemoteId(rateId)))) {
    throw Error('Enter both Channex IDs in UUID format, or clear both fields.');
  }
  const distribution = distributionOf(state);
  const mappings = {...distribution.mappings};
  if (roomId) {
    if (Object.entries(mappings).some(([key, value]) =>
      key !== type && (value.roomId === roomId || value.rateId === rateId))) {
      throw Error('These Channex IDs are already mapped to another room type.');
    }
    mappings[type] = {roomId, rateId};
  } else {
    delete mappings[type];
  }
  return {...state, distribution: {...distribution, mappings}};
}

export function enqueue(state, from, to, today, id, reason = 'Inventory and rates') {
  if (!isDate(from) || !isDate(to) || !isDate(today) || from > to) throw Error('Invalid sync dates.');
  from = from < today ? today : from;
  if (to < from) return state;
  const distribution = distributionOf(state);
  const jobs = [...distribution.jobs];
  for (let start = from; start <= to; ) {
    const limit = addDays(start, 365);
    let end = limit < to ? limit : to;
    let mergedStart = start;
    for (let index = jobs.length - 1; index >= 0; index--) {
      const job = jobs[index];
      if (job.status !== 'queued' || job.to < addDays(mergedStart, -1) || job.from > addDays(end, 1)) continue;
      const joinedStart = job.from < mergedStart && job.from >= today ? job.from : mergedStart;
      const joinedEnd = job.to > end ? job.to : end;
      if (nights(joinedStart, addDays(joinedEnd, 1)) > 366) continue;
      mergedStart = joinedStart;
      end = joinedEnd;
      jobs.splice(index, 1);
    }
    jobs.push({id: id + '/' + start, from: mergedStart, to: end, reason, at: stamp(), status: 'queued', attempts: 0});
    start = addDays(end, 1);
    if (jobs.length > 100) throw Error('Send queued changes before adding more sync batches.');
  }
  jobs.sort((left, right) => left.from.localeCompare(right.from));
  return {...state, distribution: {...distribution, jobs}};
}

function changedDates(previous = [], next = [], fields, start, end) {
  const byId = new Map(previous.map(item => [item.id, item]));
  const dates = [];
  for (const item of next) {
    const old = byId.get(item.id);
    byId.delete(item.id);
    if (old && fields.every(field => old[field] === item[field])) continue;
    if (old) dates.push(old[start], addDays(old[end], -1));
    dates.push(item[start], addDays(item[end], -1));
  }
  for (const item of byId.values()) dates.push(item[start], addDays(item[end], -1));
  return dates;
}

export function enqueueChanges(previous, next, today, id) {
  const roomValues = state => state.rooms.map(({id, type, status, rate}) => [id, type, status, rate]);
  const dates = [
    ...changedDates(previous.bookings.filter(b => b.status !== 'Cancelled'), next.bookings.filter(b => b.status !== 'Cancelled'),
      ['roomId', 'checkIn', 'checkOut'], 'checkIn', 'checkOut'),
    ...changedDates(previous.blocks, next.blocks, ['roomId', 'start', 'end'], 'start', 'end'),
  ];
  for (const key of new Set([...Object.keys(previous.rules), ...Object.keys(next.rules)])) {
    if (JSON.stringify(previous.rules[key]) !== JSON.stringify(next.rules[key])) dates.push(key.split('|')[1]);
  }
  if (JSON.stringify(roomValues(previous)) !== JSON.stringify(roomValues(next)) ||
      JSON.stringify(distributionOf(previous).mappings) !== JSON.stringify(distributionOf(next).mappings)) {
    dates.push(today, addDays(today, HORIZON - 1));
  }
  const future = dates.filter(date => isDate(date)).sort();
  if (!future.length || future.at(-1) < today) return next;
  const from = future[0] < today ? today : future[0];
  return enqueue(next, from, future.at(-1), today, id);
}

export function recordDelivery(state, ids, {status, message, tasks = []}) {
  const distribution = distributionOf(state);
  const jobs = status === 'failed'
    ? distribution.jobs.map(job => ids.includes(job.id)
      ? {...job, status, attempts: job.attempts + 1, error: message} : job)
    : distribution.jobs.filter(job => !ids.includes(job.id));
  return journal({...state, distribution: {...distribution, jobs}}, {
    direction: 'Outbound', status, message, tasks,
  });
}

export function buildAri(state, propertyId, from, to) {
  if (!isRemoteId(propertyId) || !isDate(from) || !isDate(to) || from > to || nights(from, addDays(to, 1)) > 366) {
    throw Error('Invalid property ID or sync range.');
  }
  const {mappings} = distributionOf(state);
  const mapped = TYPES.filter(type => state.rooms.some(room => room.type === type));
  if (!mapped.length || mapped.some(type => !mappings[type])) {
    throw Error('Map every room type in the Channex section before publishing.');
  }
  const availability = [];
  const restrictions = [];
  for (const type of mapped) {
    const {roomId, rateId} = mappings[type];
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const rule = getRule(state, type, date);
      const rate = Number(rateFor(state, type, date));
      if (rate <= 0 && !rule.stopSell) throw Error(`Set a positive ${type} rate for ${date} or close sales.`);
      availability.push({property_id: propertyId, room_type_id: roomId, date, availability: availableCount(state, type, date)});
      restrictions.push({
        property_id: propertyId, rate_plan_id: rateId, date,
        ...(rate > 0 ? {rate: rate.toFixed(2)} : {}),
        min_stay_arrival: rule.minStay, stop_sell: rule.stopSell,
        closed_to_arrival: rule.cta, closed_to_departure: rule.ctd,
      });
    }
  }
  return {availability, restrictions};
}

export function validateDistribution(state) {
  const value = distributionOf(state);
  if (!value || !Array.isArray(value.jobs) || value.jobs.length > 100 ||
      !Array.isArray(value.journal) || value.journal.length > 100 ||
      !value.mappings || typeof value.mappings !== 'object' || Array.isArray(value.mappings)) {
    throw Error('Invalid sync data in the workspace.');
  }
  let checked = {...state, distribution: {...value, mappings: {}}};
  for (const [type, mapping] of Object.entries(value.mappings)) {
    checked = setProviderMapping(checked, type, mapping.roomId, mapping.rateId);
  }
  if (value.jobs.some(job => !job || typeof job.id !== 'string' || !isDate(job.from) || !isDate(job.to) ||
      job.from > job.to || nights(job.from, addDays(job.to, 1)) > 366 ||
      !['queued', 'failed'].includes(job.status) || !Number.isInteger(job.attempts)) ||
      value.journal.some(event => !event || typeof event.message !== 'string' ||
        (event.tasks && !Array.isArray(event.tasks)))) {
    throw Error('Invalid sync batch in the workspace.');
  }
  return checked;
}
