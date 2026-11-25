import {get, put, BlobPreconditionFailedError} from '@vercel/blob';

const path = 'homa/workspace-v1.json';

export function blobWorkspaceStore() {
  return {
    async read() {
      const response = await get(path, {access: 'private', useCache: false});
      if (!response) return {etag: null, value: null};
      return {
        etag: response.blob.etag,
        value: await new Response(response.stream).json(),
      };
    },
    async write(value, etag) {
      try {
        await put(path, JSON.stringify(value), {
          access: 'private',
          contentType: 'application/json',
          ...(etag ? {ifMatch: etag} : {allowOverwrite: false}),
        });
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError || (!etag && /already exists/i.test(error.message))) {
          throw Object.assign(Error('The workspace changed. Refresh it and retry.'), {status: 409});
        }
        throw error;
      }
    },
  };
}
