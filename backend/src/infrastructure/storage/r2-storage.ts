import { AwsClient } from 'aws4fetch';
import type { ObjectStorage } from './object-storage';

export interface R2Options {
  endpoint: string; // https://<account-id>.r2.cloudflarestorage.com
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string; // custom domain (or r2.dev) bound to the bucket
}

/**
 * Cloudflare R2 through its S3-compatible API (SigV4, path-style).
 * Credentials stay on the server; clients only ever receive `publicUrl()`.
 */
export class R2Storage implements ObjectStorage {
  private readonly client: AwsClient;

  constructor(private readonly opts: R2Options) {
    for (const [k, v] of Object.entries(opts))
      if (!v) throw new Error(`R2 storage is missing "${k}"`);
    this.client = new AwsClient({
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
      service: 's3',
      region: 'auto',
    });
  }

  private url(key: string) {
    return `${this.opts.endpoint.replace(/\/+$/, '')}/${this.opts.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  private async send(method: string, key: string, init: RequestInit = {}) {
    const res = await this.client.fetch(this.url(key), { method, ...init });
    if (!res.ok)
      throw new Error(
        `R2 ${method} ${key} failed: ${res.status} ${await res.text()}`,
      );
  }

  put(key: string, body: Buffer, contentType: string) {
    return this.send('PUT', key, {
      body: new Uint8Array(body),
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable', // keys are unique per upload
      },
    });
  }

  delete(key: string) {
    return this.send('DELETE', key);
  }

  publicUrl(key: string) {
    return `${this.opts.publicBaseUrl}/${key}`;
  }
}
