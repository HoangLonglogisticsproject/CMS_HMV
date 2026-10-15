# Public Content Delivery API

Consumed by the public website. Read-only, no authentication, cacheable (`Cache-Control: public, max-age=60,
stale-while-revalidate=300`). Full schemas: [`openapi-spec.json`](./openapi-spec.json) (tag *Public · Articles*).

## Rules (enforced by the backend and covered by integration tests)

1. Only **published, non-archived** articles are returned, and only in locales that are **live**
   (approved and published). Drafts and unapproved translations are never served — not even by slug.
2. Content always comes from the published revision; later draft edits are invisible until re-approved
   and re-published.
3. `?locale=` selects the language (`vi` default). Unknown locale → `400 UNKNOWN_LOCALE`.
4. Responses are plain resources (no `{ success, data }` envelope). Errors use `ErrorResponse`
   (`{ statusCode, code, message, details? }`).
5. No runtime translation: a locale that is not live returns `404`.

## Articles (EcoNews)

| Endpoint | Response |
|---|---|
| `GET /api/v1/public/articles?locale=vi&category=&page=1&pageSize=20` | `{ items: PublicArticleSummary[], page, pageSize, total }`, newest first |
| `GET /api/v1/public/articles/:slug?locale=vi` | `PublicArticle` or `404 ARTICLE_NOT_FOUND` |
| `GET /api/v1/public/article-categories?locale=vi` | `[{ code, name }]` |

`PublicArticle`:

```json
{
  "id": "0199…", "locale": "vi", "slug": "chuoi-cung-ung-ca-phe",
  "title": "…", "excerpt": "…",
  "category": { "code": "SUPPLY_CHAIN_INSIGHTS", "name": "Thông Tin Chuỗi Cung Ứng" },
  "cover": { "url": "https://media…/media/2026/10/….webp", "width": 1920, "height": 1080, "alt": "…" },
  "isFeatured": false, "authorName": "…", "authorRole": "…",
  "readTimeMinutes": 4,
  "publishedAt": "2026-10-13T10:00:00.000Z", "updatedAt": "2026-10-14T08:00:00.000Z",
  "content": { "type": "doc", "content": [ … ] },
  "seo": { "title": "…", "description": "…" },
  "alternates": [{ "locale": "en", "slug": "coffee-supply-chain" }]
}
```

- `content` is Tiptap/ProseMirror JSON, rich content schema v1 (see
  [admin-integration-contract.md §5](./admin-integration-contract.md#5-rich-content-tiptap--required-editor-changes)).
  Image nodes carry resolved `attrs.src` and `attrs.alt`. Render it with a whitelist renderer (e.g.
  `@tiptap/static-renderer` / `generateHTML` with the same extensions); do not inject it as raw HTML.
- `alternates` lists the other live locales, for `hreflang` links. Slugs differ per locale.
- `seo.title` / `seo.description` already fall back to title / excerpt.

## Not implemented yet

Pages (`/public/pages/:systemKey`), commodities, processing capabilities. Their endpoints will follow the
same rules when those domains are built.
