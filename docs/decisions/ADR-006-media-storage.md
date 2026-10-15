# ADR-006: Server-Side Media Upload to Cloudflare R2

## Status
Accepted — implemented in `backend/src/modules/media` and `backend/src/infrastructure/storage`.

## Context
Media must be validated before anyone can load it, R2 credentials must never reach the browser, and an
image may need different alt text per locale and per placement.

## Decision
- **Server-side upload** (multipart → NestJS → storage) instead of presigned PUTs. With presigned uploads the
  object exists (and, in a public bucket, is reachable) before the server has seen a byte. Server-side, the
  bytes are sniffed (JPEG/PNG/WebP only; SVG rejected), size-limited (10 MB) and pixel-limited (50 MP),
  hashed, and only then written. Revisit presigned uploads if files grow beyond ~25 MB (video).
- **Storage keys** are generated (`media/YYYY/MM/<uuid>.<ext>`); user file names are stored sanitized for
  display only. Objects are immutable and cached for a year.
- **`ObjectStorage` interface** with `LocalDiskStorage` (dev/test, served at `/media-files` with `nosniff` and a
  `default-src 'none'` CSP) and `R2Storage` (S3 API, SigV4 via `aws4fetch`). Selected by `STORAGE_DRIVER`.
- **Metadata by context:** `media_assets` holds file facts; `media_asset_translations` holds the default alt
  text per locale; article cover alt lives in the article translation and inline alt in the content node.
  Approval requires alt text for every image in that locale.
- **Usage tracking:** `article_revision_media` links revisions to media with `ON DELETE RESTRICT`; the
  usages endpoint reports which current drafts / published revisions use an asset.
- All assets are public website images. There is no private media in v1.

## Consequences
- `R2Storage` is verified against an S3-compatible server (MinIO) but **not against real R2** yet.
- No delete endpoint yet; the database already refuses to delete referenced media.
- EXIF metadata (possibly GPS) is not stripped; images are not re-encoded. Add `sharp` re-encoding if that matters.
- Uploaded-but-unused images are reachable by URL (unguessable UUID keys) even before an article is published.
