-- Authored only; application requires separate owner authorization. Legacy bookings retain original snapshot terms.
ALTER TABLE "HotelSettings" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE "HotelSettings" ADD COLUMN "refundApprovalThresholdMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("refundApprovalThresholdMinor" >= 0);
ALTER TABLE "HotelSettings" ADD COLUMN "writeOffApprovalThresholdMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("writeOffApprovalThresholdMinor" >= 0);
ALTER TABLE "HotelSettings" ADD COLUMN "cashVarianceApprovalThresholdMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("cashVarianceApprovalThresholdMinor" >= 0);
ALTER TABLE "HotelSettings" ADD COLUMN "ratePublicationRequiresApproval" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Role" ADD COLUMN "canManageGuestPrivacy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Role" ADD COLUMN "canApproveHotelExceptions" BOOLEAN NOT NULL DEFAULT false;
-- Existing administrators must deliberately assign the new powers after separately authorized schema application.
ALTER TABLE "HotelSettings" ADD COLUMN "groupsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HotelSettings" ADD COLUMN "prearrivalEmailEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HotelSettings" ADD COLUMN "prearrivalDays" INTEGER NOT NULL DEFAULT 1 CHECK ("prearrivalDays" BETWEEN 1 AND 14);
ALTER TABLE "HotelSettings" ADD COLUMN "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HotelSettings" ADD COLUMN "loyaltyEarnMinorPerPoint" INTEGER NOT NULL DEFAULT 100 CHECK ("loyaltyEarnMinorPerPoint" BETWEEN 1 AND 1000000);
ALTER TABLE "HotelSettings" ADD COLUMN "loyaltyRedeemMinorPerPoint" INTEGER NOT NULL DEFAULT 1 CHECK ("loyaltyRedeemMinorPerPoint" BETWEEN 1 AND 1000000);
ALTER TABLE "HotelSettings" ADD COLUMN "loyaltyMinimumRedemptionPoints" INTEGER NOT NULL DEFAULT 100 CHECK ("loyaltyMinimumRedemptionPoints" BETWEEN 1 AND 1000000);
ALTER TABLE "HotelSettings" ADD COLUMN "depositPercent" INTEGER NOT NULL DEFAULT 100 CHECK ("depositPercent" BETWEEN 1 AND 100);
ALTER TABLE "HotelSettings" ADD COLUMN "securityDepositMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("securityDepositMinor" >= 0);
