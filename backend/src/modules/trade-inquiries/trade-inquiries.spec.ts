import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { loadConfig, trimTrailingSlashes } from '../../config';
import { AppError } from '../../common/errors';
import { blankToNull, buildBrief } from './inquiry-brief';
import { ORIGINS, PRODUCTS, lookup, requirementsFor } from './inquiry-contract';
import {
  type InquiryEmail,
  type InquiryNotifier,
  buildInquiryEmail,
  sendWithin,
  smtpTransportOptions,
} from './inquiry-notifier';
import { REFERENCE, createReference } from './inquiry-reference';
import {
  bodyHash,
  signIngestRequest,
  verifyIngestRequest,
} from './inquiry-signature';
import {
  STALE_ATTEMPT_MS,
  notificationRetryable,
  vietnamBound,
} from './trade-inquiries.service';
import { IngestTradeInquiryDto, isFilterDate } from './trade-inquiry.dto';

// Shared with the website (HMV_landingpage src/next/inquiry/service.test.js and docs/inbound/TRADE_DESK_DELIVERY.md):
// both repositories must produce this exact signature over these exact body bytes, or the integration has drifted.
export const SIGNING_TEST_VECTOR = {
  secret: 'hmv-shared-test-vector-secret-0123456789abcdef',
  timestamp: '1767225600',
  idempotencyKey: '0f3b6d2e-1c4a-4e8b-9a77-2f1d3c4b5a69',
  body: '{"locale":"en","productId":"dried-cassava-chips","origin":"vietnam","destination":"Singapore","volume":{"amount":"5000","unit":"mt_month"},"application":"bioethanol","transport":"sea_fcl","requirements":{},"contact":{"company":"Example Co","email":"buyer@example.com"},"consentAt":"2026-01-01T00:00:00.000Z"}',
  bodySha256:
    '20fe22d201ffaf572bf56b405b8e5695a6e8f270f1312238c40cc078e7431d9c',
  signature: '37a0452e58562fb1d41ff58ad73f4cc362cd6586e529d2b958476a905d5f4d91',
};

describe('ingest signature', () => {
  const v = SIGNING_TEST_VECTOR;
  const nowMs = Number(v.timestamp) * 1000;
  const check = (over: Partial<Parameters<typeof verifyIngestRequest>[0]>) =>
    verifyIngestRequest({
      secret: v.secret,
      timestamp: v.timestamp,
      signature: v.signature,
      idempotencyKey: v.idempotencyKey,
      body: v.body,
      nowMs,
      ...over,
    });

  it('matches the shared test vector (raw body bytes, as a string or a Buffer)', () => {
    expect(bodyHash(v.body)).toBe(v.bodySha256);
    expect(
      signIngestRequest(v.secret, v.timestamp, v.idempotencyKey, v.body),
    ).toBe(v.signature);
    expect(check({})).toBe('ok');
    expect(check({ body: Buffer.from(v.body, 'utf8') })).toBe('ok');
  });

  it('the vector body is a valid product-led inquiry: it passes the ingestion DTO and the contract', async () => {
    const dto = plainToInstance(IngestTradeInquiryDto, JSON.parse(v.body));
    // The app's ValidationPipe options: unknown fields are refused.
    expect(
      await validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    expect(buildBrief(dto)).toMatchObject({
      productId: 'dried-cassava-chips',
      productName: 'Dried cassava chips',
      origin: 'Vietnam',
      destination: 'Singapore',
      volumeAmount: '5000',
      application: 'Bioethanol',
      transport: 'Sea freight (FCL)',
    });
  });

  it('the body is signed: another body, or the same JSON serialized differently, is refused', () => {
    expect(check({ body: v.body.replace('Singapore', 'Rotterdam') })).toBe(
      'unauthenticated',
    );
    expect(check({ body: JSON.stringify(JSON.parse(v.body), null, 1) })).toBe(
      'unauthenticated',
    );
    expect(check({ body: '' })).toBe('unauthenticated');
  });

  it('refuses a wrong secret, a tampered key or timestamp, and missing or malformed headers', () => {
    expect(check({ secret: `${v.secret}x` })).toBe('unauthenticated');
    expect(check({ idempotencyKey: `${v.idempotencyKey}x` })).toBe(
      'unauthenticated',
    );
    expect(check({ timestamp: '1767225601' })).toBe('unauthenticated');
    expect(check({ signature: undefined })).toBe('unauthenticated');
    expect(check({ signature: 'not-hex' })).toBe('unauthenticated');
    expect(check({ timestamp: undefined })).toBe('unauthenticated');
    expect(check({ secret: '' })).toBe('unauthenticated');
  });

  it('refuses a timestamp more than 5 minutes away; accepts within the window', () => {
    expect(check({ nowMs: nowMs + 299_000 })).toBe('ok');
    expect(check({ nowMs: nowMs - 299_000 })).toBe('ok');
    expect(check({ nowMs: nowMs + 301_000 })).toBe('unauthenticated');
    expect(check({ nowMs: nowMs - 301_000 })).toBe('unauthenticated');
  });

  it('a correctly signed but malformed idempotency key is a validation error, not an auth error', () => {
    const key = 'bad key!';
    expect(
      check({
        idempotencyKey: key,
        signature: signIngestRequest(v.secret, v.timestamp, key, v.body),
      }),
    ).toBe('invalid-key');
  });
});

describe('inquiry reference', () => {
  it('HMV-<year>-<6 unambiguous characters>', () => {
    expect(createReference(new Date('2027-03-01T00:00:00Z'), () => 0)).toBe(
      'HMV-2027-222222',
    );
    const refs = new Set(Array.from({ length: 200 }, () => createReference()));
    for (const r of refs) expect(r).toMatch(REFERENCE);
    expect(refs.size).toBeGreaterThan(195);
  });
});

describe('inquiry contract', () => {
  it('mirrors the website requirement keys for the buyer pages and the other products', () => {
    expect(requirementsFor('passion-fruit').map((r) => r.key)).toEqual([
      'variety',
      'sizeWeight',
      'brix',
      'packaging',
      'deliveryWindow',
      'destinationPort',
      'destinationRequirements',
    ]);
    expect(requirementsFor('dried-cassava-chips').map((r) => r.key)).toEqual([
      'starch',
      'moisture',
      'loading',
      'incoterm',
      'destinationPort',
      'deliveryWindow',
    ]);
    expect(requirementsFor('bananas').map((r) => r.key)).toEqual([
      'spec-fruit-size',
      'spec-maturity',
      'spec-carton-weight',
      'spec-cold-chain',
      'destinationPort',
      'deliveryWindow',
      'certification',
      'incoterm',
    ]);
    expect(Object.keys(PRODUCTS)).toHaveLength(7);
    // Every inquiry is product-led: no product, no requirement fields.
    expect(requirementsFor(null)).toEqual([]);
  });

  it('lookups use own keys only: inherited names are unknown, never Object.prototype members', () => {
    for (const key of [
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
    ])
      expect(lookup(PRODUCTS, key)).toBeUndefined();
    expect(lookup(PRODUCTS, 'unknown-product')).toBeUndefined();
    expect(lookup(ORIGINS, 'vietnam')).toBe('Vietnam');
    expect(lookup(ORIGINS, null)).toBeUndefined();
    expect(requirementsFor('__proto__')).toEqual([]);
    expect(requirementsFor('constructor')).toEqual([]);
  });
});

describe('notification email', () => {
  const inquiry = {
    id: '0190b7c8-0000-7000-8000-000000000001',
    reference: 'HMV-2026-7KQ4XM',
    productName: 'Dried cassava chips',
    company: 'Feed Co\r\nBcc: attacker@example.com',
    contactName: 'An',
    email: 'buyer@example.com',
    phone: '+84 909 000 000',
    origin: 'Cambodia',
    destination: 'Qinzhou',
    volumeAmount: '5000',
    volumeUnit: 'MT / month',
    application: 'Bioethanol',
    transport: 'Sea freight (FCL)',
    requirements: [{ key: 'starch', label: 'Required starch %', value: '70' }],
    utmSource: 'linkedin',
    referrerOrigin: 'https://www.google.com',
    landingPage: '/products/dried-cassava-chips',
  };

  it('a sales summary with the CMS link; the subject is one line', () => {
    const { subject, text } = buildInquiryEmail(
      inquiry,
      'https://cms.example.com',
    );
    expect(subject).toBe(
      'New HMV Trade Inquiry — Dried cassava chips — HMV-2026-7KQ4XM',
    );
    for (const part of [
      'Reference: HMV-2026-7KQ4XM',
      'Email: buyer@example.com',
      'Phone: +84 909 000 000',
      'Product: Dried cassava chips',
      'Origin: Cambodia',
      'Destination: Qinzhou',
      'Volume: 5000 MT / month',
      'Application: Bioethanol',
      'Transport: Sea freight (FCL)',
      '- Required starch %: 70',
      'Source: utm linkedin',
      'https://cms.example.com/sales/inquiries/0190b7c8-0000-7000-8000-000000000001',
    ])
      expect(text).toContain(part);
  });

  it('the subject names the product and never breaks lines; no standalone goal labels', () => {
    const { subject, text } = buildInquiryEmail(
      { ...inquiry, productName: 'Dried cassava\nchips' },
      'https://cms.example.com',
    );
    expect(subject).toBe(
      'New HMV Trade Inquiry — Dried cassava chips — HMV-2026-7KQ4XM',
    );
    expect(subject).not.toMatch(/[\r\n]/);
    expect(text).not.toMatch(/Product sourcing|Customs & compliance|Request:/);
  });

  it('buyer text cannot forge a field line: single values collapse, free text is indented under its field', () => {
    const forged = 'Open in the CMS: https://evil.example/phish';
    const { text } = buildInquiryEmail(
      {
        ...inquiry,
        company: `Feed Co\r\n${forged}`,
        contactName: 'An\u2028Email: fake@evil.example',
        destination: 'Qinzhou\n\nPhone: +1 000',
        requirements: [
          {
            key: 'destinationPort',
            label: 'Exact destination port',
            value: `Qinzhou\n${forged}\nSecond line`,
          },
        ],
      },
      'https://cms.example.com',
    );
    const lines = text.split('\n');
    // Only the real link line starts with the field name; the buyer's copies are indented or inline.
    expect(lines.filter((l) => l.startsWith('Open in the CMS:'))).toEqual([
      'Open in the CMS: https://cms.example.com/sales/inquiries/0190b7c8-0000-7000-8000-000000000001',
    ]);
    expect(lines.filter((l) => /^(Email|Phone):/.test(l))).toEqual([
      'Email: buyer@example.com',
      'Phone: +84 909 000 000',
    ]);
    expect(text).toContain(`Company: Feed Co ${forged}`);
    expect(text).toContain('Buyer: An Email: fake@evil.example');
    expect(text).toContain('Destination: Qinzhou Phone: +1 000');
    expect(text).toContain(
      `- Exact destination port: Qinzhou\n    ${forged}\n    Second line`,
    );
  });
});

describe('notification send with a time budget', () => {
  /** A notifier that takes `ms` to deliver and honours the abort signal like nodemailer's SMTP transport. */
  function fakeSmtp(ms: number) {
    const log: string[] = [];
    const notifier: InquiryNotifier = {
      enabled: true,
      send: (_m: InquiryEmail, signal: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
          const done = setTimeout(() => {
            log.push('delivered');
            resolve();
          }, ms);
          signal.addEventListener('abort', () => {
            clearTimeout(done);
            log.push('cancelled');
            reject(
              Object.assign(new Error('Message sending aborted'), {
                code: 'EABORT',
              }),
            );
          });
        }),
    };
    return { notifier, log };
  }
  const message = { subject: 's', text: 't' };

  it('a send over budget is cancelled (ETIMEOUT) and nothing is delivered afterwards', async () => {
    const smtp = fakeSmtp(200);
    const started = Date.now();
    await expect(sendWithin(smtp.notifier, message, 20)).rejects.toMatchObject({
      code: 'ETIMEOUT',
    });
    expect(Date.now() - started).toBeLessThan(150);
    await new Promise((r) => setTimeout(r, 250));
    expect(smtp.log).toEqual(['cancelled']);
  });

  it('a send within budget is delivered and never aborted', async () => {
    const smtp = fakeSmtp(5);
    await expect(
      sendWithin(smtp.notifier, message, 200),
    ).resolves.toBeUndefined();
    expect(smtp.log).toEqual(['delivered']);
  });

  it('a send that fails on its own keeps its error code', async () => {
    const failing: InquiryNotifier = {
      enabled: true,
      send: () =>
        Promise.reject(Object.assign(new Error('auth'), { code: 'EAUTH' })),
    };
    await expect(sendWithin(failing, message, 200)).rejects.toMatchObject({
      code: 'EAUTH',
    });
  });
});

describe('inbox date filters are Vietnam calendar days (UTC+7)', () => {
  const iso = (d: Date) => d.toISOString();
  it('a plain date: from its 00:00 to the next day 00:00 (exclusive), in Vietnam', () => {
    expect(iso(vietnamBound('2026-11-12', 'from'))).toBe(
      '2026-11-11T17:00:00.000Z',
    );
    expect(iso(vietnamBound('2026-11-12', 'to'))).toBe(
      '2026-11-12T17:00:00.000Z',
    );
    expect(iso(vietnamBound('2026-12-31', 'to'))).toBe(
      '2026-12-31T17:00:00.000Z',
    );
    expect(iso(vietnamBound('2027-01-01', 'from'))).toBe(
      '2026-12-31T17:00:00.000Z',
    );
    expect(iso(vietnamBound('2028-02-29', 'to'))).toBe(
      '2028-02-29T17:00:00.000Z',
    );
  });

  it('a date-time with an offset is an instant; without one it is Vietnam time', () => {
    expect(iso(vietnamBound('2026-11-12T00:00:00Z', 'from'))).toBe(
      '2026-11-12T00:00:00.000Z',
    );
    expect(iso(vietnamBound('2026-11-12T09:30:00+02:00', 'to'))).toBe(
      '2026-11-12T07:30:00.000Z',
    );
    expect(iso(vietnamBound('2026-11-12T08:00', 'from'))).toBe(
      '2026-11-12T01:00:00.000Z',
    );
  });
});

describe('trade inquiry configuration', () => {
  const secret = 'x'.repeat(32);
  it('ingestion: off by default; on needs a 32+ character secret', () => {
    expect(loadConfig({}).tradeInquiries.ingestEnabled).toBe(false);
    expect(() => loadConfig({ TRADE_INQUIRY_INGEST_ENABLED: 'true' })).toThrow(
      'TRADE_INQUIRY_INGEST_SECRET',
    );
    expect(() =>
      loadConfig({
        TRADE_INQUIRY_INGEST_ENABLED: 'true',
        TRADE_INQUIRY_INGEST_SECRET: 'short',
      }),
    ).toThrow('TRADE_INQUIRY_INGEST_SECRET');
    expect(
      loadConfig({
        TRADE_INQUIRY_INGEST_ENABLED: 'true',
        TRADE_INQUIRY_INGEST_SECRET: secret,
      }).tradeInquiries.ingestEnabled,
    ).toBe(true);
  });

  it('notification email: on needs recipients, sender, SMTP host and the CMS URL (https in production)', () => {
    expect(() => loadConfig({ INQUIRY_NOTIFY_EMAIL_ENABLED: 'true' })).toThrow(
      'INQUIRY_NOTIFY_TO, INQUIRY_NOTIFY_FROM, SMTP_HOST, CMS_PUBLIC_URL',
    );
    const email = {
      INQUIRY_NOTIFY_EMAIL_ENABLED: 'true',
      INQUIRY_NOTIFY_TO: 'a@hmv.test, b@hmv.test',
      INQUIRY_NOTIFY_FROM: 'cms@hmv.test',
      SMTP_HOST: 'smtp.hmv.test',
      CMS_PUBLIC_URL: 'https://cms.hmv.test/',
    };
    expect(loadConfig(email).tradeInquiries).toMatchObject({
      cmsPublicUrl: 'https://cms.hmv.test',
      notify: { enabled: true, to: ['a@hmv.test', 'b@hmv.test'] },
    });
    const prod = {
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://cms.hmv.test',
      MEDIA_PUBLIC_BASE_URL: 'https://media.hmv.test',
    };
    for (const bad of [
      'http://cms.hmv.test',
      'https://',
      'https:',
      'cms.hmv.test',
      'ftp://cms.hmv.test',
      'not a url',
    ])
      expect(() =>
        loadConfig({ ...prod, ...email, CMS_PUBLIC_URL: bad }),
      ).toThrow('CMS_PUBLIC_URL');
    expect(
      loadConfig({ ...prod, ...email, CMS_PUBLIC_URL: 'https://CMS.hmv.test/' })
        .tradeInquiries.cmsPublicUrl,
    ).toBe('https://cms.hmv.test');
    expect(
      loadConfig({
        ...prod,
        ...email,
        CMS_PUBLIC_URL: 'https://hmv.test/cms//',
      }).tradeInquiries.cmsPublicUrl,
    ).toBe('https://hmv.test/cms');
    // Development is unchanged: any value, trailing slashes trimmed.
    expect(
      loadConfig({ ...email, CMS_PUBLIC_URL: 'http://localhost:3000/' })
        .tradeInquiries.cmsPublicUrl,
    ).toBe('http://localhost:3000');
  });
});

describe('SMTP transport', () => {
  const smtp = {
    host: 'smtp.hmv.test',
    port: 587,
    secure: false,
    user: 'u',
    pass: 'p',
  };
  it('is always encrypted: implicit TLS when secure, STARTTLS required otherwise', () => {
    const implicit = smtpTransportOptions({ ...smtp, port: 465, secure: true });
    expect(implicit).toMatchObject({ secure: true, port: 465 });
    expect(implicit).not.toHaveProperty('requireTLS');

    const starttls = smtpTransportOptions(smtp);
    expect(starttls).toMatchObject({ requireTLS: true, port: 587 });
    // Nothing that could turn TLS off or leave it optional: no secure:false, ignoreTLS or relaxed certificates.
    expect(starttls).not.toHaveProperty('secure');
    expect(starttls).not.toHaveProperty('ignoreTLS');
    expect(starttls).not.toHaveProperty('tls');
    expect(implicit).not.toHaveProperty('ignoreTLS');
    expect(implicit).not.toHaveProperty('tls');

    expect(smtpTransportOptions({ ...smtp, user: '' }).auth).toBeUndefined();
  });
});

describe('notification retry rule', () => {
  const now = new Date('2026-11-12T08:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const at = (
    notificationStatus: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'SKIPPED',
    age = 0,
  ) => ({
    notificationStatus,
    notificationLastAttemptAt: ago(age),
    createdAt: ago(age),
  });
  it('a failed attempt, or one a crash left PENDING or SENDING for 5 minutes; never a running one', () => {
    expect(notificationRetryable(at('FAILED'), now)).toBe(true);
    expect(notificationRetryable(at('SENDING'), now)).toBe(false);
    expect(notificationRetryable(at('PENDING'), now)).toBe(false);
    expect(
      notificationRetryable(at('SENDING', STALE_ATTEMPT_MS + 1), now),
    ).toBe(true);
    expect(
      notificationRetryable(at('PENDING', STALE_ATTEMPT_MS + 1), now),
    ).toBe(true);
    expect(notificationRetryable(at('SENT', STALE_ATTEMPT_MS + 1), now)).toBe(
      false,
    );
    expect(notificationRetryable(at('SKIPPED'), now)).toBe(false);
  });
});

describe('inquiry brief', () => {
  const dto = (over: object) =>
    ({
      locale: 'en',
      productId: 'dried-cassava-chips',
      requirements: {},
      contact: { company: 'Feed Co', email: 'Buyer@Example.com' },
      consentAt: '2026-11-12T08:00:00.000Z',
      ...over,
    }) as IngestTradeInquiryDto;
  const issues = (over: object) => {
    try {
      buildBrief(dto(over));
    } catch (err) {
      return (err as AppError).details;
    }
    return [];
  };

  it('reports every issue, in order: product, unit, application, transport, requirements', () => {
    expect(
      issues({
        productId: 'gold',
        volume: { unit: 'barrels' },
        transport: 'teleport',
        requirements: { admin: 'x', incoterm: 'XYZ' },
      }),
    ).toEqual([
      { path: 'productId', message: 'productId must be a Trade Desk product' },
      { path: 'volume.unit', message: 'unknown volume unit' },
      { path: 'transport', message: 'unknown transport' },
      { path: 'requirements.admin', message: 'unknown requirement' },
      { path: 'requirements.incoterm', message: 'unknown requirement' },
    ]);
    // Product-led: an unknown or inherited product id is refused.
    for (const productId of ['__proto__', 'constructor', 'logistics'])
      expect(issues({ productId })).toEqual([
        {
          path: 'productId',
          message: 'productId must be a Trade Desk product',
        },
      ]);
    expect(
      issues({
        origin: 'thailand',
        application: 'fuel',
        requirements: { incoterm: 'XYZ', starch: 'x'.repeat(201), moisture: 7 },
      }),
    ).toEqual([
      { path: 'origin', message: 'origin is not offered for this product' },
      { path: 'application', message: 'unknown application' },
      { path: 'requirements.incoterm', message: 'unknown option' },
      {
        path: 'requirements.starch',
        message: 'must be a string of at most 200 characters',
      },
      {
        path: 'requirements.moisture',
        message: 'must be a string of at most 200 characters',
      },
    ]);
  });

  it('stores labels, the contract order, the default origin and unit; blank answers are left out', () => {
    const brief = buildBrief(
      dto({
        volume: { amount: ' 5000 ', unit: 'mt_month' },
        application: 'feed',
        requirements: { incoterm: 'CIF', starch: ' 70 ', moisture: '' },
      }),
    );
    expect(brief).toMatchObject({
      productId: 'dried-cassava-chips',
      productName: 'Dried cassava chips',
      origin: 'Vietnam',
      volumeAmount: '5000',
      volumeUnit: 'MT / month',
      application: 'Animal feed',
      transport: null,
      email: 'buyer@example.com',
      contactName: null,
    });
    expect(brief.requirements).toEqual([
      { key: 'starch', label: 'Required starch %', value: '70' },
      { key: 'incoterm', label: 'Incoterm', value: 'CIF' },
    ]);
    expect(blankToNull('  ')).toBeNull();
    expect(blankToNull(undefined)).toBeNull();
    expect(blankToNull(' x ')).toBe('x');
  });
});

describe('inbox date filter format', () => {
  it('a plain date or an ISO 8601 date-time (minutes at least, optional offset)', () => {
    for (const ok of [
      '2026-11-12',
      '2026-11-12T08:00',
      '2026-11-12T08:00:00Z',
      '2026-11-12T08:00:00.123+07:00',
    ])
      expect(isFilterDate(ok)).toBe(true);
    for (const bad of [
      '2026-W46',
      '2026-316',
      '2026-11',
      '2026-11-12T08',
      '12/11/2026',
      '2026-13-01',
      '2026-02-30',
      'x',
      20261112,
    ])
      expect(isFilterDate(bad)).toBe(false);
  });
});

describe('trailing slashes', () => {
  it('are removed without a regex; nothing else changes', () => {
    expect(trimTrailingSlashes('https://cms.hmv.test///')).toBe(
      'https://cms.hmv.test',
    );
    expect(trimTrailingSlashes('https://cms.hmv.test/admin')).toBe(
      'https://cms.hmv.test/admin',
    );
    expect(trimTrailingSlashes('///')).toBe('');
    expect(trimTrailingSlashes('')).toBe('');
  });
});
