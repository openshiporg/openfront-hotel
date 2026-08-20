-- Enforce behavioral ownership for hotel lifecycle records and add durable
-- audit/outbox evidence. Configuration and replay-specific evidence remain
-- standalone by design.

ALTER TABLE "RoomInventory" ADD COLUMN "inventoryKey" TEXT;
UPDATE "RoomInventory"
SET "inventoryKey" = "roomType" || ':' || to_char("date" AT TIME ZONE 'UTC', 'YYYY-MM-DD');
ALTER TABLE "RoomInventory" ALTER COLUMN "inventoryKey" SET NOT NULL;
CREATE UNIQUE INDEX "RoomInventory_inventoryKey_key" ON "RoomInventory"("inventoryKey");

ALTER TABLE "ChannelReservation" ADD COLUMN "channelKey" TEXT;
UPDATE "ChannelReservation"
SET "channelKey" = "channel" || ':' || "externalId";
ALTER TABLE "ChannelReservation" ALTER COLUMN "channelKey" SET NOT NULL;
CREATE UNIQUE INDEX "ChannelReservation_channelKey_key" ON "ChannelReservation"("channelKey");

-- These relationships are required for operational correctness. Historical
-- evidence that can legitimately arrive unmatched (PaymentEvent and an
-- unlinked ChannelReservation reservation/room type) intentionally stays nullable.
ALTER TABLE "Room" ALTER COLUMN "roomType" SET NOT NULL;
ALTER TABLE "RoomInventory" ALTER COLUMN "roomType" SET NOT NULL;
ALTER TABLE "HousekeepingTask" ALTER COLUMN "room" SET NOT NULL;
ALTER TABLE "RoomAssignment" ALTER COLUMN "booking" SET NOT NULL;
ALTER TABLE "RoomAssignment" ALTER COLUMN "roomType" SET NOT NULL;
ALTER TABLE "Booking" ALTER COLUMN "guestProfile" SET NOT NULL;
ALTER TABLE "BookingPayment" ALTER COLUMN "booking" SET NOT NULL;
ALTER TABLE "BookingPayment" ALTER COLUMN "paymentProvider" SET NOT NULL;
ALTER TABLE "BookingPaymentSession" ALTER COLUMN "booking" SET NOT NULL;
ALTER TABLE "BookingPaymentSession" ALTER COLUMN "paymentProvider" SET NOT NULL;
ALTER TABLE "ReservationLineItem" ALTER COLUMN "reservation" SET NOT NULL;
ALTER TABLE "RoomImage" ALTER COLUMN "roomType" SET NOT NULL;
ALTER TABLE "GuestDocument" ALTER COLUMN "guest" SET NOT NULL;
ALTER TABLE "LoyaltyTransaction" ALTER COLUMN "guest" SET NOT NULL;
ALTER TABLE "RatePlan" ALTER COLUMN "roomType" SET NOT NULL;
ALTER TABLE "MaintenanceRequest" ALTER COLUMN "room" SET NOT NULL;
ALTER TABLE "ChannelReservation" ALTER COLUMN "channel" SET NOT NULL;
ALTER TABLE "ChannelSyncEvent" ALTER COLUMN "channel" SET NOT NULL;
ALTER TABLE "Folio" ALTER COLUMN "booking" SET NOT NULL;
ALTER TABLE "FolioEntry" ALTER COLUMN "folio" SET NOT NULL;

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_stay_dates_check" CHECK ("checkOutDate" > "checkInDate");
ALTER TABLE "RoomInventory"
  ADD CONSTRAINT "RoomInventory_counts_check" CHECK (
    "totalRooms" >= 0 AND "bookedRooms" >= 0 AND "blockedRooms" >= 0
    AND "bookedRooms" + "blockedRooms" <= "totalRooms"
  );

CREATE TABLE "HotelAuditEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "propertyKey" TEXT NOT NULL DEFAULT '',
    "aggregateType" TEXT NOT NULL DEFAULT '',
    "aggregateId" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL DEFAULT '',
    "actor" TEXT,
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB,
    "metadataSnapshot" JSONB DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HotelAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HotelOutboxEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "propertyKey" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "aggregateType" TEXT NOT NULL DEFAULT '',
    "aggregateId" TEXT NOT NULL DEFAULT '',
    "payloadSnapshot" JSONB DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HotelOutboxEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HotelOutboxEvent_status_check" CHECK ("status" IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter')),
    CONSTRAINT "HotelOutboxEvent_attempts_check" CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX "HotelAuditEvent_eventKey_key" ON "HotelAuditEvent"("eventKey");
CREATE INDEX "HotelAuditEvent_actor_idx" ON "HotelAuditEvent"("actor");
CREATE INDEX "HotelAuditEvent_aggregate_idx" ON "HotelAuditEvent"("aggregateType", "aggregateId", "occurredAt");
CREATE UNIQUE INDEX "HotelOutboxEvent_eventKey_key" ON "HotelOutboxEvent"("eventKey");
CREATE INDEX "HotelOutboxEvent_dispatch_idx" ON "HotelOutboxEvent"("status", "availableAt");
CREATE INDEX "HotelOutboxEvent_aggregate_idx" ON "HotelOutboxEvent"("aggregateType", "aggregateId");

ALTER TABLE "HotelAuditEvent"
  ADD CONSTRAINT "HotelAuditEvent_actor_fkey"
  FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
