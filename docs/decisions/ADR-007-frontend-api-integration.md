# ADR-007: Frontend ↔ API Integration Layer

## Status
Accepted — implemented in `frontend/src/lib/api`, `frontend/src/modules/auth`, articles and media query hooks.

## Context
The CMS frontend (Next.js 16, TanStack Query) was built on an in-memory mock adapter with flat VI/EN view models.
The backend (ADR-004/005/006) uses immutable revisions, per-locale approval, cookie sessions with CSRF tokens and
server-side media validation. The integration must keep Antigravity's UI, stay typed against the API contract and
never fake success.

## Decision
1. **Typed client from the OpenAPI document**: `openapi-typescript` generates `schema.d.ts`; `openapi-fetch` checks
   paths, params, bodies and responses at compile time. No hand-written DTOs. Uploads use XHR (progress events) with
   the response typed from the same schema.
2. **Direct cross-origin calls** with `credentials: 'include'` instead of a Next.js rewrite proxy, because the rewrite
   proxy drops the client IP (breaks per-IP rate limiting and audit IPs). Requires same-site deployment.
3. **CSRF token in memory**, bootstrapped from `GET /auth/session`; sent on every write by client middleware.
4. **Client-side auth gate** (default-deny for every route but `/login`); session expiry opens an in-place re-login
   dialog so drafts survive; the Query cache is cleared on logout or user change.
5. **Server state only in TanStack Query**; writes store the returned detail and invalidate lists/stats/previews;
   approve/publish are never optimistic.
6. **Form model ≠ DTO**: the editor keeps its flat VI/EN form; `article-form.ts` maps API detail → form and builds a
   minimal PATCH (changed fields only) against the loaded revision, which also makes conflict resolution a safe
   "re-apply my changes".
7. **Browser E2E against the real stack** (Playwright): NestJS `dist`, PostgreSQL `hmv_cms_e2e_test`, and a
   production Next build in `.next-e2e` (Next allows only one `next dev` per project directory).

## Consequences
- Contract drift becomes a TypeScript error after `pnpm --filter frontend api:generate`.
- Commodities/Stages/Dashboard remain on mocks until their APIs exist; mock code for articles, media and pages was
  removed so the two data sources never mix within a feature.
- The UI received only integration-necessary additions (login, re-login and conflict dialogs, workflow panel,
  error/loading states); visual polish is tracked as Antigravity tasks in `frontend/docs/FRONTEND_HANDOFF.md`.
