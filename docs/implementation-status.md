# HMV Global CMS — Implementation Status

_Last updated: 2026-10-14 — milestone "Fullstack integration: Auth + EcoNews + Media"._

## Verified working end to end (real NestJS + PostgreSQL 16 + Next.js)

| Area | State | Evidence |
|---|---|---|
| Auth | Login/logout, HttpOnly DB session cookie, CSRF token bootstrap, Origin check, rate limit, session expiry with in-place re-login (drafts kept), permission-aware UI | backend `test/auth.e2e-spec.ts` (10); browser `frontend/e2e/auth.spec.ts` (4) |
| RBAC | Permissions table, default-deny guard; UI hides actions per permission, API enforces | backend tests per role; browser viewer/editor/reviewer flows |
| EcoNews | List (server paging/filter/search, stats), create, edit VI/EN independently, save draft (immutable revisions, `expectedRevision`), 409 conflict dialog with merge, preview, per-locale approve, publish, archive/restore, public API visibility | backend `test/articles.e2e-spec.ts` (13); browser `article-workflow.spec.ts` (2), `conflict-and-validation.spec.ts` (2) |
| Media | Multipart upload (type detected from bytes, progress), per-locale default alt text, picker selection, cover + inline images by `mediaId`, usage tracking, reload persistence | backend `test/media.e2e-spec.ts` (5); browser `media.spec.ts` (2) |
| Contract | OpenAPI exported from the built API; responses validated against it in backend tests; frontend types generated (`openapi-typescript`) and calls typed (`openapi-fetch`) | `docs/api/openapi-spec.json`, `frontend/src/lib/api/schema.d.ts` |
| Quality gates | backend: tsc 0, oxlint 0, 26 unit + 28 integration; frontend: tsc 0, ESLint 0 errors (53 pre-existing warnings), `next build` OK, Playwright 17/17 (two consecutive runs) | see commands below |

Both suites were mutation-checked (injected bugs: CSRF check removed, public live-locale filter removed, re-approval
skipped, undocumented response field; frontend: 409 treated as generic error, image without `mediaId`, expiry
redirect dropping drafts) — each was caught by the relevant test.

### How to run

```bash
docker compose up -d postgres
pnpm --filter backend test && pnpm --filter backend test:e2e     # unit + PostgreSQL integration (hmv_cms_test)
pnpm --filter backend build && pnpm --filter frontend test:e2e   # browser E2E (hmv_cms_e2e_test, ports 4100/3100)
pnpm --filter frontend typecheck && pnpm --filter frontend lint && pnpm --filter frontend build
```

## Still on mock data (no backend API yet)

Dashboard metrics/activity, Pages & sections, Commodities & products, Supply-chain stages, Users & settings screens.
Mocks for articles and media were removed.

## Not production-ready yet

1. **Cloudflare R2** not tested with real credentials (adapter verified against MinIO only).
2. **Login rate limiting** is in-memory (single API instance); move to Redis/Postgres before scaling out.
3. **Deployment**: CMS and API must be same-site with HTTPS (cookie `__Host-`, `SameSite=Lax`); `TRUST_PROXY` must
   match the proxy chain; no infrastructure/security acceptance done.
4. No user-management API/UI (users are provisioned with `pnpm --filter backend user:create`).
5. Uploaded images are not re-encoded; EXIF is not stripped.
6. Publishing rule: one published revision per article — an unapproved edit to a live locale blocks publishing other
   locales (options in `docs/api/admin-integration-contract.md` §7; needs a business decision).
7. Admin search is accent-sensitive ("chuoi" ≠ "chuỗi").

## History

- Foundation milestone: the original `0_init` migration never applied (UTF-8 BOM) and was replaced; Article model
  redesigned (ADR-004); auth (ADR-005); media (ADR-006). HMV Postgres maps to host port 5442.
- Integration milestone: ADR-007; `GET /admin/articles/stats`, `awaitingReview` filter, `authorName` and per-locale
  `readTimeMinutes` in list rows, `Permission` enum and pagination params in OpenAPI, `Retry-After` exposed via CORS.
