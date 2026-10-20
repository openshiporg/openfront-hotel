-- Additive Openfront store-logo contract for the property singleton.
-- Existing rows keep an empty logoIcon, which preserves the current storefront accent mark.
ALTER TABLE "HotelSettings" ADD COLUMN "logoIcon" TEXT NOT NULL DEFAULT '';
ALTER TABLE "HotelSettings" ADD COLUMN "logoColor" TEXT NOT NULL DEFAULT '0';
