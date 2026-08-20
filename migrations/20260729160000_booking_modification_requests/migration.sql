-- CreateTable
CREATE TABLE "BookingModificationRequest" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL DEFAULT '',
    "booking" TEXT NOT NULL,
    "requestedCheckInDate" TIMESTAMP(3),
    "requestedCheckOutDate" TIMESTAMP(3),
    "guestMessage" TEXT NOT NULL DEFAULT '',
    "requestedByEmailHash" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolutionKey" TEXT,
    "resolutionRequestHash" TEXT NOT NULL DEFAULT '',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "staffNote" TEXT NOT NULL DEFAULT '',
    "resultSnapshot" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingModificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingModificationRequest_requestKey_key" ON "BookingModificationRequest"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "BookingModificationRequest_resolutionKey_key" ON "BookingModificationRequest"("resolutionKey");

-- CreateIndex
CREATE INDEX "BookingModificationRequest_booking_idx" ON "BookingModificationRequest"("booking");

-- CreateIndex
CREATE INDEX "BookingModificationRequest_resolvedBy_idx" ON "BookingModificationRequest"("resolvedBy");

-- CreateIndex
CREATE INDEX "BookingModificationRequest_booking_status_created_idx" ON "BookingModificationRequest"("booking", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "BookingModificationRequest" ADD CONSTRAINT "BookingModificationRequest_booking_fkey" FOREIGN KEY ("booking") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingModificationRequest" ADD CONSTRAINT "BookingModificationRequest_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
