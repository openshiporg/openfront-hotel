-- Add a controlled property business-date boundary, immutable night-audit runs,
-- and the minimum group-block/allocation aggregate. Raw lifecycle CRUD remains
-- denied; custom commands own these records.

CREATE TABLE "HotelBusinessDate" (
  "id" INTEGER NOT NULL,
  "propertyKey" TEXT NOT NULL DEFAULT '',
  "currentBusinessDate" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HotelBusinessDate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HotelBusinessDate_propertyKey_key" ON "HotelBusinessDate"("propertyKey");
INSERT INTO "HotelBusinessDate" ("id", "propertyKey", "currentBusinessDate")
VALUES (1, 'the-alder-house', date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'));

CREATE TABLE "NightAuditRun" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL DEFAULT '',
  "requestHash" TEXT NOT NULL DEFAULT '',
  "propertyKey" TEXT NOT NULL DEFAULT '',
  "businessDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL,
  "dueBookingCount" INTEGER NOT NULL,
  "postedEntryCount" INTEGER NOT NULL,
  "existingEntryCount" INTEGER NOT NULL,
  "exceptionCount" INTEGER NOT NULL,
  "debitMinor" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NightAuditRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NightAuditRun_status_check" CHECK ("status" IN ('completed', 'failed')),
  CONSTRAINT "NightAuditRun_counts_check" CHECK (
    "dueBookingCount" >= 0 AND "postedEntryCount" >= 0 AND
    "existingEntryCount" >= 0 AND "exceptionCount" >= 0 AND "debitMinor" >= 0
  )
);
CREATE UNIQUE INDEX "NightAuditRun_eventKey_key" ON "NightAuditRun"("eventKey");
CREATE UNIQUE INDEX "NightAuditRun_businessDate_key" ON "NightAuditRun"("businessDate");

CREATE TABLE "GroupBlock" (
  "id" TEXT NOT NULL,
  "blockCode" TEXT NOT NULL DEFAULT '',
  "name" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL,
  "arrivalDate" TIMESTAMP(3) NOT NULL,
  "departureDate" TIMESTAMP(3) NOT NULL,
  "releaseDate" TIMESTAMP(3),
  "contactName" TEXT NOT NULL DEFAULT '',
  "contactEmail" TEXT NOT NULL DEFAULT '',
  "billingType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupBlock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GroupBlock_dates_check" CHECK ("departureDate" > "arrivalDate"),
  CONSTRAINT "GroupBlock_status_check" CHECK ("status" IN ('tentative', 'definite', 'released', 'cancelled')),
  CONSTRAINT "GroupBlock_billing_check" CHECK ("billingType" IN ('guest_pays', 'master_folio', 'split'))
);
CREATE UNIQUE INDEX "GroupBlock_blockCode_key" ON "GroupBlock"("blockCode");

CREATE TABLE "GroupBlockAllocation" (
  "id" TEXT NOT NULL,
  "allocationKey" TEXT NOT NULL DEFAULT '',
  "groupBlock" TEXT NOT NULL,
  "roomType" TEXT NOT NULL,
  "roomsHeld" INTEGER NOT NULL,
  "roomsPickedUp" INTEGER NOT NULL,
  "rateMinor" INTEGER NOT NULL,
  "currencyCode" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupBlockAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GroupBlockAllocation_counts_check" CHECK (
    "roomsHeld" > 0 AND "roomsPickedUp" >= 0 AND
    "roomsPickedUp" <= "roomsHeld" AND "rateMinor" >= 0
  )
);
CREATE UNIQUE INDEX "GroupBlockAllocation_allocationKey_key" ON "GroupBlockAllocation"("allocationKey");
CREATE INDEX "GroupBlockAllocation_groupBlock_idx" ON "GroupBlockAllocation"("groupBlock");
CREATE INDEX "GroupBlockAllocation_roomType_idx" ON "GroupBlockAllocation"("roomType");
ALTER TABLE "GroupBlockAllocation" ADD CONSTRAINT "GroupBlockAllocation_groupBlock_fkey"
  FOREIGN KEY ("groupBlock") REFERENCES "GroupBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupBlockAllocation" ADD CONSTRAINT "GroupBlockAllocation_roomType_fkey"
  FOREIGN KEY ("roomType") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
