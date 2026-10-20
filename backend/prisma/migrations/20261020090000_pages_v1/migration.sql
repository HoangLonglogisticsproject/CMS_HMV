-- Pages V1 (ADR-008): replaces the unused scaffold `pages` / `page_translations` with revisioned, localized pages.
-- The scaffold tables were never written by any code. The guard below aborts the migration if they hold data,
-- so this can never drop real content. The shared scaffold enums (PublicationStatus, SupportedLocale) stay:
-- the commodity/product scaffolds still use them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "pages") OR EXISTS (SELECT 1 FROM "page_translations") THEN
    RAISE EXCEPTION 'pages scaffold tables contain data; refusing to replace them';
  END IF;
END $$;

DROP TABLE "page_translations";
DROP TABLE "pages";

-- CreateEnum
CREATE TYPE "PageReviewStatus" AS ENUM ('IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED');

-- CreateTable
CREATE TABLE "pages" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_revisions" (
    "id" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_revision_translations" (
    "revisionId" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "contentVersion" INTEGER NOT NULL DEFAULT 1,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "page_revision_translations_pkey" PRIMARY KEY ("revisionId","locale")
);

-- CreateTable
CREATE TABLE "page_translation_reviews" (
    "pageId" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" "PageReviewStatus" NOT NULL,
    "note" TEXT,
    "actorId" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_translation_reviews_pkey" PRIMARY KEY ("pageId","locale")
);

-- CreateTable
CREATE TABLE "page_published_locales" (
    "pageId" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "revisionId" UUID NOT NULL,
    "firstPublishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" UUID NOT NULL,

    CONSTRAINT "page_published_locales_pkey" PRIMARY KEY ("pageId","locale")
);

-- CreateIndex
CREATE UNIQUE INDEX "pages_key_key" ON "pages"("key");

-- CreateIndex
CREATE UNIQUE INDEX "page_revisions_pageId_number_key" ON "page_revisions"("pageId", "number");

-- CreateIndex
CREATE INDEX "page_published_locales_revisionId_idx" ON "page_published_locales"("revisionId");

-- AddForeignKey
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_revision_translations" ADD CONSTRAINT "page_revision_translations_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "page_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_revision_translations" ADD CONSTRAINT "page_revision_translations_locale_fkey" FOREIGN KEY ("locale") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_translation_reviews" ADD CONSTRAINT "page_translation_reviews_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_translation_reviews" ADD CONSTRAINT "page_translation_reviews_locale_fkey" FOREIGN KEY ("locale") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_translation_reviews" ADD CONSTRAINT "page_translation_reviews_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_published_locales" ADD CONSTRAINT "page_published_locales_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_published_locales" ADD CONSTRAINT "page_published_locales_locale_fkey" FOREIGN KEY ("locale") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_published_locales" ADD CONSTRAINT "page_published_locales_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "page_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_published_locales" ADD CONSTRAINT "page_published_locales_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: the pages the website renders from the CMS. Content arrives through the editor, not the migration.
INSERT INTO "pages" ("id", "key") VALUES (gen_random_uuid(), 'about');

-- Seed: page permissions. ADMIN holds every permission; EDITOR writes and submits; REVIEWER reviews and publishes.
INSERT INTO "permissions" ("code", "description") VALUES
  ('page:read', 'Read website pages and their workflow state'),
  ('page:write', 'Edit website page drafts and submit translations for review'),
  ('page:review', 'Approve or request changes on submitted page translations'),
  ('page:publish', 'Publish approved page translations')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("roleCode", "permissionCode") VALUES
  ('ADMIN', 'page:read'), ('ADMIN', 'page:write'), ('ADMIN', 'page:review'), ('ADMIN', 'page:publish'),
  ('EDITOR', 'page:read'), ('EDITOR', 'page:write'),
  ('REVIEWER', 'page:read'), ('REVIEWER', 'page:review'), ('REVIEWER', 'page:publish'),
  ('VIEWER', 'page:read')
ON CONFLICT DO NOTHING;
