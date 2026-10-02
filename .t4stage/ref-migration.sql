-- Task 3: password reset by SMS code.
-- New table: PasswordReset — one row per issued code. The 6-digit code is
-- stored ONLY as a salted sha256 hash ("salt:hash"); expiresAt is
-- createdAt + 10 minutes; attempts counts wrong entries (dead at 5);
-- usedAt burns the code on success. No existing columns change shape.

-- CreateTable PasswordReset
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PasswordReset_userId_usedAt_idx" ON "PasswordReset"("userId", "usedAt");

-- CreateIndex
CREATE INDEX "PasswordReset_expiresAt_idx" ON "PasswordReset"("expiresAt");
