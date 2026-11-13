# Trade inquiries (sales inbox)

Buyer inquiries from the public website's HMV Trade Desk are stored in the CMS database and worked in the CMS
**Sales → Leads & CRM** screen. PostgreSQL is the system of record; the notification email is a convenience.

Every inquiry is **product-led**: the buyer asks for one HMV product. The website's chat-first Trade Desk asks only the
product, the delivery destination and the expected volume; technical and logistics points are for the commercial
discussion. Each lead's **route** is derived from what is stored, never stored itself and never a status change:
product, destination and volume known is **Sales · RFQ** (ready for quotation); anything less is **Customer Service**
(the buyer is still clarifying the requirement). Earlier inquiries may also carry application, transport and product
or supply requirements; they are kept as the buyer gave them. There is no goal or inquiry type, and no free-text goods
field.

```
Browser ──► www.hmv-global.com/api/inquiry (Next.js, same origin)
              │ validates, then signs a server-to-server request
              ▼
            CMS API  POST /api/v1/integrations/trade-inquiries   (HMAC, no session, no CORS)
              │ validates again, creates TradeInquiry + AuditLog in one transaction
              ├──► notification email (best effort, ~2.5 s budget)
              ▼
            CMS Sales Inbox  /sales/inquiries  (session + RBAC)
```

The browser never calls the CMS. The CMS CORS list is unchanged (CMS frontend only).

## Data model

Migration `backend/prisma/migrations/20261112090000_trade_inquiries`.

`TradeInquiry` (`trade_inquiries`)

| Field | Notes |
| --- | --- |
| `reference` | `HMV-YYYY-XXXXXX`, unique. 6 characters from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (no 0/O/1/I), `crypto.randomInt`, retried on collision. The CMS generates it; the website shows it to the buyer. |
| `idempotencyKey` | Unique. The website's key for one submission; a repeat returns the same inquiry. Never returned by the admin API. |
| `status` | `NEW → CONTACTED → QUALIFIED → QUOTED → WON / LOST`. Any transition is allowed (sales corrects mistakes). |
| `locale` | `en`/`vi`. |
| `productId`, `productName` | Required. Website product id and its English name. No relation to the Commodity/ProductVariant tables. |
| `origin`, `destination`, `volumeAmount`, `volumeUnit`, `application`, `transport` | The buyer's commercial requirement. Controlled values are stored as English labels; `origin` defaults to the product's first origin. |
| `requirements` | JSON array `{key, label, value}` of the answered product requirements (specification and supply execution), in contract order. |
| `buyerNotes` | Free text, ≤ 2000. |
| `company`, `contactName`, `email` (lower-cased), `phone` | Contact. |
| `landingPage`, `referrerOrigin`, `utmSource/Medium/Campaign` | Path only, origin only, UTM values. No query strings, no full referrer URL, no honeypot value. |
| `contactConsentAt` | When the buyer ticked the consent box. |
| `assignedToId` | Optional user; set to null if that user is deleted. |
| `notificationStatus` | `PENDING` / `SENDING` / `SENT` / `FAILED` / `SKIPPED` (email disabled), with `notificationAttempts` (also the attempt's claim token) and `notificationLastAttemptAt`. |
| `createdAt`, `updatedAt`, `lastActivityAt` | |

Indexes: `createdAt`; `(status, createdAt)`; `(assignedToId, status)`; `email`; `(productId, createdAt)`; `(utmSource, createdAt)`.

`TradeInquiryNote` (`trade_inquiry_notes`): `inquiryId`, `body` (≤ 4000), `createdById`, `createdAt`. Internal only.

There is no delete endpoint for inquiries or notes.

The product requirement contract (`backend/src/modules/trade-inquiries/inquiry-contract.ts`) mirrors the website's
`src/features/trade-desk/rules.js`. A website change to products or requirement keys must be made in both. Priority
products are passion fruit and dried cassava chips; the other website products are accepted with their own
specification points plus destination port, delivery window, certification and Incoterm.

## Roles and permissions

| Permission | SALES | ADMIN | EDITOR | REVIEWER | VIEWER |
| --- | --- | --- | --- | --- | --- |
| `inquiry:read` (inbox, stats, detail, assignee list) | ✓ | ✓ | – | – | – |
| `inquiry:write` (status, assignment, notes, resend email) | ✓ | ✓ | – | – | – |

The migration adds both permissions, the `SALES` role, and grants them to `SALES` and `ADMIN`. Existing grants are
unchanged. Only active users holding `inquiry:write` can be assigned an inquiry.

Create a sales account: `pnpm --filter backend user:create --email sales@hmv.vn --name "Kinh doanh" --role SALES`
(or from the CMS user admin screen).

## API

Ingestion (website server only):

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/v1/integrations/trade-inquiries` | HMAC headers (below); `@Public` only skips the session check |

Admin (session cookie + `X-CSRF-Token` on writes):

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/v1/admin/trade-inquiries?page&pageSize&status&productId&locale&assignedToId&unassigned&dateFrom&dateTo&utmSource&search` | `inquiry:read` |
| GET | `/api/v1/admin/trade-inquiries/stats` | `inquiry:read` |
| GET | `/api/v1/admin/trade-inquiries/assignees` | `inquiry:read` |
| GET | `/api/v1/admin/trade-inquiries/:id` | `inquiry:read` |
| PATCH | `/api/v1/admin/trade-inquiries/:id` (`status`, `assignedToId` only) | `inquiry:write` |
| POST | `/api/v1/admin/trade-inquiries/:id/notes` | `inquiry:write` |
| POST | `/api/v1/admin/trade-inquiries/:id/resend-notification` | `inquiry:write` |

Schemas: `docs/api/openapi-spec.json`.

## Signing protocol

Headers on `POST /api/v1/integrations/trade-inquiries`:

| Header | Value |
| --- | --- |
| `Idempotency-Key` | 8–64 characters `[A-Za-z0-9-]` (the website sends a UUID per submission, reused on retry) |
| `X-HMV-Timestamp` | Unix seconds |
| `X-HMV-Signature` | lower-case hex `HMAC-SHA256(secret, "<timestamp>.<idempotencyKey>.<bodySha256>")` |

`bodySha256` is the lower-case hex SHA-256 of the **exact request body bytes**. The sender serializes the JSON once and
uses that same string for the hash and as the HTTP body; the CMS hashes the raw body it received (`req.rawBody`, the app
runs with `rawBody: true`), never re-serialized JSON. Captured headers therefore cannot be replayed with another body
within the time window, and a body that is the same JSON written differently does not verify either.

The CMS checks the signature in constant time (`timingSafeEqual`) before the body is validated or used, then refuses a
timestamp more than 300 s from its clock, then checks the key format. No contact data is in the headers. The body is
JSON validated against `IngestTradeInquiryDto`; unknown fields are refused, `contact` must be an object, and product,
origin, unit, application, transport and requirement option ids are matched as the contract's own keys only
(`__proto__`, `constructor`… are unknown values, a 400).

Shared test vector (also in the website's `docs/inbound/TRADE_DESK_DELIVERY.md` and tests; both repositories assert it):

```
secret          hmv-shared-test-vector-secret-0123456789abcdef
timestamp       1767225600
idempotencyKey  0f3b6d2e-1c4a-4e8b-9a77-2f1d3c4b5a69
body            {"locale":"en","productId":"dried-cassava-chips","origin":"vietnam","destination":"Singapore","volume":{"amount":"5000","unit":"mt_month"},"application":"bioethanol","transport":"sea_fcl","requirements":{},"contact":{"company":"Example Co","email":"buyer@example.com"},"consentAt":"2026-01-01T00:00:00.000Z"}
bodySha256      20fe22d201ffaf572bf56b405b8e5695a6e8f270f1312238c40cc078e7431d9c
signature       37a0452e58562fb1d41ff58ad73f4cc362cd6586e529d2b958476a905d5f4d91
```

(`body` is the exact string: no trailing newline. Signed string: `1767225600.0f3b6d2e-1c4a-4e8b-9a77-2f1d3c4b5a69.20fe22d2…1d9c`. The body is a valid inquiry: the CMS accepts it.)

Responses:

| Status | Meaning | Website action |
| --- | --- | --- |
| 201 `{reference, duplicate:false}` | Created | Show the reference |
| 200 `{reference, duplicate:true}` | This key was already received; nothing created, no email | Show the reference |
| 400 `VALIDATION_FAILED` | Body or key invalid | Do not retry |
| 401 `SIGNATURE_INVALID` | Missing/wrong signature, stale timestamp, body changed after signing | Configuration error; alert |
| 503 `INTEGRATION_DISABLED` | `TRADE_INQUIRY_INGEST_ENABLED` is not `true` | Show the failure state with retry/email fallback |

Idempotency is the unique `idempotencyKey` column, so concurrent repeats of one key still create one row.

## Notification email

After the inquiry is committed, one email goes to `INQUIRY_NOTIFY_TO` (SMTP via nodemailer, 2 s connect/greeting,
2.5 s socket, 2.5 s overall). Subject `New HMV Trade Inquiry — <product> — <reference>`, a plain-text summary of the product requirement (product,
origin, destination, volume, application, transport, then the answered requirements),
link to `CMS_PUBLIC_URL/sales/inquiries/<id>`. Buyer values are display-formatted: single-value fields are collapsed to
one line, free-text requirement values keep their lines indented under the field, so buyer text can never start a line
that looks like a field of the email. The saved inquiry is unchanged.

- The 2.5 s budget **cancels** the send: an `AbortController` aborts it (nodemailer closes the SMTP connection) and
  `FAILED` is recorded only once the send has stopped, so nothing keeps sending in the background and a resend cannot
  overlap it. A send that completed within the budget is `SENT`. If the budget runs out after the SMTP server took the
  message but before its reply was processed, the attempt is recorded as `FAILED` (`ETIMEOUT`) although the email may
  have been delivered: check the `INQUIRY_NOTIFY_TO` mailbox for it before a manual resend, which would send a second
  email.
- A failure or timeout never rolls back the inquiry: it is stored as `FAILED` and logged as
  `Inquiry <reference>: notification email failed (<error code>)` — no addresses, credentials or buyer data.
- Once the inquiry is committed the website gets its reference, even if recording the notification state then fails
  (logged as `Inquiry <reference>: notification state not recorded (<error code>)`; the inquiry stays `PENDING` and can
  be resent after 5 minutes).
- A duplicate submission never sends another email.
- Sales can retry from the inquiry page ("Gửi lại email thông báo"); each retry that actually runs is audited.
- The SMTP connection is always encrypted: implicit TLS with `SMTP_SECURE=true` (port 465), otherwise STARTTLS is
  required (`requireTLS`), and a server that does not offer it makes the attempt `FAILED` instead of sending the buyer's
  details in clear text.

**One attempt at a time, across API instances.** PostgreSQL is the lock: an attempt starts with one conditional update
that moves the notification to `SENDING` and increments `notificationAttempts`; only the caller whose update matched
sends. The initial attempt claims `PENDING`; a manual resend claims `FAILED`, `SENT` or `SKIPPED`, or a `PENDING` /
`SENDING` left by a crash (no progress for 5 minutes, against a 2.5 s budget). An attempt writes its result only while
the notification is still `SENDING` under its own attempt number, so a taken-over attempt can never overwrite a newer
one. A resend while an attempt runs gets **409 `NOTIFICATION_IN_PROGRESS`**: nothing is sent, nothing is audited. The
inbox offers "resend" only where the API reports `notificationRetryable` (a failed attempt, or a crashed one).

```
PENDING ──claim──► SENDING ──► SENT | FAILED
FAILED / SENT / SKIPPED ──manual claim──► SENDING ──► …
PENDING / SENDING without progress for 5 min ──manual claim──► SENDING (takeover) ──► …
```
- With `INQUIRY_NOTIFY_EMAIL_ENABLED` unset the status is `SKIPPED`; the inbox is still the record.

## Audit

`inquiry.create`, `inquiry.status_change`, `inquiry.assign`, `inquiry.note_add`, `inquiry.notification_retry` on entity
`trade_inquiry`. Metadata holds the reference and the changed values (status, assignee id, note id, email result) —
never the buyer's email, phone, company or notes.

## Configuration (backend)

| Variable | Required | Notes |
| --- | --- | --- |
| `TRADE_INQUIRY_INGEST_ENABLED` | – | `true` to accept website submissions. Off: 503. |
| `TRADE_INQUIRY_INGEST_SECRET` | when enabled | ≥ 32 characters, random (`openssl rand -hex 32`). Same value as the website's `CMS_INQUIRY_SECRET`. The API refuses to start if it is shorter. |
| `INQUIRY_NOTIFY_EMAIL_ENABLED` | – | `true` to send the email. |
| `INQUIRY_NOTIFY_TO` | when email on | Comma-separated recipients. |
| `INQUIRY_NOTIFY_FROM` | when email on | A sender the SMTP provider allows (SPF/DKIM on that domain). |
| `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (`true` for 465), `SMTP_USER`, `SMTP_PASS` | when email on | `SMTP_SECURE=true`: implicit TLS; otherwise STARTTLS is required. There is no unencrypted mode. |
| `CMS_PUBLIC_URL` | when email on | CMS frontend URL for the email link. In production it must parse as an `https:` URL with a host (`https://` alone is refused); it is stored without a trailing slash. |

Rotate the secret by setting the new value on the CMS and the website together; requests signed with the old value
get 401 in between, and the website shows its retry/email fallback.

## Sales workflow

1. A new inquiry appears in **Sales → Leads & CRM** (the list re-polls every 30 s while the tab is open) and,
   if enabled, in the notification mailbox. Times are shown in Vietnam time (Asia/Ho_Chi_Minh, UTC+7), and a date
   filter selects that Vietnam calendar day (`2026-11-12` = `2026-11-11T17:00Z` up to, not including,
   `2026-11-12T17:00Z`).
2. Open it, assign it, contact the buyer: **Gửi email cho người mua** (mailto with the reference), **Sao chép số điện
   thoại**, or **Mở WhatsApp** (only for numbers given with a country code). Nothing is sent automatically.
3. Move the status as the deal progresses; record calls and agreements as notes.
4. **Tuyến xử lý** says who works the lead: Sales · RFQ goes to quotation; Customer Service helps a buyer still
   clarifying the destination or volume.

The inbox lists reference, company and contact, product, destination, volume, route, status, assignee, source and
time received (with the notification email state), and filters by status, product, assignee, date, `utm_source` and
search. A lead page starts with its summary (company, buyer, product, destination, volume, route, status, assignee),
then the buyer's own message, the contact, any **Additional buyer information** from an earlier inquiry (origin,
application, transport, requirements; folded away), internal notes, sales handling (status, assignee, email state) and
attribution (landing page, referrer origin, UTM).

## Local development: the migration was edited before release

`20261112090000_trade_inquiries` was changed on its branch before any deployment (product required, no `goal` or
`goods` column, `SENDING` notification state). A test database is recreated as usual. A **developer database that
already applied an earlier version** fails `prisma migrate dev`/`deploy` with a checksum mismatch; nothing is changed
automatically. Either:

- **Keep the data** — run against that database only, after a backup (`pg_dump`):

  ```sql
  ALTER TYPE "InquiryNotificationStatus" ADD VALUE IF NOT EXISTS 'SENDING' BEFORE 'SENT';
  -- Inquiries without a product cannot be kept as they are: review them first.
  SELECT "reference", "goal", "goods" FROM "trade_inquiries" WHERE "productId" IS NULL;
  -- Then, for each: set a product (e.g. UPDATE ... SET "productId" = 'nuts', "productName" = 'Cashew nuts' WHERE
  -- "reference" = '...'), or delete it yourself (its notes go with it).
  ALTER TABLE "trade_inquiries"
    DROP COLUMN IF EXISTS "goal",
    DROP COLUMN IF EXISTS "goods",
    ALTER COLUMN "productId" SET NOT NULL,
    ALTER COLUMN "productName" SET NOT NULL;
  -- Forget the old checksum; Prisma records the current file's in the next step.
  DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261112090000_trade_inquiries';
  ```

  then `pnpm --filter backend exec prisma migrate resolve --applied 20261112090000_trade_inquiries` and check with
  `pnpm --filter backend exec prisma migrate status`.
- **Discard the data** — only if that is your choice: `pnpm --filter backend exec prisma migrate reset` (drops and
  recreates the whole development database, then seeds it).

## Before production

- The CMS is not deployed by this change. Ingestion needs a production CMS API reachable over **HTTPS** from the
  website's server (Vercel), with `TRADE_INQUIRY_INGEST_ENABLED=true` and the shared secret set on both sides.
- Rate limiting of public submissions belongs at the website edge/route; the CMS endpoint is authenticated by HMAC and
  has no in-memory limiter (multi-instance hosting would make one meaningless).
- PostgreSQL backups must cover `trade_inquiries` and `trade_inquiry_notes` (they hold buyer contact data). Agree a
  retention period with the business; there is no automatic purge yet.
- SMTP: a sender domain with SPF/DKIM, and a recipient mailbox the commercial team watches.
