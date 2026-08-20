-- Persist one platform-owned storefront accent preset on the existing HotelSettings singleton.
ALTER TABLE "HotelSettings"
ADD COLUMN "storefrontAccentPreset" TEXT NOT NULL DEFAULT 'brass';

ALTER TABLE "HotelSettings"
ADD CONSTRAINT "HotelSettings_storefrontAccentPreset_check"
CHECK ("storefrontAccentPreset" IN ('brass', 'forest', 'harbor', 'claret'));
