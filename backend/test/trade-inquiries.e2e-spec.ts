import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { INQUIRY_NOTIFIER } from '../src/modules/trade-inquiries/inquiry-notifier';
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
  goal: 'sourcing',
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

describe('Trade inquiries (PostgreSQL)', () => {
  let t: TestApp;
  let sales: Session;
  const notifier = { enabled: true, send: vi.fn(async () => {}) };

  /** A signed ingestion request, as the website sends it. */
  const ingest = (
    body: object,
    key: string = randomUUID(),
    opts: { secret?: string; timestamp?: number } = {},
  ) => {
    const ts = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
    return request(t.http)
      .post(INGEST)
      .set('X-HMV-Timestamp', ts)
      .set('X-HMV-Signature', signIngestRequest(opts.secret ?? SECRET, ts, key))
      .set('Idempotency-Key', key)
      .send(body);
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
        goal: 'sourcing',
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
        goal: 'sourcing',
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
      expect(burst.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 200, 201]);
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
      // A CMS session is not an ingestion credential.
      await sales.post(INGEST, cassava()).expect(401);
      expect(await t.prisma.tradeInquiry.count()).toBe(0);
    });

    it('validation: unknown fields, bad values and uncontrolled requirements are refused', async () => {
      const refused = [
        cassava({ admin: true }),
        cassava({ locale: 'fr' }),
        cassava({ goal: 'loans' }),
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
        cassava({ goal: 'customs', productId: null, goods: '' }),
        cassava({ consentAt: 'yesterday' }),
        cassava({ website: 'http://spam' }),
      ];
      for (const body of refused) {
        const res = await ingest(body);
        expect(res.status, JSON.stringify(body).slice(0, 120)).toBe(400);
      }
      expect(await t.prisma.tradeInquiry.count()).toBe(0);
    });

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
    /** Three inquiries: cassava (EN, linkedin), passion fruit (VI) and a customs request. */
    async function seed() {
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
          goal: 'customs',
          productId: null,
          origin: 'Laos',
          goods: 'Chemical samples',
          application: undefined,
          requirements: { service: 'import' },
          contact: { company: 'Chem Ltd', email: 'ops@chem.example' },
          source: undefined,
        }),
      ).expect(201);
      return Promise.all([a, b, c].map((r) => row(r.body.reference)));
    }

    it('lists newest first with server pagination; rows are summaries without contact details or the brief JSON', async () => {
      const [, , customs] = await seed();
      const page1 = await sales.get(`${ADMIN}?pageSize=2`).expect(200);
      expectContract(page1.body, 'TradeInquiryListResponse');
      expect(page1.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
      expect(page1.body.items[0].reference).toBe(customs.reference);
      expect(page1.body.items[0]).not.toHaveProperty('email');
      expect(page1.body.items[0]).not.toHaveProperty('requirements');
      const page2 = await sales.get(`${ADMIN}?pageSize=2&page=2`).expect(200);
      expect(page2.body.items).toHaveLength(1);
      await sales.get(`${ADMIN}?pageSize=101`).expect(400);
    });

    it('filters by status, goal, product, locale, source, assignee, dates and search', async () => {
      const [cas, pas] = await seed();
      const refs = async (query: string) =>
        (await sales.get(`${ADMIN}?${query}`).expect(200)).body.items.map(
          (i: { reference: string }) => i.reference,
        );
      expect(await refs('goal=customs')).toHaveLength(1);
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
      const today = new Date().toISOString().slice(0, 10);
      expect(await refs(`dateFrom=${today}&dateTo=${today}`)).toHaveLength(3);
      expect(await refs('dateTo=2020-01-01')).toHaveLength(0);
    });

    it('stats count by status, today and the last 7 days', async () => {
      const [cas] = await seed();
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
      const [cas] = await seed();
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
      const [cas] = await seed();
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
      const [cas] = await seed();
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

    it('permissions: SALES and ADMIN only; writes need the CSRF header; no public listing', async () => {
      const [cas] = await seed();
      for (const role of ['EDITOR', 'REVIEWER', 'VIEWER']) {
        const s = await t.signIn(role);
        await s.get(ADMIN).expect(403);
        await s.get(`${ADMIN}/${cas.id}`).expect(403);
        await s.patch(`${ADMIN}/${cas.id}`, { status: 'LOST' }).expect(403);
      }
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
