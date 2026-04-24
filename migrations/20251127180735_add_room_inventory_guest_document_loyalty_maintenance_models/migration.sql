-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "guestProfile" TEXT;

-- CreateTable
CREATE TABLE "RoomInventory" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "roomType" TEXT,
    "totalRooms" INTEGER NOT NULL DEFAULT 0,
    "bookedRooms" INTEGER NOT NULL DEFAULT 0,
    "blockedRooms" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RoomInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "preferences" JSONB DEFAULT '{"pillowType":"standard","floorPreference":"any","smokingPreference":"non-smoking","bedType":"any","earlyCheckIn":false,"lateCheckOut":false,"specialDiet":"","accessibility":[]}',
    "loyaltyNumber" TEXT NOT NULL DEFAULT '',
    "loyaltyTier" TEXT DEFAULT 'bronze',
    "loyaltyPoints" TEXT NOT NULL DEFAULT '',
    "communicationPreferences" JSONB DEFAULT '{"emailMarketing":true,"smsNotifications":false,"phoneNotifications":false,"preferredLanguage":"en","newsletterSubscribed":false}',
    "idType" TEXT,
    "idNumber" TEXT NOT NULL DEFAULT '',
    "nationality" TEXT NOT NULL DEFAULT '',
    "address1" TEXT NOT NULL DEFAULT '',
    "address2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT '',
    "specialNotes" TEXT NOT NULL DEFAULT '',
    "isVip" BOOLEAN NOT NULL DEFAULT false,
    "isBlacklisted" BOOLEAN NOT NULL DEFAULT false,
    "userAccount" TEXT,
    "lastStayAt" TIMESTAMP(3),
    "totalStays" TEXT NOT NULL DEFAULT '',
    "totalSpent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestDocument" (
    "id" TEXT NOT NULL,
    "guest" TEXT,
    "documentType" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL DEFAULT '',
    "issuingCountry" TEXT NOT NULL DEFAULT '',
    "expiryDate" TIMESTAMP(3),
    "frontImage" TEXT NOT NULL DEFAULT '',
    "backImage" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "guest" TEXT,
    "booking" TEXT,
    "points" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "roomType" TEXT,
    "baseRate" DOUBLE PRECISION NOT NULL,
    "seasonalAdjustments" JSONB DEFAULT '{"peak":1.25,"high":1.15,"regular":1,"low":0.85}',
    "minimumStay" INTEGER DEFAULT 1,
    "maximumStay" INTEGER,
    "advanceBookingMin" INTEGER DEFAULT 0,
    "advanceBookingMax" INTEGER,
    "cancellationPolicy" TEXT DEFAULT 'moderate',
    "mealPlan" TEXT DEFAULT 'room_only',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "applicableDays" JSONB DEFAULT '{"monday":true,"tuesday":true,"wednesday":true,"thursday":true,"friday":true,"saturday":true,"sunday":true}',
    "status" TEXT DEFAULT 'draft',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isPromotional" BOOLEAN NOT NULL DEFAULT false,
    "promoCode" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRequest" (
    "id" TEXT NOT NULL,
    "room" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT DEFAULT 'reported',
    "reportedBy" TEXT,
    "assignedTo" TEXT,
    "images" JSONB DEFAULT '[]',
    "scheduledFor" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cost" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomInventory_date_idx" ON "RoomInventory"("date");

-- CreateIndex
CREATE INDEX "RoomInventory_roomType_idx" ON "RoomInventory"("roomType");

-- CreateIndex
CREATE UNIQUE INDEX "Guest_email_key" ON "Guest"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Guest_loyaltyNumber_key" ON "Guest"("loyaltyNumber");

-- CreateIndex
CREATE INDEX "Guest_userAccount_idx" ON "Guest"("userAccount");

-- CreateIndex
CREATE INDEX "GuestDocument_guest_idx" ON "GuestDocument"("guest");

-- CreateIndex
CREATE INDEX "GuestDocument_verifiedBy_idx" ON "GuestDocument"("verifiedBy");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_guest_idx" ON "LoyaltyTransaction"("guest");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_booking_idx" ON "LoyaltyTransaction"("booking");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_createdBy_idx" ON "LoyaltyTransaction"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlan_name_key" ON "RatePlan"("name");

-- CreateIndex
CREATE INDEX "RatePlan_roomType_idx" ON "RatePlan"("roomType");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_room_idx" ON "MaintenanceRequest"("room");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_reportedBy_idx" ON "MaintenanceRequest"("reportedBy");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_assignedTo_idx" ON "MaintenanceRequest"("assignedTo");

-- CreateIndex
CREATE INDEX "Booking_guestProfile_idx" ON "Booking"("guestProfile");

-- AddForeignKey
ALTER TABLE "RoomInventory" ADD CONSTRAINT "RoomInventory_roomType_fkey" FOREIGN KEY ("roomType") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_guestProfile_fkey" FOREIGN KEY ("guestProfile") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_userAccount_fkey" FOREIGN KEY ("userAccount") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestDocument" ADD CONSTRAINT "GuestDocument_guest_fkey" FOREIGN KEY ("guest") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestDocument" ADD CONSTRAINT "GuestDocument_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_guest_fkey" FOREIGN KEY ("guest") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_booking_fkey" FOREIGN KEY ("booking") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_roomType_fkey" FOREIGN KEY ("roomType") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_room_fkey" FOREIGN KEY ("room") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_reportedBy_fkey" FOREIGN KEY ("reportedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
