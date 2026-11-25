import {randomUUID} from 'node:crypto';
import {addDays, iso} from '../hotel.mjs';
import {fresh, hydrate} from '../workspace-core.mjs';
import {distributionOf, enqueue, enqueueChanges, HORIZON, journal, recordDelivery, validateDistribution} from '../distribution.mjs';
import {applyRevision} from './channex.mjs';

const today = () => iso(new Date());
const conflict = message => Object.assign(Error(message), {status: 409});

export function channelWorkspace(store, provider, mode) {
  async function read() {
    const {etag, value} = await store.read();
    return {etag, record: value ?? {revision: 0, state: {...fresh(), bookings: []}, received: [], operation: null}};
  }

  async function update(change) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const {etag, record} = await read();
      const next = change(record);
      try {
        await store.write(next, etag);
        return next;
      } catch (error) {
        if (error.status !== 409 || attempt === 5) throw error;
      }
    }
  }

  const result = record => ({state: record.state, revision: record.revision, mode: mode ?? 'Workspace'});

  async function save(input, revision) {
    const checked = validateDistribution(hydrate(input));
    const record = await update(previous => {
      if (previous.revision !== revision) throw conflict('Another update saved first. Refresh the shared workspace and retry.');
      const mapping = distributionOf(checked).mappings;
      const state = {...checked, distribution: {...distributionOf(previous.state), mappings: mapping}};
      return {...previous, revision: previous.revision + 1,
        state: enqueueChanges(previous.state, state, today(), randomUUID())};
    });
    return result(record);
  }

  async function queue() {
    const record = await update(previous => ({...previous, revision: previous.revision + 1,
      state: enqueue(previous.state, today(), addDays(today(), HORIZON - 1), today(), randomUUID(), 'Full sync')}));
    return result(record);
  }

  async function operate(kind, work) {
    if (!provider) throw Object.assign(Error('Set the Channex API key and property ID in deployment settings.'), {status: 503});
    const id = randomUUID();
    const record = await update(previous => {
      if (previous.operation?.until > Date.now()) throw conflict('A Channex sync is already running.');
      return {...previous, operation: {id, kind, until: Date.now() + 90000}};
    });
    try {
      return await work(record);
    } finally {
      await update(previous => previous.operation?.id === id ? {...previous, operation: null} : previous);
    }
  }

  function send() {
    return operate('send', async record => {
      const job = distributionOf(record.state).jobs[0];
      if (!job) throw conflict('There are no queued changes.');
      let status = 'accepted', message = '', tasks = [];
      try {
        const from = job.from < today() ? today() : job.from;
        if (from <= job.to) {
          tasks = await provider.send(record.state, from, job.to);
          message = `Channex accepted the batch for ${from} to ${job.to}.`;
        } else {
          status = 'expired';
          message = 'The batch covered past dates and was closed.';
        }
      } catch (error) {
        status = 'failed';
        message = error.message;
      }
      const updated = await update(previous => ({...previous, revision: previous.revision + 1,
        state: recordDelivery(previous.state, [job.id], {status, message, tasks})}));
      return {...result(updated), message};
    });
  }

  function pull() {
    return operate('pull', async () => {
      const started = Date.now();
      const feed = await provider.feed();
      let imported = 0, acknowledged = 0, errorMessage = '';
      for (const item of feed) {
        if (Date.now() - started > 35000) break;
        try {
          const current = await read();
          if (!current.record.received.includes(item.id)) {
            await update(previous => {
              if (previous.received.includes(item.id)) return previous;
              const applied = applyRevision(previous.state, item, provider.propertyId);
              const next = enqueueChanges(previous.state, applied, today(), randomUUID());
              return {...previous, revision: previous.revision + 1,
                received: [...previous.received, item.id].slice(-2000),
                state: journal(next, {direction: 'Inbound', status: 'saved',
                  message: `Channex revision saved (${item.attributes.status}).`, tasks: [item.id]})};
            });
            imported++;
          }
          await provider.ack(item.id);
          acknowledged++;
        } catch (error) {
          errorMessage = error.message;
          await update(previous => ({...previous, revision: previous.revision + 1,
            state: journal(previous.state, {direction: 'Inbound', status: 'failed',
              message: errorMessage, tasks: [item.id]})}));
          break;
        }
      }
      const {record} = await read();
      const remaining = feed.length - acknowledged;
      return {...result(record), remaining, message: errorMessage ||
        (feed.length ? `${imported} saved, ${acknowledged} acknowledged${remaining ? ', more pending' : ''}.` : 'No bookings waiting in Channex.')};
    });
  }

  return {read: async () => result((await read()).record), save, queue, send, pull};
}
