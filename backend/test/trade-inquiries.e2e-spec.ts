import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { TradeInquiry } from '@prisma/client';
import request from 'supertest';
import {
  INQUIRY_NOTIFIER,
  type InquiryNotifier,
} from '../src/modules/trade-inquiries/inquiry-notifier';
import { REFERENCE } from '../src/modules/trade-inquiries/inquiry-reference';
import { signIngestRequest } from '../src/modules/trade-inquiries/inquiry-signature';
import {
  expectContract,
  type Session,
  setupApp,
  type TestApp,
} from './helpers';

const SECRET = 'integration-test-secret-'.padEnd(48, 'x');
const INGEST = '/api/v1/integrations/trade-inquiries';
const ADMIN = '/api/v1/admin/trade-inquiries';

const cassava = (over: object = {}) => ({
  locale: 'en',
  productId: 'dried-cassava-chips',
  origin: 'cambodia',
  destination: 'Qinzhou, China',
  volume: { amount: '5000', unit: 'mt_month' },
  application: 'feed',
  transport: 'sea_fcl',
  requirements: { starch: '70', incoterm: 'CIF' },
  notes: 'Monthly contract',
  contact: {
    company: 'Feed Co',
    email: 'Buyer@Example.com',
    name: 'An Nguyen',
    phone: '+84 909 000 000',
  },
  source: {
    landingPage: '/products/dried-cassava-chips',
    referrer: 'https://www.google.com',
    utm: { source: 'linkedin', medium: 'social', campaign: 'q4' },
  },
  consentAt: new Date().toISOString(),
  ...over,
});

/** What seedInquiries needs from the test: the signed ingestion request and the row lookup. */
interface SeedContext {
  ingest: (body: object) => request.Test;
  row: (reference: string) => Promise<TradeInquiry>;
}

/** Three inquiries, received in this order: cassava (EN), passion fruit (VI, utm google), cashew nuts (no source). */
async function seedInquiries({ ingest, row }: SeedContext) {
  const a = await ingest(cassava()).expect(201);
  const b = await ingest(
    cassava({
      locale: 'vi',
      productId: 'passion-fruit',
      origin: 'vietnam',
      application: undefined,
      destination: 'Rotterdam',
      requirements: { brix: '14+' },
      contact: { company: 'Fresh BV', email: 'buyer@fresh.example' },
      source: { utm: { source: 'google' } },
    }),
  ).expect(201);
  const c = await ingest(
    cassava({
      productId: 'nuts',
      origin: undefined,
      application: undefined,
      transport: undefined,
      requirements: { incoterm: 'FOB' },
      contact: { company: 'Chem Ltd', email: 'ops@chem.example' },
      source: undefined,
    }),
  ).expect(201);
  return Promise.all([a, b, c].map((r) => row(r.body.reference)));
}

/** Bodies the ingestion refuses: unknown fields, bad values, uncontrolled requirements, inherited names, wrong types. */
const REFUSED: object[] = [
  cassava({ admin: true }),
  cassava({ locale: 'fr' }),
  // Every inquiry is product-led: there is no goal or goods field, and a product is required.
  cassava({ goal: 'sourcing' }),
  cassava({ goods: 'Chemical samples' }),
  cassava({ productId: undefined }),
  cassava({ productId: null }),
  cassava({ contact: { company: 'Feed Co', email: 'not-an-email' } }),
  cassava({ notes: 'x'.repeat(2001) }),
  cassava({ volume: { amount: 'lots', unit: 'mt' } }),
  cassava({ source: { utm: { source: '<script>' } } }),
  cassava({
    source: { landingPage: '/products/x?email=buyer@example.com' },
  }),
  cassava({
    source: { referrer: 'https://www.google.com/search?q=hmv' },
  }),
  cassava({ requirements: { admin: 'yes' } }),
  cassava({ requirements: { incoterm: 'XYZ' } }),
  cassava({ productId: 'gold' }),
  cassava({ origin: 'thailand' }),
  cassava({ consentAt: 'yesterday' }),
  cassava({ website: 'filled-by-a-bot' }),
  // Inherited names are never contract keys or options (a 400, not a 500).
  cassava({ productId: '__proto__' }),
  cassava({ productId: 'constructor' }),
  cassava({ productId: 'unknown-product' }),
  cassava({ requirements: { incoterm: '__proto__' } }),
  cassava({ requirements: { incoterm: 'constructor' } }),
  cassava({ requirements: { incoterm: 'toString' } }),
  cassava({ origin: '__proto__' }),
  cassava({ application: 'constructor' }),
  cassava({ transport: '__proto__' }),
  cassava({ volume: { amount: '5', unit: 'constructor' } }),
  // contact, volume and source must be objects.
  cassava({ contact: [] }),
  cassava({ contact: null }),
  cassava({ contact: 'x' }),
  cassava({ volume: [] }),
  cassava({ source: 'x' }),
];

describe('Trade inquiries (PostgreSQL)', () => {
  let t: TestApp;
  let sales: Session;
  const notifier = {
    enabled: true,
    send: vi.fn<InquiryNotifier['send']>(async () => {}),
  };

  /**
   * A signed ingestion request, as the website sends it: the body serialized once, that exact string signed and sent.
   * `sent` replaces the transmitted body after signing (a tampered request).
   */
  const ingest = (
    body: unknown,
    key: string = randomUUID(),
    opts: { secret?: string; timestamp?: number; sent?: string } = {},
  ) => {
    const ts = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
    const raw = JSON.stringify(body);
    return request(t.http)
      .post(INGEST)
      .set('Content-Type', 'application/json')
      .set('X-HMV-Timestamp', ts)
      .set(
        'X-HMV-Signature',
        signIngestRequest(opts.secret ?? SECRET, ts, key, raw),
      )
      .set('Idempotency-Key', key)
      .send(opts.sent ?? raw);
  };
  const row = (reference: string) =>
    t.prisma.tradeInquiry.findUniqueOrThrow({ where: { reference } });
  const audits = (entityId: string) =>
    t.prisma.auditLog.findMany({
      where: { entityType: 'trade_inquiry', entityId },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    Object.assign(process.env, {
      TRADE_INQUIRY_INGEST_ENABLED: 'true',
      TRADE_INQUIRY_INGEST_SECRET: SECRET,
    });
    t = await setupApp((b) =>
      b.overrideProvider(INQUIRY_NOTIFIER).useValue(notifier),
    );
  });
  afterAll(async () => {
    await t.app.close();
    delete process.env.TRADE_INQUIRY_INGEST_ENABLED;
    delete process.env.TRADE_INQUIRY_INGEST_SECRET;
  });
  beforeEach(async () => {
    await t.reset();
    notifier.enabled = true;
    notifier.send.mockReset().mockResolvedValue(undefined);
    sales = await t.signIn('SALES');
  });

  describe('ingestion', () => {
    it('a new inquiry: 201 with its reference, a labelled snapshot, an audit row without PII, one email', async () => {
      const res = await ingest(cassava()).expect(201);
      expectContract(res.body, 'IngestTradeInquiryResponse');
      expect(res.body).toEqual({
        reference: expect.stringMatching(REFERENCE),
        duplicate: false,
      });
      const saved = await row(res.body.reference);
      expect(saved).toMatchObject({
        status: 'NEW',
        locale: 'en',
        productId: 'dried-cassava-chips',
        productName: 'Dried cassava chips',
        origin: 'Cambodia',
        destination: 'Qinzhou, China',
        volumeAmount: '5000',
        volumeUnit: 'MT / month',
        application: 'Animal feed',
        transport: 'Sea freight (FCL)',
        requirements: [
          { key: 'starch', label: 'Required starch %', value: '70' },
          { key: 'incoterm', label: 'Incoterm', value: 'CIF' },
        ],
        buyerNotes: 'Monthly contract',
        company: 'Feed Co',
        email: 'buyer@example.com',
        landingPage: '/products/dried-cassava-chips',
        referrerOrigin: 'https://www.google.com',
        utmSource: 'linkedin',
        notificationStatus: 'SENT',
        notificationAttempts: 1,
        assignedToId: null,
      });
      expect(notifier.send).toHaveBeenCalledTimes(1);
      const [created] = await audits(saved.id);
      expect(created).toMatchObject({
        action: 'inquiry.create',
        actorId: null,
      });
      expect(created.metadata).toEqual({
        reference: saved.reference,
        status: 'NEW',
        productId: 'dried-cassava-chips',
      });
      expect(JSON.stringify(created.metadata)).not.toMatch(
        /Feed Co|buyer@example|909/,
      );
    });

    it('the same idempotency key returns the existing inquiry (200, duplicate) and sends no second email, also concurrently', async () => {
      const key = randomUUID();
      const first = await ingest(cassava(), key).expect(201);
      const again = await ingest(cassava({ notes: 'resubmitted' }), key).expect(
        200,
      );
      expect(again.body).toEqual({
        reference: first.body.reference,
        duplicate: true,
      });
      const burst = await Promise.all(
        [1, 2, 3].map(() => ingest(cassava(), 'burst-key-0001')),
      );
      expect(burst.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 200, 201,
      ]);
      expect(new Set(burst.map((r) => r.body.reference)).size).toBe(1);
      expect(await t.prisma.tradeInquiry.count()).toBe(2);
      expect(notifier.send).toHaveBeenCalledTimes(2);
    });

    it('authentication: missing, wrong or stale signatures are 401; a malformed key is 400', async () => {
      await request(t.http).post(INGEST).send(cassava()).expect(401);
      const wrong = await ingest(cassava(), randomUUID(), {
        secret: 'another-secret-of-sufficient-length-000',
      }).expect(401);
      expect(wrong.body.code).toBe('SIGNATURE_INVALID');
      await ingest(cassava(), randomUUID(), {
        timestamp: Math.floor(Date.now() / 1000) - 600,
      }).expect(401);
      const badKey = await ingest(cassava(), 'bad key!').expect(400);
      expect(badKey.body.code).toBe('VALIDATION_FAILED');
      // The body is signed: valid headers replayed with another body are refused, even a byte-different equal JSON.
      const tampered = await ingest(cassava(), randomUUID(), {
        sent: JSON.stringify(
          cassava({
            contact: { company: 'Attacker', email: 'a@evil.example' },
          }),
        ),
      }).expect(401);
      expect(tampered.body.code).toBe('SIGNATURE_INVALID');
      await ingest(cassava(), randomUUID(), {
        sent: JSON.stringify(cassava(), null, 2),
      }).expect(401);
      // A CMS session is not an ingestion credential.
      await sales.post(INGEST, cassava()).expect(401);
      expect(await t.prisma.tradeInquiry.count()).toBe(0);
    });

    it.each(REFUSED.map((body) => [JSON.stringify(body).slice(0, 90), body]))(
      'validation refuses %s (400, nothing saved)',
      async (_name, body) => {
        const res = await ingest(body);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
        expect(await t.prisma.tradeInquiry.count()).toBe(0);
      },
    );

    it.each([
      ['null', null],
      ['an array', []],
      ['a string', 'x'],
    ])(
      'a JSON body that is not an object (%s) is refused',
      async (_name, body) => {
        expect((await ingest(body)).status).toBe(400);
        expect(await t.prisma.tradeInquiry.count()).toBe(0);
      },
    );

    it('a failed email keeps the inquiry (FAILED), logs neither secrets nor contact details; resend succeeds and is audited', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn');
      notifier.send.mockRejectedValueOnce(
        Object.assign(
          new Error(
            '535 auth failed for smtp-user / SMTP-PASSWORD-123 <buyer@example.com>',
          ),
          { code: 'EAUTH' },
        ),
      );
      const res = await ingest(cassava()).expect(201);
      const saved = await row(res.body.reference);
      expect(saved).toMatchObject({
        notificationStatus: 'FAILED',
        notificationAttempts: 1,
      });
      const logged = warn.mock.calls.flat().join(' ');
      expect(logged).toContain(saved.reference);
      expect(logged).not.toMatch(
        /SMTP-PASSWORD|smtp-user|buyer@example|Feed Co/,
      );
      warn.mockRestore();

      const resent = await sales
        .post(`${ADMIN}/${saved.id}/resend-notification`)
        .expect(201);
      expect(resent.body).toMatchObject({
        notificationStatus: 'SENT',
        notificationAttempts: 2,
      });
      expect((await audits(saved.id)).map((a) => a.action)).toEqual([
        'inquiry.create',
        'inquiry.notification_retry',
      ]);
    });

    it('an email over the time budget is cancelled: FAILED (ETIMEOUT), the send saw the abort, the inquiry is accepted', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn');
      const aborted: boolean[] = [];
      notifier.send.mockImplementationOnce(
        (_m, signal) =>
          new Promise<void>((_, reject) =>
            signal.addEventListener('abort', () => {
              aborted.push(true);
              reject(Object.assign(new Error('aborted'), { code: 'EABORT' }));
            }),
          ),
      );
      const res = await ingest(cassava()).expect(201);
      expect(aborted).toEqual([true]);
      expect(await row(res.body.reference)).toMatchObject({
        notificationStatus: 'FAILED',
        notificationAttempts: 1,
      });
      expect(warn.mock.calls.flat().join(' ')).toContain('(ETIMEOUT)');
      warn.mockRestore();
    }, 10_000);

    it('a failure recording the notification after the inquiry is committed still accepts the inquiry', async () => {
      const error = vi.spyOn(Logger.prototype, 'error');
      // The first notification write is the claim (PENDING → SENDING).
      const claim = vi
        .spyOn(t.prisma.tradeInquiry, 'update')
        .mockRejectedValueOnce(
          Object.assign(new Error('connection lost for buyer@example.com'), {
            code: 'P1001',
          }),
        );
      try {
        const res = await ingest(cassava()).expect(201);
        expect(res.body.duplicate).toBe(false);
        const saved = await row(res.body.reference);
        expect(saved.notificationStatus).toBe('PENDING');
        const logged = error.mock.calls.flat().join(' ');
        expect(logged).toContain(`Inquiry ${saved.reference}`);
        expect(logged).toContain('(P1001)');
        expect(logged).not.toMatch(/buyer@example|Feed Co/);
      } finally {
        claim.mockRestore();
        error.mockRestore();
      }
    });

    /** The next send waits until the test settles it; `started` resolves once the send began (the attempt claimed). */
    function holdNextSend() {
      let settle:
        { resolve: () => void; reject: (err: Error) => void } | undefined;
      let began: () => void = () => {};
      const started = new Promise<void>((resolve) => (began = resolve));
      notifier.send.mockImplementationOnce(
        () =>
          new Promise<void>((resolve, reject) => {
            settle = { resolve, reject };
            began();
          }),
      );
      return { started, settle: () => settle! };
    }
    const resend = (id: string) =>
      sales.post(`${ADMIN}/${id}/resend-notification`);
    const retries = async (id: string) =>
      (await audits(id)).filter(
        (a) => a.action === 'inquiry.notification_retry',
      );

    it('two simultaneous resends: one attempt sends, the other is refused (409) without sending or an audit entry', async () => {
      notifier.send.mockRejectedValueOnce(new Error('first attempt fails'));
      const { id } = await row(
        (await ingest(cassava()).expect(201)).body.reference,
      );
      const held = holdNextSend();
      const first = resend(id).then((r) => r);
      await held.started;
      const second = await resend(id).expect(409);
      expect(second.body.code).toBe('NOTIFICATION_IN_PROGRESS');
      held.settle().resolve();
      expect((await first).body).toMatchObject({
        notificationStatus: 'SENT',
        notificationAttempts: 2,
      });
      expect(notifier.send).toHaveBeenCalledTimes(2); // the initial attempt and one resend
      expect(await retries(id)).toHaveLength(1);
    });

    it('a resend while the initial attempt is sending is refused; the inbox offers no resend; one email', async () => {
      const held = holdNextSend();
      const ingesting = ingest(cassava()).then((r) => r);
      await held.started;
      const [{ id, reference }] = await t.prisma.tradeInquiry.findMany();
      expect((await row(reference)).notificationStatus).toBe('SENDING');
      expect(
        (await sales.get(`${ADMIN}/${id}`).expect(200)).body
          .notificationRetryable,
      ).toBe(false);
      expect((await resend(id).expect(409)).body.code).toBe(
        'NOTIFICATION_IN_PROGRESS',
      );
      held.settle().resolve();
      expect((await ingesting).status).toBe(201);
      expect((await row(reference)).notificationStatus).toBe('SENT');
      expect(notifier.send).toHaveBeenCalledTimes(1);
      expect(await retries(id)).toHaveLength(0);
    });

    it('a failed attempt is FAILED; a later manual retry claims it and sends once', async () => {
      const held = holdNextSend();
      const ingesting = ingest(cassava()).then((r) => r);
      await held.started;
      held
        .settle()
        .reject(Object.assign(new Error('refused'), { code: 'EENVELOPE' }));
      const { reference } = (await ingesting).body;
      const { id } = await row(reference);
      expect((await row(reference)).notificationStatus).toBe('FAILED');
      expect(
        (await sales.get(`${ADMIN}/${id}`).expect(200)).body
          .notificationRetryable,
      ).toBe(true);
      expect((await resend(id).expect(201)).body.notificationStatus).toBe(
        'SENT',
      );
      expect(notifier.send).toHaveBeenCalledTimes(2);
      expect(await retries(id)).toHaveLength(1);
    });

    it('an attempt that crashed (SENDING for 5 minutes) can be taken over; its late result never overwrites the newer one', async () => {
      const first = holdNextSend();
      const ingesting = ingest(cassava()).then((r) => r);
      await first.started;
      const [{ id, reference }] = await t.prisma.tradeInquiry.findMany();
      await t.prisma.tradeInquiry.update({
        where: { id },
        data: { notificationLastAttemptAt: new Date(Date.now() - 6 * 60_000) },
      });
      // Attempt 2 takes over and is still sending when attempt 1 ends, late and failed.
      const second = holdNextSend();
      const takeover = resend(id).then((r) => r);
      await second.started;
      first
        .settle()
        .reject(Object.assign(new Error('late'), { code: 'ECONNRESET' }));
      expect((await ingesting).status).toBe(201);
      // Attempt 1 no longer holds the claim: its FAILED is not written over attempt 2.
      expect((await row(reference)).notificationStatus).toBe('SENDING');
      second.settle().resolve();
      expect((await takeover).body).toMatchObject({
        notificationStatus: 'SENT',
        notificationAttempts: 2,
      });
      expect((await row(reference)).notificationStatus).toBe('SENT');
    });

    it('with notification email disabled the inquiry is saved and marked SKIPPED', async () => {
      notifier.enabled = false;
      const res = await ingest(cassava()).expect(201);
      expect((await row(res.body.reference)).notificationStatus).toBe(
        'SKIPPED',
      );
      expect(notifier.send).not.toHaveBeenCalled();
    });

    it('disabled integration: 503 for every request', async () => {
      process.env.TRADE_INQUIRY_INGEST_ENABLED = 'false';
      const off = await setupApp();
      process.env.TRADE_INQUIRY_INGEST_ENABLED = 'true';
      try {
        const res = await request(off.http)
          .post(INGEST)
          .send(cassava())
          .expect(503);
        expect(res.body.code).toBe('INTEGRATION_DISABLED');
      } finally {
        await off.app.close();
      }
    });
  });

  describe('sales inbox', () => {
    it('lists newest first with server pagination; rows are summaries without contact details or the brief JSON', async () => {
      const [, , nuts] = await seedInquiries({ ingest, row });
      const page1 = await sales.get(`${ADMIN}?pageSize=2`).expect(200);
      expectContract(page1.body, 'TradeInquiryListResponse');
      expect(page1.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
      expect(page1.body.items[0].reference).toBe(nuts.reference);
      expect(page1.body.items[0]).not.toHaveProperty('email');
      expect(page1.body.items[0]).not.toHaveProperty('requirements');
      const page2 = await sales.get(`${ADMIN}?pageSize=2&page=2`).expect(200);
      expect(page2.body.items).toHaveLength(1);
      await sales.get(`${ADMIN}?pageSize=101`).expect(400);
    });

    it('filters by status, product, locale, source, assignee, dates and search; there is no goal filter', async () => {
      const [cas, pas] = await seedInquiries({ ingest, row });
      const refs = async (query: string) =>
        (await sales.get(`${ADMIN}?${query}`).expect(200)).body.items.map(
          (i: { reference: string }) => i.reference,
        );
      expect(await refs('productId=nuts')).toHaveLength(1);
      await sales.get(`${ADMIN}?goal=customs`).expect(400);
      expect(await refs('productId=dried-cassava-chips')).toEqual([
        cas.reference,
      ]);
      expect(await refs('locale=vi')).toEqual([pas.reference]);
      expect(await refs('utmSource=linkedin')).toEqual([cas.reference]);
      expect(await refs('search=fresh')).toEqual([pas.reference]);
      expect(await refs(`search=${cas.reference.toLowerCase()}`)).toEqual([
        cas.reference,
      ]);
      expect(await refs('search=ops%40chem')).toHaveLength(1);
      expect(await refs('search=rotterdam')).toEqual([pas.reference]);
      await sales
        .patch(`${ADMIN}/${cas.id}`, {
          status: 'CONTACTED',
          assignedToId: sales.user.id,
        })
        .expect(200);
      expect(await refs('status=CONTACTED')).toEqual([cas.reference]);
      expect(await refs(`assignedToId=${sales.user.id}`)).toEqual([
        cas.reference,
      ]);
      expect(await refs('unassigned=true')).toHaveLength(2);
      const today = new Date(Date.now() + 7 * 3_600_000) // the Vietnam calendar day
        .toISOString()
        .slice(0, 10);
      expect(await refs(`dateFrom=${today}&dateTo=${today}`)).toHaveLength(3);
      expect(await refs('dateTo=2020-01-01')).toHaveLength(0);
      expect(
        (await sales.get(`${ADMIN}?dateFrom=2026-W46`).expect(400)).body.code,
      ).toBe('VALIDATION_FAILED');
    });

    it('a filter date is a Vietnam calendar day (UTC+7), whatever the server time zone', async () => {
      const [a, b, c] = await seedInquiries({ ingest, row });
      const at = (inquiry: { id: string }, iso: string) =>
        t.prisma.tradeInquiry.update({
          where: { id: inquiry.id },
          data: { createdAt: new Date(iso) },
        });
      await at(a, '2026-11-11T16:59:59Z'); // 2026-11-11 23:59:59 in Vietnam
      await at(b, '2026-11-11T17:00:00Z'); // 2026-11-12 00:00:00
      await at(c, '2026-11-12T17:00:00Z'); // 2026-11-13 00:00:00: outside
      const refs = async (query: string) =>
        (await sales.get(`${ADMIN}?${query}`).expect(200)).body.items
          .map((i: { reference: string }) => i.reference)
          .sort();
      expect(await refs('dateFrom=2026-11-12&dateTo=2026-11-12')).toEqual([
        b.reference,
      ]);
      expect(await refs('dateTo=2026-11-11')).toEqual([a.reference]);
      expect(await refs('dateFrom=2026-11-13')).toEqual([c.reference]);
      // An explicit offset is an instant.
      expect(
        await refs('dateFrom=2026-11-11T17:00:00Z&dateTo=2026-11-11T17:00:01Z'),
      ).toEqual([b.reference]);
    });

    it('stats count by status, today and the last 7 days', async () => {
      const [cas] = await seedInquiries({ ingest, row });
      await sales.patch(`${ADMIN}/${cas.id}`, { status: 'WON' }).expect(200);
      const res = await sales.get(`${ADMIN}/stats`).expect(200);
      expectContract(res.body, 'TradeInquiryStatsResponse');
      expect(res.body).toEqual({
        total: 3,
        new: 2,
        contacted: 0,
        qualified: 0,
        quoted: 0,
        won: 1,
        lost: 0,
        today: 3,
        last7Days: 3,
      });
    });

    it('detail: the brief, contact, source, notes and notification state; unknown id is 404', async () => {
      const [cas] = await seedInquiries({ ingest, row });
      const res = await sales.get(`${ADMIN}/${cas.id}`).expect(200);
      expectContract(res.body, 'TradeInquiryDetailResponse');
      expect(res.body).toMatchObject({
        email: 'buyer@example.com',
        phone: '+84 909 000 000',
        utmCampaign: 'q4',
        notes: [],
        notificationStatus: 'SENT',
      });
      expect(res.body).not.toHaveProperty('idempotencyKey');
      const missing = await sales.get(`${ADMIN}/${randomUUID()}`).expect(404);
      expect(missing.body.code).toBe('INQUIRY_NOT_FOUND');
    });

    it('status changes and assignments are audited; only active users with inquiry:write can be assigned', async () => {
      const [cas] = await seedInquiries({ ingest, row });
      const colleague = await t.signIn('SALES');
      const editor = await t.signIn('EDITOR');
      await sales
        .patch(`${ADMIN}/${cas.id}`, { status: 'QUALIFIED' })
        .expect(200);
      const assigned = await sales
        .patch(`${ADMIN}/${cas.id}`, { assignedToId: colleague.user.id })
        .expect(200);
      expect(assigned.body.assignedTo).toEqual({
        id: colleague.user.id,
        displayName: colleague.user.displayName,
      });
      const refused = await sales
        .patch(`${ADMIN}/${cas.id}`, { assignedToId: editor.user.id })
        .expect(422);
      expect(refused.body.code).toBe('ASSIGNEE_INVALID');
      await sales
        .patch(`${ADMIN}/${cas.id}`, { assignedToId: null })
        .expect(200);
      await sales.patch(`${ADMIN}/${cas.id}`, {}).expect(400);
      // status is optional only when omitted: null never reaches the database.
      const nullStatus = await sales
        .patch(`${ADMIN}/${cas.id}`, { status: null })
        .expect(400);
      expect(nullStatus.body.code).toBe('VALIDATION_FAILED');
      expect((await row(cas.reference)).status).toBe('QUALIFIED');
      // The buyer's brief cannot be edited.
      await sales
        .patch(`${ADMIN}/${cas.id}`, { company: 'Changed' })
        .expect(400);

      const trail = await audits(cas.id);
      expect(trail.map((a) => [a.action, a.actorId])).toEqual([
        ['inquiry.create', null],
        ['inquiry.status_change', sales.user.id],
        ['inquiry.assign', sales.user.id],
        ['inquiry.assign', sales.user.id],
      ]);
      expect(trail[1].metadata).toEqual({
        reference: cas.reference,
        from: 'NEW',
        to: 'QUALIFIED',
      });
      expect(trail[2].metadata).toEqual({
        reference: cas.reference,
        from: null,
        to: colleague.user.id,
      });

      const { items } = (await sales.get(`${ADMIN}/assignees`).expect(200))
        .body;
      expect(items.map((u: { id: string }) => u.id).sort()).toEqual(
        [colleague.user.id, sales.user.id].sort(),
      );
    });

    it('internal notes: added, audited, listed on the detail, and moving lastActivityAt', async () => {
      const [cas] = await seedInquiries({ ingest, row });
      const note = await sales
        .post(`${ADMIN}/${cas.id}/notes`, {
          body: '  Called the buyer, sample requested.  ',
        })
        .expect(201);
      expectContract(note.body, 'TradeInquiryNoteResponse');
      expect(note.body).toMatchObject({
        body: 'Called the buyer, sample requested.',
        createdBy: { id: sales.user.id },
      });
      await sales.post(`${ADMIN}/${cas.id}/notes`, { body: '' }).expect(400);
      const detail = (await sales.get(`${ADMIN}/${cas.id}`).expect(200)).body;
      expect(detail.notes).toHaveLength(1);
      expect(new Date(detail.lastActivityAt).getTime()).toBeGreaterThanOrEqual(
        new Date(note.body.createdAt).getTime(),
      );
      const [, added] = await audits(cas.id);
      expect(added).toMatchObject({
        action: 'inquiry.note_add',
        metadata: { reference: cas.reference, noteId: note.body.id },
      });
    });

    it.each(['EDITOR', 'REVIEWER', 'VIEWER'])(
      '%s has no access to the sales inbox',
      async (role) => {
        const [cas] = await seedInquiries({ ingest, row });
        const other = await t.signIn(role);
        await other.get(ADMIN).expect(403);
        await other.get(`${ADMIN}/${cas.id}`).expect(403);
        await other.patch(`${ADMIN}/${cas.id}`, { status: 'LOST' }).expect(403);
      },
    );

    it('permissions: SALES and ADMIN only; writes need the CSRF header; no public listing', async () => {
      const [cas] = await seedInquiries({ ingest, row });
      const admin = await t.signIn('ADMIN');
      await admin.get(ADMIN).expect(200);
      await admin.patch(`${ADMIN}/${cas.id}`, { status: 'LOST' }).expect(200);
      await sales.agent
        .patch(`${ADMIN}/${cas.id}`)
        .send({ status: 'WON' })
        .expect(403); // no X-CSRF-Token
      await request(t.http).get(ADMIN).expect(401);
      await request(t.http).get(`${ADMIN}/${cas.id}`).expect(401);
    });
  });
});
