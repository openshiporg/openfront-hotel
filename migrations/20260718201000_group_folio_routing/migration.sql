-- Add group-owned master folios and explicit reservation billing routing.
ALTER TABLE "Folio" ALTER COLUMN "booking" DROP NOT NULL;
ALTER TABLE "Folio" ADD COLUMN "groupBlock" TEXT;
CREATE UNIQUE INDEX "Folio_groupBlock_key" ON "Folio"("groupBlock");
ALTER TABLE "Folio" ADD CONSTRAINT "Folio_groupBlock_fkey"
  FOREIGN KEY ("groupBlock") REFERENCES "GroupBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Folio" ADD CONSTRAINT "Folio_owner_check"
  CHECK ((CASE WHEN "booking" IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN "groupBlock" IS NOT NULL THEN 1 ELSE 0 END) = 1);

ALTER TABLE "Booking"
  ADD COLUMN "billingFolio" TEXT,
  ADD COLUMN "groupBlock" TEXT,
  ADD COLUMN "groupBlockAllocation" TEXT;
CREATE INDEX "Booking_billingFolio_idx" ON "Booking"("billingFolio");
CREATE INDEX "Booking_groupBlock_idx" ON "Booking"("groupBlock");
CREATE INDEX "Booking_groupBlockAllocation_idx" ON "Booking"("groupBlockAllocation");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_billingFolio_fkey"
  FOREIGN KEY ("billingFolio") REFERENCES "Folio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_groupBlock_fkey"
  FOREIGN KEY ("groupBlock") REFERENCES "GroupBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_groupBlockAllocation_fkey"
  FOREIGN KEY ("groupBlockAllocation") REFERENCES "GroupBlockAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
