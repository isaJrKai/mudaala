-- Task 2: reports + basic moderation.
-- New tables: Report (one flag per reporter per target) and AuditLog
-- (immutable moderation paper trail). No existing columns change shape —
-- Listing.status gains a new VALUE ("HIDDEN") only, which needs no DDL.

-- CreateTable Report
CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reporterId" TEXT,
    "reporterIp" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable AuditLog
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_status_idx" ON "Report"("targetType", "targetId", "status");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_reporterId_status_idx" ON "Report"("reporterId", "status");

-- CreateIndex
CREATE INDEX "Report_reporterIp_status_idx" ON "Report"("reporterIp", "status");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
