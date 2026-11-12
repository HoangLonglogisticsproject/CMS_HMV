import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InquiryNotificationStatus, TradeInquiryStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PageMeta, PageQuery, UserRef } from '../../common/dto';
import { INQUIRY_GOALS, INQUIRY_LOCALES } from './inquiry-contract';

// ---------- Ingestion (website server → CMS) ----------
// Lengths and formats match or are stricter than the website's validation (src/features/trade-desk/validation.js).
// Unknown fields are refused by the global ValidationPipe (forbidNonWhitelisted).

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PATH = /^\/(?!\/)[^?#\s]*$/;
const ORIGIN = /^https?:\/\/[^/?#\s]+$/;
const UTM = /^[\w.+\- ]*$/;
/** Inbox date filters: YYYY-MM-DD, or a date-time with an optional offset. */
const FILTER_DATE =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

export class InquiryVolumeDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(20)
  @Matches(/^([0-9][0-9.,\s]*)?$/)
  amount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;
}

export class InquiryContactDto {
  @IsString()
  @Transform(trim)
  @MinLength(2)
  @MaxLength(150)
  company: string;

  @IsString()
  @Transform(trim)
  @MaxLength(254)
  @Matches(EMAIL, { message: 'email must be an email address' })
  email: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(40)
  @Matches(/^[+0-9()\s.-]*$/)
  phone?: string;
}

export class InquiryUtmDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(UTM)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(UTM)
  medium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(UTM)
  campaign?: string;
}

/** Where the buyer came from: a same-site path and a referrer origin only (never a query string or a referrer path). */
export class InquirySourceDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @ValidateIf((_, v) => v !== '')
  @Matches(PATH)
  landingPage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ValidateIf((_, v) => v !== '')
  @Matches(ORIGIN)
  referrer?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => InquiryUtmDto)
  utm?: InquiryUtmDto;
}

export class IngestTradeInquiryDto {
  @IsIn(INQUIRY_LOCALES)
  locale: (typeof INQUIRY_LOCALES)[number];

  @IsIn(INQUIRY_GOALS)
  goal: (typeof INQUIRY_GOALS)[number];

  /** Website product id; required for sourcing. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  productId?: string | null;

  /** Cargo or goods description; required for logistics and customs. */
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(200)
  goods?: string;

  /** Sourcing: an origin id ("vietnam"); otherwise free text. */
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(120)
  origin?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(120)
  destination?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => InquiryVolumeDto)
  volume?: InquiryVolumeDto;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  application?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  transport?: string;

  /** Controlled requirement key → value (a choice requirement's option id). Checked against the contract. */
  @IsObject()
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  requirements: Record<string, string>;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  notes?: string;

  // An object: arrays, null and scalars are refused here, before the service reads its fields.
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => InquiryContactDto)
  contact: InquiryContactDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => InquirySourceDto)
  source?: InquirySourceDto;

  /** When the buyer ticked the contact-consent box (the submission time). */
  @IsISO8601({ strict: true })
  consentAt: string;
}

export class IngestTradeInquiryResponse {
  /** HMV-YYYY-XXXXXX: the reference the website shows the buyer. */
  reference: string;
  /** True when this idempotency key was already received: the existing inquiry is returned, nothing is created. */
  duplicate: boolean;
}

// ---------- Admin (sales inbox) ----------

export class TradeInquiryListQuery extends PageQuery {
  @IsOptional()
  @IsIn(Object.values(TradeInquiryStatus))
  @ApiPropertyOptional({
    enum: TradeInquiryStatus,
    enumName: 'TradeInquiryStatus',
  })
  status?: TradeInquiryStatus;

  @IsOptional()
  @IsIn(INQUIRY_GOALS)
  @ApiPropertyOptional({ enum: INQUIRY_GOALS })
  goal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  productId?: string;

  @IsOptional()
  @IsIn(INQUIRY_LOCALES)
  @ApiPropertyOptional({ enum: INQUIRY_LOCALES })
  locale?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  /** Only inquiries with nobody assigned. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unassigned?: boolean;

  /** Received on or after: a date is 00:00 of that Vietnam day; a date-time without an offset is Vietnam time. */
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(FILTER_DATE)
  dateFrom?: string;

  /** Received before the end of this Vietnam day (date), or before this instant (date-time). */
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(FILTER_DATE)
  dateTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utmSource?: string;

  /** Reference, company, email, contact name, product or destination (case-insensitive). */
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  search?: string;
}

export class TradeInquirySummary {
  id: string;
  reference: string;
  @ApiProperty({ enum: TradeInquiryStatus, enumName: 'TradeInquiryStatus' })
  status: TradeInquiryStatus;
  createdAt: Date;
  locale: string;
  goal: string;
  productId: string | null;
  productName: string | null;
  goods: string | null;
  destination: string | null;
  volumeAmount: string | null;
  volumeUnit: string | null;
  company: string;
  contactName: string | null;
  utmSource: string | null;
  referrerOrigin: string | null;
  assignedTo: UserRef | null;
  @ApiProperty({
    enum: InquiryNotificationStatus,
    enumName: 'InquiryNotificationStatus',
  })
  notificationStatus: InquiryNotificationStatus;
  lastActivityAt: Date;
}

export class TradeInquiryListResponse extends PageMeta {
  items: TradeInquirySummary[];
}

export class TradeInquiryStatsResponse {
  total: number;
  new: number;
  contacted: number;
  qualified: number;
  quoted: number;
  won: number;
  lost: number;
  /** Received since 00:00 Vietnam time (UTC+7). */
  today: number;
  last7Days: number;
}

export class InquiryRequirement {
  key: string;
  label: string;
  value: string;
}

export class TradeInquiryNoteResponse {
  id: string;
  body: string;
  createdAt: Date;
  createdBy: UserRef;
}

export class TradeInquiryDetailResponse extends TradeInquirySummary {
  origin: string | null;
  application: string | null;
  transport: string | null;
  requirements: InquiryRequirement[];
  buyerNotes: string | null;
  email: string;
  phone: string | null;
  landingPage: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  contactConsentAt: Date;
  updatedAt: Date;
  notificationAttempts: number;
  notificationLastAttemptAt: Date | null;
  notes: TradeInquiryNoteResponse[];
}

/** Status and assignment only: the buyer's brief is never edited. `assignedToId: null` unassigns. */
export class UpdateTradeInquiryDto {
  // Optional only when omitted: `status: null` is refused (IsOptional would let null through to Prisma).
  @ValidateIf((_, v) => v !== undefined)
  @IsIn(Object.values(TradeInquiryStatus))
  @ApiPropertyOptional({
    enum: TradeInquiryStatus,
    enumName: 'TradeInquiryStatus',
  })
  status?: TradeInquiryStatus;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  @ApiPropertyOptional({ type: String, nullable: true })
  assignedToId?: string | null;
}

export class CreateTradeInquiryNoteDto {
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(4000)
  body: string;
}

export class InquiryAssigneeListResponse {
  items: UserRef[];
}
