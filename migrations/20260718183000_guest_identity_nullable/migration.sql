-- Guests without loyalty enrollment must not collide on an empty unique value.
UPDATE "Guest" SET "loyaltyNumber" = NULL WHERE BTRIM("loyaltyNumber") = '';
ALTER TABLE "Guest" ALTER COLUMN "loyaltyNumber" DROP DEFAULT;
