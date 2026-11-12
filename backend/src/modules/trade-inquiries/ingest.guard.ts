import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../../common/errors';
import { APP_CONFIG, type AppConfig } from '../../config';
import { verifyIngestRequest } from './inquiry-signature';

/**
 * Server-to-server authentication of the website's inquiry ingestion. This guard IS the access control of the route:
 * the route is @Public() only so the global session guard does not demand a CMS session cookie, which a server never
 * has. Without the shared secret's HMAC over a fresh timestamp, the idempotency key and the exact body received, no
 * request gets through. It runs before the body is validated or used.
 * Disabled integration → 503; bad, missing or stale signature → 401; well-signed but malformed key → 400.
 */
@Injectable()
export class TradeInquiryIngestGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    const { ingestEnabled, ingestSecret } = this.config.tradeInquiries;
    if (!ingestEnabled)
      throw new AppError(
        503,
        'INTEGRATION_DISABLED',
        'Trade inquiry ingestion is disabled',
      );
    // rawBody: the exact bytes received (the app runs with `rawBody: true`); absent, the hash is of nothing and fails.
    const req = ctx.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const check = verifyIngestRequest({
      secret: ingestSecret,
      timestamp: req.header('x-hmv-timestamp'),
      signature: req.header('x-hmv-signature'),
      idempotencyKey: req.header('idempotency-key'),
      body: req.rawBody ?? Buffer.alloc(0),
      nowMs: Date.now(),
    });
    if (check === 'invalid-key')
      throw new AppError(
        400,
        'VALIDATION_FAILED',
        'Request validation failed',
        [
          {
            path: 'Idempotency-Key',
            message: 'must be 8-64 letters, digits or hyphens',
          },
        ],
      );
    if (check !== 'ok')
      throw new AppError(
        401,
        'SIGNATURE_INVALID',
        'Missing, invalid or expired request signature',
      );
    return true;
  }
}
