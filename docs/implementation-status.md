# HMV Global CMS — Implementation Status

_Last updated: 2026-10-16 — milestone "Auth & Identity Hardening": **engineering complete**, Product Owner manual
acceptance pending. Production security is a separate milestone (below)._

## Verified working end to end (real NestJS + PostgreSQL 16 + Next.js)

| Area | State | Evidence |
|---|---|---|
| Auth | Login/logout, HttpOnly DB session cookie, CSRF token bootstrap, Origin check, rate limit, session expiry with in-place re-login (drafts kept), permission-aware UI | backend `test/auth.e2e-spec.ts` (10); browser `frontend/e2e/auth.spec.ts` (4) |
| Auth hardening | Create-only `user:create`, `user:reset-password`, `user:list` CLIs; self-service password change; `/admin/users` (`user:manage`, last-admin guard); session refetch failures keep the app and drafts; identity change (re-login or another tab) reloads the tab; CSRF token bound to the tab's account; production config checks | backend `user-cli` (8), `account-security` (7), `users` (9), `credential-safety` + `config` unit; browser `auth-hardening` (5), `session-resilience` (5), `reauth-isolation` (3), `cross-tab-writes` (4) |
| RBAC | Permissions table, default-deny guard; UI hides actions per permission, API enforces | backend tests per role; browser viewer/editor/reviewer flows |
| EcoNews | List (server paging/filter/search, stats), create, edit VI/EN independently, save draft (immutable revisions, `expectedRevision`), 409 conflict dialog with merge, preview, per-locale approve, publish, archive/restore, public API visibility | backend `test/articles.e2e-spec.ts` (13); browser `article-workflow.spec.ts` (2), `conflict-and-validation.spec.ts` (2) |
| Media | Multipart upload (type detected from bytes, progress), per-locale default alt text, picker selection, cover + inline images by `mediaId`, usage tracking, reload persistence | backend `test/media.e2e-spec.ts` (5); browser `media.spec.ts` (2) |
| Trade inquiries | Website → CMS ingestion (HMAC + idempotency key, `HMV-YYYY-XXXXXX` reference), Sales Inbox `/sales/inquiries` (list/filters/stats, detail, status, assignment, notes), SALES role, notification email with FAILED/retry state. Not deployed. See `docs/sales/TRADE_INQUIRIES.md` | backend `trade-inquiries.spec.ts` + `test/trade-inquiries.e2e-spec.ts` (14); browser `sales-inquiries.spec.ts` (3) |
| Contract | OpenAPI exported from the built API; responses validated against it in backend tests; frontend types generated (`openapi-typescript`) and calls typed (`openapi-fetch`) | `docs/api/openapi-spec.json`, `frontend/src/lib/api/schema.d.ts` |
| Quality gates | backend: tsc 0, 39 unit + 52 integration; frontend: tsc 0, ESLint 0 errors (59 pre-existing warnings), `next build` OK, Playwright 84/84 | see commands below |

Both suites were mutation-checked (injected bugs: CSRF check removed, public live-locale filter removed, re-approval
skipped, undocumented response field; frontend: 409 treated as generic error, image without `mediaId`, expiry
redirect dropping drafts) — each was caught by the relevant test.

### How to run

```bash
cp .env.example .env    # once: POSTGRES_PASSWORD; backend/.env DATABASE_URL uses the same password (see README.md)
docker compose up -d postgres
pnpm --filter backend test && pnpm --filter backend test:e2e     # unit + PostgreSQL integration (hmv_cms_test)
pnpm --filter backend build && pnpm --filter frontend test:e2e   # browser E2E (hmv_cms_e2e_test, ports 4100/3100)
pnpm --filter frontend typecheck && pnpm --filter frontend lint && pnpm --filter frontend build
```

## Still on mock data (no backend API yet)

Dashboard metrics/activity, Commodities & products, Supply-chain stages, Users & settings screens.
Mocks for articles, media and pages were removed. Pages: About is CMS-managed (ADR-008); other pages are not modelled yet.

## Not production-ready yet

1. **Cloudflare R2** not tested with real credentials (adapter verified against MinIO only).
2. **Login rate limiting** is in-memory (single API instance); move to Redis/Postgres before scaling out.
3. **Deployment**: CMS and API must be same-site with HTTPS (cookie `__Host-`, `SameSite=Lax`); `TRUST_PROXY` must
   match the proxy chain; no infrastructure/security acceptance done.
4. User management is functional (API + minimal UI at `/admin/users`); presentation to be refined. No MFA or email
   recovery (see `docs/operations/auth-runbook.md`).
5. Uploaded images are not re-encoded; EXIF is not stripped.
6. Publishing rule: one published revision per article — an unapproved edit to a live locale blocks publishing other
   locales (options in `docs/api/admin-integration-contract.md` §7; needs a business decision).
7. Admin search is accent-sensitive ("chuoi" ≠ "chuỗi").
8. **Production Security milestone (separate, not started)**: HTTPS pilot and deployment review (item 3), shared
   rate-limit store (item 2), first-login password change, production secrets management. Production deployment is
   not approved. (The development PostgreSQL password was removed from source and history and rotated before the
   first push; compose and tests read it from the environment.)

## History

- Foundation milestone: the original `0_init` migration never applied (UTF-8 BOM) and was replaced; Article model
  redesigned (ADR-004); auth (ADR-005); media (ADR-006). HMV Postgres maps to host port 5442.
- Integration milestone: ADR-007; `GET /admin/articles/stats`, `awaitingReview` filter, `authorName` and per-locale
  `readTimeMinutes` in list rows, `Permission` enum and pagination params in OpenAPI, `Retry-After` exposed via CORS.
- Auth & Identity Hardening (2026-10-16, branch `feat/auth-hardening`): migration
  `20261016090000_user_manage_permission`; runbook `docs/operations/auth-runbook.md`. Final verification: cross-tab
  Approve/Publish in the review drawer and identity changes during in-flight writes, with real sessions on the `_test`
  database; no write ran or was audited under another account.
