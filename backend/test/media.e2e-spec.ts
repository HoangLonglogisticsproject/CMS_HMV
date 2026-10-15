import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { makePng } from './fixtures';
import {
  expectContract,
  type Session,
  setupApp,
  type TestApp,
} from './helpers';

const MEDIA_DIR = process.env.LOCAL_STORAGE_DIR!;
const countFiles = (dir = MEDIA_DIR): number =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).reduce(
        (n, e) => n + (e.isDirectory() ? countFiles(join(dir, e.name)) : 1),
        0,
      )
    : 0;
const para = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

describe('Media (PostgreSQL + local storage adapter)', () => {
  let t: TestApp;
  let editor: Session;
  let reviewer: Session;

  beforeAll(async () => {
    t = await setupApp();
    await t.reset();
    editor = await t.signIn('EDITOR');
    reviewer = await t.signIn('REVIEWER');
  });
  afterAll(() => t.app.close());

  const upload = async (name = 'photo.png', png = makePng(4, 3)) =>
    (
      await editor
        .upload('/api/v1/admin/media')
        .attach('file', png, {
          filename: name,
          contentType: 'application/octet-stream',
        })
        .expect(201)
    ).body;

  it('detects the type from the bytes, stores under a generated key and serves the file safely', async () => {
    const png = makePng(4, 3);
    const res = await editor
      .upload('/api/v1/admin/media')
      .field('category', 'COMMODITY')
      .attach('file', png, {
        filename: '../../Ảnh cà phê.png',
        contentType: 'text/plain',
      }) // the client lies about the type
      .expect(201);
    expectContract(res.body, 'MediaAssetResponse');
    expect(res.body).toMatchObject({
      mimeType: 'image/png',
      width: 4,
      height: 3,
      byteSize: png.length,
      checksumSha256: createHash('sha256').update(png).digest('hex'),
      originalFilename: 'Ảnh cà phê.png',
      title: 'Ảnh cà phê',
      category: 'COMMODITY',
      altTexts: [],
      uploadedBy: { id: editor.user.id },
    });
    expect(res.body.url).toMatch(
      /^http:\/\/localhost:4000\/media-files\/media\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/,
    );

    const key = res.body.url.replace('http://localhost:4000/media-files/', '');
    expect(existsSync(join(MEDIA_DIR, key))).toBe(true);
    const served = await request(t.http).get(`/media-files/${key}`).expect(200);
    expect(Buffer.compare(served.body, png)).toBe(0);
    expect(served.headers).toMatchObject({
      'content-type': 'image/png',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    });
    expect(
      await t.prisma.auditLog.count({
        where: { action: 'media.upload', entityId: res.body.id },
      }),
    ).toBe(1);
  });

  it('rejects non-images, oversize files and missing files without storing anything', async () => {
    const files = countFiles();
    const rows = await t.prisma.mediaAsset.count();
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
    );
    expect(
      (
        await editor
          .upload('/api/v1/admin/media')
          .attach('file', svg, {
            filename: 'logo.png',
            contentType: 'image/png',
          })
          .expect(415)
      ).body.code,
    ).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(
      (
        await editor
          .upload('/api/v1/admin/media')
          .attach('file', makePng(4, 3).subarray(0, 20), {
            filename: 'truncated.png',
          })
          .expect(415)
      ).body.code,
    ).toBe('UNSUPPORTED_MEDIA_TYPE');
    const huge = Buffer.concat([makePng(1, 1), Buffer.alloc(70 * 1024)]); // MEDIA_MAX_BYTES is 64 KiB in tests
    expect(
      (
        await editor
          .upload('/api/v1/admin/media')
          .attach('file', huge, { filename: 'huge.png' })
          .expect(413)
      ).body.code,
    ).toBe('PAYLOAD_TOO_LARGE');
    expect(
      (
        await editor
          .upload('/api/v1/admin/media')
          .field('title', 'x')
          .expect(400)
      ).body.code,
    ).toBe('FILE_REQUIRED');
    await editor
      .upload('/api/v1/admin/media')
      .field('category', 'SELFIE')
      .attach('file', makePng(1, 1), { filename: 'a.png' })
      .expect(400);
    expect(countFiles()).toBe(files);
    expect(await t.prisma.mediaAsset.count()).toBe(rows);
  });

  it('updates title, category and per-locale default alt text', async () => {
    const asset = await upload();
    const res = await editor
      .patch(`/api/v1/admin/media/${asset.id}`, {
        title: 'Kho lạnh Bình Dương',
        category: 'FACILITY',
        altTexts: [
          { locale: 'vi', altText: 'Kho lạnh tại Bình Dương' },
          { locale: 'en', altText: 'Cold storage in Binh Duong' },
        ],
      })
      .expect(200);
    expect(res.body).toMatchObject({
      title: 'Kho lạnh Bình Dương',
      category: 'FACILITY',
    });
    expect(res.body.altTexts).toEqual([
      { locale: 'en', altText: 'Cold storage in Binh Duong' },
      { locale: 'vi', altText: 'Kho lạnh tại Bình Dương' },
    ]);
    const removed = await editor
      .patch(`/api/v1/admin/media/${asset.id}`, {
        category: null,
        altTexts: [{ locale: 'vi', altText: null }],
      })
      .expect(200);
    expect(removed.body).toMatchObject({
      category: null,
      altTexts: [{ locale: 'en', altText: 'Cold storage in Binh Duong' }],
    });
    expect(
      (
        await editor
          .patch(`/api/v1/admin/media/${asset.id}`, {
            altTexts: [{ locale: 'fr', altText: 'x' }],
          })
          .expect(422)
      ).body.code,
    ).toBe('UNKNOWN_LOCALE');
    await editor
      .patch(`/api/v1/admin/media/${asset.id}`, {
        url: 'https://evil.example/x.png',
      })
      .expect(400);
    await reviewer
      .patch(`/api/v1/admin/media/${asset.id}`, { title: 'x' })
      .expect(403);
    expect(
      (
        await editor
          .get('/api/v1/admin/media/0199f3a0-0000-7000-8000-000000000000')
          .expect(404)
      ).body.code,
    ).toBe('MEDIA_NOT_FOUND');
  });

  it('lists with category filter, alt-text search and pagination', async () => {
    const a = await upload('kho.png');
    await editor
      .patch(`/api/v1/admin/media/${a.id}`, {
        category: 'LOGISTICS',
        altTexts: [{ locale: 'en', altText: 'Reefer container yard' }],
      })
      .expect(200);
    const list = await reviewer
      .get('/api/v1/admin/media?category=LOGISTICS')
      .expect(200);
    expectContract(list.body, 'MediaListResponse');
    expect(list.body.items.map((x: any) => x.id)).toEqual([a.id]);
    expect(
      (
        await reviewer.get('/api/v1/admin/media?search=reefer').expect(200)
      ).body.items.map((x: any) => x.id),
    ).toEqual([a.id]);
    expect(
      (await reviewer.get('/api/v1/admin/media?pageSize=1').expect(200)).body
        .items,
    ).toHaveLength(1);
  });

  it('tracks usage by current draft and published revisions and resolves media in public content', async () => {
    const cover = await upload('cover.png', makePng(8, 6));
    const inline = await upload('inline.png', makePng(5, 5));
    const replacement = await upload('replacement.png');
    const content = {
      type: 'doc',
      content: [
        para('Ảnh kho lạnh dưới đây'),
        {
          type: 'image',
          attrs: {
            mediaId: inline.id.toUpperCase(),
            src: 'https://tracker.example/p.gif',
            alt: null,
          },
        },
      ],
    };
    const art = (
      await editor
        .post('/api/v1/admin/articles', {
          categoryCode: 'COLD_CHAIN_INTEL',
          coverMediaId: cover.id,
          translations: [
            {
              locale: 'vi',
              title: 'Kho lạnh',
              slug: 'kho-lanh',
              content,
              coverImageAlt: 'Ảnh bìa kho lạnh',
            },
          ],
        })
        .expect(201)
    ).body;
    expect(art.coverMedia).toEqual({
      id: cover.id,
      url: cover.url,
      width: 8,
      height: 6,
    });
    expect(art.translations[0].content.content[1].attrs).toEqual({
      mediaId: inline.id,
      alt: null,
      src: inline.url,
    }); // stored src is discarded

    const usage = async (id: string) =>
      (await editor.get(`/api/v1/admin/media/${id}/usages`).expect(200)).body;
    const u = await usage(cover.id);
    expectContract(u, 'MediaUsageResponse');
    expect(u).toMatchObject({
      inUse: true,
      historicalRevisionCount: 0,
      usages: [
        {
          entityType: 'ARTICLE',
          entityId: art.id,
          revisionNumber: 1,
          contexts: ['DRAFT'],
        },
      ],
    });
    expect((await usage(inline.id)).inUse).toBe(true);
    expect(await usage(replacement.id)).toMatchObject({
      inUse: false,
      usages: [],
    });

    // Approval needs alt text for every image in this locale: the inline image has none yet.
    const incomplete = await reviewer
      .post(`/api/v1/admin/articles/${art.id}/translations/vi/approve`, {
        expectedRevision: 1,
      })
      .expect(422);
    expect(incomplete.body.details).toEqual([
      {
        path: 'content',
        message: `Image ${inline.id} needs alt text in this locale`,
      },
    ]);
    await editor
      .patch(`/api/v1/admin/media/${inline.id}`, {
        altTexts: [{ locale: 'vi', altText: 'Container lạnh' }],
      })
      .expect(200);
    await reviewer
      .post(`/api/v1/admin/articles/${art.id}/translations/vi/approve`, {
        expectedRevision: 1,
      })
      .expect(200);
    await reviewer
      .post(`/api/v1/admin/articles/${art.id}/publish`, { expectedRevision: 1 })
      .expect(200);
    expect((await usage(cover.id)).usages[0].contexts).toEqual([
      'DRAFT',
      'PUBLISHED',
    ]);

    const page = (
      await request(t.http)
        .get('/api/v1/public/articles/kho-lanh?locale=vi')
        .expect(200)
    ).body;
    expect(page.cover).toEqual({
      url: cover.url,
      width: 8,
      height: 6,
      alt: 'Ảnh bìa kho lạnh',
    });
    expect(page.content.content[1].attrs).toMatchObject({
      src: inline.url,
      alt: 'Container lạnh',
    });

    await editor
      .patch(`/api/v1/admin/articles/${art.id}/draft`, {
        expectedRevision: 1,
        coverMediaId: replacement.id,
      })
      .expect(200);
    expect((await usage(cover.id)).usages).toMatchObject([
      { revisionNumber: 1, contexts: ['PUBLISHED'] },
    ]);
    expect((await usage(replacement.id)).usages).toMatchObject([
      { revisionNumber: 2, contexts: ['DRAFT'] },
    ]);
    expect(
      (
        await request(t.http)
          .get('/api/v1/public/articles/kho-lanh?locale=vi')
          .expect(200)
      ).body.cover.url,
    ).toBe(cover.url);

    // The database refuses to delete media that any revision references.
    await expect(
      t.prisma.mediaAsset.delete({ where: { id: cover.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});
