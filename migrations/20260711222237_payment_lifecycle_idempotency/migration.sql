/*
  Warnings:

  - A unique constraint covering the columns `[paymentSession]` on the table `BookingPayment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[idempotencyKey]` on the table `BookingPaymentSession` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "BookingPayment_paymentSession_idx";

-- DropIndex
DROP INDEX "BookingPaymentSession_idempotencyKey_idx";

-- CreateIndex
CREATE UNIQUE INDEX "BookingPayment_paymentSession_key" ON "BookingPayment"("paymentSession");

-- CreateIndex
CREATE UNIQUE INDEX "BookingPaymentSession_idempotencyKey_key" ON "BookingPaymentSession"("idempotencyKey");
