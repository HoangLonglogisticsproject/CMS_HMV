## What and why

<!-- Milestone or problem, and the change in a few lines. -->

## Verification

- [ ] CI is green: `quality`, `integration`, `e2e`
- [ ] New or changed behaviour is covered by a test; no assertion was removed or weakened to pass CI
- [ ] UI change: screenshots below

## Safety

- [ ] No secrets, `.env` files, database dumps or real credentials (development accounts included)
- [ ] Database changes are new Prisma migrations only (no `db push`, no reset); API changes regenerate `docs/api/openapi-spec.json` and `frontend/src/lib/api/schema.d.ts`
- [ ] No deployment and no production configuration change
