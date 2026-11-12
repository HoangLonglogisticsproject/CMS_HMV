import type { Prisma } from '@prisma/client';
import { AppError, type Issue } from '../../common/errors';
import {
  ORIGINS,
  PRODUCTS,
  type ProductRule,
  type Requirement,
  type StoredRequirement,
  TRANSPORT,
  VOLUME_UNITS,
  lookup,
  requirementsFor,
} from './inquiry-contract';
import type { IngestTradeInquiryDto } from './trade-inquiry.dto';

// The controlled brief of an ingested inquiry: checked against the contract, labelled for the sales team. Each helper
// checks one part and returns its value with the issues it found; buildBrief() reports all issues together, in this
// order: product, origin, unit / application / transport, requirements.

/** Trimmed text; null when missing or blank. */
export const blankToNull = (value: string | null | undefined) =>
  value?.trim() || null;

const MAX_REQUIREMENT_LENGTH = 200;

/** The inquiry's product: one of the contract's products. */
function resolveProduct(dto: IngestTradeInquiryDto) {
  const product = lookup(PRODUCTS, dto.productId);
  const issues: Issue[] = product
    ? []
    : [
        {
          path: 'productId',
          message: 'productId must be a Trade Desk product',
        },
      ];
  return { product, issues };
}

/** One of the product's origins (its first by default), as a label. */
function resolveOrigin(
  dto: IngestTradeInquiryDto,
  product: ProductRule | undefined,
) {
  const origin = blankToNull(dto.origin);
  if (!product) return { origin, issues: [] };
  const issues: Issue[] =
    origin && !product.origins.includes(origin)
      ? [{ path: 'origin', message: 'origin is not offered for this product' }]
      : [];
  return {
    origin: lookup(ORIGINS, origin ?? product.origins[0]) ?? null,
    issues,
  };
}

/** An optional controlled answer as its label: null when blank, an issue when not one of the table's keys. */
function controlled(
  table: Record<string, string> | undefined,
  raw: string | undefined,
  issue: Issue,
  issues: Issue[],
) {
  const value = blankToNull(raw);
  const label = lookup(table, value);
  if (value && !label) issues.push(issue);
  return label ?? null;
}

/** The volume unit (containers by default), application and transport, as labels. */
function resolveOptions(
  dto: IngestTradeInquiryDto,
  product: ProductRule | undefined,
) {
  const issues: Issue[] = [];
  const unit = lookup(VOLUME_UNITS, dto.volume?.unit ?? 'containers');
  if (!unit)
    issues.push({ path: 'volume.unit', message: 'unknown volume unit' });
  const application = controlled(
    product?.applications,
    dto.application,
    { path: 'application', message: 'unknown application' },
    issues,
  );
  const transport = controlled(
    TRANSPORT,
    dto.transport,
    { path: 'transport', message: 'unknown transport' },
    issues,
  );
  return { unit, application, transport, issues };
}

/** One requirement answer: the problem, or the value to store (a choice's label; '' for a blank text answer). */
function checkRequirement(
  rule: Requirement | undefined,
  raw: unknown,
): { problem: string } | { value: string } {
  if (!rule) return { problem: 'unknown requirement' };
  if (typeof raw !== 'string' || raw.trim().length > MAX_REQUIREMENT_LENGTH)
    return { problem: 'must be a string of at most 200 characters' };
  const value = raw.trim();
  if (!rule.options) return { value };
  const label = lookup(rule.options, value);
  return label ? { value: label } : { problem: 'unknown option' };
}

/** The answered requirements, labelled and in the contract's order, so every inquiry reads the same way. */
function resolveRequirements(dto: IngestTradeInquiryDto) {
  const rules = requirementsFor(dto.productId);
  const issues: Issue[] = [];
  const requirements: StoredRequirement[] = [];
  for (const [key, raw] of Object.entries(dto.requirements)) {
    const rule = rules.find((r) => r.key === key);
    const result = checkRequirement(rule, raw);
    if ('problem' in result)
      issues.push({ path: `requirements.${key}`, message: result.problem });
    else if (rule && result.value)
      requirements.push({ key, label: rule.label, value: result.value });
  }
  const position = (key: string) => rules.findIndex((r) => r.key === key);
  requirements.sort((a, b) => position(a.key) - position(b.key));
  return { requirements, issues };
}

/**
 * The inquiry as stored: the resolved brief, the contact (email lower-cased) and the visit's source. Throws
 * VALIDATION_FAILED with every issue when any part is outside the contract.
 */
export function buildBrief(dto: IngestTradeInquiryDto) {
  const { product, issues: productIssues } = resolveProduct(dto);
  const { origin, issues: originIssues } = resolveOrigin(dto, product);
  const options = resolveOptions(dto, product);
  const { requirements, issues: requirementIssues } = resolveRequirements(dto);
  const issues = [
    ...productIssues,
    ...originIssues,
    ...options.issues,
    ...requirementIssues,
  ];
  if (!product || issues.length)
    throw new AppError(
      400,
      'VALIDATION_FAILED',
      'Request validation failed',
      issues,
    );

  const amount = blankToNull(dto.volume?.amount);
  return {
    locale: dto.locale,
    productId: dto.productId,
    productName: product.name,
    origin,
    destination: blankToNull(dto.destination),
    volumeAmount: amount,
    volumeUnit: amount ? options.unit! : null,
    application: options.application,
    transport: options.transport,
    requirements: requirements as unknown as Prisma.InputJsonArray,
    buyerNotes: blankToNull(dto.notes),
    company: dto.contact.company.trim(),
    contactName: blankToNull(dto.contact.name),
    email: dto.contact.email.trim().toLowerCase(),
    phone: blankToNull(dto.contact.phone),
    landingPage: blankToNull(dto.source?.landingPage),
    referrerOrigin: blankToNull(dto.source?.referrer),
    utmSource: blankToNull(dto.source?.utm?.source),
    utmMedium: blankToNull(dto.source?.utm?.medium),
    utmCampaign: blankToNull(dto.source?.utm?.campaign),
    contactConsentAt: new Date(dto.consentAt),
  };
}
