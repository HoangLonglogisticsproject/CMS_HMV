# ADR-002: Frontend & Backend Separation

## Status
Accepted

## Context
Next.js provides full-stack capabilities (Route Handlers, Server Actions). However, for an enterprise CMS with complex authorization (RBAC), audit logging, database migrations, background workflows, and public API delivery to independent websites, coupling business logic inside Next.js creates technical debt and prevents clean multi-client access.

## Decision
- **NestJS** is the sole owner of business logic, database operations, transactional consistency, audit trails, and authentication/authorization.
- **Next.js** operates strictly as an admin front-of-house UI. All data interactions are conducted via HTTP calls to the NestJS REST API (`/api/v1/*`).
- Next.js server components / actions must never import Prisma Client or connect directly to PostgreSQL.

## Consequences
- Clean separation of concerns.
- Independent deployment and scaling of API server vs. CMS web client.
- The Public Content Delivery API can be consumed by the independently developed public website without involving Next.js runtime.
