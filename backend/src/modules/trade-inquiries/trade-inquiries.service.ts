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
import {
  type InquiryGoal,
  ORIGINS,
  PRODUCTS,
  type StoredRequirement,
  TRANSPORT,
  VOLUME_UNITS,
  lookup,
  requirementsFor,
} from './inquiry-contract';
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

const empty = (v: string | undefined | null) => {
  const s = v?.trim();
  return s ? s : null;
};
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
  const zoned = /(Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const instant = new Date(
    plainDate
      ? `${value}T00:00:00${VIETNAM_OFFSET}`
      : zoned
        ? value
        : `${value}${VIETNAM_OFFSET}`,
  );
  if (Number.isNaN(instant.getTime()))
    throw invalid([
      {
        path: side === 'from' ? 'dateFrom' : 'dateTo',
        message: 'not a valid date',
      },
    ]);
  return plainDate && side === 'to'
    ? new Date(instant.getTime() + DAY_MS)
    : instant;
}

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

  /** The controlled brief: checked against the contract, labelled for the sales team. */
  private brief(dto: IngestTradeInquiryDto) {
    const issues: Issue[] = [];
    const goal = dto.goal as InquiryGoal;
    const sourcing = goal === 'sourcing';
    const product = sourcing ? lookup(PRODUCTS, dto.productId) : undefined;
    if (sourcing && !product)
      issues.push({
        path: 'productId',
        message: 'productId must be a Trade Desk product',
      });
    if (!sourcing && dto.productId)
      issues.push({
        path: 'productId',
        message: 'productId is for sourcing inquiries only',
      });
    if (!sourcing && !empty(dto.goods))
      issues.push({
        path: 'goods',
        message: 'goods is required for this goal',
      });

    let origin = empty(dto.origin);
    if (sourcing && product) {
      if (origin && !product.origins.includes(origin))
        issues.push({
          path: 'origin',
          message: 'origin is not offered for this product',
        });
      origin = lookup(ORIGINS, origin ?? product.origins[0]) ?? null;
    }
    const unit = dto.volume?.unit ?? 'containers';
    const unitLabel = lookup(VOLUME_UNITS, unit);
    if (!unitLabel)
      issues.push({ path: 'volume.unit', message: 'unknown volume unit' });
    const application = empty(dto.application);
    const applicationLabel = lookup(product?.applications, application);
    if (application && !applicationLabel)
      issues.push({ path: 'application', message: 'unknown application' });
    const transport = empty(dto.transport);
    const transportLabel = lookup(TRANSPORT, transport);
    if (transport && !transportLabel)
      issues.push({ path: 'transport', message: 'unknown transport' });

    const rules = requirementsFor(goal, dto.productId);
    const requirements: StoredRequirement[] = [];
    for (const [key, raw] of Object.entries(dto.requirements)) {
      const rule = rules.find((r) => r.key === key);
      const value = typeof raw === 'string' ? raw.trim() : null;
      if (!rule)
        issues.push({
          path: `requirements.${key}`,
          message: 'unknown requirement',
        });
      else if (value === null || value.length > 200)
        issues.push({
          path: `requirements.${key}`,
          message: 'must be a string of at most 200 characters',
        });
      else if (rule.options && !lookup(rule.options, value))
        issues.push({ path: `requirements.${key}`, message: 'unknown option' });
      else if (value)
        requirements.push({
          key,
          label: rule.label,
          value: rule.options ? lookup(rule.options, value)! : value,
        });
    }
    if (issues.length) throw invalid(issues);
    // In the contract's order, so every inquiry reads the same way.
    requirements.sort(
      (a, b) =>
        rules.findIndex((r) => r.key === a.key) -
        rules.findIndex((r) => r.key === b.key),
    );

    const amount = empty(dto.volume?.amount);
    return {
      locale: dto.locale,
      goal,
      productId: product ? dto.productId! : null,
      productName: product?.name ?? null,
      goods: sourcing ? null : empty(dto.goods),
      origin,
      destination: empty(dto.destination),
      volumeAmount: amount,
      volumeUnit: amount ? unitLabel! : null,
      application: applicationLabel ?? null,
      transport: transportLabel ?? null,
      requirements: requirements as unknown as Prisma.InputJsonArray,
      buyerNotes: empty(dto.notes),
      company: dto.contact.company.trim(),
      contactName: empty(dto.contact.name),
      email: dto.contact.email.trim().toLowerCase(),
      phone: empty(dto.contact.phone),
      landingPage: empty(dto.source?.landingPage),
      referrerOrigin: empty(dto.source?.referrer),
      utmSource: empty(dto.source?.utm?.source),
      utmMedium: empty(dto.source?.utm?.medium),
      utmCampaign: empty(dto.source?.utm?.campaign),
      contactConsentAt: new Date(dto.consentAt),
    };
  }

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
    const data = this.brief(dto);
    const existing = () =>
      this.prisma.tradeInquiry.findUnique({
        where: { idempotencyKey },
        select: { reference: true },
      });
    const known = await existing();
    if (known) return { reference: known.reference, duplicate: true };

    let inquiry: { id: string; reference: string };
    for (let attempt = 0; ; attempt++) {
      try {
        inquiry = await this.prisma.$transaction(async (tx) => {
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
        break;
      } catch (err) {
        const target = uniqueTarget(err);
        if (target?.includes('idempotencyKey')) {
          const winner = await existing();
          if (winner) return { reference: winner.reference, duplicate: true };
        }
        if (target?.includes('reference') && attempt < 4) continue; // reference collision: draw again
        throw err;
      }
    }

    try {
      await this.notify(inquiry.id);
    } catch (err) {
      this.logger.error(
        `Inquiry ${inquiry.reference}: notification state not recorded (${errorReason(err)})`,
      );
    }
    return { reference: inquiry.reference, duplicate: false };
  }

  // ---------- Notification ----------

  /**
   * Attempts the new-inquiry email within the time budget and records the outcome. A failed or timed-out send is a
   * FAILED outcome, not an error; only recording the outcome can throw (the caller decides what that means).
   */
  private async notify(id: string): Promise<InquiryNotificationStatus> {
    if (!this.notifier.enabled) {
      await this.prisma.tradeInquiry.update({
        where: { id },
        data: { notificationStatus: 'SKIPPED' },
      });
      return 'SKIPPED';
    }
    const inquiry = await this.prisma.tradeInquiry.findUniqueOrThrow({
      where: { id },
    });
    const attemptedAt = new Date();
    let status: InquiryNotificationStatus = 'SENT';
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
    } catch (err) {
      status = 'FAILED';
      // The reference and an error code only: SMTP replies can echo addresses, and credentials must never reach logs.
      this.logger.warn(
        `Inquiry ${inquiry.reference}: notification email failed (${errorReason(err)})`,
      );
    }
    await this.prisma.tradeInquiry.update({
      where: { id },
      data: {
        notificationStatus: status,
        notificationAttempts: { increment: 1 },
        notificationLastAttemptAt: attemptedAt,
      },
    });
    return status;
  }

  async resendNotification(
    id: string,
    actor: Actor,
  ): Promise<TradeInquiryDetailResponse> {
    const inquiry = await this.prisma.tradeInquiry.findUnique({
      where: { id },
      select: { reference: true },
    });
    if (!inquiry) throw notFound();
    const result = await this.notify(id);
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
