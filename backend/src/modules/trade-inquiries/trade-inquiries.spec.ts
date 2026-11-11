import { loadConfig } from '../../config';
import { PRODUCTS, requirementsFor } from './inquiry-contract';
import { buildInquiryEmail, withTimeout } from './inquiry-notifier';
import { REFERENCE, createReference } from './inquiry-reference';
import { signIngestRequest, verifyIngestRequest } from './inquiry-signature';

// Shared with the website (HMV_landingpage src/next/inquiry/adapters.test.js and docs/inbound/TRADE_DESK_DELIVERY.md):
// both repositories must produce this exact signature, or the integration has drifted.
export const SIGNING_TEST_VECTOR = {
  secret: 'hmv-shared-test-vector-secret-0123456789abcdef',
  timestamp: '1767225600',
  idempotencyKey: '0f3b6d2e-1c4a-4e8b-9a77-2f1d3c4b5a69',
  signature: '07793521e0fd555bb265faff963e5bcb9ebb252c6781190a75e4a53f32e1be60',
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
      nowMs,
      ...over,
    });

  it('matches the shared test vector', () => {
    expect(signIngestRequest(v.secret, v.timestamp, v.idempotencyKey)).toBe(
      v.signature,
    );
    expect(check({})).toBe('ok');
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
        signature: signIngestRequest(v.secret, v.timestamp, key),
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
    expect(
      requirementsFor('sourcing', 'passion-fruit').map((r) => r.key),
    ).toEqual([
      'variety',
      'sizeWeight',
      'brix',
      'packaging',
      'deliveryWindow',
      'destinationPort',
      'destinationRequirements',
    ]);
    expect(
      requirementsFor('sourcing', 'dried-cassava-chips').map((r) => r.key),
    ).toEqual([
      'starch',
      'moisture',
      'loading',
      'incoterm',
      'destinationPort',
      'deliveryWindow',
    ]);
    expect(requirementsFor('sourcing', 'bananas').map((r) => r.key)).toEqual([
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
    expect(requirementsFor('customs', null).map((r) => r.key)).toEqual([
      'service',
      'hsCode',
      'timing',
    ]);
  });
});

describe('notification email', () => {
  const inquiry = {
    id: '0190b7c8-0000-7000-8000-000000000001',
    reference: 'HMV-2026-7KQ4XM',
    goal: 'sourcing',
    productName: 'Dried cassava chips',
    goods: null,
    company: 'Feed Co\r\nBcc: attacker@example.com',
    contactName: 'An',
    email: 'buyer@example.com',
    phone: '+84 909 000 000',
    origin: 'Cambodia',
    destination: 'Qinzhou',
    volumeAmount: '5000',
    volumeUnit: 'MT / month',
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
      'Volume: 5000 MT / month',
      '- Required starch %: 70',
      'Source: utm linkedin',
      'https://cms.example.com/sales/inquiries/0190b7c8-0000-7000-8000-000000000001',
    ])
      expect(text).toContain(part);
  });

  it('a goal without a product is named by its goal and goods; the subject never breaks lines', () => {
    const { subject } = buildInquiryEmail(
      {
        ...inquiry,
        goal: 'customs',
        productName: null,
        goods: 'Chemical\nsamples',
      },
      'https://cms.example.com',
    );
    expect(subject).toBe(
      'New HMV Trade Inquiry — Chemical samples — HMV-2026-7KQ4XM',
    );
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it('withTimeout rejects a send that takes too long', async () => {
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toMatchObject({
      code: 'ETIMEOUT',
    });
    await expect(withTimeout(Promise.resolve('ok'), 10)).resolves.toBe('ok');
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
    expect(() =>
      loadConfig({ ...prod, ...email, CMS_PUBLIC_URL: 'http://cms.hmv.test' }),
    ).toThrow('CMS_PUBLIC_URL');
  });
});
