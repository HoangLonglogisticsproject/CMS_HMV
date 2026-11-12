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
  productName: string;
  company: string;
  contactName: string | null;
  email: string;
  phone: string | null;
  origin: string | null;
  destination: string | null;
  volumeAmount: string | null;
  volumeUnit: string | null;
  application: string | null;
  transport: string | null;
  requirements: StoredRequirement[];
  utmSource: string | null;
  referrerOrigin: string | null;
  landingPage: string | null;
}

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

/** The sales summary email: the product requirement and its supply plan, plain text (buyer input never rendered as HTML). */
export function buildInquiryEmail(
  inquiry: InquiryForEmail,
  cmsPublicUrl: string,
): InquiryEmail {
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
    ...line('Product', inquiry.productName),
    ...line('Origin', inquiry.origin),
    ...line('Destination', inquiry.destination),
    ...line('Volume', volume),
    ...line('Application', inquiry.application),
    ...line('Transport', inquiry.transport),
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
    subject: oneLine(
      `New HMV Trade Inquiry — ${inquiry.productName} — ${inquiry.reference}`,
    ),
    text,
  };
}

type SmtpConfig = AppConfig['tradeInquiries']['notify']['smtp'];

/**
 * The SMTP transport settings. The connection is always encrypted, because the email carries buyer contact details:
 * implicit TLS when `secure` (port 465), otherwise STARTTLS is required (`requireTLS`), so a server that does not
 * offer it makes the attempt fail rather than send in clear text. Connection, greeting and socket timeouts stay
 * inside the attempt budget.
 */
export function smtpTransportOptions(smtp: SmtpConfig) {
  return {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: !smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: 2_000,
    greetingTimeout: 2_000,
    socketTimeout: NOTIFY_TIMEOUT_MS,
  };
}

/** SMTP via nodemailer, encrypted (smtpTransportOptions). */
export function smtpNotifier(
  config: AppConfig['tradeInquiries']['notify'],
): InquiryNotifier {
  const transport = createTransport(smtpTransportOptions(config.smtp));
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
