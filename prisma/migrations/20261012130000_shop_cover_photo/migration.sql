-- Separate the public shop avatar from its optional wide cover image.
-- Production may already have this column; IF NOT EXISTS keeps this migration safe.
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "coverPhotoUrl" TEXT;
