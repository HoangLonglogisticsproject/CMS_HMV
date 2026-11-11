-- CreateEnum
CREATE TYPE "TradeInquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "InquiryNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "trade_inquiries" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "TradeInquiryStatus" NOT NULL DEFAULT 'NEW',
    "locale" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT,
    "goods" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "volumeAmount" TEXT,
    "volumeUnit" TEXT,
    "application" TEXT,
    "transport" TEXT,
    "requirements" JSONB NOT NULL,
    "buyerNotes" TEXT,
    "company" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "landingPage" TEXT,
    "referrerOrigin" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "contactConsentAt" TIMESTAMP(3) NOT NULL,
    "assignedToId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notificationStatus" "InquiryNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "notificationAttempts" INTEGER NOT NULL DEFAULT 0,
    "notificationLastAttemptAt" TIMESTAMP(3),

    CONSTRAINT "trade_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_inquiry_notes" (
    "id" UUID NOT NULL,
    "inquiryId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_inquiry_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trade_inquiries_reference_key" ON "trade_inquiries"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "trade_inquiries_idempotencyKey_key" ON "trade_inquiries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "trade_inquiries_createdAt_idx" ON "trade_inquiries"("createdAt");

-- CreateIndex
CREATE INDEX "trade_inquiries_status_createdAt_idx" ON "trade_inquiries"("status", "createdAt");

-- CreateIndex
CREATE INDEX "trade_inquiries_assignedToId_status_idx" ON "trade_inquiries"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "trade_inquiries_email_idx" ON "trade_inquiries"("email");

-- CreateIndex
CREATE INDEX "trade_inquiries_productId_createdAt_idx" ON "trade_inquiries"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "trade_inquiries_utmSource_createdAt_idx" ON "trade_inquiries"("utmSource", "createdAt");

-- CreateIndex
CREATE INDEX "trade_inquiry_notes_inquiryId_createdAt_idx" ON "trade_inquiry_notes"("inquiryId", "createdAt");

-- AddForeignKey
ALTER TABLE "trade_inquiries" ADD CONSTRAINT "trade_inquiries_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_inquiry_notes" ADD CONSTRAINT "trade_inquiry_notes_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "trade_inquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_inquiry_notes" ADD CONSTRAINT "trade_inquiry_notes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Sales permissions and the SALES role (docs/sales/TRADE_INQUIRIES.md). Additive: ADMIN gains both permissions;
-- EDITOR, REVIEWER and VIEWER gain nothing; no existing grant is removed. Idempotent, so re-running it is harmless.
INSERT INTO "permissions" ("code", "description") VALUES
  ('inquiry:read',  'View trade inquiries in the sales inbox'),
  ('inquiry:write', 'Update inquiry status and assignment, add notes, resend notifications')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "roles" ("code", "name", "description") VALUES
  ('SALES', 'Sales', 'Handles trade inquiries from the website')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("roleCode", "permissionCode") VALUES
  ('SALES', 'inquiry:read'), ('SALES', 'inquiry:write'),
  ('ADMIN', 'inquiry:read'), ('ADMIN', 'inquiry:write')
ON CONFLICT DO NOTHING;
