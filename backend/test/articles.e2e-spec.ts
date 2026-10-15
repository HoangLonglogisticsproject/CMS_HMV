import request from 'supertest';
import {
  expectContract,
  type Session,
  setupApp,
  type TestApp,
} from './helpers';

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const vi = (
  slug: string,
  text = 'Nội dung phân tích chuỗi cung ứng cà phê Robusta Tây Nguyên',
) => ({
  locale: 'vi',
  title: 'Chuỗi cung ứng cà phê',
  slug,
  excerpt: 'Tóm tắt tiếng Việt',
  content: doc(text),
});
const en = (slug: string) => ({
  locale: 'en',
  title: 'Coffee supply chain',
  slug,
  excerpt: 'English summary',
  content: doc('Analysis of the Robusta coffee chain'),
});
const article = (slugBase: string, extra: object = {}) => ({
  categoryCode: 'SUPPLY_CHAIN_INSIGHTS',
  translations: [vi(`${slugBase}-vi`), en(`${slugBase}-en`)],
  ...extra,
});
const tr = (body: { translations: { locale: string }[] }, locale: string) =>
  body.translations.find((t) => t.locale === locale) as any;

describe('Articles (PostgreSQL)', () => {
  let t: TestApp;
  let editor: Session;
  let reviewer: Session;
  const pub = () => request(t.http);

  beforeAll(async () => {
    t = await setupApp();
    await t.reset();
    editor = await t.signIn('EDITOR');
    reviewer = await t.signIn('REVIEWER');
  });
  afterAll(() => t.app.close());

  const create = async (slugBase: string, extra: object = {}) =>
    (
      await editor
        .post('/api/v1/admin/articles', article(slugBase, extra))
        .expect(201)
    ).body;
  const approve = (id: string, locale: string, revision: number) =>
    reviewer.post(
      `/api/v1/admin/articles/${id}/translations/${locale}/approve`,
      { expectedRevision: revision },
    );
  const publish = (id: string, revision: number) =>
    reviewer.post(`/api/v1/admin/articles/${id}/publish`, {
      expectedRevision: revision,
    });

  it('creates an article as draft revision 1 with independent locales', async () => {
    const res = await editor
      .post('/api/v1/admin/articles', article('create'))
      .expect(201);
    expectContract(res.body, 'ArticleDetailResponse');
    expect(res.body).toMatchObject({
      status: 'DRAFT',
      revision: 1,
      hasUnpublishedChanges: false,
      publication: null,
      categoryCode: 'SUPPLY_CHAIN_INSIGHTS',
    });
    expect(res.body.translations.map((x: any) => x.locale)).toEqual([
      'en',
      'vi',
    ]);
    expect(tr(res.body, 'vi')).toMatchObject({
      reviewStatus: 'UNREVIEWED',
      isLive: false,
      contentVersion: 1,
      readTimeMinutes: 1,
      wordCount: 12,
    });
    expect(tr(res.body, 'vi').contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tr(res.body, 'vi').contentHash).not.toBe(
      tr(res.body, 'en').contentHash,
    );
    expect(res.body.createdBy).toEqual({
      id: editor.user.id,
      displayName: editor.user.displayName,
    });
    expect(
      await t.prisma.auditLog.count({
        where: { action: 'article.create', entityId: res.body.id },
      }),
    ).toBe(1);
  });

  it('validates references, locales, slugs and required fields', async () => {
    const bad = async (body: object, status: number, code: string) => {
      const res = await editor
        .post('/api/v1/admin/articles', body)
        .expect(status);
      expect(res.body.code).toBe(code);
      return res.body;
    };
    await bad(
      { ...article('v1'), categoryCode: 'Supply Chain Insights' },
      422,
      'UNKNOWN_CATEGORY',
    );
    await bad(
      {
        categoryCode: 'SUPPLY_CHAIN_INSIGHTS',
        translations: [{ ...vi('v2'), locale: 'fr' }],
      },
      422,
      'UNKNOWN_LOCALE',
    );
    await bad(
      {
        categoryCode: 'SUPPLY_CHAIN_INSIGHTS',
        translations: [{ ...vi('v3'), slug: 'Chuỗi Cung Ứng' }],
      },
      400,
      'VALIDATION_FAILED',
    );
    await bad(
      {
        categoryCode: 'SUPPLY_CHAIN_INSIGHTS',
        translations: [{ locale: 'vi', slug: 'no-title' }],
      },
      422,
      'TRANSLATION_INCOMPLETE',
    );
    await bad(
      {
        categoryCode: 'SUPPLY_CHAIN_INSIGHTS',
        translations: [vi('dup'), vi('dup-2')],
      },
      400,
      'VALIDATION_FAILED',
    );
    await bad(
      { categoryCode: 'SUPPLY_CHAIN_INSIGHTS', translations: [] },
      400,
      'VALIDATION_FAILED',
    );
    const media = await bad(
      {
        ...article('v4'),
        coverMediaId: '0199f3a0-0000-7000-8000-000000000000',
      },
      422,
      'MEDIA_NOT_FOUND',
    );
    expect(media.details).toEqual({
      mediaIds: ['0199f3a0-0000-7000-8000-000000000000'],
    });
    const extra = await bad(
      { ...article('v5'), status: 'PUBLISHED' },
      400,
      'VALIDATION_FAILED',
    ); // status is not client-writable
    expect(extra.details).toEqual([
      { path: 'status', message: 'property status should not exist' },
    ]);
  });

  it('rejects unsafe or unsupported rich content with a precise path', async () => {
    const withContent = (content: unknown) => ({
      categoryCode: 'SUPPLY_CHAIN_INSIGHTS',
      translations: [
        { ...vi(`rc-${Math.random().toString(36).slice(2, 8)}`), content },
      ],
    });
    const xss = await editor
      .post(
        '/api/v1/admin/articles',
        withContent({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'x',
                  marks: [
                    { type: 'link', attrs: { href: 'javascript:alert(1)' } },
                  ],
                },
              ],
            },
          ],
        }),
      )
      .expect(422);
    expect(xss.body).toMatchObject({
      code: 'RICH_CONTENT_INVALID',
      details: [
        {
          path: 'translations[0].content.content[0].content[0].marks[0].attrs.href',
        },
      ],
    });

    const script = await editor
      .post(
        '/api/v1/admin/articles',
        withContent({
          type: 'doc',
          content: [{ type: 'script', text: 'alert(1)' }],
        }),
      )
      .expect(422);
    expect(script.body.details[0]).toEqual({
      path: 'translations[0].content.content[0]',
      message: 'Node type "script" is not supported',
    });

    const html = await editor
      .post('/api/v1/admin/articles', withContent('<p onclick="x">hi</p>'))
      .expect(400);
    expect(html.body.code).toBe('VALIDATION_FAILED');

    const nul = await editor.agent
      .post('/api/v1/admin/articles')
      .set('X-CSRF-Token', editor.csrf)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(withContent(doc('a\u0000b'))))
      .expect(400);
    expect(nul.body.message).toMatch(/NUL/);
  });

  it('saves a new revision per draft edit and keeps the other locale untouched', async () => {
    const a = await create('edit');
    const before = { vi: tr(a, 'vi'), en: tr(a, 'en') };
    const res = await editor
      .patch(`/api/v1/admin/articles/${a.id}/draft`, {
        expectedRevision: 1,
        translations: [{ locale: 'vi', title: 'Tiêu đề đã sửa' }],
      })
      .expect(200);
    expect(res.body.revision).toBe(2);
    expect(tr(res.body, 'vi')).toMatchObject({
      title: 'Tiêu đề đã sửa',
      excerpt: before.vi.excerpt,
      content: before.vi.content,
    });
    expect(tr(res.body, 'vi').contentHash).not.toBe(before.vi.contentHash);
    expect(tr(res.body, 'en')).toEqual(before.en);

    const cleared = await editor
      .patch(`/api/v1/admin/articles/${a.id}/draft`, {
        expectedRevision: 2,
        translations: [{ locale: 'en', excerpt: null }],
        isFeatured: true,
      })
      .expect(200);
    expect(tr(cleared.body, 'en').excerpt).toBeNull();
    expect(cleared.body.isFeatured).toBe(true);
    expect(
      await t.prisma.articleRevision.count({ where: { articleId: a.id } }),
    ).toBe(3);
  });

  it('refuses stale saves instead of overwriting (optimistic concurrency)', async () => {
    const a = await create('conflict');
    await editor
      .patch(`/api/v1/admin/articles/${a.id}/draft`, {
        expectedRevision: 1,
        translations: [{ locale: 'vi', title: 'A' }],
      })
      .expect(200);
    const stale = await editor
      .patch(`/api/v1/admin/articles/${a.id}/draft`, {
        expectedRevision: 1,
        translations: [{ locale: 'vi', title: 'B' }],
      })
      .expect(409);
    expect(stale.body).toMatchObject({
      code: 'REVISION_CONFLICT',
      details: { currentRevision: 2 },
    });

    const racers = await Promise.all(
      ['X', 'Y'].map((title) =>
        editor.patch(`/api/v1/admin/articles/${a.id}/draft`, {
          expectedRevision: 2,
          translations: [{ locale: 'vi', title }],
        }),
      ),
    );
    expect(racers.map((r) => r.status).sort((x, y) => x - y)).toEqual([
      200, 409,
    ]);
    expect(
      (await editor.get(`/api/v1/admin/articles/${a.id}`)).body.revision,
    ).toBe(3);
  });

  it('keeps slugs unique per locale across articles', async () => {
    const a = await create('slug');
    const taken = await editor
      .post('/api/v1/admin/articles', {
        categoryCode: 'QUALITY_STANDARDS',
        translations: [vi('slug-vi')],
      })
      .expect(409);
    expect(taken.body).toMatchObject({
      code: 'SLUG_TAKEN',
      details: { locale: 'vi', slug: 'slug-vi' },
    });
    // The same slug in another locale is a different URL.
    await editor
      .post('/api/v1/admin/articles', {
        categoryCode: 'QUALITY_STANDARDS',
        translations: [{ ...en('slug-vi') }],
      })
      .expect(201);
    // Renaming releases the old slug.
    await editor
      .patch(`/api/v1/admin/articles/${a.id}/draft`, {
        expectedRevision: 1,
        translations: [{ locale: 'vi', slug: 'slug-vi-renamed' }],
      })
      .expect(200);
    await editor
      .post('/api/v1/admin/articles', {
        categoryCode: 'QUALITY_STANDARDS',
        translations: [vi('slug-vi')],
      })
      .expect(201);
  });

  it('only publishes approved translations and never exposes drafts publicly', async () => {
    const a = await create('publish');
    expect((await publish(a.id, 1).expect(409)).body.code).toBe(
      'TRANSLATION_NOT_APPROVED',
    );
    await pub().get('/api/v1/public/articles/publish-vi?locale=vi').expect(404);

    const approved = await approve(a.id, 'vi', 1).expect(200);
    expect(tr(approved.body, 'vi').reviewStatus).toBe('APPROVED');
    expect(tr(approved.body, 'en').reviewStatus).toBe('UNREVIEWED');

    const published = await publish(a.id, 1).expect(200);
    expect(published.body).toMatchObject({
      status: 'PUBLISHED',
      hasUnpublishedChanges: false,
      publication: { revision: 1, liveLocales: ['vi'] },
    });
    expect(tr(published.body, 'vi')).toMatchObject({
      isLive: true,
      hasUnpublishedChanges: false,
    });
    expect(tr(published.body, 'en')).toMatchObject({
      isLive: false,
      hasUnpublishedChanges: true,
    });

    const page = await pub()
      .get('/api/v1/public/articles/publish-vi?locale=vi')
      .expect(200);
    expectContract(page.body, 'PublicArticle');
    expect(page.headers['cache-control']).toMatch(/public/);
    expect(page.body).toMatchObject({
      locale: 'vi',
      title: 'Chuỗi cung ứng cà phê',
      category: {
        code: 'SUPPLY_CHAIN_INSIGHTS',
        name: 'Thông Tin Chuỗi Cung Ứng',
      },
      seo: {
        title: 'Chuỗi cung ứng cà phê',
        description: 'Tóm tắt tiếng Việt',
      },
      alternates: [],
    });
    await pub().get('/api/v1/public/articles/publish-en?locale=en').expect(404); // EN was never approved
    await pub().get('/api/v1/public/articles/publish-vi?locale=en').expect(404); // slugs are per locale

    const list = await pub()
      .get('/api/v1/public/articles?locale=vi')
      .expect(200);
    expectContract(list.body, 'PublicArticleListResponse');
    expect(list.body.items.map((x: any) => x.id)).toContain(a.id);
    expect(
      (
        await pub().get('/api/v1/public/articles?locale=en').expect(200)
      ).body.items.map((x: any) => x.id),
    ).not.toContain(a.id);

    // Approving EN later and publishing again adds the locale and the hreflang alternates.
    await approve(a.id, 'en', 1).expect(200);
    await publish(a.id, 1).expect(200);
    expect(
      (
        await pub()
          .get('/api/v1/public/articles/publish-en?locale=en')
          .expect(200)
      ).body.alternates,
    ).toEqual([{ locale: 'vi', slug: 'publish-vi' }]);
  });

  it('isolates drafts from published content until re-approved and re-published', async () => {
    const a = await create('isolate');
    await approve(a.id, 'vi', 1).expect(200);
    await publish(a.id, 1).expect(200);

    const edited = await editor
      .patch(`/api/v1/admin/articles/${a.id}/draft`, {
        expectedRevision: 1,
        translations: [
          {
            locale: 'vi',
            title: 'Bản nháp chưa duyệt',
            content: doc('Nội dung mới chưa kiểm duyệt'),
          },
        ],
      })
      .expect(200);
    expect(edited.body).toMatchObject({
      revision: 2,
      status: 'PUBLISHED',
      hasUnpublishedChanges: true,
      publication: { revision: 1 },
    });
    expect(tr(edited.body, 'vi')).toMatchObject({
      isLive: true,
      hasUnpublishedChanges: true,
      reviewStatus: 'UNREVIEWED',
    });

    const live = await pub()
      .get('/api/v1/public/articles/isolate-vi?locale=vi')
      .expect(200);
    expect(live.body.title).toBe('Chuỗi cung ứng cà phê');
    expect(JSON.stringify(live.body)).not.toContain('chưa kiểm duyệt');

    const preview = await editor
      .get(`/api/v1/admin/articles/${a.id}/preview?locale=vi`)
      .expect(200);
    expectContract(preview.body, 'PublicArticle');
    expect(preview.body).toMatchObject({
      title: 'Bản nháp chưa duyệt',
      publishedAt: null,
    });
    expect(preview.headers['cache-control']).toBe('no-store');
    await pub()
      .get(`/api/v1/admin/articles/${a.id}/preview?locale=vi`)
      .expect(401);

    // The live VI translation changed, so publishing needs a fresh approval of exactly this content.
    expect((await publish(a.id, 2).expect(409)).body).toMatchObject({
      code: 'TRANSLATION_NOT_APPROVED',
      details: { locales: ['vi'] },
    });
    await approve(a.id, 'vi', 2).expect(200);
    await publish(a.id, 2).expect(200);
    expect(
      (
        await pub()
          .get('/api/v1/public/articles/isolate-vi?locale=vi')
          .expect(200)
      ).body.title,
    ).toBe('Bản nháp chưa duyệt');

    // Revision 1 is still intact in the database (immutable history).
    const r1 = await t.prisma.articleRevision.findFirstOrThrow({
      where: { articleId: a.id, number: 1 },
      include: { translations: true },
    });
    expect(r1.translations.find((x) => x.locale === 'vi')!.title).toBe(
      'Chuỗi cung ứng cà phê',
    );
  });

  it('carries approvals across revisions when content is unchanged', async () => {
    const a = await create('carry');
    await approve(a.id, 'vi', 1).expect(200);
    await approve(a.id, 'en', 1).expect(200);
    await publish(a.id, 1).expect(200);
    const res = await editor
      .patch(`/api/v1/admin/articles/${a.id}/draft`, {
        expectedRevision: 1,
        translations: [{ locale: 'en', title: 'Coffee chain, revised' }],
      })
      .expect(200);
    expect(tr(res.body, 'vi').reviewStatus).toBe('APPROVED'); // untouched → same hash → still approved
    expect(tr(res.body, 'en').reviewStatus).toBe('UNREVIEWED');
  });

  it('refuses approval of incomplete translations', async () => {
    const a = (
      await editor
        .post('/api/v1/admin/articles', {
          categoryCode: 'COLD_CHAIN_INTEL',
          translations: [
            { locale: 'vi', title: 'Rỗng', slug: 'empty-content' },
          ],
        })
        .expect(201)
    ).body;
    const res = await approve(a.id, 'vi', 1).expect(422);
    expect(res.body).toMatchObject({
      code: 'TRANSLATION_INCOMPLETE',
      details: [{ path: 'content', message: 'Content is empty' }],
    });
    expect((await approve(a.id, 'en', 1).expect(404)).body.code).toBe(
      'TRANSLATION_NOT_FOUND',
    );
  });

  it('flags translations whose source locale changed', async () => {
    const a = await create('source');
    const marked = await editor
      .patch(`/api/v1/admin/articles/${a.id}/draft`, {
        expectedRevision: 1,
        translations: [{ locale: 'en', sourceLocale: 'vi' }],
      })
      .expect(200);
    expect(tr(marked.body, 'en')).toMatchObject({
      sourceLocale: 'vi',
      isOutdated: false,
    });
    const changed = await editor
      .patch(`/api/v1/admin/articles/${a.id}/draft`, {
        expectedRevision: 2,
        translations: [{ locale: 'vi', content: doc('Nguồn đã thay đổi') }],
      })
      .expect(200);
    expect(tr(changed.body, 'en').isOutdated).toBe(true);
    await editor
      .patch(`/api/v1/admin/articles/${a.id}/draft`, {
        expectedRevision: 3,
        translations: [{ locale: 'en', sourceLocale: 'en' }],
      })
      .expect(422);
  });

  it('archives (public 404, read-only) and restores', async () => {
    const a = await create('archive');
    await approve(a.id, 'vi', 1).expect(200);
    await publish(a.id, 1).expect(200);

    const archived = await reviewer
      .post(`/api/v1/admin/articles/${a.id}/archive`)
      .expect(200);
    expect(archived.body.status).toBe('ARCHIVED');
    await pub().get('/api/v1/public/articles/archive-vi?locale=vi').expect(404);
    expect(
      (
        await editor
          .patch(`/api/v1/admin/articles/${a.id}/draft`, {
            expectedRevision: 1,
            isFeatured: true,
          })
          .expect(409)
      ).body.code,
    ).toBe('ARTICLE_ARCHIVED');
    expect(
      (
        await reviewer
          .post(`/api/v1/admin/articles/${a.id}/archive`)
          .expect(409)
      ).body.code,
    ).toBe('ARTICLE_ARCHIVED');
    expect(
      (
        await editor.get('/api/v1/admin/articles?status=ARCHIVED').expect(200)
      ).body.items.map((x: any) => x.id),
    ).toContain(a.id);
    expect(
      (await editor.get('/api/v1/admin/articles').expect(200)).body.items.map(
        (x: any) => x.id,
      ),
    ).not.toContain(a.id);

    await reviewer.post(`/api/v1/admin/articles/${a.id}/restore`).expect(200);
    await pub().get('/api/v1/public/articles/archive-vi?locale=vi').expect(200);
  });

  it('lists with filters, search, sorting and pagination', async () => {
    await t.reset();
    editor = await t.signIn('EDITOR');
    reviewer = await t.signIn('REVIEWER');
    const a = await create('list-a', { authorName: 'Nguyễn Văn A' });
    const b = await create('list-b', { categoryCode: 'COLD_CHAIN_INTEL' });
    await editor
      .patch(`/api/v1/admin/articles/${b.id}/draft`, {
        expectedRevision: 1,
        translations: [{ locale: 'en', title: 'Reefer containers explained' }],
      })
      .expect(200);
    await approve(a.id, 'vi', 1).expect(200);
    await approve(a.id, 'en', 1).expect(200);
    await publish(a.id, 1).expect(200);

    const all = await editor.get('/api/v1/admin/articles').expect(200);
    expectContract(all.body, 'ArticleListResponse');
    expect(all.body).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(all.body.items.map((x: any) => x.id)).toEqual([a.id, b.id]); // -updatedAt: a was published last

    const ids = async (query: string) =>
      (
        await editor.get(`/api/v1/admin/articles?${query}`).expect(200)
      ).body.items.map((x: any) => x.id);
    expect(await ids('status=PUBLISHED')).toEqual([a.id]);
    expect(await ids('status=DRAFT')).toEqual([b.id]);
    expect(await ids('category=COLD_CHAIN_INTEL')).toEqual([b.id]);
    expect(await ids('search=REEFER')).toEqual([b.id]);
    expect(await ids('sort=createdAt')).toEqual([a.id, b.id]);
    expect(await ids('pageSize=1&page=2&sort=createdAt')).toEqual([b.id]);
    await editor.get('/api/v1/admin/articles?pageSize=500').expect(400);
    await editor.get('/api/v1/admin/articles?sort=title').expect(400);
    expect(all.body.items[0]).toMatchObject({ authorName: 'Nguyễn Văn A' });
    expect(all.body.items[0].translations[0].readTimeMinutes).toBe(1);

    // b has unapproved translations; a is fully approved.
    expect(await ids('awaitingReview=true')).toEqual([b.id]);
    expect(await ids('awaitingReview=false')).toEqual([a.id]);
    await editor.get('/api/v1/admin/articles?awaitingReview=maybe').expect(400);
    const stats = await editor.get('/api/v1/admin/articles/stats').expect(200);
    expectContract(stats.body, 'ArticleStatsResponse');
    expect(stats.body).toEqual({
      total: 2,
      draft: 1,
      published: 1,
      archived: 0,
      awaitingReview: 1,
      featured: 0,
    });
    await reviewer.post(`/api/v1/admin/articles/${b.id}/archive`).expect(200);
    expect(
      (await editor.get('/api/v1/admin/articles/stats').expect(200)).body,
    ).toMatchObject({ total: 1, archived: 1, awaitingReview: 0 });

    const cats = await editor
      .get('/api/v1/admin/article-categories')
      .expect(200);
    expect(cats.body).toHaveLength(6);
    expectContract(cats.body[0], 'ArticleCategoryResponse');
  });
});
