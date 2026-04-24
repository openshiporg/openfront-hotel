-- CreateTable
CREATE TABLE "ReservationLineItem" (
    "id" TEXT NOT NULL,
    "reservation" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedBy" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonalRate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "roomType" TEXT,
    "priceAdjustment" INTEGER,
    "priceMultiplier" DOUBLE PRECISION,
    "minimumStay" INTEGER DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonalRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "channelType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "credentials" JSONB DEFAULT '{}',
    "commission" DOUBLE PRECISION DEFAULT 0,
    "syncInventory" BOOLEAN NOT NULL DEFAULT true,
    "syncRates" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "syncStatus" TEXT DEFAULT 'active',
    "syncErrors" JSONB DEFAULT '[]',
    "mappingRules" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelReservation" (
    "id" TEXT NOT NULL,
    "channel" TEXT,
    "externalId" TEXT NOT NULL DEFAULT '',
    "reservation" TEXT,
    "roomType" TEXT,
    "checkInDate" TIMESTAMP(3) NOT NULL,
    "checkOutDate" TIMESTAMP(3) NOT NULL,
    "guestName" TEXT NOT NULL DEFAULT '',
    "guestEmail" TEXT NOT NULL DEFAULT '',
    "totalAmount" INTEGER,
    "commission" INTEGER,
    "channelStatus" TEXT NOT NULL DEFAULT '',
    "rawData" JSONB DEFAULT '{}',
    "lastSyncedAt" TIMESTAMP(3),
    "syncErrors" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMetrics" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalRooms" INTEGER NOT NULL DEFAULT 0,
    "occupiedRooms" INTEGER NOT NULL DEFAULT 0,
    "occupancyRate" DOUBLE PRECISION DEFAULT 0,
    "averageDailyRate" INTEGER DEFAULT 0,
    "revenuePerAvailableRoom" INTEGER DEFAULT 0,
    "totalRevenue" INTEGER DEFAULT 0,
    "channelRevenue" JSONB DEFAULT '{}',
    "newReservations" INTEGER DEFAULT 0,
    "cancellations" INTEGER DEFAULT 0,
    "checkIns" INTEGER DEFAULT 0,
    "checkOuts" INTEGER DEFAULT 0,

    CONSTRAINT "DailyMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReservationLineItem_reservation_idx" ON "ReservationLineItem"("reservation");

-- CreateIndex
CREATE INDEX "ReservationLineItem_postedBy_idx" ON "ReservationLineItem"("postedBy");

-- CreateIndex
CREATE INDEX "SeasonalRate_roomType_idx" ON "SeasonalRate"("roomType");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_name_key" ON "Channel"("name");

-- CreateIndex
CREATE INDEX "ChannelReservation_channel_idx" ON "ChannelReservation"("channel");

-- CreateIndex
CREATE INDEX "ChannelReservation_externalId_idx" ON "ChannelReservation"("externalId");

-- CreateIndex
CREATE INDEX "ChannelReservation_reservation_idx" ON "ChannelReservation"("reservation");

-- CreateIndex
CREATE INDEX "ChannelReservation_roomType_idx" ON "ChannelReservation"("roomType");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMetrics_date_key" ON "DailyMetrics"("date");

-- AddForeignKey
ALTER TABLE "ReservationLineItem" ADD CONSTRAINT "ReservationLineItem_reservation_fkey" FOREIGN KEY ("reservation") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationLineItem" ADD CONSTRAINT "ReservationLineItem_postedBy_fkey" FOREIGN KEY ("postedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonalRate" ADD CONSTRAINT "SeasonalRate_roomType_fkey" FOREIGN KEY ("roomType") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelReservation" ADD CONSTRAINT "ChannelReservation_channel_fkey" FOREIGN KEY ("channel") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelReservation" ADD CONSTRAINT "ChannelReservation_reservation_fkey" FOREIGN KEY ("reservation") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelReservation" ADD CONSTRAINT "ChannelReservation_roomType_fkey" FOREIGN KEY ("roomType") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
