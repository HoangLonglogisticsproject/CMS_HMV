import { Injectable } from '@nestjs/common';
import { PageReviewStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { type Actor, audit } from '../../common/audit';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { stableStringify } from '../articles/rich-content';
import {
  PageDetailResponse,
  PageListResponse,
  PageRevisionRefDto,
  PageSummaryResponse,
  PageTranslationResponse,
  PageTranslationState,
  PageTranslationSummary,
  PublicPage,
  RequestPageChangesDto,
  SavePageDraftDto,
} from './page.dto';
import {
  AboutPageContent,
  CONTENT_VERSION,
  missingFields,
  validatePageContent,
} from './page-content.dto';

type Db = Prisma.TransactionClient | PrismaService;

const PAGE_INCLUDE = {
  // The draft is the highest revision; vi sorts before en.
  revisions: {
    orderBy: { number: 'desc' },
    take: 1,
    include: { translations: { orderBy: { locale: 'desc' } } },
  },
  reviews: true,
  publishedLocales: {
    include: {
      revision: {
        select: {
          number: true,
          translations: { select: { locale: true, contentHash: true } },
        },
      },
    },
  },
} satisfies Prisma.PageInclude;
type LoadedPage = Prisma.PageGetPayload<{ include: typeof PAGE_INCLUDE }>;
type Translation = LoadedPage['revisions'][number]['translations'][number];

interface DraftTranslation {
  locale: string;
  content: Prisma.JsonValue;
  contentVersion: number;
  seoTitle: string | null;
  seoDescription: string | null;
}

/** What a reviewer approves and what gets published: content and SEO of one locale. */
const hashOf = (t: DraftTranslation) =>
  createHash('sha256')
    .update(
      stableStringify({
        content: t.content,
        contentVersion: t.contentVersion,
        seoTitle: t.seoTitle,
        seoDescription: t.seoDescription,
      }),
    )
    .digest('hex');

/** undefined = keep, null/blank = clear. */
const merge = (value: string | null | undefined, previous: string | null) =>
  value === undefined ? previous : value?.trim() || null;

const heroOf = (content: Prisma.JsonValue) =>
  (content as { hero?: { title?: string; lead?: string } } | null)?.hero;

@Injectable()
export class PagesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PageListResponse> {
    const pages = await this.prisma.page.findMany({
      include: PAGE_INCLUDE,
      orderBy: { key: 'asc' },
    });
    return { items: pages.map((p) => this.summary(p)) };
  }

  async get(key: string): Promise<PageDetailResponse> {
    const page = await this.load(this.prisma, key);
    const history = await this.prisma.pageRevision.findMany({
      where: { pageId: page.id },
      orderBy: { number: 'desc' },
      take: 20,
      include: {
        createdBy: { select: { id: true, displayName: true } },
        translations: { select: { locale: true } },
      },
    });
    const { title, revision, updatedAt } = this.summary(page);
    return {
      key,
      title,
      revision,
      updatedAt,
      translations: (page.revisions[0]?.translations ?? []).map((t) =>
        this.translation(page, t),
      ),
      history: history.map((r) => ({
        number: r.number,
        createdAt: r.createdAt,
        createdBy: r.createdBy,
        locales: r.translations.map((t) => t.locale).sort(),
      })),
    };
  }

  /** Inserts revision N+1. Locales not listed are copied unchanged; published content is never touched. */
  async saveDraft(
    key: string,
    dto: SavePageDraftDto,
    actor: Actor,
  ): Promise<PageDetailResponse> {
    await this.transaction(async (tx) => {
      const page = await this.load(tx, key);
      const base = this.assertRevision(page, dto.expectedRevision);
      const drafts = new Map<string, DraftTranslation>(
        (base?.translations ?? []).map((t) => [
          t.locale,
          {
            locale: t.locale,
            content: t.content,
            contentVersion: t.contentVersion,
            seoTitle: t.seoTitle,
            seoDescription: t.seoDescription,
          },
        ]),
      );
      const seen = new Set<string>();
      for (const [i, input] of dto.translations.entries()) {
        const at = `translations[${i}]`;
        if (seen.has(input.locale))
          throw new AppError(
            400,
            'VALIDATION_FAILED',
            'Request validation failed',
            [{ path: `${at}.locale`, message: 'Duplicate locale' }],
          );
        seen.add(input.locale);
        const previous = drafts.get(input.locale);
        if (!previous) {
          await this.assertLocale(tx, input.locale, 422);
          if (input.content === undefined)
            throw new AppError(
              422,
              'TRANSLATION_INCOMPLETE',
              'Content is required when adding a locale',
              [{ path: `${at}.content`, message: 'Required' }],
            );
        }
        if (input.content !== undefined) {
          const issues = await validatePageContent(
            key,
            input.content,
            `${at}.content`,
          );
          if (issues.length)
            throw new AppError(
              400,
              'VALIDATION_FAILED',
              'Page content is invalid',
              issues,
            );
        }
        drafts.set(input.locale, {
          locale: input.locale,
          content: (input.content ?? previous!.content) as Prisma.JsonValue,
          contentVersion:
            input.content === undefined
              ? previous!.contentVersion
              : CONTENT_VERSION,
          seoTitle: merge(input.seoTitle, previous?.seoTitle ?? null),
          seoDescription: merge(
            input.seoDescription,
            previous?.seoDescription ?? null,
          ),
        });
      }
      const revision = await tx.pageRevision.create({
        data: {
          pageId: page.id,
          number: (base?.number ?? 0) + 1,
          createdById: actor.userId!,
          translations: {
            createMany: {
              data: [...drafts.values()].map((t) => ({
                ...t,
                content: t.content as Prisma.InputJsonValue,
                contentHash: hashOf(t),
              })),
            },
          },
        },
      });
      await audit(tx, actor, 'page.update_draft', 'page', page.id, {
        key,
        revision: revision.number,
        locales: [...seen],
      });
    });
    return this.get(key);
  }

  /** Editor hands a complete translation to reviewers. Re-submitting unchanged content is a no-op. */
  submit(key: string, locale: string, dto: PageRevisionRefDto, actor: Actor) {
    return this.review(
      key,
      locale,
      dto.expectedRevision,
      actor,
      'page.submit_translation',
      (t, state) => {
        const missing = missingFields(t.content);
        if (missing.length)
          throw new AppError(
            422,
            'TRANSLATION_INCOMPLETE',
            'Fill every field before submitting for review',
            missing,
          );
        if (
          state === PageTranslationState.IN_REVIEW ||
          state === PageTranslationState.APPROVED
        )
          return null;
        return { status: PageReviewStatus.IN_REVIEW, note: null };
      },
    );
  }

  approve(key: string, locale: string, dto: PageRevisionRefDto, actor: Actor) {
    return this.review(
      key,
      locale,
      dto.expectedRevision,
      actor,
      'page.approve_translation',
      (_t, state) => {
        if (state === PageTranslationState.APPROVED) return null;
        if (state !== PageTranslationState.IN_REVIEW)
          throw new AppError(
            409,
            'TRANSLATION_NOT_SUBMITTED',
            `The ${locale} translation has not been submitted for review`,
          );
        return { status: PageReviewStatus.APPROVED, note: null };
      },
    );
  }

  requestChanges(
    key: string,
    locale: string,
    dto: RequestPageChangesDto,
    actor: Actor,
  ) {
    return this.review(
      key,
      locale,
      dto.expectedRevision,
      actor,
      'page.request_changes',
      (_t, state) => {
        if (
          state !== PageTranslationState.IN_REVIEW &&
          state !== PageTranslationState.APPROVED
        )
          throw new AppError(
            409,
            'TRANSLATION_NOT_SUBMITTED',
            `The ${locale} translation has not been submitted for review`,
          );
        return {
          status: PageReviewStatus.CHANGES_REQUESTED,
          note: dto.note.trim(),
        };
      },
    );
  }

  /** Makes the approved draft of one locale live. Other locales keep what they serve. */
  async publish(
    key: string,
    locale: string,
    dto: PageRevisionRefDto,
    actor: Actor,
  ): Promise<PageDetailResponse> {
    await this.transaction(async (tx) => {
      const page = await this.load(tx, key);
      const t = this.draftTranslation(page, dto.expectedRevision, locale);
      if (this.state(page, t) !== PageTranslationState.APPROVED)
        throw new AppError(
          409,
          'TRANSLATION_NOT_APPROVED',
          `The ${locale} translation must be approved before publishing`,
          { locales: [locale] },
        );
      if (this.publishedHash(page, locale) === t.contentHash) return; // already live
      const now = new Date();
      const revisionId = page.revisions[0].id;
      await tx.pagePublishedLocale.upsert({
        where: { pageId_locale: { pageId: page.id, locale } },
        create: {
          pageId: page.id,
          locale,
          revisionId,
          firstPublishedAt: now,
          publishedAt: now,
          publishedById: actor.userId!,
        },
        update: { revisionId, publishedAt: now, publishedById: actor.userId! },
      });
      await audit(tx, actor, 'page.publish_translation', 'page', page.id, {
        key,
        locale,
        revision: dto.expectedRevision,
        contentHash: t.contentHash,
      });
    });
    return this.get(key);
  }

  /** Published content of one locale. Drafts, reviews and unpublished locales are never read here. */
  async publicGet(key: string, locale: string): Promise<PublicPage> {
    await this.assertLocale(this.prisma, locale, 400);
    const live = await this.prisma.pagePublishedLocale.findFirst({
      where: { locale, page: { key } },
      include: {
        revision: { include: { translations: { where: { locale } } } },
        page: {
          include: {
            publishedLocales: {
              select: { locale: true },
              orderBy: { locale: 'asc' },
            },
          },
        },
      },
    });
    const t = live?.revision.translations[0];
    if (!live || !t)
      throw new AppError(404, 'PAGE_NOT_FOUND', 'Page not found');
    const hero = heroOf(t.content)!;
    return {
      key,
      locale,
      title: hero.title!,
      seo: {
        title: t.seoTitle ?? hero.title!,
        description: t.seoDescription ?? hero.lead ?? null,
      },
      content: t.content as unknown as AboutPageContent,
      publishedAt: live.firstPublishedAt,
      updatedAt: live.publishedAt,
      alternates: live.page.publishedLocales.filter((p) => p.locale !== locale),
    };
  }

  // ---------- Internals ----------

  /** One review step on the current draft of a locale. `decide` returns null when nothing changes. */
  private async review(
    key: string,
    locale: string,
    expectedRevision: number,
    actor: Actor,
    action: string,
    decide: (
      t: Translation,
      state: PageTranslationState,
    ) => { status: PageReviewStatus; note: string | null } | null,
  ): Promise<PageDetailResponse> {
    await this.transaction(async (tx) => {
      const page = await this.load(tx, key);
      const t = this.draftTranslation(page, expectedRevision, locale);
      const next = decide(t, this.state(page, t));
      if (!next) return;
      const data = {
        contentHash: t.contentHash,
        ...next,
        actorId: actor.userId!,
        updatedAt: new Date(),
      };
      // ponytail: last write wins if two reviewers act on the same locale at once; add a review version if that ever matters.
      await tx.pageTranslationReview.upsert({
        where: { pageId_locale: { pageId: page.id, locale } },
        create: { pageId: page.id, locale, ...data },
        update: data,
      });
      await audit(tx, actor, action, 'page', page.id, {
        key,
        locale,
        revision: expectedRevision,
        contentHash: t.contentHash,
        ...(next.note ? { note: next.note } : {}),
      });
    });
    return this.get(key);
  }

  private async load(db: Db, key: string): Promise<LoadedPage> {
    const page = await db.page.findUnique({
      where: { key },
      include: PAGE_INCLUDE,
    });
    if (!page) throw new AppError(404, 'PAGE_NOT_FOUND', 'Page not found');
    return page;
  }

  private assertRevision(page: LoadedPage, expected: number) {
    const draft = page.revisions[0] ?? null;
    const current = draft?.number ?? 0;
    if (current !== expected)
      throw new AppError(
        409,
        'REVISION_CONFLICT',
        `Draft is at revision ${current}, not ${expected}; reload and retry`,
        {
          currentRevision: current,
        },
      );
    return draft;
  }

  private draftTranslation(
    page: LoadedPage,
    expected: number,
    locale: string,
  ): Translation {
    const t = this.assertRevision(page, expected)?.translations.find(
      (x) => x.locale === locale,
    );
    if (!t)
      throw new AppError(
        404,
        'TRANSLATION_NOT_FOUND',
        `The draft has no ${locale} translation`,
      );
    return t;
  }

  private async assertLocale(db: Db, locale: string, status: 400 | 422) {
    const found = await db.locale.findFirst({
      where: { code: locale, isActive: true },
    });
    if (!found)
      throw new AppError(
        status,
        'UNKNOWN_LOCALE',
        `Unknown locale "${locale}"`,
        status === 422 ? { locales: [locale] } : undefined,
      );
  }

  /** Reviews bind to a content hash: once the content changes, the locale is back to DRAFT. */
  private state(page: LoadedPage, t: Translation): PageTranslationState {
    const review = page.reviews.find((r) => r.locale === t.locale);
    return review && review.contentHash === t.contentHash
      ? (review.status as PageTranslationState)
      : PageTranslationState.DRAFT;
  }

  private publishedHash(page: LoadedPage, locale: string) {
    return page.publishedLocales
      .find((p) => p.locale === locale)
      ?.revision.translations.find((t) => t.locale === locale)?.contentHash;
  }

  private translationSummary(
    page: LoadedPage,
    t: Translation,
  ): PageTranslationSummary {
    const live = page.publishedLocales.some((p) => p.locale === t.locale);
    return {
      locale: t.locale,
      state: this.state(page, t),
      isLive: live,
      hasUnpublishedChanges:
        !live || this.publishedHash(page, t.locale) !== t.contentHash,
    };
  }

  private translation(
    page: LoadedPage,
    t: Translation,
  ): PageTranslationResponse {
    const review = page.reviews.find((r) => r.locale === t.locale);
    const live = page.publishedLocales.find((p) => p.locale === t.locale);
    const { state, isLive, hasUnpublishedChanges } = this.translationSummary(
      page,
      t,
    );
    return {
      locale: t.locale,
      state,
      isLive,
      hasUnpublishedChanges,
      content: t.content as unknown as AboutPageContent,
      contentVersion: t.contentVersion,
      seoTitle: t.seoTitle,
      seoDescription: t.seoDescription,
      contentHash: t.contentHash,
      // Kept after edits so the editor can see what to fix; cleared once approved or re-submitted.
      reviewNote:
        review?.status === PageReviewStatus.CHANGES_REQUESTED
          ? review.note
          : null,
      missingFields: missingFields(t.content).map((i) => i.path),
      publishedRevision: live?.revision.number ?? null,
      publishedAt: live?.publishedAt ?? null,
    };
  }

  private summary(page: LoadedPage): PageSummaryResponse {
    const draft = page.revisions[0];
    return {
      key: page.key,
      title: heroOf(draft?.translations[0]?.content ?? null)?.title || null,
      revision: draft?.number ?? 0,
      updatedAt: draft?.createdAt ?? null,
      translations: (draft?.translations ?? []).map((t) =>
        this.translationSummary(page, t),
      ),
    };
  }

  /** Two saves racing on the same revision number: the loser gets 409 instead of a 500. */
  private async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        (err.meta as { modelName?: string } | undefined)?.modelName ===
          'PageRevision'
      )
        throw new AppError(
          409,
          'REVISION_CONFLICT',
          'The draft was saved by someone else; reload and retry',
        );
      throw err;
    }
  }
}
