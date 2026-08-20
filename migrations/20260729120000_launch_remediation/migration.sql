BEGIN;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "balanceDueMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "depositAmountMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "feesAmountMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "holdExpiresAt" TIMESTAMP(3),
ADD COLUMN     "pricingRevision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "pricingSnapshot" JSONB DEFAULT '{}',
ADD COLUMN     "pricingVersion" TEXT NOT NULL DEFAULT 'legacy-v1',
ADD COLUMN     "ratePlan" TEXT,
ADD COLUMN     "roomRateMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxAmountMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalAmountMinor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "BookingPayment" ADD COLUMN     "amountMinor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "HotelSettings" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "pricingVersion" TEXT NOT NULL DEFAULT 'hotel-pricing-v2',
ADD COLUMN     "serviceFeeMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 1000;

-- AlterTable
ALTER TABLE "RatePlan" ADD COLUMN     "baseRateMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "ReservationLineItem" ADD COLUMN     "snapshotStatus" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "supersededAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "canManageAudit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageIntegrations" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RoomAssignment" ADD COLUMN     "ratePerNightMinor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RoomType" ADD COLUMN     "baseRateMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "disabledAt" TIMESTAMP(3);

-- Expand/contract backfill: preserve legacy major-unit values while integer
-- minor-unit columns become authoritative. ROUND is deterministic for the
-- non-negative two-decimal hotel amounts accepted by existing write paths.
UPDATE "Booking" SET
  "roomRateMinor" = ROUND(COALESCE("roomRate", 0) * 100)::INTEGER,
  "taxAmountMinor" = ROUND(COALESCE("taxAmount", 0) * 100)::INTEGER,
  "feesAmountMinor" = ROUND(COALESCE("feesAmount", 0) * 100)::INTEGER,
  "totalAmountMinor" = ROUND(COALESCE("totalAmount", 0) * 100)::INTEGER,
  "depositAmountMinor" = ROUND(COALESCE("depositAmount", 0) * 100)::INTEGER,
  "balanceDueMinor" = ROUND(COALESCE("balanceDue", 0) * 100)::INTEGER,
  "pricingSnapshot" = jsonb_build_object(
    'source', 'legacy-backfill',
    'roomSubtotalMinor', ROUND(COALESCE("roomRate", 0) * 100)::INTEGER,
    'taxMinor', ROUND(COALESCE("taxAmount", 0) * 100)::INTEGER,
    'feesMinor', ROUND(COALESCE("feesAmount", 0) * 100)::INTEGER,
    'totalMinor', ROUND(COALESCE("totalAmount", 0) * 100)::INTEGER,
    'currencyCode', 'USD'
  )
WHERE "pricingVersion" = 'legacy-v1';

UPDATE "BookingPayment" SET "amountMinor" = ROUND(COALESCE("amount", 0) * 100)::INTEGER;
UPDATE "RoomType" SET "baseRateMinor" = ROUND(COALESCE("baseRate", 0) * 100)::INTEGER;
UPDATE "RatePlan" SET "baseRateMinor" = ROUND(COALESCE("baseRate", 0) * 100)::INTEGER;
UPDATE "RoomAssignment" SET "ratePerNightMinor" = ROUND(COALESCE("ratePerNight", 0) * 100)::INTEGER;
ALTER TABLE "RoomType" ALTER COLUMN "baseRate" SET DEFAULT 0;
ALTER TABLE "RatePlan" ALTER COLUMN "baseRate" SET DEFAULT 0;

-- Preserve the capabilities of existing administrative roles while making
-- future delegation explicit through dedicated permissions.
UPDATE "Role" SET
  "canManageAudit" = ("canManageOnboarding" OR "canManageRoles"),
  "canManageIntegrations" = ("canManageOnboarding" OR "canManagePayments");

-- CreateTable
CREATE TABLE "RefundIntent" (
    "id" TEXT NOT NULL,
    "intentKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "cancellationEventKey" TEXT NOT NULL DEFAULT '',
    "propertyKey" TEXT NOT NULL DEFAULT '',
    "booking" TEXT NOT NULL,
    "sourcePayment" TEXT NOT NULL,
    "paymentProvider" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT NOT NULL DEFAULT '',
    "leaseExpiresAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deadLetteredAt" TIMESTAMP(3),
    "providerRefundId" TEXT,
    "providerResultSnapshot" JSONB DEFAULT '{}',
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelSeedRecord" (
    "id" TEXT NOT NULL,
    "seedKey" TEXT NOT NULL DEFAULT '',
    "section" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "contentHash" TEXT NOT NULL DEFAULT '',
    "seedVersion" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelSeedRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelAbuseBucket" (
    "id" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelAbuseBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelWorkerLease" (
    "id" TEXT NOT NULL,
    "leaseKey" TEXT NOT NULL DEFAULT '',
    "ownerId" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "heartbeatAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelWorkerLease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefundIntent_intentKey_key" ON "RefundIntent"("intentKey");

-- CreateIndex
CREATE UNIQUE INDEX "RefundIntent_providerRefundId_key" ON "RefundIntent"("providerRefundId");

-- CreateIndex
CREATE INDEX "RefundIntent_booking_idx" ON "RefundIntent"("booking");

-- CreateIndex
CREATE INDEX "RefundIntent_sourcePayment_idx" ON "RefundIntent"("sourcePayment");

-- CreateIndex
CREATE INDEX "RefundIntent_paymentProvider_idx" ON "RefundIntent"("paymentProvider");

-- CreateIndex
CREATE INDEX "RefundIntent_dispatch_idx" ON "RefundIntent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "RefundIntent_booking_status_idx" ON "RefundIntent"("booking", "status");

-- CreateIndex
CREATE INDEX "RefundIntent_source_status_idx" ON "RefundIntent"("sourcePayment", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HotelSeedRecord_seedKey_key" ON "HotelSeedRecord"("seedKey");

-- CreateIndex
CREATE INDEX "HotelSeedRecord_entity_idx" ON "HotelSeedRecord"("section", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelAbuseBucket_bucketKey_key" ON "HotelAbuseBucket"("bucketKey");

-- CreateIndex
CREATE INDEX "HotelAbuseBucket_expiry_idx" ON "HotelAbuseBucket"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "HotelWorkerLease_leaseKey_key" ON "HotelWorkerLease"("leaseKey");

-- CreateIndex
CREATE INDEX "Booking_ratePlan_idx" ON "Booking"("ratePlan");

-- CreateIndex
CREATE INDEX "Booking_status_stay_idx" ON "Booking"("status", "checkInDate", "checkOutDate");

-- CreateIndex
CREATE INDEX "Booking_departure_status_idx" ON "Booking"("checkOutDate", "status");

-- CreateIndex
CREATE INDEX "Booking_hold_expiry_idx" ON "Booking"("holdExpiresAt", "status");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_ratePlan_fkey" FOREIGN KEY ("ratePlan") REFERENCES "RatePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundIntent" ADD CONSTRAINT "RefundIntent_booking_fkey" FOREIGN KEY ("booking") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundIntent" ADD CONSTRAINT "RefundIntent_sourcePayment_fkey" FOREIGN KEY ("sourcePayment") REFERENCES "BookingPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundIntent" ADD CONSTRAINT "RefundIntent_paymentProvider_fkey" FOREIGN KEY ("paymentProvider") REFERENCES "PaymentProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
