-- Add immutable reservation snapshot fields without invalidating existing ledger rows.
ALTER TABLE "ReservationLineItem"
ADD COLUMN "cancellationPolicySnapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN "imageAltTextSnapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN "imagePathSnapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN "mealPlanSnapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN "nightIndex" INTEGER,
ADD COLUMN "pricingSourceSnapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN "ratePlanDescriptionSnapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN "ratePlanIdSnapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN "ratePlanNameSnapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN "roomTypeIdSnapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN "roomTypeNameSnapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN "snapshotKey" TEXT,
ADD COLUMN "taxRateBasisPoints" INTEGER;

-- Existing line items predate snapshot generation. Give each a stable unique legacy
-- identity before making the new idempotency key required.
UPDATE "ReservationLineItem"
SET "snapshotKey" = 'legacy:' || "id"
WHERE "snapshotKey" IS NULL;

ALTER TABLE "ReservationLineItem"
ALTER COLUMN "snapshotKey" SET NOT NULL,
ALTER COLUMN "snapshotKey" SET DEFAULT '';

CREATE UNIQUE INDEX "ReservationLineItem_snapshotKey_key"
ON "ReservationLineItem"("snapshotKey");
