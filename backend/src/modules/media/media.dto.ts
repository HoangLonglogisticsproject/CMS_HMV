import { ApiPropertyOptional } from '@nestjs/swagger';
import { MediaCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LOCALE_RE, PageMeta, PageQuery, UserRef } from '../../common/dto';

export class UploadMediaDto {
  /** Internal display title. Defaults to the file name. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsEnum(MediaCategory)
  category?: MediaCategory;
}

export class MediaAltTextInput {
  @Matches(LOCALE_RE)
  locale: string;

  /** Default alt text for this locale. `null` or "" removes it. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  altText: string | null;
}

export class UpdateMediaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  /** `null` clears the category. */
  @IsOptional()
  @IsEnum(MediaCategory)
  category?: MediaCategory | null;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MediaAltTextInput)
  altTexts?: MediaAltTextInput[];
}

export const MEDIA_SORTS = [
  'createdAt',
  '-createdAt',
  'title',
  '-title',
  'byteSize',
  '-byteSize',
] as const;

export class ListMediaQuery extends PageQuery {
  @IsOptional()
  @IsEnum(MediaCategory)
  category?: MediaCategory;

  /** Matches title, file name or alt text (case-insensitive). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(MEDIA_SORTS)
  @ApiPropertyOptional({ enum: MEDIA_SORTS, default: '-createdAt' })
  sort: (typeof MEDIA_SORTS)[number] = '-createdAt';
}

export class MediaAltText {
  locale: string;
  altText: string;
}

export class MediaAssetResponse {
  id: string;
  /** Public URL of the stored object. */
  url: string;
  title: string;
  category: MediaCategory | null;
  /** Detected from the file bytes. */
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  originalFilename: string;
  checksumSha256: string;
  /** Default alt text per locale. Usages (article cover, inline images) may override it. */
  altTexts: MediaAltText[];
  uploadedBy: UserRef;
  createdAt: Date;
  updatedAt: Date;
}

export class MediaListResponse extends PageMeta {
  items: MediaAssetResponse[];
}

export class LocalizedTitle {
  locale: string;
  title: string;
}

export enum MediaUsageContext {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
}

export class MediaUsage {
  entityType: string; // "ARTICLE"
  entityId: string;
  revisionNumber: number;
  /** Whether the referencing revision is the current draft, the published one, or both. */
  contexts: MediaUsageContext[];
  titles: LocalizedTitle[];
}

export class MediaUsageResponse {
  mediaId: string;
  /** True when a current draft or published revision references the asset. Such assets must not be deleted. */
  inUse: boolean;
  usages: MediaUsage[];
  /** Older revisions that still reference the asset (kept for history). */
  historicalRevisionCount: number;
}
