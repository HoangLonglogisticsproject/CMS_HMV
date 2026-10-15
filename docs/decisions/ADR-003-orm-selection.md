# ADR-003: Selection of Prisma ORM

## Status
Accepted

## Context
A type-safe, migration-friendly ORM is required for PostgreSQL in NestJS. Primary candidates evaluated: **Prisma** vs **Drizzle**.

## Evaluation Criteria
1. **Schema Centralization & Evolution**: HMV CMS has interconnected entities across Content, Localization, Revisions, and Supply Chain. A single human-readable declaration schema (`schema.prisma`) simplifies team collaboration and automated migration diffs.
2. **NestJS Ecosystem Maturity**: Prisma has long-standing, battle-tested integration patterns with NestJS dependency injection, life-cycle hooks (`onModuleInit`), and Swagger plugins.
3. **Audit Snapshotting & Relations**: Prisma's relational query API (`include`, nested relations, transaction management) aligns well with revision creation and dual-locale translation tracking.

## Decision
We select **Prisma ORM (v6.x stable)** as the primary database access layer for NestJS.

## Consequences
- Clean migrations stored in `backend/prisma/migrations`.
- Strongly-typed Prisma Client shared across NestJS services via a global `DatabaseModule`.
