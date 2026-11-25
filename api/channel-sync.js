import {createHash, timingSafeEqual} from 'node:crypto';
import {channexClient, channexSettings} from '../server/channex.mjs';
import {channelWorkspace} from '../server/channel-workspace.mjs';
import {blobWorkspaceStore} from '../server/workspace-store.mjs';

const digest = value => createHash('sha256').update(value).digest();
const matches = (provided, expected) => typeof provided === 'string' && typeof expected === 'string' &&
  expected.length >= 24 && timingSafeEqual(digest(provided), digest(expected));

function send(res, status, data) {
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff'});
  res.end(JSON.stringify(data));
}

async function bodyOf(req) {
  const maxBytes = 3850000;
  if (Number(req.headers['content-length']) > maxBytes) throw Object.assign(Error('Request is too large.'), {status: 413});
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(Error('Request is too large.'), {status: 413});
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export default async function handler(req, res) {
  const settings = channexSettings();
  const admin = process.env.HOMA_WORKSPACE_KEY;
  const webhookKey = process.env.CHANNEX_WEBHOOK_SECRET;
  const storage = Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN));
  const shared = storage && Boolean(admin && admin.length >= 24);
  if (req.method === 'GET') return send(res, 200, {shared, providerConfigured: Boolean(shared && settings)});
  if (req.method !== 'POST') return send(res, 405, {error: 'Use GET or POST.'});
  if (!shared) return send(res, 503, {error: 'Shared workspace storage is unavailable.'});
  const url = new URL(req.url, 'http://localhost');
  const webhook = url.pathname === '/api/channel-webhook' || url.searchParams.get('webhook') === '1';
  if (webhook ? !matches(req.headers['x-homa-webhook-secret'], webhookKey)
    : !matches(req.headers.authorization, 'Bearer ' + admin)) {
    return send(res, 401, {error: 'Workspace access denied.'});
  }
  if (!String(req.headers['content-type']).includes('application/json')) {
    return send(res, 415, {error: 'Use application/json.'});
  }
  const provider = settings ? channexClient(settings) : null;
  const workspace = channelWorkspace(blobWorkspaceStore(), provider, settings?.mode);
  try {
    const input = await bodyOf(req);
    if (!input || typeof input !== 'object' || Array.isArray(input)) return send(res, 400, {error: 'Invalid request.'});
    if (webhook) {
      if (!settings) return send(res, 503, {error: 'Channex is not configured.'});
      const eventProperty = input.property_id ?? input.payload?.property_id;
      if (input.event !== 'booking' || eventProperty !== settings.propertyId) return send(res, 204, null);
      const {remaining} = await workspace.pull();
      return send(res, remaining ? 503 : 200, {remaining});
    }
    switch (input.action) {
      case 'read': return send(res, 200, await workspace.read());
      case 'save':
        if (!input.state || !Number.isSafeInteger(input.revision)) return send(res, 400, {error: 'Invalid workspace or revision.'});
        return send(res, 200, await workspace.save(input.state, input.revision));
      case 'queue': return send(res, 200, await workspace.queue());
      case 'send': return send(res, 200, await workspace.send());
      case 'pull': return send(res, 200, await workspace.pull());
      case 'verify':
        if (!provider) return send(res, 503, {error: 'Set the Channex API key and property ID in deployment settings.'});
        return send(res, 200, {property: await provider.property(), mode: settings.mode});
      default: return send(res, 400, {error: 'Unknown workspace action.'});
    }
  } catch (error) {
    if (error.status) return send(res, error.status, {error: error.message});
    if (error instanceof SyntaxError) return send(res, 400, {error: 'Invalid JSON body.'});
    // Keep storage internals and provider response data off the public endpoint.
    if (String(error.name).startsWith('Blob')) return send(res, 503, {error: 'Shared storage is temporarily unavailable.'});
    return send(res, 422, {error: error.message});
  }
}
