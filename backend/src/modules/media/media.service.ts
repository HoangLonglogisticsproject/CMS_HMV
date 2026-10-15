import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { type Actor, audit } from '../../common/audit';
import { pageArgs } from '../../common/dto';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from '../../infrastructure/storage/object-storage';
import { sniffImage } from './image-sniff';
import {
  ListMediaQuery,
  MediaAssetResponse,
  MediaListResponse,
  MediaUsageContext,
  MediaUsageResponse,
  UpdateMediaDto,
  UploadMediaDto,
} from './media.dto';

/** The subset of multer's file object we use (multer types are not installed). */
export interface UploadedImage {
  buffer: Buffer;
  originalname: string;
}

/** What other modules need to render a media reference. */
export interface ResolvedMedia {
  id: string;
  url: string;
  width: number;
  height: number;
  alt: Record<string, string>; // default alt per locale
}

const MAX_PIXELS = 50_000_000; // decompression-bomb guard for downstream resizers

const MEDIA_INCLUDE = {
  translations: { orderBy: { locale: 'asc' } },
  uploadedBy: { select: { id: true, displayName: true } },
} satisfies Prisma.MediaAssetInclude;

type MediaRow = Prisma.MediaAssetGetPayload<{ include: typeof MEDIA_INCLUDE }>;

/** Display-only name: no path, no control characters, multer's latin1 decoding repaired. */
export function sanitizeFilename(name: string): string {
  let decoded = name;
  // oxlint-disable-next-line no-control-regex -- only ASCII/latin1 names can be mis-decoded UTF-8
  if (!/[^\u0000-\u00ff]/.test(name)) {
    const utf8 = Buffer.from(name, 'latin1').toString('utf8');
    if (!utf8.includes('\uFFFD')) decoded = utf8;
  }
  const base = decoded.split(/[\\/]/).pop() ?? '';
  const clean = base
    // oxlint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return clean || 'upload';
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async upload(
    file: UploadedImage | undefined,
    dto: UploadMediaDto,
    actor: Actor,
  ): Promise<MediaAssetResponse> {
    if (!file?.buffer?.length)
      throw new AppError(
        400,
        'FILE_REQUIRED',
        'Attach the image as multipart field "file"',
      );
    const image = sniffImage(file.buffer);
    if (!image)
      throw new AppError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Only JPEG, PNG and WebP images are accepted',
      );
    if (image.width * image.height > MAX_PIXELS) {
      throw new AppError(
        413,
        'PAYLOAD_TOO_LARGE',
        `Image exceeds ${MAX_PIXELS / 1_000_000} megapixels`,
      );
    }

    const originalFilename = sanitizeFilename(file.originalname);
    const now = new Date();
    // The key never contains user input, so it cannot collide, traverse paths or leak file names.
    const storageKey = `media/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${image.extension}`;
    await this.storage.put(storageKey, file.buffer, image.mimeType);

    try {
      const asset = await this.prisma.$transaction(async (tx) => {
        const created = await tx.mediaAsset.create({
          data: {
            storageKey,
            originalFilename,
            mimeType: image.mimeType,
            byteSize: file.buffer.length,
            width: image.width,
            height: image.height,
            checksumSha256: createHash('sha256')
              .update(file.buffer)
              .digest('hex'),
            title:
              dto.title?.trim() || originalFilename.replace(/\.[^.]+$/, ''),
            category: dto.category,
            uploadedById: actor.userId,
          },
          include: MEDIA_INCLUDE,
        });
        await audit(tx, actor, 'media.upload', 'media', created.id, {
          storageKey,
          byteSize: created.byteSize,
        });
        return created;
      });
      return this.toResponse(asset);
    } catch (err) {
      await this.storage.delete(storageKey).catch(() => undefined); // no orphaned objects
      throw err;
    }
  }

  async list(q: ListMediaQuery): Promise<MediaListResponse> {
    const where: Prisma.MediaAssetWhereInput = { category: q.category };
    if (q.search) {
      const contains = { contains: q.search, mode: 'insensitive' as const };
      where.OR = [
        { title: contains },
        { originalFilename: contains },
        { translations: { some: { altText: contains } } },
      ];
    }
    const field = q.sort.replace('-', '') as 'createdAt' | 'title' | 'byteSize';
    const [items, total] = await this.prisma.$transaction([
      this.prisma.mediaAsset.findMany({
        where,
        include: MEDIA_INCLUDE,
        orderBy: [
          { [field]: q.sort.startsWith('-') ? 'desc' : 'asc' },
          { id: 'asc' },
        ],
        ...pageArgs(q),
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    return {
      items: items.map((a) => this.toResponse(a)),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  async get(id: string): Promise<MediaAssetResponse> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
      include: MEDIA_INCLUDE,
    });
    if (!asset)
      throw new AppError(404, 'MEDIA_NOT_FOUND', 'Media asset not found');
    return this.toResponse(asset);
  }

  async update(
    id: string,
    dto: UpdateMediaDto,
    actor: Actor,
  ): Promise<MediaAssetResponse> {
    await this.prisma.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!asset)
        throw new AppError(404, 'MEDIA_NOT_FOUND', 'Media asset not found');

      const altTexts = dto.altTexts ?? [];
      const locales = altTexts.map((a) => a.locale);
      if (new Set(locales).size !== locales.length) {
        throw new AppError(
          400,
          'VALIDATION_FAILED',
          'Each locale may appear once',
          [{ path: 'altTexts', message: 'Duplicate locale' }],
        );
      }
      const known = await tx.locale.findMany({
        where: { code: { in: locales }, isActive: true },
        select: { code: true },
      });
      const unknown = locales.filter((l) => !known.some((k) => k.code === l));
      if (unknown.length)
        throw new AppError(
          422,
          'UNKNOWN_LOCALE',
          `Unknown locale(s): ${unknown.join(', ')}`,
          { locales: unknown },
        );

      await tx.mediaAsset.update({
        where: { id },
        data: { title: dto.title?.trim(), category: dto.category },
      });
      for (const { locale, altText } of altTexts) {
        const text = altText?.trim();
        if (text) {
          await tx.mediaAssetTranslation.upsert({
            where: { mediaId_locale: { mediaId: id, locale } },
            create: { mediaId: id, locale, altText: text },
            update: { altText: text },
          });
        } else {
          await tx.mediaAssetTranslation.deleteMany({
            where: { mediaId: id, locale },
          });
        }
      }
      await audit(tx, actor, 'media.update', 'media', id, {
        fields: Object.keys(dto),
      });
    });
    return this.get(id);
  }

  async usages(id: string): Promise<MediaUsageResponse> {
    await this.get(id);
    const refs = await this.prisma.articleRevisionMedia.findMany({
      where: { mediaId: id },
      select: {
        revision: {
          select: {
            number: true,
            articleId: true,
            draftOf: { select: { id: true } },
            publishedOf: { select: { id: true } },
            translations: {
              select: { locale: true, title: true },
              orderBy: { locale: 'asc' },
            },
          },
        },
      },
    });
    const usages = refs
      .map(({ revision: r }) => ({
        entityType: 'ARTICLE',
        entityId: r.articleId,
        revisionNumber: r.number,
        contexts: [
          r.draftOf && MediaUsageContext.DRAFT,
          r.publishedOf && MediaUsageContext.PUBLISHED,
        ].filter((c): c is MediaUsageContext => Boolean(c)),
        titles: r.translations,
      }))
      .filter((u) => u.contexts.length > 0);
    return {
      mediaId: id,
      inUse: usages.length > 0,
      usages,
      historicalRevisionCount: refs.length - usages.length,
    };
  }

  /** Looks up assets for rendering. Unknown ids are simply absent from the map. */
  async resolveMany(
    ids: Iterable<string>,
  ): Promise<Map<string, ResolvedMedia>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: unique } },
      include: { translations: true },
    });
    return new Map(
      assets.map((a) => [
        a.id,
        {
          id: a.id,
          url: this.storage.publicUrl(a.storageKey),
          width: a.width,
          height: a.height,
          alt: Object.fromEntries(
            a.translations.map((t) => [t.locale, t.altText]),
          ),
        },
      ]),
    );
  }

  private toResponse(a: MediaRow): MediaAssetResponse {
    return {
      id: a.id,
      url: this.storage.publicUrl(a.storageKey),
      title: a.title,
      category: a.category,
      mimeType: a.mimeType,
      byteSize: a.byteSize,
      width: a.width,
      height: a.height,
      originalFilename: a.originalFilename,
      checksumSha256: a.checksumSha256,
      altTexts: a.translations.map((t) => ({
        locale: t.locale,
        altText: t.altText,
      })),
      uploadedBy: a.uploadedBy,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}
