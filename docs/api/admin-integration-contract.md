# Admin API ↔ CMS Frontend — Integration Contract (Auth, Articles, Media)

Status (2026-10-14): **integrated**. The CMS frontend talks to the NestJS API for authentication, EcoNews
articles and the media library; verified by backend integration tests (PostgreSQL) and browser E2E tests against
the real stack (`frontend/e2e`). Website pages (About) use the Pages API since 2026-10-20 (§9). Dashboard,
Commodities and Supply-chain stages still use the mock adapter.

Source of truth: [`openapi-spec.json`](./openapi-spec.json), exported from the built API
(`pnpm --filter backend openapi:export`). Frontend types are generated from it — never hand-written:

```bash
pnpm --filter frontend api:generate   # → frontend/src/lib/api/schema.d.ts
```

A backend contract change therefore shows up as a frontend compile error after regeneration.

---

## 1. Topology

| | Dev | Notes |
|---|---|---|
| API | `http://localhost:4000/api/v1` | `CORS_ORIGIN` must list the CMS origin |
| CMS | `http://localhost:3000` | `NEXT_PUBLIC_API_URL=http://localhost:4000` (build-time; a trailing `/api/v1` is stripped — generated paths already include it) |
| Media files (local driver) | `http://localhost:4000/media-files/…` | R2 public domain in production |

The browser calls the API **directly** (CORS with credentials). A Next.js rewrite proxy is deliberately not used:
Next 16's rewrite proxy does not add `X-Forwarded-For`, so every user would appear to come from the Next server —
per-IP login rate limiting would become a global lockout and audit IPs would be wrong. Production must keep CMS and
API **same-site** (e.g. `cms.hmvglobal.com` + `api.hmvglobal.com`) because the cookie is `SameSite=Lax`.

## 2. Authentication & session

| Step | Call | Frontend |
|---|---|---|
| Sign in | `POST /api/v1/auth/login` | `modules/auth/components/login-form.tsx` → HttpOnly cookie set by the API |
| Bootstrap / restore | `GET /api/v1/auth/session` → `{ user, csrfToken, expiresAt }` | `useSession()` stores `csrfToken` **in memory only** (`lib/api/client.ts`) |
| Writes | header `X-CSRF-Token` | added by the `openapi-fetch` middleware and the upload helper |
| Sign out | `POST /api/v1/auth/logout` | clears the whole Query cache, redirects to `/login` |

- Every route except `/login` is wrapped in `AuthGate` (`modules/auth/components/auth-gate.tsx`).
- A **401 on any protected request** (session expired/revoked) keeps the current screen mounted and opens a
  re-login dialog; unsaved form data and editor content survive. Signing back in as the same user keeps the cache;
  a different user clears it.
- **403** `PERMISSION_DENIED` / `CSRF_TOKEN_INVALID` and every other error are shown via toasts using
  `lib/api/errors.ts` (one Vietnamese message per error `code`, plus `details`).
- Permissions come from `session.user.permissions` (`Permission` enum in the OpenAPI document). `useCan()` hides
  actions and nav items; **the API enforces every permission itself**.
- No token is stored in `localStorage`/`sessionStorage`; the session cookie is HttpOnly (verified by E2E).

| Role | Permissions |
|---|---|
| ADMIN | all |
| EDITOR | `article:read`, `article:write`, `media:read`, `media:write`, `page:read`, `page:write` |
| REVIEWER | `article:read`, `article:review`, `article:publish`, `article:archive`, `media:read`, `page:read`, `page:review`, `page:publish` |
| VIEWER | `article:read`, `media:read`, `page:read` |

## 3. Errors

`{ statusCode, code, message, details? }` — branch on `code`. Full list in `ErrorResponse.code` (OpenAPI enum).
Frontend mapping: `lib/api/errors.ts` (messages) and `formErrorsFromApi()` in
`modules/content/articles/utils/article-form.ts` (puts `SLUG_TAKEN`, `VALIDATION_FAILED` paths and
`TRANSLATION_INCOMPLETE` on the right VI/EN field). Network failures become `NETWORK_ERROR`.

## 4. Articles

### Model

Stable article id + **immutable revisions**; every draft save creates revision N+1, the published revision is never
modified. One translation per locale. A reviewer approves a **locale**; the approval is bound to that translation's
`contentHash`, so editing a locale resets it to `UNREVIEWED` while untouched locales stay approved. **Publish** makes
the current draft revision public; every approved locale goes live; an already-live locale that changed must be
re-approved first (see §7).

### Endpoints → hooks (`modules/content/articles/queries/use-articles.ts`)

| Endpoint | Permission | Hook |
|---|---|---|
| `GET /admin/articles?page&pageSize&status&category&search&awaitingReview&sort` | article:read | `useArticles(params)` — server-side paging/filter/search |
| `GET /admin/articles/stats` | article:read | `useArticleStats()` — metric strip (counts across all pages) |
| `GET /admin/articles/:id` | article:read | `useArticleDetail(id)` |
| `POST /admin/articles` | article:write | `useCreateArticle()` |
| `PATCH /admin/articles/:id/draft` (`expectedRevision` required) | article:write | `useSaveArticleDraft()` |
| `GET /admin/articles/:id/preview?locale` | article:read | `useArticlePreviews(id, locales)` — list "Xem" dialog |
| `POST /admin/articles/:id/translations/:locale/approve` | article:review | `useApproveTranslation()` |
| `POST /admin/articles/:id/publish` | article:publish | `usePublishArticle()` |
| `POST /admin/articles/:id/archive` · `/restore` | article:archive | `useArchiveArticle()` · `useRestoreArticle()` |
| `GET /admin/article-categories` | article:read | `useArticleCategories()` — labels for selects and badges |

`awaitingReview=true` (and `stats.awaitingReview`): non-archived articles with at least one draft translation that is
not approved for its current content. The list's "Đang kiểm duyệt" filter and "Chờ kiểm duyệt" metric use it.

Every write returns the new detail: the hooks store it in the cache and invalidate lists, stats, previews and media
usages. Approve/publish/archive are **never optimistic**.

### Editor flow (`components/article-editor-view.tsx`)

1. The detail is loaded **once** into the form (`toFormValues`); background refetches never overwrite typing.
2. Save builds a PATCH with **only the fields that changed** relative to the loaded revision (`buildDraftPatch`),
   sends `expectedRevision`, and reloads the form from the response.
3. `409 REVISION_CONFLICT` opens `RevisionConflictDialog`; the user's edits stay on screen. Choices:
   *Apply my changes* (re-sends the same patch on top of the latest revision — fields the other editor changed and
   this user did not are preserved), *Load latest* (discard), or keep editing.
4. Approve / publish / archive live in `ArticleWorkflowPanel` (replaces the old writable status dropdown) and are
   disabled while there are unsaved edits.

### Field mapping (form ↔ API)

| Form field | API |
|---|---|
| `category` | `categoryCode` |
| `titleVi/En`, `slugVi/En`, `excerptVi/En` | `translations[{ locale, title, slug, excerpt }]` |
| content state (VI/EN) | `translations[].content` (Tiptap JSON, schema v1) |
| `coverMediaId` (+ `coverImage` URL for display) | `coverMediaId` / `coverMedia { id, url, width, height }` |
| `coverImageAltVi/En` | `translations[].coverImageAlt` (falls back to the media default alt) |
| `seo.metaTitle*`, `seo.metaDescription*` | `translations[].seoTitle`, `.seoDescription` |
| `seo.canonicalUrl`, `seo.ogImageUrl` | derived (slug path, cover) for the SEO checklist; not stored |
| reading time | `translations[].readTimeMinutes` (computed, read-only) |
| `authorName`, `authorRole`, `isFeatured` | same names (optional byline) |
| *removed:* `status`, `readTimeMinutes` input, `relatedCommodityIds`, `seo.keywords` | — |

Client validation (`schemas/article-schema.ts`) mirrors the API: slug `^[a-z0-9]+(-[a-z0-9]+)*$`, max lengths,
EN needs title + slug once started. The API stays authoritative.

## 5. Media

| Endpoint | Permission | Hook (`modules/content/media/queries/use-media.ts`) |
|---|---|---|
| `GET /admin/media?page&pageSize&category&search&sort` | media:read | `useMediaAssets(params)` |
| `POST /admin/media` (multipart `file`, `title?`, `category?`) | media:write | `useUploadMedia()` — XHR with upload progress |
| `PATCH /admin/media/:id` (`title?`, `category?`, `altTexts[]`) | media:write | `useUpdateMedia()` |
| `GET /admin/media/:id/usages` | media:read | `useMediaUsages(id)` |

The server detects the type from the bytes (JPEG/PNG/WebP only, ≤ 10 MB). Default alt text per locale is edited in
the gallery detail card; usage-specific alt (article cover, inline image) is chosen in the picker. Adding media by URL
was removed (external images cannot be validated or kept available).

## 6. Rich content (Tiptap)

- Image nodes carry `attrs.mediaId` (custom `MediaImage` extension in `components/editor/rich-text-editor.tsx`);
  the API discards `src` on input and resolves it from `mediaId` on output, so content survives a CDN change.
  Pasted `<img>` without a media id are dropped by the editor.
- Link hrefs are checked with the same rule as the API (`components/editor/content-rules.ts`): `http(s):`, `mailto:`,
  `tel:`, `/path`, `#anchor`.
- Loading content or switching locale no longer marks the editor dirty (`setContent(…, { emitUpdate: false })`).

## 7. Publishing rule — open business decision

Current rule: **one published revision per article**. Publishing requires every *live* locale to be approved in the
draft being published. Consequence: if a translator has an unapproved edit to live EN, the VI fix cannot be published
until EN is approved or reverted (the UI explains this and disables Publish).

| Option | Effect | Cost |
|---|---|---|
| A. Keep (current) | Simple, every public locale comes from one reviewed revision | Locale edits can block each other |
| B. Per-locale published pointers | Each locale publishes independently | Shared fields (category, cover, featured) need their own rule; schema + query changes |
| C. Publication revision on publish | Publish VI from the draft while EN is carried over from the previous published revision into a new combined revision | More publish logic; still one pointer for reads |

Recommendation: keep **A** for v1; implement **C** if the editorial team needs independent locale release cadence.
Not changed without a business decision.

## 8. Not available yet

Dashboard metrics/activity, pages other than About, page unpublish, Commodities, Supply-chain stages, user management, article delete,
media delete, related commodities, review queue/notifications, scheduled publishing.

## 9. Website pages

Model: [ADR-008](../decisions/ADR-008-website-pages.md). Hooks: `modules/content/pages/queries/use-pages.ts`.
Form layout per page type: `modules/content/pages/utils/page-form.ts` (mirrors the backend content class).

| Endpoint | Permission | Hook |
|---|---|---|
| `GET /admin/pages` | `page:read` | `usePages` |
| `GET /admin/pages/:key` | `page:read` | `usePageDetail` |
| `PATCH /admin/pages/:key/draft` `{ expectedRevision, translations: [{ locale, content?, seoTitle?, seoDescription? }] }` | `page:write` | `useSavePageDraft` |
| `POST /admin/pages/:key/translations/:locale/submit` | `page:write` | `usePageStep` |
| `POST …/approve` · `POST …/request-changes` `{ note }` | `page:review` | `usePageStep` |
| `POST …/publish` | `page:publish` | `usePageStep` |

- Every write sends `expectedRevision` (the detail's `revision`; 0 before the first save) → `409 REVISION_CONFLICT`.
- Per locale, `state` is `DRAFT | IN_REVIEW | APPROVED | CHANGES_REQUESTED` for the current draft content; an edit
  resets it to `DRAFT`. `missingFields` lists what blocks submission; `reviewNote` shows the reviewer's request.
- Content validation errors: `400 VALIDATION_FAILED` with `translations[i].content.…` paths; incomplete
  submission: `422 TRANSLATION_INCOMPLETE`; out-of-order steps: `409 TRANSLATION_NOT_SUBMITTED` /
  `TRANSLATION_NOT_APPROVED`.
