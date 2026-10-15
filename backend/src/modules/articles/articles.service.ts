import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { type Actor, audit } from '../../common/audit';
import { pageArgs } from '../../common/dto';
import { AppError, type Issue } from '../../common/errors';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MediaService, type ResolvedMedia } from '../media/media.service';
import {
  ArticleCategoryResponse,
  ArticleDetailResponse,
  ArticleListResponse,
  ArticleStatsResponse,
  ArticleStatus,
  ArticleSummaryResponse,
  ArticleTranslationSummary,
  CreateArticleDto,
  ListArticlesQuery,
  PublicArticle,
  PublicArticleListResponse,
  PublicArticlesQuery,
  PublicArticleSummary,
  RevisionRefDto,
  TranslationReviewStatus,
  UpdateArticleDraftDto,
} from './article.dto';
import {
  collectMediaIds,
  countWords,
  hydrateContent,
  imagesMissingAlt,
  RICH_CONTENT_VERSION,
  stableStringify,
  validateRichContent,
} from './rich-content';

type Tx = Prisma.TransactionClient;
type Media = Map<string, ResolvedMedia>;

/** Localized fields covered by contentHash, i.e. what a reviewer approves. */
const HASHED_FIELDS = [
  'title',
  'slug',
  'excerpt',
  'content',
  'contentVersion',
  'coverImageAlt',
  'seoTitle',
  'seoDescription',
] as const;

interface TranslationData {
  locale: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: Prisma.JsonValue | null;
  contentVersion: number;
  wordCount: number;
  coverImageAlt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  contentHash: string;
  sourceLocale: string | null;
  sourceHash: string | null;
}

const hashTranslation = (t: TranslationData) =>
  createHash('sha256')
    .update(
      stableStringify(Object.fromEntries(HASHED_FIELDS.map((k) => [k, t[k]]))),
    )
    .digest('hex');

const readTime = (words: number) =>
  words ? Math.max(1, Math.ceil(words / 200)) : 0;

/** undefined = keep, null/blank = clear. */
const merge = (
  value: string | null | undefined,
  previous: string | null | undefined,
) => (value === undefined ? (previous ?? null) : value?.trim() || null);

const USER_REF = { select: { id: true, displayName: true } } as const;
const STATE_INCLUDE = {
  publishedRevision: {
    select: {
      number: true,
      translations: { select: { locale: true, contentHash: true, slug: true } },
    },
  },
  publishedLocales: { select: { locale: true }, orderBy: { locale: 'asc' } },
  approvals: { select: { locale: true, contentHash: true } },
} satisfies Prisma.ArticleInclude;

const SUMMARY_INCLUDE = {
  ...STATE_INCLUDE,
  draftRevision: {
    select: {
      number: true,
      categoryCode: true,
      isFeatured: true,
      coverMediaId: true,
      authorName: true,
      createdBy: USER_REF,
      translations: {
        select: {
          locale: true,
          title: true,
          slug: true,
          wordCount: true,
          contentHash: true,
          sourceLocale: true,
          sourceHash: true,
        },
        orderBy: { locale: 'asc' },
      },
    },
  },
} satisfies Prisma.ArticleInclude;

const DETAIL_INCLUDE = {
  ...STATE_INCLUDE,
  createdBy: USER_REF,
  draftRevision: {
    include: {
      createdBy: USER_REF,
      translations: { orderBy: { locale: 'asc' } },
    },
  },
} satisfies Prisma.ArticleInclude;

const PUBLIC_REVISION_INCLUDE = (locale: string, withContent: boolean) =>
  ({
    translations: withContent ? true : { omit: { content: true } },
    category: { include: { translations: { where: { locale } } } },
  }) satisfies Prisma.ArticleRevisionInclude;

type SummaryRow = Prisma.ArticleGetPayload<{ include: typeof SUMMARY_INCLUDE }>;
type DetailRow = Prisma.ArticleGetPayload<{ include: typeof DETAIL_INCLUDE }>;
type PublicRevision = Prisma.ArticleRevisionGetPayload<{
  include: {
    translations: true;
    category: { include: { translations: true } };
  };
}>;

function translationStates(a: SummaryRow | DetailRow) {
  const draft = a.draftRevision!.translations;
  const live = new Set(a.publishedLocales.map((p) => p.locale));
  const published = new Map(
    a.publishedRevision?.translations.map((t) => [t.locale, t.contentHash]) ??
      [],
  );
  return (t: (typeof draft)[number]) => ({
    reviewStatus: a.approvals.some(
      (ap) => ap.locale === t.locale && ap.contentHash === t.contentHash,
    )
      ? TranslationReviewStatus.APPROVED
      : TranslationReviewStatus.UNREVIEWED,
    isLive: live.has(t.locale),
    hasUnpublishedChanges:
      !live.has(t.locale) || published.get(t.locale) !== t.contentHash,
    isOutdated:
      t.sourceLocale !== null &&
      draft.find((s) => s.locale === t.sourceLocale)?.contentHash !==
        t.sourceHash,
  });
}

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  // ---------- Admin reads ----------

  async categories(): Promise<ArticleCategoryResponse[]> {
    const rows = await this.prisma.articleCategory.findMany({
      where: { isActive: true },
      include: { translations: { orderBy: { locale: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((c) => ({
      code: c.code,
      sortOrder: c.sortOrder,
      names: c.translations.map(({ locale, name }) => ({ locale, name })),
    }));
  }

  async list(q: ListArticlesQuery): Promise<ArticleListResponse> {
    const where: Prisma.ArticleWhereInput = {
      id:
        q.awaitingReview === undefined
          ? undefined
          : q.awaitingReview
            ? { in: await this.awaitingReviewIds() }
            : { notIn: await this.awaitingReviewIds() },
      archivedAt: q.status === ArticleStatus.ARCHIVED ? { not: null } : null,
      publishedRevisionId:
        q.status === ArticleStatus.PUBLISHED
          ? { not: null }
          : q.status === ArticleStatus.DRAFT
            ? null
            : undefined,
      draftRevision: {
        categoryCode: q.category,
        translations: q.search
          ? {
              some: {
                OR: [
                  { title: { contains: q.search, mode: 'insensitive' } },
                  { slug: { contains: q.search, mode: 'insensitive' } },
                ],
              },
            }
          : undefined,
      },
    };
    const field = q.sort.replace('-', '') as
      'updatedAt' | 'createdAt' | 'lastPublishedAt';
    const direction = q.sort.startsWith('-') ? 'desc' : 'asc';
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        include: SUMMARY_INCLUDE,
        orderBy: [
          field === 'lastPublishedAt'
            ? { lastPublishedAt: { sort: direction, nulls: 'last' } }
            : { [field]: direction },
          { id: 'asc' },
        ],
        ...pageArgs(q),
      }),
      this.prisma.article.count({ where }),
    ]);
    const media = await this.media.resolveMany(
      rows.flatMap((r) => r.draftRevision?.coverMediaId ?? []),
    );
    return {
      items: rows.map((r) => this.toSummary(r, media)),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  /**
   * Non-archived articles whose current draft has a translation without an approval for its exact content.
   * ponytail: computed per request with one query; fine for thousands of articles. Materialise a flag if lists get slow.
   */
  private async awaitingReviewIds(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT a.id FROM articles a
      JOIN article_revision_translations t ON t."revisionId" = a."draftRevisionId"
      WHERE a."archivedAt" IS NULL AND NOT EXISTS (
        SELECT 1 FROM article_translation_approvals ap
        WHERE ap."articleId" = a.id AND ap.locale = t.locale AND ap."contentHash" = t."contentHash")`;
    return rows.map((r) => r.id);
  }

  async stats(): Promise<ArticleStatsResponse> {
    const live = { archivedAt: null };
    const [total, draft, published, archived, featured] =
      await this.prisma.$transaction([
        this.prisma.article.count({ where: live }),
        this.prisma.article.count({
          where: { ...live, publishedRevisionId: null },
        }),
        this.prisma.article.count({
          where: { ...live, publishedRevisionId: { not: null } },
        }),
        this.prisma.article.count({ where: { archivedAt: { not: null } } }),
        this.prisma.article.count({
          where: { ...live, draftRevision: { isFeatured: true } },
        }),
      ]);
    const awaitingReview = (await this.awaitingReviewIds()).length;
    return { total, draft, published, archived, featured, awaitingReview };
  }

  async get(id: string): Promise<ArticleDetailResponse> {
    const a = await this.prisma.article.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!a?.draftRevision)
      throw new AppError(404, 'ARTICLE_NOT_FOUND', 'Article not found');
    const d = a.draftRevision;
    const media = await this.media.resolveMany([
      ...d.translations.flatMap((t) => collectMediaIds(t.content)),
      ...(d.coverMediaId ? [d.coverMediaId] : []),
    ]);
    const state = translationStates(a);
    return {
      // oxlint-disable-next-line no-misused-spread -- plain object typed by its DTO class
      ...this.toSummary(a, media),
      authorRole: d.authorRole,
      createdBy: a.createdBy,
      translations: d.translations.map((t) => ({
        locale: t.locale,
        title: t.title,
        slug: t.slug,
        ...state(t),
        excerpt: t.excerpt,
        // Admin keeps the stored alt (no default fallback) so editors see what is actually saved.
        content: hydrateContent(
          t.content,
          (mid) => media.get(mid) && { url: media.get(mid)!.url },
        ) as Record<string, unknown> | null,
        contentVersion: t.contentVersion,
        coverImageAlt: t.coverImageAlt,
        seoTitle: t.seoTitle,
        seoDescription: t.seoDescription,
        contentHash: t.contentHash,
        wordCount: t.wordCount,
        readTimeMinutes: readTime(t.wordCount),
        sourceLocale: t.sourceLocale,
      })),
    };
  }

  /** Renders the current draft exactly as the public API would. Never cached, never public. */
  async preview(id: string, locale: string): Promise<PublicArticle> {
    const a = await this.prisma.article.findUnique({
      where: { id },
      include: {
        draftRevision: { include: PUBLIC_REVISION_INCLUDE(locale, true) },
      },
    });
    if (!a?.draftRevision)
      throw new AppError(404, 'ARTICLE_NOT_FOUND', 'Article not found');
    const t = a.draftRevision.translations.find((x) => x.locale === locale);
    if (!t)
      throw new AppError(
        404,
        'TRANSLATION_NOT_FOUND',
        `No "${locale}" translation in the draft`,
      );
    const alternates = a.draftRevision.translations
      .filter((x) => x.locale !== locale)
      .map(({ locale: l, slug }) => ({ locale: l, slug }));
    return this.toPublic(
      { ...a, firstPublishedAt: null, lastPublishedAt: null },
      a.draftRevision,
      locale,
      alternates,
    );
  }

  // ---------- Admin writes ----------

  async create(
    dto: CreateArticleDto,
    actor: Actor,
  ): Promise<ArticleDetailResponse> {
    const id = await this.transaction(async (tx) => {
      const article = await tx.article.create({
        data: { createdById: actor.userId },
      });
      const revision = await this.writeRevision(
        tx,
        article.id,
        null,
        dto,
        actor.userId,
      );
      await tx.article.update({
        where: { id: article.id },
        data: { draftRevisionId: revision.id },
      });
      await this.syncSlugs(tx, article.id);
      await audit(tx, actor, 'article.create', 'article', article.id, {
        revision: 1,
        locales: dto.translations.map((t) => t.locale),
      });
      return article.id;
    });
    return this.get(id);
  }

  async updateDraft(
    id: string,
    dto: UpdateArticleDraftDto,
    actor: Actor,
  ): Promise<ArticleDetailResponse> {
    await this.transaction(async (tx) => {
      const a = await tx.article.findUnique({
        where: { id },
        include: { draftRevision: { include: { translations: true } } },
      });
      const base = this.assertRevision(a, dto.expectedRevision).draftRevision!;
      const revision = await this.writeRevision(
        tx,
        id,
        base,
        dto,
        actor.userId,
      );
      await tx.article.update({
        where: { id },
        data: { draftRevisionId: revision.id },
      });
      await this.syncSlugs(tx, id);
      await audit(tx, actor, 'article.update_draft', 'article', id, {
        revision: revision.number,
        locales: dto.translations?.map((t) => t.locale) ?? [],
      });
    });
    return this.get(id);
  }

  /** Approves one locale of the current draft. The approval binds to its content hash. */
  async approve(
    id: string,
    locale: string,
    dto: RevisionRefDto,
    actor: Actor,
  ): Promise<ArticleDetailResponse> {
    await this.transaction(async (tx) => {
      const a = await tx.article.findUnique({
        where: { id },
        include: { draftRevision: { include: { translations: true } } },
      });
      const draft = this.assertRevision(a, dto.expectedRevision).draftRevision!;
      const t = draft.translations.find((x) => x.locale === locale);
      if (!t)
        throw new AppError(
          404,
          'TRANSLATION_NOT_FOUND',
          `No "${locale}" translation in the draft`,
        );

      const media = await this.media.resolveMany([
        ...collectMediaIds(t.content),
        ...(draft.coverMediaId ? [draft.coverMediaId] : []),
      ]);
      const problems: Issue[] = [];
      if (!t.content || countWords(t.content) === 0)
        problems.push({ path: 'content', message: 'Content is empty' });
      if (
        draft.coverMediaId &&
        !(t.coverImageAlt ?? media.get(draft.coverMediaId)?.alt[locale])
      ) {
        problems.push({
          path: 'coverImageAlt',
          message:
            'The cover image needs alt text in this locale (here or as the media default)',
        });
      }
      for (const mediaId of imagesMissingAlt(
        t.content,
        (mid) => media.get(mid)?.alt[locale],
      )) {
        problems.push({
          path: 'content',
          message: `Image ${mediaId} needs alt text in this locale`,
        });
      }
      if (problems.length)
        throw new AppError(
          422,
          'TRANSLATION_INCOMPLETE',
          'Translation is not ready for approval',
          problems,
        );

      await tx.articleTranslationApproval.createMany({
        data: [
          {
            articleId: id,
            locale,
            contentHash: t.contentHash,
            approvedById: actor.userId,
          },
        ],
        skipDuplicates: true,
      });
      await audit(tx, actor, 'article.approve_translation', 'article', id, {
        locale,
        revision: draft.number,
        contentHash: t.contentHash,
      });
    });
    return this.get(id);
  }

  /**
   * Publishes the draft revision `expectedRevision`. Every approved locale goes live; a locale that is already live
   * must be approved in this revision too, so an unreviewed edit can never reach the public through someone else's publish.
   */
  async publish(
    id: string,
    dto: RevisionRefDto,
    actor: Actor,
  ): Promise<ArticleDetailResponse> {
    await this.transaction(async (tx) => {
      const a = await tx.article.findUnique({
        where: { id },
        include: {
          draftRevision: {
            include: {
              translations: { select: { locale: true, contentHash: true } },
            },
          },
          publishedLocales: true,
          approvals: true,
        },
      });
      const draft = this.assertRevision(a, dto.expectedRevision).draftRevision!;
      const approved = draft.translations
        .filter((t) =>
          a!.approvals.some(
            (ap) => ap.locale === t.locale && ap.contentHash === t.contentHash,
          ),
        )
        .map((t) => t.locale);
      const live = a!.publishedLocales.map((p) => p.locale);
      const blocked = live.filter((l) => !approved.includes(l));
      if (blocked.length) {
        throw new AppError(
          409,
          'TRANSLATION_NOT_APPROVED',
          `Live translation(s) changed and need approval: ${blocked.join(', ')}`,
          { locales: blocked },
        );
      }
      if (!approved.length) {
        throw new AppError(
          409,
          'TRANSLATION_NOT_APPROVED',
          'Approve at least one translation before publishing',
          {
            locales: draft.translations.map((t) => t.locale),
          },
        );
      }

      const now = new Date();
      await tx.article.update({
        where: { id },
        data: {
          publishedRevisionId: draft.id,
          firstPublishedAt: a!.firstPublishedAt ?? now,
          lastPublishedAt: now,
        },
      });
      await tx.articlePublishedLocale.createMany({
        data: approved
          .filter((l) => !live.includes(l))
          .map((locale) => ({ articleId: id, locale, publishedAt: now })),
      });
      await this.syncSlugs(tx, id);
      await audit(tx, actor, 'article.publish', 'article', id, {
        revision: draft.number,
        locales: approved,
      });
    });
    return this.get(id);
  }

  /** Hides the article from the public API. Draft and publication state are kept, so restore is lossless. */
  async archive(id: string, actor: Actor): Promise<ArticleDetailResponse> {
    await this.transaction(async (tx) => {
      const a = await tx.article.findUnique({
        where: { id },
        select: { archivedAt: true },
      });
      if (!a) throw new AppError(404, 'ARTICLE_NOT_FOUND', 'Article not found');
      if (a.archivedAt)
        throw new AppError(
          409,
          'ARTICLE_ARCHIVED',
          'Article is already archived',
        );
      await tx.article.update({
        where: { id },
        data: { archivedAt: new Date(), archivedById: actor.userId },
      });
      await audit(tx, actor, 'article.archive', 'article', id);
    });
    return this.get(id);
  }

  /** Un-archives. Previously live locales become public again. */
  async restore(id: string, actor: Actor): Promise<ArticleDetailResponse> {
    await this.transaction(async (tx) => {
      const a = await tx.article.findUnique({
        where: { id },
        select: { archivedAt: true },
      });
      if (!a) throw new AppError(404, 'ARTICLE_NOT_FOUND', 'Article not found');
      if (!a.archivedAt)
        throw new AppError(
          409,
          'ARTICLE_NOT_ARCHIVED',
          'Article is not archived',
        );
      await tx.article.update({
        where: { id },
        data: { archivedAt: null, archivedById: null },
      });
      await audit(tx, actor, 'article.restore', 'article', id);
    });
    return this.get(id);
  }

  // ---------- Public reads: only live locales of the published revision, never drafts ----------

  private publicWhere(locale: string): Prisma.ArticleWhereInput {
    return {
      archivedAt: null,
      publishedRevisionId: { not: null },
      publishedLocales: { some: { locale } },
    };
  }

  async publicList(q: PublicArticlesQuery): Promise<PublicArticleListResponse> {
    await this.assertLocale(q.locale);
    const where: Prisma.ArticleWhereInput = {
      ...this.publicWhere(q.locale),
      publishedRevision: q.category ? { categoryCode: q.category } : undefined,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        include: {
          publishedRevision: {
            include: PUBLIC_REVISION_INCLUDE(q.locale, false),
          },
        },
        orderBy: [{ firstPublishedAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(q),
      }),
      this.prisma.article.count({ where }),
    ]);
    const media = await this.media.resolveMany(
      rows.flatMap((r) => r.publishedRevision?.coverMediaId ?? []),
    );
    return {
      items: rows.map((r) =>
        this.toPublicSummary(
          r,
          r.publishedRevision! as PublicRevision,
          q.locale,
          media,
        ),
      ),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  async publicGet(slug: string, locale: string): Promise<PublicArticle> {
    await this.assertLocale(locale);
    const a = await this.prisma.article.findFirst({
      where: {
        ...this.publicWhere(locale),
        publishedRevision: { translations: { some: { locale, slug } } },
      },
      include: {
        publishedLocales: true,
        publishedRevision: { include: PUBLIC_REVISION_INCLUDE(locale, true) },
      },
    });
    if (!a?.publishedRevision)
      throw new AppError(404, 'ARTICLE_NOT_FOUND', 'Article not found');
    const live = new Set(a.publishedLocales.map((p) => p.locale));
    const alternates = a.publishedRevision.translations
      .filter((t) => t.locale !== locale && live.has(t.locale))
      .map((t) => ({ locale: t.locale, slug: t.slug }));
    return this.toPublic(a, a.publishedRevision, locale, alternates);
  }

  async publicCategories(locale: string) {
    await this.assertLocale(locale);
    const rows = await this.prisma.articleCategory.findMany({
      where: { isActive: true },
      include: { translations: { where: { locale } } },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((c) => ({
      code: c.code,
      name: c.translations[0]?.name ?? c.code,
    }));
  }

  // ---------- Internals ----------

  /** Maps unique-constraint races to domain errors (two saves of the same revision, two articles taking one slug). */
  private async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const model = (err.meta as { modelName?: string } | undefined)
          ?.modelName;
        if (model === 'ArticleRevision')
          throw new AppError(
            409,
            'REVISION_CONFLICT',
            'The draft was saved by someone else; reload and retry',
          );
        if (model === 'ArticleSlug')
          throw new AppError(
            409,
            'SLUG_TAKEN',
            'Slug is already used by another article',
          );
      }
      throw err;
    }
  }

  private assertRevision<
    T extends {
      archivedAt: Date | null;
      draftRevision: { number: number } | null;
    },
  >(a: T | null, expected: number): T {
    if (!a?.draftRevision)
      throw new AppError(404, 'ARTICLE_NOT_FOUND', 'Article not found');
    if (a.archivedAt)
      throw new AppError(
        409,
        'ARTICLE_ARCHIVED',
        'Archived articles are read-only; restore it first',
      );
    if (a.draftRevision.number !== expected) {
      throw new AppError(
        409,
        'REVISION_CONFLICT',
        `Draft is at revision ${a.draftRevision.number}, not ${expected}; reload and retry`,
        {
          currentRevision: a.draftRevision.number,
        },
      );
    }
    return a;
  }

  private async assertLocale(locale: string) {
    const found = await this.prisma.locale.findFirst({
      where: { code: locale, isActive: true },
    });
    if (!found)
      throw new AppError(400, 'UNKNOWN_LOCALE', `Unknown locale "${locale}"`);
  }

  /** Inserts revision N+1 = base + input. Revisions are never updated afterwards. */
  private async writeRevision(
    tx: Tx,
    articleId: string,
    base: Prisma.ArticleRevisionGetPayload<{
      include: { translations: true };
    }> | null,
    input: Partial<CreateArticleDto>,
    actorId: string,
  ) {
    const translations = new Map<string, TranslationData>(
      // oxlint-disable-next-line no-unused-vars -- revisionId is dropped so the row can seed the next revision
      (base?.translations ?? []).map(({ revisionId: _, ...t }) => [
        t.locale,
        t,
      ]),
    );
    const inputs = input.translations ?? [];
    const locales = inputs.map((t) => t.locale);
    if (new Set(locales).size !== locales.length) {
      throw new AppError(
        400,
        'VALIDATION_FAILED',
        'Each locale may appear once',
        [{ path: 'translations', message: 'Duplicate locale' }],
      );
    }
    const added = locales.filter((l) => !translations.has(l));
    if (added.length) {
      const active = await tx.locale.findMany({
        where: { code: { in: added }, isActive: true },
        select: { code: true },
      });
      const unknown = added.filter((l) => !active.some((a) => a.code === l));
      if (unknown.length)
        throw new AppError(
          422,
          'UNKNOWN_LOCALE',
          `Unknown locale(s): ${unknown.join(', ')}`,
          { locales: unknown },
        );
    }

    for (const [i, t] of inputs.entries()) {
      const prev = translations.get(t.locale);
      const title = t.title?.trim() || prev?.title;
      const slug = t.slug ?? prev?.slug;
      if (!title || !slug) {
        throw new AppError(
          422,
          'TRANSLATION_INCOMPLETE',
          `Translation "${t.locale}" needs a title and a slug`,
          [
            {
              path: `translations[${i}]`,
              message: 'title and slug are required when adding a locale',
            },
          ],
        );
      }
      let content = prev?.content ?? null;
      if (t.content !== undefined) {
        if (t.content === null) content = null;
        else {
          const result = validateRichContent(t.content);
          if (!result.ok) {
            throw new AppError(
              422,
              'RICH_CONTENT_INVALID',
              'Rich content is invalid',
              result.issues.map((x) => ({
                path: `translations[${i}].content${x.path}`,
                message: x.message,
              })),
            );
          }
          content = result.doc as Prisma.JsonObject;
        }
      }
      translations.set(t.locale, {
        locale: t.locale,
        title,
        slug,
        excerpt: merge(t.excerpt, prev?.excerpt),
        content,
        contentVersion:
          t.content !== undefined
            ? RICH_CONTENT_VERSION
            : (prev?.contentVersion ?? RICH_CONTENT_VERSION),
        wordCount: countWords(content),
        coverImageAlt: merge(t.coverImageAlt, prev?.coverImageAlt),
        seoTitle: merge(t.seoTitle, prev?.seoTitle),
        seoDescription: merge(t.seoDescription, prev?.seoDescription),
        contentHash: '',
        sourceLocale: prev?.sourceLocale ?? null,
        sourceHash: prev?.sourceHash ?? null,
      });
    }
    for (const t of translations.values()) t.contentHash = hashTranslation(t);
    for (const t of inputs) {
      if (t.sourceLocale === undefined) continue;
      const target = translations.get(t.locale)!;
      const source =
        t.sourceLocale === null ? undefined : translations.get(t.sourceLocale);
      if (t.sourceLocale !== null && (!source || source.locale === t.locale)) {
        throw new AppError(
          422,
          'UNKNOWN_LOCALE',
          `sourceLocale "${t.sourceLocale}" must be another locale of this article`,
        );
      }
      target.sourceLocale = source?.locale ?? null;
      target.sourceHash = source?.contentHash ?? null;
    }

    const categoryCode = input.categoryCode ?? base?.categoryCode;
    if (!categoryCode || categoryCode !== base?.categoryCode) {
      const category =
        categoryCode &&
        (await tx.articleCategory.findFirst({
          where: { code: categoryCode, isActive: true },
        }));
      if (!category)
        throw new AppError(
          422,
          'UNKNOWN_CATEGORY',
          `Unknown article category "${categoryCode}"`,
        );
    }
    const coverMediaId =
      input.coverMediaId === undefined
        ? (base?.coverMediaId ?? null)
        : (input.coverMediaId?.toLowerCase() ?? null);
    const mediaIds = new Set(
      [...translations.values()].flatMap((t) => collectMediaIds(t.content)),
    );
    if (coverMediaId) mediaIds.add(coverMediaId);
    const found = await tx.mediaAsset.findMany({
      where: { id: { in: [...mediaIds] } },
      select: { id: true },
    });
    const missing = [...mediaIds].filter(
      (mid) => !found.some((f) => f.id === mid),
    );
    if (missing.length)
      throw new AppError(
        422,
        'MEDIA_NOT_FOUND',
        'Referenced media does not exist',
        { mediaIds: missing },
      );

    return tx.articleRevision.create({
      data: {
        articleId,
        number: (base?.number ?? 0) + 1,
        categoryCode: categoryCode!,
        coverMediaId,
        isFeatured: input.isFeatured ?? base?.isFeatured ?? false,
        authorName: merge(input.authorName, base?.authorName),
        authorRole: merge(input.authorRole, base?.authorRole),
        createdById: actorId,
        translations: {
          createMany: {
            data: [...translations.values()].map((t) => ({
              ...t,
              content:
                (t.content as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
            })),
          },
        },
        mediaRefs: {
          createMany: { data: [...mediaIds].map((mediaId) => ({ mediaId })) },
        },
      },
    });
  }

  /** Reserves the draft and published slugs of an article and releases the ones it no longer uses. */
  private async syncSlugs(tx: Tx, articleId: string) {
    const select = { translations: { select: { locale: true, slug: true } } };
    const a = await tx.article.findUniqueOrThrow({
      where: { id: articleId },
      select: { draftRevision: { select }, publishedRevision: { select } },
    });
    const keep = [
      ...(a.draftRevision?.translations ?? []),
      ...(a.publishedRevision?.translations ?? []),
    ].filter(
      (k, i, all) =>
        all.findIndex((o) => o.locale === k.locale && o.slug === k.slug) === i,
    );
    for (const { locale, slug } of keep) {
      const owner = await tx.articleSlug.findUnique({
        where: { locale_slug: { locale, slug } },
      });
      if (owner && owner.articleId !== articleId) {
        throw new AppError(
          409,
          'SLUG_TAKEN',
          `Slug "${slug}" is already used in locale "${locale}"`,
          { locale, slug },
        );
      }
      if (!owner)
        await tx.articleSlug.create({ data: { locale, slug, articleId } });
    }
    await tx.articleSlug.deleteMany({
      where: { articleId, NOT: { OR: keep } },
    });
  }

  private toSummary(
    a: SummaryRow | DetailRow,
    media: Media,
  ): ArticleSummaryResponse {
    const d = a.draftRevision!;
    const state = translationStates(a);
    const cover = d.coverMediaId ? media.get(d.coverMediaId) : undefined;
    return {
      id: a.id,
      status: a.archivedAt
        ? ArticleStatus.ARCHIVED
        : a.publishedRevisionId
          ? ArticleStatus.PUBLISHED
          : ArticleStatus.DRAFT,
      hasUnpublishedChanges:
        a.publishedRevisionId !== null &&
        a.publishedRevisionId !== a.draftRevisionId,
      revision: d.number,
      categoryCode: d.categoryCode,
      isFeatured: d.isFeatured,
      authorName: d.authorName,
      coverMedia: cover
        ? {
            id: cover.id,
            url: cover.url,
            width: cover.width,
            height: cover.height,
          }
        : null,
      translations: d.translations.map((t): ArticleTranslationSummary => ({
        locale: t.locale,
        title: t.title,
        slug: t.slug,
        ...state(t),
        readTimeMinutes: readTime(t.wordCount),
      })),
      publication: a.publishedRevision
        ? {
            revision: a.publishedRevision.number,
            firstPublishedAt: a.firstPublishedAt!,
            lastPublishedAt: a.lastPublishedAt!,
            liveLocales: a.publishedLocales.map((p) => p.locale),
          }
        : null,
      archivedAt: a.archivedAt,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      updatedBy: d.createdBy,
    };
  }

  private toPublicSummary(
    a: {
      id: string;
      firstPublishedAt: Date | null;
      lastPublishedAt: Date | null;
    },
    r: PublicRevision,
    locale: string,
    media: Media,
  ): PublicArticleSummary {
    const t = r.translations.find((x) => x.locale === locale)!;
    const cover = r.coverMediaId ? media.get(r.coverMediaId) : undefined;
    return {
      id: a.id,
      locale,
      slug: t.slug,
      title: t.title,
      excerpt: t.excerpt,
      category: {
        code: r.categoryCode,
        name:
          r.category.translations.find((c) => c.locale === locale)?.name ??
          r.categoryCode,
      },
      cover: cover
        ? {
            url: cover.url,
            width: cover.width,
            height: cover.height,
            alt: t.coverImageAlt ?? cover.alt[locale] ?? null,
          }
        : null,
      isFeatured: r.isFeatured,
      authorName: r.authorName,
      authorRole: r.authorRole,
      readTimeMinutes: readTime(t.wordCount),
      publishedAt: a.firstPublishedAt,
      updatedAt: a.lastPublishedAt,
    };
  }

  private async toPublic(
    a: {
      id: string;
      firstPublishedAt: Date | null;
      lastPublishedAt: Date | null;
    },
    r: PublicRevision,
    locale: string,
    alternates: { locale: string; slug: string }[],
  ): Promise<PublicArticle> {
    const t = r.translations.find((x) => x.locale === locale)!;
    const media = await this.media.resolveMany([
      ...collectMediaIds(t.content),
      ...(r.coverMediaId ? [r.coverMediaId] : []),
    ]);
    return {
      // oxlint-disable-next-line no-misused-spread -- plain object typed by its DTO class
      ...this.toPublicSummary(a, r, locale, media),
      content: hydrateContent(t.content, (mid) => {
        const m = media.get(mid);
        return m && { url: m.url, alt: m.alt[locale] };
      }) as Record<string, unknown> | null,
      seo: {
        title: t.seoTitle ?? t.title,
        description: t.seoDescription ?? t.excerpt,
      },
      alternates,
    };
  }
}
