-- Fail closed for the bounded direct-booking-first release. Existing certified
-- custom bridges explicitly marked mode=live remain active; demo/invalid rows
-- are retained as evidence but cannot claim inventory/rate sync or live connectivity.
ALTER TABLE "Channel" ALTER COLUMN "isActive" SET DEFAULT false;
ALTER TABLE "Channel" ALTER COLUMN "syncInventory" SET DEFAULT false;
ALTER TABLE "Channel" ALTER COLUMN "syncRates" SET DEFAULT false;
ALTER TABLE "Channel" ALTER COLUMN "syncStatus" SET DEFAULT 'paused';

UPDATE "Channel" SET "syncRates" = false, "syncInventory" = false;

UPDATE "Channel"
SET "isActive" = false,
    "syncStatus" = 'paused'
WHERE COALESCE("credentials" ->> 'mode', '') <> 'live';
