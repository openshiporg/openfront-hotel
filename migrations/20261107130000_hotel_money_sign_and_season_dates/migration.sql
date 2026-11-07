-- Database backstops for invariants every writer already keeps. Refund rows are stored negative
-- (paymentType 'refund'), every other payment non-negative; reservation, rate and refund amounts
-- are never negative; a season never ends before it starts. Fails closed on existing violations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "BookingPayment" WHERE ("paymentType" = 'refund' AND "amountMinor" > 0) OR ("paymentType" <> 'refund' AND "amountMinor" < 0)) THEN RAISE EXCEPTION 'Booking payments with the wrong sign for their type require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "Booking" WHERE "roomRateMinor" < 0 OR "taxAmountMinor" < 0 OR "feesAmountMinor" < 0 OR "totalAmountMinor" < 0 OR "depositAmountMinor" < 0) THEN RAISE EXCEPTION 'Negative reservation amounts require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "RefundIntent" WHERE "amountMinor" <= 0 OR "attempts" < 0) THEN RAISE EXCEPTION 'Refund intents without a positive amount require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "RatePlan" WHERE "baseRateMinor" < 0) THEN RAISE EXCEPTION 'Negative rate plan prices require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "RoomAssignment" WHERE "ratePerNightMinor" < 0) THEN RAISE EXCEPTION 'Negative nightly room rates require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "SeasonalRate" WHERE "endDate" < "startDate") THEN RAISE EXCEPTION 'Seasons ending before they start require manual remediation'; END IF;
END $$;

ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_amount_sign_check" CHECK (("paymentType" = 'refund' AND "amountMinor" <= 0) OR ("paymentType" <> 'refund' AND "amountMinor" >= 0));
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_amounts_nonnegative_check" CHECK ("roomRateMinor" >= 0 AND "taxAmountMinor" >= 0 AND "feesAmountMinor" >= 0 AND "totalAmountMinor" >= 0 AND "depositAmountMinor" >= 0);
ALTER TABLE "RefundIntent" ADD CONSTRAINT "RefundIntent_amount_check" CHECK ("amountMinor" > 0 AND "attempts" >= 0);
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_baseRate_nonnegative_check" CHECK ("baseRateMinor" >= 0);
ALTER TABLE "RoomAssignment" ADD CONSTRAINT "RoomAssignment_rate_nonnegative_check" CHECK ("ratePerNightMinor" >= 0);
ALTER TABLE "SeasonalRate" ADD CONSTRAINT "SeasonalRate_dates_check" CHECK ("endDate" >= "startDate");
