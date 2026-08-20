-- Additive delivery evidence and complete tracking coverage for durable hotel records.
ALTER TABLE "FolioEntry"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "HotelAuditEvent"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "HotelOutboxEvent"
  ADD COLUMN "leaseToken" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "deadLetteredAt" TIMESTAMP(3),
  ADD COLUMN "replayedFromEventKey" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "dispatchResultSnapshot" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "HotelOutboxEvent"
  ADD CONSTRAINT "HotelOutboxEvent_maxAttempts_check" CHECK ("maxAttempts" >= 1);

CREATE INDEX "HotelOutboxEvent_tenant_dispatch_idx"
  ON "HotelOutboxEvent"("propertyKey", "status", "availableAt");
CREATE INDEX "HotelOutboxEvent_lease_idx"
  ON "HotelOutboxEvent"("propertyKey", "status", "leaseExpiresAt");

CREATE TABLE "HotelOutboxAttempt" (
  "id" TEXT NOT NULL,
  "outbox" TEXT NOT NULL,
  "propertyKey" TEXT NOT NULL DEFAULT '',
  "attemptNumber" INTEGER NOT NULL,
  "workerId" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL,
  "errorMessage" TEXT NOT NULL DEFAULT '',
  "responseSnapshot" JSONB NOT NULL DEFAULT '{}',
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HotelOutboxAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HotelOutboxAttempt_outbox_fkey" FOREIGN KEY ("outbox") REFERENCES "HotelOutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HotelOutboxAttempt_status_check" CHECK ("status" IN ('succeeded', 'failed')),
  CONSTRAINT "HotelOutboxAttempt_number_check" CHECK ("attemptNumber" >= 1)
);
CREATE UNIQUE INDEX "HotelOutboxAttempt_outbox_attempt_key"
  ON "HotelOutboxAttempt"("outbox", "attemptNumber");
CREATE INDEX "HotelOutboxAttempt_outbox_idx" ON "HotelOutboxAttempt"("outbox");
CREATE INDEX "HotelOutboxAttempt_tenant_idx" ON "HotelOutboxAttempt"("propertyKey", "startedAt");

ALTER TABLE "HotelBusinessDate"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "NightAuditRun"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
