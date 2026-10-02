-- Task 4: terms acceptance at register.
-- Register now requires an explicit "I am 18+ and accept the Terms and
-- Privacy Policy" confirmation. The moment of acceptance and the version of
-- the documents accepted are stamped on the user. Existing users keep NULL —
-- they accepted no versioned terms (their accounts predate this).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "termsVersion" TEXT;
