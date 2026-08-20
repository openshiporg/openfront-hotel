-- Additive guest booking access proof for storefront-owned reservation sessions.
ALTER TABLE "Booking"
ADD COLUMN IF NOT EXISTS "guestAccessTokenHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "guestAccessTokenIssuedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Booking_guestAccessTokenHash_idx"
ON "Booking"("guestAccessTokenHash");
