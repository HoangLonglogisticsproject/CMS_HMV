# ADR-004: Immutable Revisions, Row-Based Locales and Hash-Bound Approvals

## Status
Accepted — implemented for Articles (`backend/src/modules/articles`).

## Context
- Saving a draft must never change what the public site shows.
- EN/VI must be edited, reviewed and published independently, and more locales must be addable without a
  schema migration. Fixed columns (`titleVi`, `contentJsonEn`, …) and a Postgres enum both require migrations.
- Unreviewed translations must never go live, including through someone else's publish.
- The frontend view model (`ArticleItem`) is flat and VI/EN-specific; it must not become the storage model.

## Decision
1. **Identity + immutable revisions.** `articles` holds only identity and pointers (`draftRevisionId`,
   `publishedRevisionId`). Every save inserts `article_revisions` N+1 (shared fields) and
   `article_revision_translations` (one row per locale). Revisions are never updated.
2. **Optimistic concurrency.** Writes carry `expectedRevision`; the `(articleId, number)` unique key turns a
   concurrent save of the same base into `409 REVISION_CONFLICT` instead of a lost update.
3. **Locales are rows** in `locales`, referenced by FK. Adding a locale is an `INSERT`.
4. **Approval binds to content.** Each translation stores `contentHash` (SHA-256 over its localized fields,
   key-order independent). `article_translation_approvals (articleId, locale, contentHash)` records reviews.
   Editing a locale changes its hash and silently un-approves it; untouched locales keep their approval.
5. **Publishing** points `publishedRevisionId` at the draft and records live locales in
   `article_published_locales`. All approved locales go live; a live locale whose content changed must be
   re-approved first. Public queries read only `publishedRevision` ∩ live locales ∩ not archived.
6. **Translation provenance.** `sourceLocale` + `sourceHash` record what a translation was made from; when the
   source's hash moves on, the API reports `isOutdated`.
7. **Slug uniqueness** is a primary key on `article_slugs (locale, slug)` covering each article's draft and
   published slugs, so two articles can never race to the same public URL.
8. **Stable category codes** (`article_categories.code`) with localized names in a translation table.

## Consequences
- Full revision history for free; rollback can be added by re-pointing a draft at an old revision.
- Storage grows by one revision per save (fine for explicit saves; autosave would need coalescing).
- Single live revision: if a translator has an unapproved edit to a live locale, it blocks publishing
  other locales until it is approved or reverted. Per-locale published pointers are the upgrade if that hurts.
- Pages, Commodities and other scaffolded tables still use the old `SupportedLocale` enum and status-on-row
  design; they should adopt this pattern when their slices are built.
