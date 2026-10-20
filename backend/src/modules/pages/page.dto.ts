import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LOCALE_RE, UserRef } from '../../common/dto';
import { PublicSeo } from '../articles/article.dto';
import { AboutPageContent } from './page-content.dto';

export const PAGE_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------- Requests ----------

export class PageTranslationInput {
  @ApiProperty({ pattern: LOCALE_RE.source, example: 'vi' })
  @Matches(LOCALE_RE)
  locale: string;

  /** Full content for this locale; its shape depends on the page key (`about`: AboutPageContent). Omitted = unchanged. Required when adding a locale. */
  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({ type: () => AboutPageContent })
  content?: Record<string, unknown>;

  /** Omitted = unchanged, null or blank = use the page title. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  seoTitle?: string | null;

  /** Omitted = unchanged, null or blank = use the page lead. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  seoDescription?: string | null;
}

/** Saves a new draft revision. Only the listed locales change; the others are copied from the current draft. */
export class SavePageDraftDto {
  /** The `revision` the client last loaded (0 for a page that was never saved). A mismatch returns 409 REVISION_CONFLICT. */
  @IsInt()
  @Min(0)
  expectedRevision: number;

  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PageTranslationInput)
  translations: PageTranslationInput[];
}

export class PageRevisionRefDto {
  @IsInt()
  @Min(1)
  expectedRevision: number;
}

export class RequestPageChangesDto extends PageRevisionRefDto {
  /** What the editor needs to change. Shown to editors until the translation is approved. */
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  note: string;
}

// ---------- Admin responses ----------

/** Workflow state of the current draft content of one locale. Any edit returns it to DRAFT. */
export enum PageTranslationState {
  DRAFT = 'DRAFT',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  CHANGES_REQUESTED = 'CHANGES_REQUESTED',
}

export class PageTranslationSummary {
  locale: string;
  state: PageTranslationState;
  /** The locale is served by the public API. */
  isLive: boolean;
  /** The draft differs from what the public sees (always true when not live). */
  hasUnpublishedChanges: boolean;
}

export class PageTranslationResponse extends PageTranslationSummary {
  content: AboutPageContent;
  contentVersion: number;
  seoTitle: string | null;
  seoDescription: string | null;
  /** SHA-256 of content + SEO fields. Reviews and publications bind to it. */
  contentHash: string;
  /** The reviewer's note from the last "request changes", until the translation is approved. */
  reviewNote: string | null;
  /** Fields that must be filled before this translation can be submitted. */
  missingFields: string[];
  /** Revision the live locale is served from. */
  publishedRevision: number | null;
  publishedAt: Date | null;
}

export class PageRevisionSummary {
  number: number;
  createdAt: Date;
  createdBy: UserRef;
  /** Locales present in this revision. */
  locales: string[];
}

export class PageSummaryResponse {
  key: string;
  /** Draft title in the first available locale (vi first); null when never saved. */
  title: string | null;
  /** Current draft revision; 0 when the page was never saved. */
  revision: number;
  updatedAt: Date | null;
  translations: PageTranslationSummary[];
}

export class PageListResponse {
  items: PageSummaryResponse[];
}

export class PageDetailResponse {
  key: string;
  /** Draft title in the first available locale (vi first); null when never saved. */
  title: string | null;
  /** Current draft revision; 0 when the page was never saved. Send it back as `expectedRevision`. */
  revision: number;
  updatedAt: Date | null;
  translations: PageTranslationResponse[];
  /** Latest revisions first (at most 20). */
  history: PageRevisionSummary[];
}

// ---------- Public responses ----------

export class PublicPageAlternate {
  locale: string;
}

export class PublicPage {
  key: string;
  locale: string;
  title: string;
  seo: PublicSeo;
  content: AboutPageContent;
  /** First publication of this locale. */
  publishedAt: Date;
  /** Latest publication of this locale. */
  updatedAt: Date;
  /** Other live locales of the same page (same URL on the website). */
  alternates: PublicPageAlternate[];
}
