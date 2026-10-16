# HMV Global CMS — Frontend

Next.js 16 (App Router) admin UI. Auth, EcoNews articles and the media library run against the NestJS API;
Dashboard, Pages, Commodities and Supply-chain stages still use the mock adapter (`src/lib/mocks`).
Integration contract: [`../docs/api/admin-integration-contract.md`](../docs/api/admin-integration-contract.md).

## Run against the real API

```bash
docker compose up -d postgres                  # repo root (Postgres on :5442; needs .env, see ../README.md)
pnpm --filter backend db:migrate && pnpm --filter backend build
pnpm --filter backend user:create --email you@hmv.vn --name "Tên" --role ADMIN   # prompts for the password
pnpm --filter backend start:dev                # API on :4000
cp frontend/.env.example frontend/.env.local   # NEXT_PUBLIC_API_URL=http://localhost:4000
pnpm --filter frontend dev                     # CMS on :3000 → /login
```

The API's `CORS_ORIGIN` must contain the CMS origin. `NEXT_PUBLIC_API_URL` is inlined at build time.

## Scripts

| Script | What it does |
|---|---|
| `dev`, `build`, `start` | Next.js |
| `typecheck`, `lint` | `tsc --noEmit`, ESLint |
| `api:generate` | Regenerate `src/lib/api/schema.d.ts` from `../docs/api/openapi-spec.json` |
| `test:e2e` | Playwright against the real stack (see below) |

## Browser E2E

`pnpm --filter frontend test:e2e` starts the built API on :4100 with its own database `hmv_cms_e2e_test` (wiped and
re-provisioned with one user per role) and a production build of this app on :3100 (built into `.next-e2e`, so a
running `next dev` is not disturbed). Requires the Postgres container and `pnpm --filter backend build`. The database
URL reuses the server and credentials of `DATABASE_URL` in `backend/.env` (override with `E2E_DATABASE_URL`).
First run on a machine: `npx playwright install chromium`.

## Where things live

- `src/lib/api/` — typed client (`client.ts`), error messages (`errors.ts`), query keys, generated `schema.d.ts`
- `src/modules/auth/` — session hooks, login, auth gate (re-login on expiry)
- `src/modules/content/articles/queries`, `utils/article-form.ts` — article hooks, form ↔ API mapping
- `src/modules/content/media/queries` — media hooks (upload with progress)
- `e2e/` — Playwright specs
