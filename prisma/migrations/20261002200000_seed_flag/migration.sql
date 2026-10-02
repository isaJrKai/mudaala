-- PLACEHOLDER RULE — seed marker.
-- Seed rows are development fixtures, never real content: flagged isSeed so
-- scripts/remove-seed-data.ts deletes them in one step before launch, and so
-- sitemaps / Open Graph images never ship placeholder photos as real data.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isSeed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN "isSeed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "isSeed" BOOLEAN NOT NULL DEFAULT false;
