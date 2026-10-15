# HMV Global CMS — Backend

NestJS 12 + Prisma 6 + PostgreSQL 16. Owns data, business rules, authentication/authorization and the API
contract. Frontend integration: [`../docs/api/admin-integration-contract.md`](../docs/api/admin-integration-contract.md).

Implemented: **auth & RBAC**, **articles** (revisions, EN/VI, approval, publish, archive, preview, public
API), **media** (upload, metadata, usage tracking, local + R2 storage). Not yet: pages, commodities,
supply-chain stages, dashboard, user management.

## Run locally

```bash
docker compose up -d postgres          # from the repo root; Postgres on localhost:5442
cp backend/.env.example backend/.env    # then adjust
pnpm install
pnpm --filter backend db:migrate        # prisma migrate deploy
pnpm --filter backend build
pnpm --filter backend user:create --email you@hmv.vn --name "Tên" --role ADMIN   # first admin; prompts for the password
pnpm --filter backend start:dev         # http://localhost:4000/api/v1, Swagger UI at /docs (non-production)
```

## Scripts

| Script | What it does |
|---|---|
| `build` | `nest build` (runs the Swagger CLI plugin that documents DTOs) |
| `start:dev` / `start:prod` | Watch mode / run `dist/main.js` |
| `db:migrate` | Apply versioned migrations (`prisma migrate deploy`). Never `db push`. |
| `test` | Unit tests (rich-content validator, image sniffing) |
| `test:e2e` | Build, migrate the `*_test` database, export OpenAPI, run integration tests against PostgreSQL |
| `openapi:export` | Write `../docs/api/openapi-spec.json` |
| `user:create` | Create a NEW user (refuses an existing email; never overwrites). Password at a hidden prompt, or `HMV_USER_PASSWORD`/stdin for automation |
| `user:reset-password` | Set a new password for one existing user and revoke its sessions (asks for confirmation; `--yes` when non-interactive) |
| `user:list` | Read-only list of accounts, roles, last login and active sessions (no hashes) |
| `lint`, `typecheck` | oxlint, `tsc --noEmit` |

New migration: edit `prisma/schema.prisma`, then `npx prisma migrate dev --name <change> --create-only`,
review the SQL, commit it, apply with `db:migrate`.

## Layout

```
src/
  app.setup.ts          pipeline shared by main.ts and tests (prefix, validation, errors, CORS, headers, OpenAPI)
  config.ts             typed, validated environment
  common/               error codes + filter, pagination DTOs, audit helper
  infrastructure/       PrismaService; ObjectStorage (local disk, Cloudflare R2)
  modules/auth/         login/logout/session, global guard (session, CSRF, origin, permissions), scrypt
  modules/articles/     admin + public controllers, service, rich-content validator
  modules/media/        upload/list/update/usages, image sniffing
  scripts/              export-openapi, create-user
prisma/                 schema + migrations (reference data is seeded inside the migrations)
test/                   PostgreSQL integration tests + OpenAPI response-contract checker
```

## Environment

See [`.env.example`](./.env.example). Production needs at least `NODE_ENV=production`, `DATABASE_URL`,
`CORS_ORIGIN`, `TRUST_PROXY` (behind a proxy/CDN), and for R2: `STORAGE_DRIVER=r2`, `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `MEDIA_PUBLIC_BASE_URL` (bucket's public domain).

## Tests

Integration tests need the Postgres container. They run against `hmv_cms_test` (override with
`TEST_DATABASE_URL`; the name must end in `_test`) and truncate its data. Responses are checked against the
generated OpenAPI schemas, so undocumented or missing fields fail the build.

Design decisions: [ADR-004](../docs/decisions/ADR-004-content-revisions-and-localization.md) (revisions,
locales, approvals), [ADR-005](../docs/decisions/ADR-005-admin-authentication.md) (auth),
[ADR-006](../docs/decisions/ADR-006-media-storage.md) (media).
