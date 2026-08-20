-- CreateTable
CREATE TABLE "HotelSettings" (
    "id" INTEGER NOT NULL,
    "propertyName" TEXT NOT NULL DEFAULT '',
    "tagline" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "addressLine2" TEXT NOT NULL DEFAULT '',
    "frontDeskCopy" TEXT NOT NULL DEFAULT '',
    "checkInTime" TEXT NOT NULL DEFAULT '',
    "checkOutTime" TEXT NOT NULL DEFAULT '',
    "heroImagePath" TEXT NOT NULL DEFAULT '',
    "heroImageAltText" TEXT NOT NULL DEFAULT '',
    "heroImageCaption" TEXT NOT NULL DEFAULT '',
    "amenityImagePath" TEXT NOT NULL DEFAULT '',
    "amenityImageAltText" TEXT NOT NULL DEFAULT '',
    "amenityImageCaption" TEXT NOT NULL DEFAULT '',
    "locationImagePath" TEXT NOT NULL DEFAULT '',
    "locationImageAltText" TEXT NOT NULL DEFAULT '',
    "locationImageCaption" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelSettings_pkey" PRIMARY KEY ("id")
);
