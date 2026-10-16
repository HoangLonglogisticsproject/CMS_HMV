# HMV Global CMS

Content management system for HMV Global (integrated agricultural supply chain & global trading): an admin CMS
(Next.js) on top of an API (NestJS + Prisma + PostgreSQL).

**Status:** Auth & Identity Hardening is engineering complete; Product Owner manual acceptance is pending.
**Production deployment is not approved.** Details and open items: [`docs/implementation-status.md`](docs/implementation-status.md).

| Path | What |
|---|---|
| `frontend/` | Next.js 16 admin CMS: auth, executive dashboard, EcoNews, media, Pages / Story Studio (mock), supply chain (mock), user management |
| `backend/` | NestJS 12 API: auth & RBAC, articles (revisions, VI/EN, approval, publish), media, users; Prisma schema and migrations |
| `docs/` | Architecture, ADRs, API contracts, operations runbook (`docs/operations/auth-runbook.md`) |
| `docker-compose.yml` | Development PostgreSQL 16 on `127.0.0.1:5442` |

## Run on a new machine

Prerequisites: Git, Node.js 24, Docker Desktop (Compose v2), pnpm 10 (`corepack enable` picks the pinned version).

```bash
git clone https://github.com/HoangLonglogisticsproject/CMS_HMV.git
cd CMS_HMV
pnpm install --frozen-lockfile

cp .env.example .env                           # choose POSTGRES_PASSWORD (local only, gitignored)
cp backend/.env.example backend/.env           # put the same password in DATABASE_URL (replace CHANGE_ME)
cp frontend/.env.example frontend/.env.local   # NEXT_PUBLIC_API_URL=http://localhost:4000

docker compose up -d postgres                  # data lives in the postgres_data volume
pnpm --filter backend db:migrate               # prisma migrate deploy
pnpm --filter backend build
pnpm --filter backend user:create --email you@example.com --name "Your Name" --role ADMIN   # prompts for the password

pnpm dev:backend                               # API  http://localhost:4000/api/v1
pnpm dev:frontend                              # CMS  http://localhost:3000
```

`POSTGRES_PASSWORD` is only used when the `postgres_data` volume is first created; afterwards the role keeps its own
password (change it inside the container with `\password hmv_user`, then update `.env` and `backend/.env`).
Never commit `.env` files, database dumps or credentials.

## Tests

```bash
pnpm typecheck && pnpm lint
pnpm --filter backend test                     # unit
pnpm --filter backend test:e2e                 # integration, database hmv_cms_test
pnpm --filter frontend exec playwright install chromium   # once per machine
pnpm --filter frontend test:e2e                # browser E2E on :4100/:3100, database hmv_cms_e2e_test
```

Test databases end in `_test`, are created and migrated automatically, and reuse the server and credentials of
`DATABASE_URL` in `backend/.env` (override with `TEST_DATABASE_URL` / `E2E_DATABASE_URL`). Tests never touch the
development database `hmv_cms` and use their own `*@e2e.test` accounts.
