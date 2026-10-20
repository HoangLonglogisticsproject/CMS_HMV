# Public Content Delivery API

Consumed by the public website. Read-only, no authentication, cacheable (`Cache-Control: public, max-age=60,
stale-while-revalidate=300`). Full schemas: [`openapi-spec.json`](./openapi-spec.json) (tags *Public · Articles*,
*Public · Pages*).

## Rules (enforced by the backend and covered by integration tests)

1. Only **published** content is returned (articles: also non-archived), and only in locales that are **live**
   (approved and published). Drafts, submissions and unapproved translations are never served — not even by slug or key.
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
  [admin-integration-contract.md §6](./admin-integration-contract.md#6-rich-content-tiptap)).
  Image nodes carry resolved `attrs.src` and `attrs.alt`. Render it with a whitelist renderer (e.g.
  `@tiptap/static-renderer` / `generateHTML` with the same extensions); do not inject it as raw HTML.
- `alternates` lists the other live locales, for `hreflang` links. Slugs differ per locale.
- `seo.title` / `seo.description` already fall back to title / excerpt.

## Pages

| Endpoint | Response |
|---|---|
| `GET /api/v1/public/pages/:key?locale=vi` | `PublicPage`, or `404 PAGE_NOT_FOUND` (unknown page, or the locale is not published) |

Keys are fixed per website page (`about`). Locales are published independently: each live locale is served from
the revision it was last published from, so a locale can be live while another is still in review.

`PublicPage`:

```json
{
  "key": "about", "locale": "vi", "title": "Về HMV",
  "seo": { "title": "…", "description": "…" },
  "content": { "hero": { "title": "Về HMV", "lead": "…" }, "purpose": { … }, "vision": { … },
               "mission": { … }, "values": { … }, "team": { … } },
  "publishedAt": "2026-10-20T08:00:00.000Z", "updatedAt": "2026-10-21T09:30:00.000Z",
  "alternates": [{ "locale": "en" }]
}
```

- `content` has the page type's shape (`about` → `AboutPageContent` in the OpenAPI document): plain text and
  bounded lists, no HTML. Every text field is filled and every list has at least one item (enforced before review).
- `title` is `content.hero.title`; `seo` falls back to `hero.title` / `hero.lead`.
- `publishedAt` is the locale's first publication, `updatedAt` its latest.
- `alternates` lists the other live locales (pages have one URL per page on the website, no per-locale slug).

## Not implemented yet

Commodities, processing capabilities. Their endpoints will follow the same rules when those domains are built.
