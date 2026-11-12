import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  InquiryNotificationStatus,
  Prisma,
  TradeInquiryStatus,
} from '@prisma/client';
import { type Actor, audit } from '../../common/audit';
import { pageArgs } from '../../common/dto';
import { AppError, type Issue } from '../../common/errors';
import { APP_CONFIG, type AppConfig } from '../../config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { buildBrief } from './inquiry-brief';
import type { StoredRequirement } from './inquiry-contract';
import {
  INQUIRY_NOTIFIER,
  type InquiryNotifier,
  NOTIFY_TIMEOUT_MS,
  buildInquiryEmail,
  sendWithin,
} from './inquiry-notifier';
import { createReference } from './inquiry-reference';
import type {
  IngestTradeInquiryDto,
  IngestTradeInquiryResponse,
  InquiryAssigneeListResponse,
  TradeInquiryDetailResponse,
  TradeInquiryListQuery,
  TradeInquiryListResponse,
  TradeInquiryNoteResponse,
  TradeInquiryStatsResponse,
  UpdateTradeInquiryDto,
} from './trade-inquiry.dto';

const ENTITY = 'trade_inquiry';
const WRITE_PERMISSION = 'inquiry:write';
const userRef = { select: { id: true, displayName: true } } as const;

/** List rows: summary columns only (no requirements JSON, no notes, no contact details beyond the company). */
const summarySelect = {
  id: true,
  reference: true,
  status: true,
  createdAt: true,
  locale: true,
  goal: true,
  productId: true,
  productName: true,
  goods: true,
  destination: true,
  volumeAmount: true,
  volumeUnit: true,
  company: true,
  contactName: true,
  utmSource: true,
  referrerOrigin: true,
  assignedTo: userRef,
  notificationStatus: true,
  lastActivityAt: true,
} satisfies Prisma.TradeInquirySelect;

const invalid = (issues: Issue[]) =>
  new AppError(400, 'VALIDATION_FAILED', 'Request validation failed', issues);
const notFound = () =>
  new AppError(404, 'INQUIRY_NOT_FOUND', 'Trade inquiry not found');
/** The columns of a unique-constraint violation (P2002), e.g. "idempotencyKey"; null for any other error. */
function uniqueTarget(err: unknown): string | null {
  if (
    !(err instanceof Prisma.PrismaClientKnownRequestError) ||
    err.code !== 'P2002'
  )
    return null;
  const target = (err.meta as { target?: unknown })?.target;
  if (Array.isArray(target)) return target.join(',');
  return typeof target === 'string' ? target : '';
}

/** The inbox's one time zone: Vietnam (Asia/Ho_Chi_Minh, UTC+7 all year, no daylight saving time). */
const VIETNAM_OFFSET = '+07:00';
const DAY_MS = 86_400_000;

/** 00:00 today in Vietnam, where the commercial team works, as an instant. */
function startOfVietnamDay(now: Date) {
  const vn = new Date(now.getTime() + 7 * 3_600_000);
  return new Date(
    Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) -
      7 * 3_600_000,
  );
}

/**
 * A `dateFrom`/`dateTo` filter value as an instant. A plain date is a Vietnam calendar day: `from` is its 00:00, `to`
 * the next day's 00:00 (exclusive), so the day the inbox shows is the day filtered. A date-time without an offset is
 * Vietnam time too; one with an offset (or Z) is already an instant. Never the server's or the browser's zone.
 */
export function vietnamBound(value: string, side: 'from' | 'to'): Date {
  const plainDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  let iso: string;
  if (plainDate) iso = `${value}T00:00:00${VIETNAM_OFFSET}`;
  else if (/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) iso = value;
  else iso = `${value}${VIETNAM_OFFSET}`;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime()))
    throw invalid([
      {
        path: side === 'from' ? 'dateFrom' : 'dateTo',
        message: 'not a valid date',
      },
    ]);
  if (plainDate && side === 'to') return new Date(instant.getTime() + DAY_MS);
  return instant;
}

/** No word from an attempt for 5 minutes (its budget is 2.5 s): it crashed, and a manual resend may take it over. */
export const STALE_ATTEMPT_MS = 5 * 60_000;

/**
 * What a manual resend may claim: a finished attempt (FAILED, SENT, SKIPPED), or one left PENDING or SENDING by a
 * crash. A PENDING or SENDING notification younger than STALE_ATTEMPT_MS belongs to a running attempt.
 */
function manualClaim(now: Date): Prisma.TradeInquiryWhereInput {
  const stale = new Date(now.getTime() - STALE_ATTEMPT_MS);
  return {
    OR: [
      { notificationStatus: { in: ['FAILED', 'SENT', 'SKIPPED'] } },
      {
        notificationStatus: 'SENDING',
        notificationLastAttemptAt: { lt: stale },
      },
      { notificationStatus: 'PENDING', createdAt: { lt: stale } },
    ],
  };
}

/** Whether the sales inbox offers "resend": a failed attempt, or one a crash left behind (see manualClaim). */
export function notificationRetryable(
  inquiry: {
    notificationStatus: InquiryNotificationStatus;
    notificationLastAttemptAt: Date | null;
    createdAt: Date;
  },
  now: Date,
): boolean {
  const staleBefore = now.getTime() - STALE_ATTEMPT_MS;
  switch (inquiry.notificationStatus) {
    case 'FAILED':
      return true;
    case 'SENDING':
      return (inquiry.notificationLastAttemptAt?.getTime() ?? 0) < staleBefore;
    case 'PENDING':
      return inquiry.createdAt.getTime() < staleBefore;
    default:
      return false;
  }
}

/** The outcome of a notification request: an attempt's result, or IN_PROGRESS when another attempt holds it. */
type NotifyResult = 'SENT' | 'FAILED' | 'SKIPPED' | 'IN_PROGRESS';

/** A safe reason for logs: an error code or the error's class, never its message (SMTP replies can echo addresses). */
function errorReason(err: unknown) {
  const code = (err as { code?: unknown })?.code;
  if (typeof code === 'string' || typeof code === 'number') return String(code);
  return err instanceof Error ? err.name : 'Error';
}

@Injectable()
export class TradeInquiriesService {
  private readonly logger = new Logger('TradeInquiries');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(INQUIRY_NOTIFIER) private readonly notifier: InquiryNotifier,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------- Ingestion ----------

  /**
   * One inquiry per idempotency key. A new key creates it (and notifies once); a known key returns the existing
   * reference with `duplicate: true` and sends nothing. The unique column settles concurrent duplicates.
   * Once the inquiry is committed the answer is success: a notification failure after that (sending, or recording
   * its state) is logged and left to the sales inbox's resend, never reported as a failed submission.
   */
  async ingest(
    dto: IngestTradeInquiryDto,
    idempotencyKey: string,
  ): Promise<IngestTradeInquiryResponse> {
    const data = buildBrief(dto);
    const known = await this.byIdempotencyKey(idempotencyKey);
    if (known) return { reference: known.reference, duplicate: true };

    const inquiry = await this.create(data, idempotencyKey);
    if ('duplicate' in inquiry) return inquiry;

    try {
      await this.notify(inquiry.id, 'initial');
    } catch (err) {
      this.logger.error(
        `Inquiry ${inquiry.reference}: notification state not recorded (${errorReason(err)})`,
      );
    }
    return { reference: inquiry.reference, duplicate: false };
  }

  private byIdempotencyKey(idempotencyKey: string) {
    return this.prisma.tradeInquiry.findUnique({
      where: { idempotencyKey },
      select: { reference: true },
    });
  }

  /**
   * Creates the inquiry and its audit row. A reference collision draws a new reference (up to 4 more times); losing a
   * race on the idempotency key returns the winner's reference as a duplicate.
   */
  private async create(
    data: ReturnType<typeof buildBrief>,
    idempotencyKey: string,
    attempt = 0,
  ): Promise<{ id: string; reference: string } | IngestTradeInquiryResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.tradeInquiry.create({
          data: { ...data, idempotencyKey, reference: createReference() },
        });
        await audit(tx, {}, 'inquiry.create', ENTITY, created.id, {
          reference: created.reference,
          status: created.status,
          goal: created.goal,
          productId: created.productId,
        });
        return created;
      });
    } catch (err) {
      const target = uniqueTarget(err);
      const winner = target?.includes('idempotencyKey')
        ? await this.byIdempotencyKey(idempotencyKey)
        : null;
      if (winner) return { reference: winner.reference, duplicate: true };
      if (target?.includes('reference') && attempt < 4)
        return this.create(data, idempotencyKey, attempt + 1);
      throw err;
    }
  }

  // ---------- Notification ----------

  /**
   * One notification attempt, claimed in PostgreSQL so that one inquiry is never emailed by two attempts at once, on
   * any number of API instances: a single conditional update moves the notification to SENDING and counts the attempt;
   * only the caller whose update matched (count 1) sends. The initial attempt claims PENDING; a manual resend claims
   * what manualClaim() allows. The attempt number is the claim's token: the result is written only while the
   * notification is still SENDING under that number, so an attempt that was taken over can never overwrite a newer one.
   * A failed or timed-out send is a FAILED result, not an error; only the database can throw.
   */
  private async notify(
    id: string,
    mode: 'initial' | 'manual',
  ): Promise<NotifyResult> {
    const now = new Date();
    const claimable: Prisma.TradeInquiryWhereInput =
      mode === 'initial' ? { notificationStatus: 'PENDING' } : manualClaim(now);
    if (!this.notifier.enabled) {
      const skipped = await this.prisma.tradeInquiry.updateMany({
        where: { id, ...claimable },
        data: { notificationStatus: 'SKIPPED' },
      });
      return skipped.count === 1 ? 'SKIPPED' : 'IN_PROGRESS';
    }
    const claim = await this.prisma.tradeInquiry.updateMany({
      where: { id, ...claimable },
      data: {
        notificationStatus: 'SENDING',
        notificationAttempts: { increment: 1 },
        notificationLastAttemptAt: now,
      },
    });
    if (claim.count !== 1) return 'IN_PROGRESS';
    // Read after the claim: SENDING with a fresh timestamp cannot be claimed again, so this is our attempt's number.
    const inquiry = await this.prisma.tradeInquiry.findUniqueOrThrow({
      where: { id },
    });
    const result = await this.attempt(inquiry);
    await this.prisma.tradeInquiry.updateMany({
      where: {
        id,
        notificationStatus: 'SENDING',
        notificationAttempts: inquiry.notificationAttempts,
      },
      data: { notificationStatus: result },
    });
    return result;
  }

  /** Sends the new-inquiry email within the time budget: SENT, or FAILED (logged with the reference and a code). */
  private async attempt(
    inquiry: Prisma.TradeInquiryGetPayload<object>,
  ): Promise<'SENT' | 'FAILED'> {
    try {
      const message = buildInquiryEmail(
        {
          ...inquiry,
          requirements: inquiry.requirements as unknown as StoredRequirement[],
        },
        this.config.tradeInquiries.cmsPublicUrl,
      );
      // Cancelled, not abandoned, at the budget: when this reports FAILED no send is still running.
      await sendWithin(this.notifier, message, NOTIFY_TIMEOUT_MS);
      return 'SENT';
    } catch (err) {
      // The reference and an error code only: SMTP replies can echo addresses, and credentials must never reach logs.
      this.logger.warn(
        `Inquiry ${inquiry.reference}: notification email failed (${errorReason(err)})`,
      );
      return 'FAILED';
    }
  }

  /**
   * A manual resend from the sales inbox. While another attempt holds the notification (SENDING, or the initial
   * attempt still PENDING) nothing is sent: 409 NOTIFICATION_IN_PROGRESS, and no audit entry. Each attempt that
   * actually ran is audited.
   */
  async resendNotification(
    id: string,
    actor: Actor,
  ): Promise<TradeInquiryDetailResponse> {
    const inquiry = await this.prisma.tradeInquiry.findUnique({
      where: { id },
      select: { reference: true },
    });
    if (!inquiry) throw notFound();
    const result = await this.notify(id, 'manual');
    if (result === 'IN_PROGRESS')
      throw new AppError(
        409,
        'NOTIFICATION_IN_PROGRESS',
        'A notification attempt for this inquiry is already running',
      );
    await audit(this.prisma, actor, 'inquiry.notification_retry', ENTITY, id, {
      reference: inquiry.reference,
      result,
    });
    return this.detail(id);
  }

  // ---------- Sales inbox ----------

  private where(q: TradeInquiryListQuery): Prisma.TradeInquiryWhereInput {
    const search = q.search?.trim();
    const contains = (value: string) => ({
      contains: value,
      mode: 'insensitive' as const,
    });
    return {
      status: q.status,
      goal: q.goal,
      productId: q.productId,
      locale: q.locale,
      utmSource: q.utmSource,
      assignedToId: q.unassigned ? null : q.assignedToId,
      createdAt:
        q.dateFrom || q.dateTo
          ? {
              gte: q.dateFrom ? vietnamBound(q.dateFrom, 'from') : undefined,
              lt: q.dateTo ? vietnamBound(q.dateTo, 'to') : undefined,
            }
          : undefined,
      OR: search
        ? [
            { reference: contains(search) },
            { company: contains(search) },
            { email: contains(search) },
            { contactName: contains(search) },
            { productName: contains(search) },
            { destination: contains(search) },
          ]
        : undefined,
    };
  }

  async list(q: TradeInquiryListQuery): Promise<TradeInquiryListResponse> {
    const where = this.where(q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tradeInquiry.findMany({
        where,
        select: summarySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(q),
      }),
      this.prisma.tradeInquiry.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async stats(now = new Date()): Promise<TradeInquiryStatsResponse> {
    const [byStatus, today, last7Days] = await this.prisma.$transaction([
      this.prisma.tradeInquiry.groupBy({
        by: ['status'],
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.tradeInquiry.count({
        where: { createdAt: { gte: startOfVietnamDay(now) } },
      }),
      this.prisma.tradeInquiry.count({
        where: { createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } },
      }),
    ]);
    const count = (status: TradeInquiryStatus) =>
      (
        byStatus.find((row) => row.status === status)?._count as
          { _all: number } | undefined
      )?._all ?? 0;
    return {
      total: Object.values(TradeInquiryStatus).reduce(
        (sum, s) => sum + count(s),
        0,
      ),
      new: count('NEW'),
      contacted: count('CONTACTED'),
      qualified: count('QUALIFIED'),
      quoted: count('QUOTED'),
      won: count('WON'),
      lost: count('LOST'),
      today,
      last7Days,
    };
  }

  async detail(id: string): Promise<TradeInquiryDetailResponse> {
    const inquiry = await this.prisma.tradeInquiry.findUnique({
      where: { id },
      include: {
        assignedTo: userRef,
        notes: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, body: true, createdAt: true, createdBy: userRef },
        },
      },
    });
    if (!inquiry) throw notFound();
    const { idempotencyKey: _key, assignedToId: _assignee, ...rest } = inquiry;
    return {
      ...rest,
      requirements: inquiry.requirements as unknown as StoredRequirement[],
      notificationRetryable: notificationRetryable(inquiry, new Date()),
    };
  }

  /** Users who may be assigned: active, with a role holding inquiry:write. */
  async assignees(): Promise<InquiryAssigneeListResponse> {
    const items = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: {
          some: {
            role: {
              permissions: { some: { permissionCode: WRITE_PERMISSION } },
            },
          },
        },
      },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
    });
    return { items };
  }

  async update(
    id: string,
    dto: UpdateTradeInquiryDto,
    actor: Actor,
  ): Promise<TradeInquiryDetailResponse> {
    if (dto.status === undefined && dto.assignedToId === undefined)
      throw invalid([
        { path: 'status', message: 'status or assignedToId is required' },
      ]);
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.tradeInquiry.findUnique({
        where: { id },
        select: { reference: true, status: true, assignedToId: true },
      });
      if (!current) throw notFound();
      if (dto.assignedToId) {
        const eligible = await tx.user.count({
          where: {
            id: dto.assignedToId,
            isActive: true,
            roles: {
              some: {
                role: {
                  permissions: { some: { permissionCode: WRITE_PERMISSION } },
                },
              },
            },
          },
        });
        if (!eligible)
          throw new AppError(
            422,
            'ASSIGNEE_INVALID',
            'The assignee must be an active user with inquiry:write',
          );
      }
      const statusChanged =
        dto.status !== undefined && dto.status !== current.status;
      const assigneeChanged =
        dto.assignedToId !== undefined &&
        dto.assignedToId !== current.assignedToId;
      if (!statusChanged && !assigneeChanged) return;
      await tx.tradeInquiry.update({
        where: { id },
        data: {
          status: statusChanged ? dto.status : undefined,
          assignedToId: assigneeChanged ? dto.assignedToId : undefined,
          lastActivityAt: new Date(),
        },
      });
      if (statusChanged)
        await audit(tx, actor, 'inquiry.status_change', ENTITY, id, {
          reference: current.reference,
          from: current.status,
          to: dto.status!,
        });
      if (assigneeChanged)
        await audit(tx, actor, 'inquiry.assign', ENTITY, id, {
          reference: current.reference,
          from: current.assignedToId,
          to: dto.assignedToId ?? null,
        });
    });
    return this.detail(id);
  }

  async addNote(
    id: string,
    body: string,
    actor: Actor,
  ): Promise<TradeInquiryNoteResponse> {
    return this.prisma.$transaction(async (tx) => {
      const inquiry = await tx.tradeInquiry.findUnique({
        where: { id },
        select: { reference: true },
      });
      if (!inquiry) throw notFound();
      const note = await tx.tradeInquiryNote.create({
        data: { inquiryId: id, body, createdById: actor.userId },
        select: { id: true, body: true, createdAt: true, createdBy: userRef },
      });
      await tx.tradeInquiry.update({
        where: { id },
        data: { lastActivityAt: note.createdAt },
      });
      await audit(tx, actor, 'inquiry.note_add', ENTITY, id, {
        reference: inquiry.reference,
        noteId: note.id,
      });
      return note;
    });
  }
}
