-- Complete the nullable-unique guest loyalty identity correction.
ALTER TABLE "Guest" ALTER COLUMN "loyaltyNumber" DROP NOT NULL;
