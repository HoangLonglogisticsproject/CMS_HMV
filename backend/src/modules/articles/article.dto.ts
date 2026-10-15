import {
  ApiProperty,
  ApiPropertyOptional,
  type ApiPropertyOptions,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LOCALE_RE, PageMeta, PageQuery, UserRef } from '../../common/dto';

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const RICH_CONTENT_SCHEMA: ApiPropertyOptions = {
  type: 'object',
  additionalProperties: true,
  nullable: true,
  description:
    'Tiptap/ProseMirror JSON, rich content schema v1. Nodes: doc, paragraph, text, heading(level 2|3), blockquote, ' +
    'bulletList, orderedList, listItem, codeBlock, hardBreak, horizontalRule, image(mediaId required; src is ignored on input ' +
    'and resolved on output). Marks: bold, italic, strike, underline, code, link(href http/https/mailto/tel or site-relative). ' +
    'Max 256 KiB.',
};

// ---------- Requests ----------

export class TranslationInput {
  @ApiProperty({ pattern: LOCALE_RE.source, example: 'vi' })
  @Matches(LOCALE_RE)
  locale: string;

  /** Required when adding a locale. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  /** Lowercase ASCII words joined by single hyphens. Unique per locale across all articles. Required when adding a locale. */
  @ApiPropertyOptional({
    pattern: SLUG_RE.source,
    example: 'chuoi-cung-ung-ca-phe',
  })
  @IsOptional()
  @Matches(SLUG_RE, {
    message: 'slug must be lowercase ASCII words separated by single hyphens',
  })
  @MaxLength(200)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  excerpt?: string | null;

  @ApiPropertyOptional(RICH_CONTENT_SCHEMA)
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown> | null;

  /** Alt text for the cover image in this locale. Falls back to the asset's default alt. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImageAlt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  seoTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  seoDescription?: string | null;

  /**
   * Declares this translation was produced from another locale of the same draft; the server records that locale's
   * current content hash so later source edits flag this translation as outdated. `null` clears it.
   */
  @IsOptional()
  @Matches(LOCALE_RE)
  sourceLocale?: string | null;
}

export class CreateArticleDto {
  /** Stable category code from GET /admin/article-categories. */
  @IsString()
  @MaxLength(64)
  categoryCode: string;

  @IsOptional()
  @IsUUID()
  coverMediaId?: string | null;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  authorName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  authorRole?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TranslationInput)
  translations: TranslationInput[];
}

/**
 * Partial update of the draft. Omitted fields keep their value, `null` clears a nullable field.
 * Translations are merged per locale: only the listed locales change. Every save creates a new revision.
 */
export class UpdateArticleDraftDto extends PartialType(CreateArticleDto) {
  /** The `revision` the client last loaded. A mismatch returns 409 REVISION_CONFLICT instead of overwriting. */
  @IsInt()
  @Min(1)
  expectedRevision: number;
}

export class RevisionRefDto {
  @IsInt()
  @Min(1)
  expectedRevision: number;
}

export enum ArticleStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export const ARTICLE_SORTS = [
  'updatedAt',
  '-updatedAt',
  'createdAt',
  '-createdAt',
  'lastPublishedAt',
  '-lastPublishedAt',
] as const;

export class ListArticlesQuery extends PageQuery {
  /** Omitted: every non-archived article. */
  @IsOptional()
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  /** Case-insensitive match on draft title or slug in any locale. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /** true: only non-archived articles with at least one draft translation that is not approved. */
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  awaitingReview?: boolean;

  @IsOptional()
  @IsIn(ARTICLE_SORTS)
  @ApiPropertyOptional({ enum: ARTICLE_SORTS, default: '-updatedAt' })
  sort: (typeof ARTICLE_SORTS)[number] = '-updatedAt';
}

export class LocaleQuery {
  @Matches(LOCALE_RE)
  locale: string;
}

export class PublicLocaleQuery {
  @IsOptional()
  @Matches(LOCALE_RE)
  @ApiPropertyOptional({ pattern: LOCALE_RE.source, default: 'vi' })
  locale: string = 'vi';
}

export class PublicArticlesQuery extends PageQuery {
  @IsOptional()
  @Matches(LOCALE_RE)
  @ApiPropertyOptional({ pattern: LOCALE_RE.source, default: 'vi' })
  locale: string = 'vi';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;
}

// ---------- Admin responses ----------

export enum TranslationReviewStatus {
  UNREVIEWED = 'UNREVIEWED',
  APPROVED = 'APPROVED',
}

export class ArticleTranslationSummary {
  locale: string;
  title: string;
  slug: string;
  /** APPROVED when a reviewer approved exactly this content (any edit resets it). */
  reviewStatus: TranslationReviewStatus;
  /** The locale is served by the public API. */
  isLive: boolean;
  /** The draft differs from what the public sees (always true when not live). */
  hasUnpublishedChanges: boolean;
  /** The source locale changed after this translation was made. */
  isOutdated: boolean;
  readTimeMinutes: number;
}

export class ArticleTranslationResponse extends ArticleTranslationSummary {
  excerpt: string | null;
  @ApiProperty(RICH_CONTENT_SCHEMA)
  content: Record<string, unknown> | null;
  contentVersion: number;
  coverImageAlt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  /** SHA-256 of the localized fields. Approvals bind to it. */
  contentHash: string;
  wordCount: number;
  sourceLocale: string | null;
}

export class MediaRef {
  id: string;
  url: string;
  width: number;
  height: number;
}

export class PublicationInfo {
  /** Revision number the public sees. */
  revision: number;
  firstPublishedAt: Date;
  lastPublishedAt: Date;
  liveLocales: string[];
}

export class ArticleSummaryResponse {
  id: string;
  status: ArticleStatus;
  /** Published, and the draft has moved past the published revision. */
  hasUnpublishedChanges: boolean;
  /** Current draft revision number. Send it back as `expectedRevision`. */
  revision: number;
  categoryCode: string;
  isFeatured: boolean;
  authorName: string | null;
  coverMedia: MediaRef | null;
  translations: ArticleTranslationSummary[];
  publication: PublicationInfo | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Author of the current draft revision. */
  updatedBy: UserRef;
}

export class ArticleDetailResponse extends OmitType(ArticleSummaryResponse, [
  'translations',
] as const) {
  authorRole: string | null;
  translations: ArticleTranslationResponse[];
  createdBy: UserRef;
}

/** Counts across all pages, for the list's metric strip. */
export class ArticleStatsResponse {
  /** Non-archived articles. */
  total: number;
  /** Non-archived, never published. */
  draft: number;
  /** Non-archived, published. */
  published: number;
  archived: number;
  /** Non-archived with at least one draft translation that is not approved (same rule as `awaitingReview=true`). */
  awaitingReview: number;
  /** Non-archived with the featured flag set on the current draft. */
  featured: number;
}

export class ArticleListResponse extends PageMeta {
  items: ArticleSummaryResponse[];
}

export class LocalizedName {
  locale: string;
  name: string;
}

export class ArticleCategoryResponse {
  code: string;
  sortOrder: number;
  names: LocalizedName[];
}

// ---------- Public responses (also used by the admin draft preview) ----------

export class PublicCategory {
  code: string;
  name: string;
}

export class PublicCover {
  url: string;
  width: number;
  height: number;
  alt: string | null;
}

export class PublicSeo {
  title: string;
  description: string | null;
}

export class PublicAlternate {
  locale: string;
  slug: string;
}

export class PublicArticleSummary {
  id: string;
  locale: string;
  slug: string;
  title: string;
  excerpt: string | null;
  category: PublicCategory;
  cover: PublicCover | null;
  isFeatured: boolean;
  authorName: string | null;
  authorRole: string | null;
  readTimeMinutes: number;
  /** First publication. Null only in draft previews. */
  publishedAt: Date | null;
  updatedAt: Date | null;
}

export class PublicArticle extends PublicArticleSummary {
  @ApiProperty({
    ...RICH_CONTENT_SCHEMA,
    description: 'Rich content v1 with image src/alt resolved',
  })
  content: Record<string, unknown> | null;
  seo: PublicSeo;
  /** The same article in other live locales (for hreflang). */
  alternates: PublicAlternate[];
}

export class PublicArticleListResponse extends PageMeta {
  items: PublicArticleSummary[];
}
