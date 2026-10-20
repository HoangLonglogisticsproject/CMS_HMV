// Deletes all content, media rows and users from a *test* database, keeping reference data
// (locales, roles, permissions, categories). Used by the backend integration tests and the browser E2E setup.
// Usage: DATABASE_URL=...hmv_cms_e2e_test pnpm --filter backend exec node dist/scripts/reset-test-data.js
import { PrismaClient } from '@prisma/client';

export async function resetTestData(prisma: PrismaClient) {
  const database = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
  if (!database.endsWith('_test')) {
    throw new Error(
      `Refusing to wipe "${database}": the database name must end with "_test"`,
    );
  }
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE audit_logs, sessions, user_roles, article_revision_media, article_slugs,
    article_published_locales, article_translation_approvals, article_revision_translations, article_revisions, articles,
    page_published_locales, page_translation_reviews, page_revision_translations, page_revisions,
    media_asset_translations, media_assets, users CASCADE`);
  // `pages` rows are reference data seeded by migrations (like locales), so they are kept.
}

if (require.main === module) {
  const prisma = new PrismaClient();
  resetTestData(prisma)
    .then(() => console.log('Test data reset'))
    .catch((err: unknown) => {
      console.error((err as Error).message);
      process.exitCode = 1;
    })
    .finally(() => void prisma.$disconnect());
}
