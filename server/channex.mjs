import {CHANNELS, isDate, nights} from '../hotel.mjs';
import {changeStatus, reserve, validateStay} from '../workspace-core.mjs';
import {buildAri, distributionOf, isRemoteId} from '../distribution.mjs';

export function channexSettings(env = process.env) {
  if (!env.CHANNEX_API_KEY || !isRemoteId(env.CHANNEX_PROPERTY_ID)) return null;
  const mode = env.CHANNEX_MODE || 'staging';
  if (!['staging', 'production'].includes(mode)) return null;
  return {mode, key: env.CHANNEX_API_KEY, propertyId: env.CHANNEX_PROPERTY_ID};
}

export function channexClient(config, fetcher = fetch) {
  const origin = config.mode === 'production' ? 'https://app.channex.io' : 'https://staging.channex.io';
  const {propertyId} = config;
  const filter = new URLSearchParams({'filter[property_id]': propertyId, 'pagination[limit]': '100'});
  async function request(path, body) {
    const response = await fetcher(origin + '/api/v1/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {'user-api-key': config.key, accept: 'application/json',
        ...(body === undefined ? {} : {'content-type': 'application/json'})},
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw Error(`Channex returned HTTP ${response.status}.`);
    const data = await response.json();
    if (data.errors) throw Error('Channex rejected the request.');
    return data;
  }

  async function property() {
    const {data} = await request('properties/' + propertyId);
    if (data?.id !== propertyId) throw Error('The API key cannot access the configured property.');
    if (data.attributes?.currency !== 'DZD') throw Error('This workspace uses DZD. Configure a Channex property in DZD.');
    return {id: data.id, title: data.attributes.title};
  }

  async function send(state, from, to) {
    const {availability, restrictions} = buildAri(state, propertyId, from, to);
    const [, rooms, plans] = await Promise.all([
      property(), request('room_types?' + filter), request('rate_plans?' + filter),
    ]);
    for (const {roomId, rateId} of Object.values(distributionOf(state).mappings)) {
      const plan = plans.data?.find(item => item.id === rateId);
      const planRoom = plan?.relationships?.room_type?.data?.id ?? plan?.attributes?.room_type_id;
      if (!rooms.data?.some(item => item.id === roomId) || planRoom !== roomId) {
        throw Error('A mapped rate plan does not belong to its mapped room in the configured Channex property.');
      }
    }

    const tasks = [];
    for (const [path, values] of [['restrictions', restrictions], ['availability', availability]]) {
      const result = await request(path, {values});
      const accepted = result.data?.filter(item => item.type === 'task' && item.id).map(item => item.id);
      if (!accepted?.length || result.meta?.warnings?.length) {
        throw Error(`Channex did not fully accept the ${path} update. Review the mappings and retry.`);
      }
      tasks.push(...accepted);
    }
    return tasks;
  }

  return {
    propertyId, property, send,
    feed: async () => {
      const query = new URLSearchParams({
        'filter[property_id]': propertyId, 'order[inserted_at]': 'asc', 'pagination[limit]': '20',
      });
      const {data} = await request('booking_revisions/feed?' + query);
      if (!Array.isArray(data)) throw Error('Channex returned an invalid booking feed.');
      return data;
    },
    ack: revisionId => {
      if (!isRemoteId(revisionId)) throw Error('Invalid Channex revision ID.');
      return request('booking_revisions/' + revisionId + '/ack', {});
    },
  };
}

export function applyRevision(state, revision, propertyId) {
  const data = revision?.attributes;
  if (!isRemoteId(revision?.id) || !isRemoteId(data?.booking_id) ||
      data.property_id !== propertyId || !['new', 'modified', 'cancelled'].includes(data.status)) {
    throw Error('Channex revision has an invalid property, booking ID or status.');
  }
  const bookingId = data.booking_id;
  const existing = state.bookings.filter(booking => booking.channexBookingId === bookingId);
  if (data.status === 'cancelled') {
    return existing.filter(b => b.status !== 'Cancelled').reduce((next, booking) =>
      changeStatus(next, booking.id, 'Cancelled'), state);
  }
  if (data.currency !== 'DZD' || !Array.isArray(data.rooms) || !data.rooms.length || data.rooms.length > 25) {
    throw Error('Channex revision has unsupported currency or room data.');
  }

  const {mappings} = distributionOf(state);
  const source = String(data.ota_name ?? '').toLowerCase();
  const channel = CHANNELS.find(name => name.toLowerCase() === source) ??
    ({booking: 'Booking.com', bdc: 'Booking.com', abb: 'Airbnb', exp: 'Expedia'})[source] ?? 'Channex';
  const guest = [data.customer?.name, data.customer?.surname].filter(Boolean).join(' ').trim().slice(0, 180);
  const reservedIds = new Set(existing.map(b => b.id));
  const reused = new Set();
  // Temporarily release the previous allocations so a multi-room modification can reassign rooms atomically.
  let next = {...state, bookings: state.bookings.map(b => reservedIds.has(b.id) ? {...b, status: 'Cancelled'} : b)};
  for (const [index, item] of data.rooms.entries()) {
    const type = Object.keys(mappings).find(key => mappings[key].roomId === item.room_type_id);
    if (!type) throw Error('A Channex booking room is unmapped. Map the room before retrying.');
    const key = item.ota_unique_id ? String(item.ota_unique_id) : String(index + 1);
    const prior = existing.find(b => b.channexRoomKey === key);
    if (prior && reused.has(prior.id)) throw Error('Channex revision contains duplicate room references.');
    if (prior) reused.add(prior.id);
    const checkIn = item.checkin_date ?? data.arrival_date;
    const checkOut = item.checkout_date ?? data.departure_date;
    const amount = item.amount === undefined || item.amount === null ? NaN : Number(item.amount);
    const guests = Number(item.occupancy?.adults ?? 1) +
      Number(item.occupancy?.children ?? 0) + Number(item.occupancy?.infants ?? 0);
    if (!isDate(checkIn) || !isDate(checkOut) || !(nights(checkIn, checkOut) > 0) || !Number.isFinite(amount) || amount < 0) {
      throw Error('Channex booking has invalid stay dates or room amount.');
    }
    const booking = {
      channexBookingId: bookingId, channexRoomKey: key, guest: guest.length >= 2 ? guest : 'Channel guest',
      guests, email: '', channel, checkIn, checkOut, rate: amount / nights(checkIn, checkOut),
      externalRef: prior?.externalRef ?? `CX-${bookingId}:${key}`,
      status: ['Checked in','Checked out'].includes(prior?.status) ? prior.status : 'Confirmed',
    };
    const rooms = next.rooms.filter(room => room.type === type);
    const previousRoom = rooms.find(room => room.id === prior?.roomId);
    const candidates = previousRoom ? [previousRoom, ...rooms.filter(room => room !== previousRoom)] : rooms;
    const room = candidates.find(room => !validateStay(next, {...booking, roomId: room.id}, prior?.id, {external: true}));
    if (!room) throw Error(`Channex booking requires an available ${type} room for ${checkIn}.`);
    next = reserve(next, {...booking, roomId: room.id}, prior?.id ?? null, {external: true});
  }
  if (existing.some(b => !reused.has(b.id) && ['Checked in','Checked out'].includes(b.status))) {
    throw Error('A Channex modification removed a room with an active or completed stay.');
  }
  return next;
}
