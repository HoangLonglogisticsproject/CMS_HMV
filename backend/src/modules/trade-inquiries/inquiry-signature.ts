import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Website → CMS ingestion signature (docs/sales/TRADE_INQUIRIES.md, "Signing protocol"):
//   X-HMV-Timestamp: Unix time in seconds
//   X-HMV-Signature: lowercase hex HMAC-SHA256(secret, `${timestamp}.${idempotencyKey}.${sha256hex(body)}`)
//   Idempotency-Key: the inquiry's idempotency key
// The body hash is over the exact bytes sent (the website signs the string it transmits; the CMS hashes the raw request
// body, never re-serialized JSON), so captured headers cannot be replayed with another body inside the time window.
// The idempotency key (a unique column) turns a replay of the same request into the existing inquiry, never a new one.
// No personal data is in the headers.

export const IDEMPOTENCY_KEY = /^[A-Za-z0-9-]{8,64}$/;
export const MAX_CLOCK_SKEW_SECONDS = 300;

export const bodyHash = (body: Buffer | string) =>
  createHash('sha256').update(body).digest('hex');

export const signIngestRequest = (
  secret: string,
  timestamp: string,
  idempotencyKey: string,
  body: Buffer | string,
) =>
  createHmac('sha256', secret)
    .update(`${timestamp}.${idempotencyKey}.${bodyHash(body)}`)
    .digest('hex');

export type SignatureCheck = 'ok' | 'unauthenticated' | 'invalid-key';

/** Constant-time check of the signature, then the timestamp window, then the idempotency key's format. */
export function verifyIngestRequest(input: {
  secret: string;
  timestamp?: string;
  signature?: string;
  idempotencyKey?: string;
  /** The raw request body as received. */
  body: Buffer | string;
  nowMs: number;
}): SignatureCheck {
  const { secret, timestamp, signature, idempotencyKey, body, nowMs } = input;
  if (!secret || !timestamp || !signature || !idempotencyKey)
    return 'unauthenticated';
  if (!/^\d{1,12}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature))
    return 'unauthenticated';
  const expected = Buffer.from(
    signIngestRequest(secret, timestamp, idempotencyKey, body),
    'hex',
  );
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
    return 'unauthenticated';
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS)
    return 'unauthenticated';
  return IDEMPOTENCY_KEY.test(idempotencyKey) ? 'ok' : 'invalid-key';
}
