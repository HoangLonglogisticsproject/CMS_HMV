# ADR-001: Monorepo Topology with PNPM Workspaces

## Status
Accepted (Hardened in Review)

## Context
HMV Global CMS requires two primary applications:
1. An admin dashboard frontend (Next.js App Router).
2. A scalable, type-safe API backend (NestJS).

Initially, an extra workspace `packages/api-contracts` was scaffolded. However, maintaining duplicate handwritten DTOs across monorepo packages introduces synchronization overhead.

## Decision
We utilize a clean **2-application pnpm workspace**:
- `frontend/`: Next.js 16+ App Router, Tailwind CSS, TypeScript.
- `backend/`: NestJS 11+, Prisma ORM, PostgreSQL.
- API contracts are governed directly by **NestJS OpenAPI Swagger** (`/docs` and exported `docs/api/openapi-spec.json`).
- Frontend derives strongly-typed API schemas using `openapi-typescript` (`src/lib/api/schema.d.ts`).
- Workspace `packages/api-contracts` was eliminated to prevent boilerplate duplication.

## Consequences
- Zero duplicate type definitions: Backend Swagger annotations remain the single source of truth.
- Frontend builds with fully generated, strictly typed request/response contracts.
- Simplified dependency graph with only 2 projects in `pnpm-workspace.yaml`.
