import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InquiryNotificationStatus, TradeInquiryStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsEmail,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateBy,
  ValidateIf,
  ValidateNested,
  isISO8601,
} from 'class-validator';
import { PageMeta, PageQuery, UserRef } from '../../common/dto';
import { INQUIRY_LOCALES } from './inquiry-contract';

// ---------- Ingestion (website server → CMS) ----------
// Lengths and formats match or are stricter than the website's validation (src/features/trade-desk/validation.js).
// Unknown fields are refused by the global ValidationPipe (forbidNonWhitelisted).

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const PATH = /^\/(?!\/)[^?#\s]*$/;
const ORIGIN = /^https?:\/\/[^/?#\s]+$/;
const UTM = /^[\w.+\- ]*$/;

// Inbox date filters: a plain date, or a date-time to the minute at least. The shape is checked by two small prefixes,
// the rest by class-validator's strict ISO 8601 check (real calendar dates, offsets): no week, ordinal or month dates.
const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_START = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
export const isFilterDate = (value: unknown) =>
  typeof value === 'string' &&
  (PLAIN_DATE.test(value) || DATE_TIME_START.test(value)) &&
  isISO8601(value, { strict: true });
const IsFilterDate = () =>
  ValidateBy({
    name: 'isFilterDate',
    validator: {
      validate: isFilterDate,
      defaultMessage: () =>
        '$property must be a date (YYYY-MM-DD) or an ISO 8601 date-time',
    },
  });

export class InquiryVolumeDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(20)
  @Matches(/^(\d[\d.,\s]*)?$/)
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
  @IsEmail({}, { message: 'email must be an email address' })
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
  @Matches(/^[+\d()\s.-]*$/)
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

  /** Website product id: every inquiry is for one HMV product. Checked against the contract. */
  @IsString()
  @MaxLength(64)
  productId: string;

  /** An origin id the product offers ("vietnam"), when the buyer gave one; left out, no origin is stored. */
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
  @IsFilterDate()
  dateFrom?: string;

  /** Received before the end of this Vietnam day (date), or before this instant (date-time). */
  @IsOptional()
  @IsFilterDate()
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
  productId: string;
  productName: string;
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
  /** Whether the inbox offers "resend": a failed attempt, or one a crash left PENDING or SENDING for 5 minutes. */
  notificationRetryable: boolean;
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
