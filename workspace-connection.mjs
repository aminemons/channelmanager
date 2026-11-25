export async function workspaceRequest(key, action, data = {}) {
  const response = await fetch('/api/channel-sync', {
    method: 'POST',
    headers: {'content-type': 'application/json', authorization: 'Bearer ' + key},
    body: JSON.stringify({action, ...data}),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    throw Error(result?.error || 'The shared workspace is unavailable.');
  }
  return result;
}
