import { createTransport } from 'nodemailer';
import type { AppConfig } from '../../config';
import type { StoredRequirement } from './inquiry-contract';

// New-inquiry notification to the commercial team. A secondary channel: the inquiry is already saved when it runs, and
// a failure only marks it FAILED (resend from the sales inbox). The adapter hides the transport: SMTP today, any
// other provider later behind the same `send`.

export interface InquiryEmail {
  subject: string;
  text: string;
}

export interface InquiryNotifier {
  /** False when notification email is disabled: inquiries are marked SKIPPED, nothing is sent. */
  readonly enabled: boolean;
  /** Sends one message. When `signal` aborts, the send is cancelled (connection closed) and the promise rejects. */
  send(message: InquiryEmail, signal: AbortSignal): Promise<void>;
}

export const INQUIRY_NOTIFIER = Symbol('INQUIRY_NOTIFIER');

/** Attempt budget per notification, so a slow SMTP server never holds the website's submission. */
export const NOTIFY_TIMEOUT_MS = 2_500;

/** The fields of a saved inquiry the email shows. */
export interface InquiryForEmail {
  id: string;
  reference: string;
  goal: string;
  productName: string | null;
  goods: string | null;
  company: string;
  contactName: string | null;
  email: string;
  phone: string | null;
  origin: string | null;
  destination: string | null;
  volumeAmount: string | null;
  volumeUnit: string | null;
  requirements: StoredRequirement[];
  utmSource: string | null;
  referrerOrigin: string | null;
  landingPage: string | null;
}

const GOAL_LABEL: Record<string, string> = {
  sourcing: 'Product sourcing',
  logistics: 'Logistics',
  customs: 'Customs & compliance',
};
// Line breaks a mail client may render: CR, LF, VT, FF, NEL and the Unicode line/paragraph separators.
const BREAK = /\r\n|[\r\n\v\f\u0085\u2028\u2029]/;

/** One line: line breaks and runs of whitespace collapsed, so a value cannot start a line of its own. */
const oneLine = (s: string) =>
  s.split(BREAK).join(' ').replace(/\s+/g, ' ').trim();

/**
 * A value whose line breaks are kept (free text): every continuation line indented under its field, so buyer text can
 * never start a line that reads like a field of the email ("Open in the CMS: …").
 */
const indented = (s: string) =>
  s
    .trim()
    .split(BREAK)
    .map((l) => l.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n    ');

/** The sales summary email: plain text, so buyer input is never rendered as HTML. */
export function buildInquiryEmail(
  inquiry: InquiryForEmail,
  cmsPublicUrl: string,
): InquiryEmail {
  const what =
    inquiry.productName ??
    (inquiry.goods || GOAL_LABEL[inquiry.goal] || inquiry.goal);
  // Display formatting only: the saved inquiry keeps the buyer's text as sent.
  const line = (label: string, value: string | null | undefined) =>
    value && oneLine(value) ? [`${label}: ${oneLine(value)}`] : [];
  const volume = inquiry.volumeAmount
    ? `${inquiry.volumeAmount} ${inquiry.volumeUnit ?? ''}`.trim()
    : null;
  const source = [
    inquiry.utmSource && `utm ${inquiry.utmSource}`,
    inquiry.referrerOrigin,
    inquiry.landingPage,
  ]
    .filter(Boolean)
    .join(' · ');
  const text = [
    `New HMV trade inquiry ${inquiry.reference}`,
    '',
    ...line('Reference', inquiry.reference),
    ...line('Company', inquiry.company),
    ...line('Buyer', inquiry.contactName),
    ...line('Email', inquiry.email),
    ...line('Phone', inquiry.phone),
    ...line(
      'Request',
      inquiry.goal === 'sourcing'
        ? what
        : `${GOAL_LABEL[inquiry.goal] ?? inquiry.goal}: ${what}`,
    ),
    ...line('Origin', inquiry.origin),
    ...line('Destination', inquiry.destination),
    ...line('Volume', volume),
    ...(inquiry.requirements.length
      ? [
          '',
          'Requirements:',
          ...inquiry.requirements.map(
            (r) => `- ${oneLine(r.label)}: ${indented(r.value)}`,
          ),
        ]
      : []),
    ...(source ? ['', `Source: ${oneLine(source)}`] : []),
    '',
    `Open in the CMS: ${cmsPublicUrl}/sales/inquiries/${inquiry.id}`,
  ].join('\n');
  return {
    subject: oneLine(`New HMV Trade Inquiry — ${what} — ${inquiry.reference}`),
    text,
  };
}

/** SMTP via nodemailer. Connection, greeting and socket timeouts stay inside the attempt budget. */
export function smtpNotifier(
  config: AppConfig['tradeInquiries']['notify'],
): InquiryNotifier {
  const { smtp } = config;
  const transport = createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: 2_000,
    greetingTimeout: 2_000,
    socketTimeout: NOTIFY_TIMEOUT_MS,
  });
  return {
    enabled: true,
    async send(message, signal) {
      // nodemailer's SMTP transport honours the signal: on abort it closes the connection and rejects (EABORT).
      await transport.sendMail({
        from: config.from,
        to: config.to,
        subject: message.subject,
        text: message.text,
        signal,
      });
    },
  };
}

export const disabledNotifier: InquiryNotifier = {
  enabled: false,
  send: () =>
    Promise.reject(new Error('Inquiry notification email is disabled')),
};

/**
 * One notification attempt within `ms`: the send gets an AbortSignal that fires at the budget, and this settles only
 * once the send itself has finished or been cancelled. A timeout therefore never leaves a send running in the
 * background after FAILED is recorded, and a resend cannot overlap it. Rejects with code ETIMEOUT when cancelled.
 */
export async function sendWithin(
  notifier: InquiryNotifier,
  message: InquiryEmail,
  ms: number,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    await notifier.send(message, controller.signal);
  } catch (err) {
    if (controller.signal.aborted)
      throw Object.assign(new Error(`Cancelled after ${ms} ms`), {
        code: 'ETIMEOUT',
      });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
