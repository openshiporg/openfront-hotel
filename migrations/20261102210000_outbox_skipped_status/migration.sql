-- Additive: a terminal status for outbox events whose topic has no delivery adapter.
-- Existing rows are untouched; the worker closes them through the claim path with a reason.
ALTER TABLE "HotelOutboxEvent" DROP CONSTRAINT "HotelOutboxEvent_status_check";
ALTER TABLE "HotelOutboxEvent" ADD CONSTRAINT "HotelOutboxEvent_status_check"
  CHECK ("status" IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter', 'skipped'));
