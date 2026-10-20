# ADR-008: Website pages — typed content, per-locale review and publication

Status: accepted (2026-10-20). Supersedes the `pages` / `page_translations` scaffold.

## Context
The website has a handful of fixed pages (About, later Home and Supply Chain) whose copy should be edited in the
CMS. Each page has a fixed layout owned by the website; editors change text and lists, not structure. The scaffold
tables stored status on the row, had no revisions, and used a locale enum (contrary to ADR-004). They were empty
and unused by any code.

## Decision
1. **Typed page content, not a page builder.** Each page key has a content class (`page-content.dto.ts`,
   `about` → `AboutPageContent`): fixed sections, text fields with length limits and bounded lists of cards.
   The API validates content against it (unknown fields rejected) and documents it in OpenAPI, so the admin and
   the website get generated types. Icons, grids, links and ordering rules stay in the website.
2. **Pages are created by migrations.** `pages (key)` rows are reference data (`about` seeded by
   `20261020090000_pages_v1`). Editors edit them; there is no create/delete endpoint.
3. **Revisions as in ADR-004.** Every save inserts `page_revisions` N+1 with one `page_revision_translations` row
   per locale (`content` JSON, SEO, `contentHash`). The highest revision is the draft; its number is the
   optimistic-concurrency token (`expectedRevision`, 0 before the first save).
4. **Per-locale review bound to content.** `page_translation_reviews (pageId, locale)` holds the latest step:
   `IN_REVIEW` (editor submitted), `APPROVED`, or `CHANGES_REQUESTED` with a note. It applies only while its
   `contentHash` equals the draft's; an edit returns the locale to `DRAFT`. Submitting requires every text field
   filled and every list non-empty (drafts may be incomplete). Approve/request-changes require a submission.
5. **Per-locale publication.** `page_published_locales (pageId, locale) → revisionId`. Publishing a locale needs
   its draft `APPROVED` and points that locale at the draft revision; other locales keep serving what they served.
   Pages have no shared non-localized fields, so ADR-004's single published revision (needed for an article's
   category/cover) is not required here.
6. **Permissions** `page:read`, `page:write` (edit, submit), `page:review` (approve, request changes),
   `page:publish`. EDITOR: read+write; REVIEWER: read+review+publish; VIEWER: read; ADMIN: all.
7. **Audit** events `page.update_draft`, `page.submit_translation`, `page.request_changes`,
   `page.approve_translation`, `page.publish_translation`.
8. **Public read** `GET /public/pages/:key?locale=` serves only the published revision of a live locale.

## Consequences
- Adding a page = a content class + a migration row + a form entry in the admin (`utils/page-form.ts`) + the
  website mapping. Pages that need images add `mediaId` fields and a `page_revision_media` usage table
  (like `article_revision_media`) at that point; About renders no images, so V1 has none.
- No unpublish/archive for pages yet: a published locale stays live until replaced by a newer approved draft.
- Two reviewers acting on the same locale at the same moment: last write wins (no review version column).
- The shared scaffold enums (`PublicationStatus`, `SupportedLocale`) remain for the commodity/product scaffolds.
