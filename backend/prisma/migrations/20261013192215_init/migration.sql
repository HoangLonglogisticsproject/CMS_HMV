-- CreateEnum
CREATE TYPE "MediaCategory" AS ENUM ('COMMODITY', 'FACILITY', 'LOGISTICS', 'CERTIFICATE', 'EVENT');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SupportedLocale" AS ENUM ('en', 'vi');

-- CreateEnum
CREATE TYPE "CapabilityTier" AS ENUM ('DIRECT_OPERATION', 'STRATEGIC_PARTNER', 'IN_DEVELOPMENT');

-- CreateTable
CREATE TABLE "locales" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "locales_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "permissions" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleCode" TEXT NOT NULL,
    "permissionCode" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleCode","permissionCode")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" UUID NOT NULL,
    "roleCode" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleCode")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_categories" (
    "code" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "article_categories_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "article_category_translations" (
    "categoryCode" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "article_category_translations_pkey" PRIMARY KEY ("categoryCode","locale")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL,
    "draftRevisionId" UUID,
    "publishedRevisionId" UUID,
    "firstPublishedAt" TIMESTAMP(3),
    "lastPublishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "archivedById" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_revisions" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "coverMediaId" UUID,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "authorName" TEXT,
    "authorRole" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_revision_translations" (
    "revisionId" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "content" JSONB,
    "contentVersion" INTEGER NOT NULL DEFAULT 1,
    "coverImageAlt" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "contentHash" TEXT NOT NULL,
    "sourceLocale" TEXT,
    "sourceHash" TEXT,

    CONSTRAINT "article_revision_translations_pkey" PRIMARY KEY ("revisionId","locale")
);

-- CreateTable
CREATE TABLE "article_translation_approvals" (
    "articleId" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "approvedById" UUID NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_translation_approvals_pkey" PRIMARY KEY ("articleId","locale","contentHash")
);

-- CreateTable
CREATE TABLE "article_published_locales" (
    "articleId" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_published_locales_pkey" PRIMARY KEY ("articleId","locale")
);

-- CreateTable
CREATE TABLE "article_slugs" (
    "locale" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "articleId" UUID NOT NULL,

    CONSTRAINT "article_slugs_pkey" PRIMARY KEY ("locale","slug")
);

-- CreateTable
CREATE TABLE "article_revision_media" (
    "revisionId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,

    CONSTRAINT "article_revision_media_pkey" PRIMARY KEY ("revisionId","mediaId")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "MediaCategory",
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_asset_translations" (
    "mediaId" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "altText" TEXT NOT NULL,

    CONSTRAINT "media_asset_translations_pkey" PRIMARY KEY ("mediaId","locale")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "systemKey" TEXT NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_translations" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "locale" "SupportedLocale" NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "sections" JSONB,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "isStale" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "page_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commodities" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commodities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commodity_translations" (
    "id" TEXT NOT NULL,
    "commodityId" TEXT NOT NULL,
    "locale" "SupportedLocale" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "originStory" TEXT,
    "description" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "isStale" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "commodity_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "commodityId" TEXT NOT NULL,
    "skuCode" TEXT NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variant_translations" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "locale" "SupportedLocale" NOT NULL,
    "name" TEXT NOT NULL,
    "grade" TEXT,
    "packaging" TEXT,
    "isStale" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_variant_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_specifications" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "specKey" TEXT NOT NULL,
    "specValue" TEXT NOT NULL,

    CONSTRAINT "product_specifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_capabilities" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tier" "CapabilityTier" NOT NULL DEFAULT 'STRATEGIC_PARTNER',
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processing_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_capability_translations" (
    "id" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "locale" "SupportedLocale" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isStale" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "processing_capability_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "articles_draftRevisionId_key" ON "articles"("draftRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "articles_publishedRevisionId_key" ON "articles"("publishedRevisionId");

-- CreateIndex
CREATE INDEX "articles_updatedAt_idx" ON "articles"("updatedAt");

-- CreateIndex
CREATE INDEX "articles_firstPublishedAt_idx" ON "articles"("firstPublishedAt");

-- CreateIndex
CREATE INDEX "article_revisions_coverMediaId_idx" ON "article_revisions"("coverMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "article_revisions_articleId_number_key" ON "article_revisions"("articleId", "number");

-- CreateIndex
CREATE INDEX "article_revision_translations_locale_slug_idx" ON "article_revision_translations"("locale", "slug");

-- CreateIndex
CREATE INDEX "article_slugs_articleId_idx" ON "article_slugs"("articleId");

-- CreateIndex
CREATE INDEX "article_revision_media_mediaId_idx" ON "article_revision_media"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storageKey_key" ON "media_assets"("storageKey");

-- CreateIndex
CREATE INDEX "media_assets_category_createdAt_idx" ON "media_assets"("category", "createdAt");

-- CreateIndex
CREATE INDEX "media_assets_createdAt_idx" ON "media_assets"("createdAt");

-- CreateIndex
CREATE INDEX "media_assets_checksumSha256_idx" ON "media_assets"("checksumSha256");

-- CreateIndex
CREATE UNIQUE INDEX "pages_systemKey_key" ON "pages"("systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "page_translations_pageId_locale_key" ON "page_translations"("pageId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "page_translations_locale_slug_key" ON "page_translations"("locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "commodities_code_key" ON "commodities"("code");

-- CreateIndex
CREATE UNIQUE INDEX "commodity_translations_commodityId_locale_key" ON "commodity_translations"("commodityId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "commodity_translations_locale_slug_key" ON "commodity_translations"("locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_skuCode_key" ON "product_variants"("skuCode");

-- CreateIndex
CREATE UNIQUE INDEX "product_variant_translations_variantId_locale_key" ON "product_variant_translations"("variantId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "processing_capabilities_code_key" ON "processing_capabilities"("code");

-- CreateIndex
CREATE UNIQUE INDEX "processing_capability_translations_capabilityId_locale_key" ON "processing_capability_translations"("capabilityId", "locale");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleCode_fkey" FOREIGN KEY ("roleCode") REFERENCES "roles"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionCode_fkey" FOREIGN KEY ("permissionCode") REFERENCES "permissions"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleCode_fkey" FOREIGN KEY ("roleCode") REFERENCES "roles"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_category_translations" ADD CONSTRAINT "article_category_translations_categoryCode_fkey" FOREIGN KEY ("categoryCode") REFERENCES "article_categories"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_category_translations" ADD CONSTRAINT "article_category_translations_locale_fkey" FOREIGN KEY ("locale") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_draftRevisionId_fkey" FOREIGN KEY ("draftRevisionId") REFERENCES "article_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_publishedRevisionId_fkey" FOREIGN KEY ("publishedRevisionId") REFERENCES "article_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_categoryCode_fkey" FOREIGN KEY ("categoryCode") REFERENCES "article_categories"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_revision_translations" ADD CONSTRAINT "article_revision_translations_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "article_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_revision_translations" ADD CONSTRAINT "article_revision_translations_locale_fkey" FOREIGN KEY ("locale") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_translation_approvals" ADD CONSTRAINT "article_translation_approvals_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_translation_approvals" ADD CONSTRAINT "article_translation_approvals_locale_fkey" FOREIGN KEY ("locale") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_translation_approvals" ADD CONSTRAINT "article_translation_approvals_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_published_locales" ADD CONSTRAINT "article_published_locales_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_published_locales" ADD CONSTRAINT "article_published_locales_locale_fkey" FOREIGN KEY ("locale") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_slugs" ADD CONSTRAINT "article_slugs_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_slugs" ADD CONSTRAINT "article_slugs_locale_fkey" FOREIGN KEY ("locale") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_revision_media" ADD CONSTRAINT "article_revision_media_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "article_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_revision_media" ADD CONSTRAINT "article_revision_media_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset_translations" ADD CONSTRAINT "media_asset_translations_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset_translations" ADD CONSTRAINT "media_asset_translations_locale_fkey" FOREIGN KEY ("locale") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_translations" ADD CONSTRAINT "page_translations_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commodity_translations" ADD CONSTRAINT "commodity_translations_commodityId_fkey" FOREIGN KEY ("commodityId") REFERENCES "commodities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_commodityId_fkey" FOREIGN KEY ("commodityId") REFERENCES "commodities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variant_translations" ADD CONSTRAINT "product_variant_translations_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_specifications" ADD CONSTRAINT "product_specifications_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_capability_translations" ADD CONSTRAINT "processing_capability_translations_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "processing_capabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------
-- Reference data. Changes to these rows ship as new migrations.
-- ----------------------------------------------------
INSERT INTO "locales" ("code", "name") VALUES
  ('vi', 'Tiếng Việt'),
  ('en', 'English');

INSERT INTO "permissions" ("code", "description") VALUES
  ('article:read',    'View articles, drafts and previews in the admin'),
  ('article:write',   'Create articles and edit drafts'),
  ('article:review',  'Approve article translations for publication'),
  ('article:publish', 'Publish approved article revisions'),
  ('article:archive', 'Archive and restore articles'),
  ('media:read',      'View the media library'),
  ('media:write',     'Upload media and edit media metadata');

INSERT INTO "roles" ("code", "name", "description") VALUES
  ('ADMIN',    'Administrator', 'All permissions'),
  ('EDITOR',   'Editor',        'Writes article drafts and manages media'),
  ('REVIEWER', 'Reviewer',      'Approves translations, publishes and archives'),
  ('VIEWER',   'Viewer',        'Read-only access');

INSERT INTO "role_permissions" ("roleCode", "permissionCode")
  SELECT 'ADMIN', "code" FROM "permissions";
INSERT INTO "role_permissions" ("roleCode", "permissionCode") VALUES
  ('EDITOR', 'article:read'), ('EDITOR', 'article:write'), ('EDITOR', 'media:read'), ('EDITOR', 'media:write'),
  ('REVIEWER', 'article:read'), ('REVIEWER', 'article:review'), ('REVIEWER', 'article:publish'),
  ('REVIEWER', 'article:archive'), ('REVIEWER', 'media:read'),
  ('VIEWER', 'article:read'), ('VIEWER', 'media:read');

INSERT INTO "article_categories" ("code", "sortOrder") VALUES
  ('SUPPLY_CHAIN_INSIGHTS', 1),
  ('QUALITY_STANDARDS', 2),
  ('COLD_CHAIN_INTEL', 3),
  ('GLOBAL_TRADE_INVESTMENT', 4),
  ('LOGISTICS_OPERATIONS', 5),
  ('SUSTAINABILITY_ENERGY', 6);

INSERT INTO "article_category_translations" ("categoryCode", "locale", "name") VALUES
  ('SUPPLY_CHAIN_INSIGHTS', 'en', 'Supply Chain Insights'),
  ('SUPPLY_CHAIN_INSIGHTS', 'vi', 'Thông Tin Chuỗi Cung Ứng'),
  ('QUALITY_STANDARDS', 'en', 'Quality & Agricultural Standards'),
  ('QUALITY_STANDARDS', 'vi', 'Tiêu Chuẩn Nông Sản & Chất Lượng'),
  ('COLD_CHAIN_INTEL', 'en', 'Cold Chain Intelligence'),
  ('COLD_CHAIN_INTEL', 'vi', 'Bảo Quản & Chuỗi Lạnh'),
  ('GLOBAL_TRADE_INVESTMENT', 'en', 'Global Trade & Investment'),
  ('GLOBAL_TRADE_INVESTMENT', 'vi', 'Thương Mại & Đầu Tư Quốc Tế'),
  ('LOGISTICS_OPERATIONS', 'en', 'Trade & Logistics Operations'),
  ('LOGISTICS_OPERATIONS', 'vi', 'Vận Hành Logistics'),
  ('SUSTAINABILITY_ENERGY', 'en', 'Sustainability & Renewable Energy'),
  ('SUSTAINABILITY_ENERGY', 'vi', 'Phát Triển Bền Vững & Năng Lượng');
