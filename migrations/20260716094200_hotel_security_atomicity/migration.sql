/*
  Warnings:

  - A unique constraint covering the columns `[replayKey]` on the table `ChannelSyncEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ChannelSyncEvent" ADD COLUMN     "replayKey" TEXT;

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "replayKey" TEXT NOT NULL DEFAULT '',
    "providerCode" TEXT NOT NULL DEFAULT '',
    "providerEventId" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL DEFAULT '',
    "processedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "evidence" JSONB DEFAULT '{}',
    "booking" TEXT,
    "payment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_replayKey_key" ON "PaymentEvent"("replayKey");

-- CreateIndex
CREATE INDEX "PaymentEvent_booking_idx" ON "PaymentEvent"("booking");

-- CreateIndex
CREATE INDEX "PaymentEvent_payment_idx" ON "PaymentEvent"("payment");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelSyncEvent_replayKey_key" ON "ChannelSyncEvent"("replayKey");

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_booking_fkey" FOREIGN KEY ("booking") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_payment_fkey" FOREIGN KEY ("payment") REFERENCES "BookingPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
