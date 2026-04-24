/*
  Warnings:

  - You are about to drop the column `canCreateTodos` on the `Role` table. All the data in the column will be lost.
  - You are about to drop the column `canManageAllTodos` on the `Role` table. All the data in the column will be lost.
  - You are about to drop the `Todo` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TodoImage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_Todo_todoImages` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Todo" DROP CONSTRAINT "Todo_assignedTo_fkey";

-- DropForeignKey
ALTER TABLE "_Todo_todoImages" DROP CONSTRAINT "_Todo_todoImages_A_fkey";

-- DropForeignKey
ALTER TABLE "_Todo_todoImages" DROP CONSTRAINT "_Todo_todoImages_B_fkey";

-- AlterTable
ALTER TABLE "Role" DROP COLUMN "canCreateTodos",
DROP COLUMN "canManageAllTodos",
ADD COLUMN     "canManageBookings" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageGuests" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageHousekeeping" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManagePayments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageRooms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "Todo";

-- DropTable
DROP TABLE "TodoImage";

-- DropTable
DROP TABLE "_Todo_todoImages";

-- CreateTable
CREATE TABLE "RoomType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "description" JSONB NOT NULL DEFAULT '[{"type":"paragraph","children":[{"text":""}]}]',
    "baseRate" DOUBLE PRECISION NOT NULL,
    "maxOccupancy" INTEGER NOT NULL DEFAULT 2,
    "bedConfiguration" TEXT,
    "amenities" JSONB NOT NULL DEFAULT '[]',
    "squareFeet" INTEGER,

    CONSTRAINT "RoomType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL DEFAULT '',
    "roomType" TEXT,
    "floor" INTEGER,
    "status" TEXT DEFAULT 'vacant',
    "lastCleaned" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HousekeepingTask" (
    "id" TEXT NOT NULL,
    "room" TEXT,
    "taskType" TEXT NOT NULL,
    "assignedTo" TEXT,
    "priority" INTEGER DEFAULT 2,
    "status" TEXT DEFAULT 'pending',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "HousekeepingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomAssignment" (
    "id" TEXT NOT NULL,
    "booking" TEXT,
    "room" TEXT,
    "roomType" TEXT,
    "ratePerNight" DOUBLE PRECISION,
    "guestName" TEXT NOT NULL DEFAULT '',
    "specialRequests" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RoomAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "confirmationNumber" TEXT NOT NULL DEFAULT '',
    "guestName" TEXT NOT NULL DEFAULT '',
    "guestEmail" TEXT NOT NULL DEFAULT '',
    "guestPhone" TEXT NOT NULL DEFAULT '',
    "checkInDate" TIMESTAMP(3) NOT NULL,
    "checkOutDate" TIMESTAMP(3) NOT NULL,
    "numberOfGuests" INTEGER NOT NULL DEFAULT 1,
    "numberOfAdults" INTEGER DEFAULT 1,
    "numberOfChildren" INTEGER DEFAULT 0,
    "roomRate" DOUBLE PRECISION,
    "taxAmount" DOUBLE PRECISION DEFAULT 0,
    "feesAmount" DOUBLE PRECISION DEFAULT 0,
    "totalAmount" DOUBLE PRECISION,
    "depositAmount" DOUBLE PRECISION DEFAULT 0,
    "balanceDue" DOUBLE PRECISION,
    "status" TEXT DEFAULT 'pending',
    "paymentStatus" TEXT DEFAULT 'unpaid',
    "source" TEXT DEFAULT 'direct',
    "specialRequests" TEXT NOT NULL DEFAULT '',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "guest" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingPayment" (
    "id" TEXT NOT NULL,
    "paymentReference" TEXT NOT NULL DEFAULT '',
    "paymentType" TEXT NOT NULL DEFAULT 'full_payment',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethod" TEXT NOT NULL DEFAULT 'credit_card',
    "status" TEXT DEFAULT 'pending',
    "stripePaymentIntentId" TEXT NOT NULL DEFAULT '',
    "stripeChargeId" TEXT NOT NULL DEFAULT '',
    "stripeRefundId" TEXT NOT NULL DEFAULT '',
    "cardBrand" TEXT NOT NULL DEFAULT '',
    "cardLast4" TEXT NOT NULL DEFAULT '',
    "cardExpMonth" TEXT NOT NULL DEFAULT '',
    "cardExpYear" TEXT NOT NULL DEFAULT '',
    "receiptEmail" TEXT NOT NULL DEFAULT '',
    "receiptUrl" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "failureReason" TEXT NOT NULL DEFAULT '',
    "booking" TEXT,
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "BookingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomType_name_key" ON "RoomType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Room_roomNumber_key" ON "Room"("roomNumber");

-- CreateIndex
CREATE INDEX "Room_roomType_idx" ON "Room"("roomType");

-- CreateIndex
CREATE INDEX "HousekeepingTask_room_idx" ON "HousekeepingTask"("room");

-- CreateIndex
CREATE INDEX "HousekeepingTask_assignedTo_idx" ON "HousekeepingTask"("assignedTo");

-- CreateIndex
CREATE INDEX "RoomAssignment_booking_idx" ON "RoomAssignment"("booking");

-- CreateIndex
CREATE INDEX "RoomAssignment_room_idx" ON "RoomAssignment"("room");

-- CreateIndex
CREATE INDEX "RoomAssignment_roomType_idx" ON "RoomAssignment"("roomType");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_confirmationNumber_key" ON "Booking"("confirmationNumber");

-- CreateIndex
CREATE INDEX "Booking_guest_idx" ON "Booking"("guest");

-- CreateIndex
CREATE UNIQUE INDEX "BookingPayment_paymentReference_key" ON "BookingPayment"("paymentReference");

-- CreateIndex
CREATE INDEX "BookingPayment_booking_idx" ON "BookingPayment"("booking");

-- CreateIndex
CREATE INDEX "BookingPayment_processedBy_idx" ON "BookingPayment"("processedBy");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_roomType_fkey" FOREIGN KEY ("roomType") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_room_fkey" FOREIGN KEY ("room") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAssignment" ADD CONSTRAINT "RoomAssignment_booking_fkey" FOREIGN KEY ("booking") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAssignment" ADD CONSTRAINT "RoomAssignment_room_fkey" FOREIGN KEY ("room") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAssignment" ADD CONSTRAINT "RoomAssignment_roomType_fkey" FOREIGN KEY ("roomType") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_guest_fkey" FOREIGN KEY ("guest") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_booking_fkey" FOREIGN KEY ("booking") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_processedBy_fkey" FOREIGN KEY ("processedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
