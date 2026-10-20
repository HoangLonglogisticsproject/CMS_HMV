import request from 'supertest';
import { aboutContent } from './fixtures';
import {
  expectContract,
  type Session,
  setupApp,
  type TestApp,
} from './helpers';

const PAGE = '/api/v1/admin/pages/about';
const PUBLIC = '/api/v1/public/pages/about';
const tr = (body: { translations: { locale: string }[] }, locale: string) =>
  body.translations.find((t) => t.locale === locale) as any;

describe('Pages (PostgreSQL)', () => {
  let t: TestApp;
  let editor: Session;
  let reviewer: Session;
  let viewer: Session;
  const pub = () => request(t.http);
  const save = (
    expectedRevision: number,
    translations: object[],
    as = editor,
  ) => as.patch(`${PAGE}/draft`, { expectedRevision, translations });
  const step = (
    action: string,
    locale: string,
    expectedRevision: number,
    as: Session,
    extra: object = {},
  ) =>
    as.post(`${PAGE}/translations/${locale}/${action}`, {
      expectedRevision,
      ...extra,
    });
  /** Saves vi + en (revision 1), then submits, approves and publishes `locales`. */
  const publishFresh = async (locales: string[]) => {
    await save(0, [
      { locale: 'vi', content: aboutContent('VI') },
      { locale: 'en', content: aboutContent('EN') },
    ]).expect(200);
    for (const l of locales) {
      await step('submit', l, 1, editor).expect(200);
      await step('approve', l, 1, reviewer).expect(200);
      await step('publish', l, 1, reviewer).expect(200);
    }
  };

  beforeAll(async () => {
    t = await setupApp();
  });
  beforeEach(async () => {
    await t.reset(); // keeps the `about` row seeded by the migration
    [editor, reviewer, viewer] = await Promise.all([
      t.signIn('EDITOR'),
      t.signIn('REVIEWER'),
      t.signIn('VIEWER'),
    ]);
  });
  afterAll(() => t.app.close());

  it('lists the migration-seeded about page, never saved yet', async () => {
    const list = await viewer.get('/api/v1/admin/pages').expect(200);
    expectContract(list.body, 'PageListResponse');
    expect(list.body.items).toEqual([
      {
        key: 'about',
        title: null,
        revision: 0,
        updatedAt: null,
        translations: [],
      },
    ]);
    const detail = await viewer.get(PAGE).expect(200);
    expectContract(detail.body, 'PageDetailResponse');
    expect(detail.body).toMatchObject({
      key: 'about',
      revision: 0,
      translations: [],
      history: [],
    });
    await viewer
      .get('/api/v1/admin/pages/home')
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('PAGE_NOT_FOUND'));
    await viewer.get('/api/v1/admin/pages/About!').expect(404);
  });

  it('saves immutable revisions with optimistic concurrency and history', async () => {
    const first = await save(0, [
      { locale: 'vi', content: aboutContent('VI') },
    ]).expect(200);
    expectContract(first.body, 'PageDetailResponse');
    expect(first.body).toMatchObject({ revision: 1, title: 'VI About' });
    expect(tr(first.body, 'vi')).toMatchObject({
      state: 'DRAFT',
      isLive: false,
      hasUnpublishedChanges: true,
      missingFields: [],
    });

    // en added in revision 2; vi copied unchanged (same hash).
    const second = await save(1, [
      { locale: 'en', content: aboutContent('EN'), seoTitle: '  SEO EN  ' },
    ]).expect(200);
    expect(second.body.revision).toBe(2);
    expect(tr(second.body, 'vi').contentHash).toBe(
      tr(first.body, 'vi').contentHash,
    );
    expect(tr(second.body, 'en')).toMatchObject({
      seoTitle: 'SEO EN',
      seoDescription: null,
    });
    expect(second.body.history.map((h: any) => [h.number, h.locales])).toEqual([
      [2, ['en', 'vi']],
      [1, ['vi']],
    ]);
    expect(second.body.history[0].createdBy.id).toBe(editor.user.id);

    const stale = await save(1, [{ locale: 'vi', seoTitle: 'x' }]).expect(409);
    expect(stale.body).toMatchObject({
      code: 'REVISION_CONFLICT',
      details: { currentRevision: 2 },
    });

    const race = await Promise.all([
      save(2, [{ locale: 'vi', seoTitle: 'a' }]),
      save(2, [{ locale: 'vi', seoTitle: 'b' }]),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await t.prisma.pageRevision.count()).toBe(3);
    expect(
      await t.prisma.auditLog.count({ where: { action: 'page.update_draft' } }),
    ).toBe(3);
  });

  it('validates content against the page type', async () => {
    const extra = { ...aboutContent('VI'), layout: 'grid' };
    const bad = await save(0, [{ locale: 'vi', content: extra }]).expect(400);
    expect(bad.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(bad.body.details).toContainEqual({
      path: 'translations[0].content.layout',
      message: 'property layout should not exist',
    });

    const long = aboutContent('VI');
    long.team.members = Array.from({ length: 9 }, () => long.team.members[0]);
    expect(
      (await save(0, [{ locale: 'vi', content: long }]).expect(400)).body
        .details[0].path,
    ).toBe('translations[0].content.team.members');

    await save(0, [{ locale: 'vi' }])
      .expect(422)
      .expect(({ body }) => expect(body.code).toBe('TRANSLATION_INCOMPLETE'));
    await save(0, [{ locale: 'fr', content: aboutContent('FR') }])
      .expect(422)
      .expect(({ body }) => expect(body.code).toBe('UNKNOWN_LOCALE'));
    await save(0, [
      { locale: 'vi', content: aboutContent('A') },
      { locale: 'vi', content: aboutContent('B') },
    ]).expect(400);
    await editor
      .patch(`${PAGE}/draft`, {
        expectedRevision: 0,
        translations: [],
        status: 'PUBLISHED',
      })
      .expect(400);
    expect(await t.prisma.pageRevision.count()).toBe(0);
  });

  it('enforces page permissions', async () => {
    await save(
      0,
      [{ locale: 'vi', content: aboutContent('VI') }],
      viewer,
    ).expect(403);
    await save(
      0,
      [{ locale: 'vi', content: aboutContent('VI') }],
      reviewer,
    ).expect(403);
    await save(0, [{ locale: 'vi', content: aboutContent('VI') }]).expect(200);
    await step('submit', 'vi', 1, viewer).expect(403);
    await step('submit', 'vi', 1, editor).expect(200);
    await step('approve', 'vi', 1, editor).expect(403);
    await step('request-changes', 'vi', 1, editor, { note: 'x' }).expect(403);
    await step('approve', 'vi', 1, reviewer).expect(200);
    await step('publish', 'vi', 1, editor).expect(403);
    await request(t.http).get(PAGE).expect(401);
  });

  it('runs draft → submit → request changes → resubmit → approve → publish per locale', async () => {
    const incomplete = aboutContent('VI');
    incomplete.hero.title = '';
    await save(0, [
      { locale: 'vi', content: incomplete },
      { locale: 'en', content: aboutContent('EN') },
    ]).expect(200);
    expect(tr((await editor.get(PAGE)).body, 'vi').missingFields).toEqual([
      'content.hero.title',
    ]);
    const notReady = await step('submit', 'vi', 1, editor).expect(422);
    expect(notReady.body).toMatchObject({
      code: 'TRANSLATION_INCOMPLETE',
      details: [{ path: 'content.hero.title', message: 'Required' }],
    });
    await step('approve', 'en', 1, reviewer)
      .expect(409)
      .expect(({ body }) =>
        expect(body.code).toBe('TRANSLATION_NOT_SUBMITTED'),
      );
    await step('publish', 'en', 1, reviewer)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('TRANSLATION_NOT_APPROVED'));
    await step('submit', 'fr', 1, editor)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('TRANSLATION_NOT_FOUND'));

    await save(1, [{ locale: 'vi', content: aboutContent('VI') }]).expect(200);
    expect(
      tr((await step('submit', 'vi', 2, editor).expect(200)).body, 'vi').state,
    ).toBe('IN_REVIEW');
    await step('submit', 'vi', 2, editor).expect(200); // idempotent
    await step('request-changes', 'vi', 2, reviewer, { note: '' }).expect(400);
    const sentBack = await step('request-changes', 'vi', 2, reviewer, {
      note: ' Shorten the lead ',
    }).expect(200);
    expect(tr(sentBack.body, 'vi')).toMatchObject({
      state: 'CHANGES_REQUESTED',
      reviewNote: 'Shorten the lead',
    });

    // The editor fixes it: the note stays visible until re-submitted.
    const fixed = aboutContent('VI');
    fixed.hero.lead = 'Short lead';
    const edited = await save(2, [{ locale: 'vi', content: fixed }]).expect(
      200,
    );
    expect(tr(edited.body, 'vi')).toMatchObject({
      state: 'DRAFT',
      reviewNote: 'Shorten the lead',
    });
    expect(
      tr((await step('submit', 'vi', 3, editor).expect(200)).body, 'vi'),
    ).toMatchObject({ state: 'IN_REVIEW', reviewNote: null });
    await step('approve', 'vi', 2, reviewer)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('REVISION_CONFLICT'));
    expect(
      tr((await step('approve', 'vi', 3, reviewer).expect(200)).body, 'vi')
        .state,
    ).toBe('APPROVED');

    const live = await step('publish', 'vi', 3, reviewer).expect(200);
    expectContract(live.body, 'PageDetailResponse');
    expect(tr(live.body, 'vi')).toMatchObject({
      isLive: true,
      hasUnpublishedChanges: false,
      publishedRevision: 3,
    });
    expect(tr(live.body, 'en')).toMatchObject({
      state: 'DRAFT',
      isLive: false,
    });
    await step('publish', 'vi', 3, reviewer).expect(200); // already live: no-op

    const actions = (
      await t.prisma.auditLog.findMany({
        where: { entityType: 'page' },
        orderBy: { createdAt: 'asc' },
      })
    ).map((a) => a.action);
    expect(actions).toEqual([
      'page.update_draft',
      'page.update_draft',
      'page.submit_translation',
      'page.request_changes',
      'page.update_draft',
      'page.submit_translation',
      'page.approve_translation',
      'page.publish_translation',
    ]);
  });

  it('serves only published locales, from the published revision, without credentials', async () => {
    await pub()
      .get(PUBLIC)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('PAGE_NOT_FOUND'));
    await publishFresh(['vi']);

    const vi = await pub().get(`${PUBLIC}?locale=vi`).expect(200);
    expectContract(vi.body, 'PublicPage');
    expect(vi.headers['cache-control']).toBe(
      'public, max-age=60, stale-while-revalidate=300',
    );
    expect(vi.body).toMatchObject({
      key: 'about',
      locale: 'vi',
      title: 'VI About',
      seo: { title: 'VI About', description: 'VI lead' },
      content: aboutContent('VI'),
      alternates: [],
    });
    expect((await pub().get(PUBLIC).expect(200)).body.locale).toBe('vi'); // default locale
    // en is saved but never submitted/approved/published.
    await pub()
      .get(`${PUBLIC}?locale=en`)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('PAGE_NOT_FOUND'));
    await pub()
      .get(`${PUBLIC}?locale=xx`)
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('UNKNOWN_LOCALE'));
    await pub().get(`${PUBLIC}?locale=vi&preview=1`).expect(400);
    await pub().get('/api/v1/public/pages/home').expect(404);
    await pub().get('/api/v1/public/pages/About!').expect(404);

    // A later draft (even submitted and approved) stays invisible until that locale is published again.
    await save(1, [{ locale: 'vi', content: aboutContent('VI2') }]).expect(200);
    await step('submit', 'vi', 2, editor).expect(200);
    await step('approve', 'vi', 2, reviewer).expect(200);
    expect((await pub().get(`${PUBLIC}?locale=vi`)).body.title).toBe(
      'VI About',
    );
    expect(tr((await editor.get(PAGE)).body, 'vi')).toMatchObject({
      isLive: true,
      hasUnpublishedChanges: true,
      publishedRevision: 1,
    });
  });

  it('publishes locales independently', async () => {
    await publishFresh(['vi', 'en']);
    // Revision 2 changes en only and publishes it; vi keeps serving revision 1.
    await save(1, [
      { locale: 'en', content: aboutContent('EN2') },
      { locale: 'vi', content: aboutContent('VI-draft') },
    ]).expect(200);
    await step('submit', 'en', 2, editor).expect(200);
    await step('approve', 'en', 2, reviewer).expect(200);
    const published = await step('publish', 'en', 2, reviewer).expect(200);
    expect(tr(published.body, 'en')).toMatchObject({
      publishedRevision: 2,
      hasUnpublishedChanges: false,
    });
    expect(tr(published.body, 'vi')).toMatchObject({
      publishedRevision: 1,
      hasUnpublishedChanges: true,
      state: 'DRAFT',
    });

    const en = (await pub().get(`${PUBLIC}?locale=en`).expect(200)).body;
    const vi = (await pub().get(`${PUBLIC}?locale=vi`).expect(200)).body;
    expect(en).toMatchObject({
      title: 'EN2 About',
      alternates: [{ locale: 'vi' }],
    });
    expect(vi).toMatchObject({
      title: 'VI About',
      alternates: [{ locale: 'en' }],
    });
    expect(new Date(en.updatedAt).getTime()).toBeGreaterThan(
      new Date(en.publishedAt).getTime(),
    );
  });
});
