/*
  Warnings:

  - Made the column `createdAt` on table `Booking` required. This step will fail if there are existing NULL values in that column.
  - Made the column `createdAt` on table `BookingPayment` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "createdAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "BookingPayment" ADD COLUMN     "paymentProvider" TEXT,
ADD COLUMN     "paymentSession" TEXT,
ADD COLUMN     "providerCaptureId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "providerData" JSONB DEFAULT '{}',
ADD COLUMN     "providerPaymentId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "providerRefundId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "createdAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "DailyMetrics" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "HousekeepingTask" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "canManageOnboarding" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "RoomAssignment" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "RoomInventory" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "RoomType" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingStatus" TEXT DEFAULT 'not_started';

-- CreateTable
CREATE TABLE "BookingPaymentSession" (
    "id" TEXT NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "isInitiated" BOOLEAN NOT NULL DEFAULT false,
    "amount" INTEGER NOT NULL,
    "data" JSONB DEFAULT '{}',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "booking" TEXT,
    "paymentProvider" TEXT,
    "paymentAuthorizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingPaymentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "isInstalled" BOOLEAN NOT NULL DEFAULT true,
    "credentials" JSONB DEFAULT '{}',
    "metadata" JSONB DEFAULT '{}',
    "createPaymentFunction" TEXT NOT NULL DEFAULT '',
    "capturePaymentFunction" TEXT NOT NULL DEFAULT '',
    "refundPaymentFunction" TEXT NOT NULL DEFAULT '',
    "getPaymentStatusFunction" TEXT NOT NULL DEFAULT '',
    "generatePaymentLinkFunction" TEXT NOT NULL DEFAULT '',
    "handleWebhookFunction" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelSyncEvent" (
    "id" TEXT NOT NULL,
    "channel" TEXT,
    "action" TEXT DEFAULT 'webhook_event',
    "status" TEXT DEFAULT 'success',
    "message" TEXT NOT NULL DEFAULT '',
    "payload" JSONB DEFAULT '{}',
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "attempts" INTEGER DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelSyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingPaymentSession_idempotencyKey_idx" ON "BookingPaymentSession"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BookingPaymentSession_booking_idx" ON "BookingPaymentSession"("booking");

-- CreateIndex
CREATE INDEX "BookingPaymentSession_paymentProvider_idx" ON "BookingPaymentSession"("paymentProvider");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProvider_code_key" ON "PaymentProvider"("code");

-- CreateIndex
CREATE INDEX "ChannelSyncEvent_channel_idx" ON "ChannelSyncEvent"("channel");

-- CreateIndex
CREATE INDEX "ChannelSyncEvent_createdBy_idx" ON "ChannelSyncEvent"("createdBy");

-- CreateIndex
CREATE INDEX "BookingPayment_paymentProvider_idx" ON "BookingPayment"("paymentProvider");

-- CreateIndex
CREATE INDEX "BookingPayment_paymentSession_idx" ON "BookingPayment"("paymentSession");

-- AddForeignKey
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_paymentProvider_fkey" FOREIGN KEY ("paymentProvider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_paymentSession_fkey" FOREIGN KEY ("paymentSession") REFERENCES "BookingPaymentSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPaymentSession" ADD CONSTRAINT "BookingPaymentSession_booking_fkey" FOREIGN KEY ("booking") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPaymentSession" ADD CONSTRAINT "BookingPaymentSession_paymentProvider_fkey" FOREIGN KEY ("paymentProvider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelSyncEvent" ADD CONSTRAINT "ChannelSyncEvent_channel_fkey" FOREIGN KEY ("channel") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelSyncEvent" ADD CONSTRAINT "ChannelSyncEvent_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hotel storefront editorial room media
CREATE TABLE IF NOT EXISTS "RoomImage" (
  "id" TEXT NOT NULL,
  "image_id" TEXT,
  "image_filesize" INTEGER,
  "image_width" INTEGER,
  "image_height" INTEGER,
  "image_extension" TEXT,
  "imagePath" TEXT NOT NULL DEFAULT '',
  "altText" TEXT NOT NULL DEFAULT '',
  "caption" TEXT NOT NULL DEFAULT '',
  "order" INTEGER DEFAULT 0,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "roomType" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoomImage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RoomType" ADD COLUMN IF NOT EXISTS "shortDescription" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RoomType" ADD COLUMN IF NOT EXISTS "eyebrow" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RoomType" ADD COLUMN IF NOT EXISTS "viewDescription" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RoomType" ADD COLUMN IF NOT EXISTS "thumbnail" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "RoomImage_roomType_idx" ON "RoomImage"("roomType");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RoomImage_roomType_fkey'
  ) THEN
    ALTER TABLE "RoomImage" ADD CONSTRAINT "RoomImage_roomType_fkey" FOREIGN KEY ("roomType") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
