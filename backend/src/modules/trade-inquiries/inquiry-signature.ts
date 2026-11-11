import { createHmac, timingSafeEqual } from 'node:crypto';

// Website → CMS ingestion signature (docs/sales/TRADE_INQUIRIES.md, "Signing protocol"):
//   X-HMV-Timestamp: Unix time in seconds
//   X-HMV-Signature: lowercase hex HMAC-SHA256(secret, `${timestamp}.${idempotencyKey}`)
//   Idempotency-Key: the inquiry's idempotency key
// TLS protects the body in transit; the signature proves the caller holds the shared secret; the idempotency key (a
// unique column) turns a replayed request into the existing inquiry, never a new one. No personal data is signed.

export const IDEMPOTENCY_KEY = /^[A-Za-z0-9-]{8,64}$/;
export const MAX_CLOCK_SKEW_SECONDS = 300;

export const signIngestRequest = (
  secret: string,
  timestamp: string,
  idempotencyKey: string,
) =>
  createHmac('sha256', secret)
    .update(`${timestamp}.${idempotencyKey}`)
    .digest('hex');

export type SignatureCheck = 'ok' | 'unauthenticated' | 'invalid-key';

/** Constant-time check of the signature, then the timestamp window, then the idempotency key's format. */
export function verifyIngestRequest(input: {
  secret: string;
  timestamp?: string;
  signature?: string;
  idempotencyKey?: string;
  nowMs: number;
}): SignatureCheck {
  const { secret, timestamp, signature, idempotencyKey, nowMs } = input;
  if (!secret || !timestamp || !signature || !idempotencyKey)
    return 'unauthenticated';
  if (!/^\d{1,12}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature))
    return 'unauthenticated';
  const expected = Buffer.from(
    signIngestRequest(secret, timestamp, idempotencyKey),
    'hex',
  );
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
    return 'unauthenticated';
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS)
    return 'unauthenticated';
  return IDEMPOTENCY_KEY.test(idempotencyKey) ? 'ok' : 'invalid-key';
}
