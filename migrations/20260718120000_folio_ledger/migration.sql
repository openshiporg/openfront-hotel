-- Add an append-only primary folio and entry ledger without rewriting booking snapshots.
CREATE TABLE "Folio" (
    "id" TEXT NOT NULL,
    "folioNumber" TEXT NOT NULL DEFAULT '',
    "booking" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Folio_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Folio_status_check" CHECK ("status" IN ('open', 'closed', 'voided')),
    CONSTRAINT "Folio_currency_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$')
);

CREATE TABLE "FolioEntry" (
    "id" TEXT NOT NULL,
    "folio" TEXT,
    "postingKey" TEXT NOT NULL DEFAULT '',
    "entryType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL DEFAULT '',
    "taxCategorySnapshot" TEXT NOT NULL DEFAULT '',
    "metadataSnapshot" JSONB DEFAULT '{}',
    "postedBy" TEXT,
    "reverses" TEXT,

    CONSTRAINT "FolioEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FolioEntry_amount_check" CHECK ("amountMinor" > 0),
    CONSTRAINT "FolioEntry_currency_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
    CONSTRAINT "FolioEntry_direction_check" CHECK ("direction" IN ('debit', 'credit')),
    CONSTRAINT "FolioEntry_type_check" CHECK ("entryType" IN ('room_charge', 'tax', 'fee', 'addon', 'payment', 'refund', 'adjustment', 'transfer', 'reversal')),
    CONSTRAINT "FolioEntry_source_check" CHECK ("sourceType" IN ('reservation_snapshot', 'payment', 'refund', 'operator', 'night_audit', 'system'))
);

CREATE UNIQUE INDEX "Folio_folioNumber_key" ON "Folio"("folioNumber");
CREATE UNIQUE INDEX "Folio_booking_key" ON "Folio"("booking");
CREATE UNIQUE INDEX "FolioEntry_postingKey_key" ON "FolioEntry"("postingKey");
CREATE UNIQUE INDEX "FolioEntry_reverses_key" ON "FolioEntry"("reverses");
CREATE INDEX "FolioEntry_folio_idx" ON "FolioEntry"("folio");
CREATE INDEX "FolioEntry_postedBy_idx" ON "FolioEntry"("postedBy");

ALTER TABLE "Folio" ADD CONSTRAINT "Folio_booking_fkey" FOREIGN KEY ("booking") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FolioEntry" ADD CONSTRAINT "FolioEntry_folio_fkey" FOREIGN KEY ("folio") REFERENCES "Folio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FolioEntry" ADD CONSTRAINT "FolioEntry_postedBy_fkey" FOREIGN KEY ("postedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FolioEntry" ADD CONSTRAINT "FolioEntry_reverses_fkey" FOREIGN KEY ("reverses") REFERENCES "FolioEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Give every maintained reservation one stable primary folio.
INSERT INTO "Folio" ("id", "folioNumber", "booking", "status", "currencyCode", "openedAt", "createdAt", "updatedAt")
SELECT
    'folio_' || md5(b."id"),
    'FOL-' || b."confirmationNumber",
    b."id",
    'open',
    COALESCE(NULLIF(UPPER(li."currencyCode"), ''), 'USD'),
    b."createdAt",
    b."createdAt",
    CURRENT_TIMESTAMP
FROM "Booking" b
LEFT JOIN LATERAL (
    SELECT r."currencyCode"
    FROM "ReservationLineItem" r
    WHERE r."reservation" = b."id"
    ORDER BY r."date" ASC, r."id" ASC
    LIMIT 1
) li ON TRUE;

-- Materialize existing immutable reservation snapshots as opening debit entries.
INSERT INTO "FolioEntry" (
    "id", "folio", "postingKey", "entryType", "direction", "amountMinor",
    "currencyCode", "description", "serviceDate", "postedAt", "sourceType",
    "sourceId", "taxCategorySnapshot", "metadataSnapshot"
)
SELECT
    'folio_entry_' || md5(r."id"),
    f."id",
    'folio:snapshot:' || r."snapshotKey",
    CASE
      WHEN r."type" = 'room' THEN 'room_charge'
      WHEN r."type" = 'tax' THEN 'tax'
      WHEN r."type" = 'service_fee' THEN 'fee'
      ELSE 'addon'
    END,
    'debit',
    r."totalPrice",
    COALESCE(NULLIF(UPPER(r."currencyCode"), ''), f."currencyCode"),
    r."description",
    r."date",
    r."createdAt",
    'reservation_snapshot',
    r."id",
    CASE WHEN r."type" = 'tax' THEN 'lodging_tax' ELSE '' END,
    jsonb_build_object('reservationSnapshotKey', r."snapshotKey", 'reservationLineType', r."type")
FROM "ReservationLineItem" r
JOIN "Folio" f ON f."booking" = r."reservation"
WHERE r."totalPrice" > 0;

-- Materialize settled payment/refund evidence against the same balance contract.
INSERT INTO "FolioEntry" (
    "id", "folio", "postingKey", "entryType", "direction", "amountMinor",
    "currencyCode", "description", "serviceDate", "postedAt", "sourceType",
    "sourceId", "taxCategorySnapshot", "metadataSnapshot"
)
SELECT
    'folio_payment_' || md5(p."id"),
    f."id",
    'folio:payment:' || p."id",
    CASE WHEN p."paymentType" = 'refund' OR p."amount" < 0 THEN 'refund' ELSE 'payment' END,
    CASE WHEN p."paymentType" = 'refund' OR p."amount" < 0 THEN 'debit' ELSE 'credit' END,
    ROUND(ABS(p."amount") * 100)::INTEGER,
    COALESCE(NULLIF(UPPER(p."currency"), ''), f."currencyCode"),
    COALESCE(NULLIF(p."description", ''),
      CASE WHEN p."paymentType" = 'refund' OR p."amount" < 0 THEN 'Refund' ELSE 'Payment' END || ' for ' || f."folioNumber"),
    COALESCE(p."processedAt", p."refundedAt", p."createdAt"),
    COALESCE(p."processedAt", p."refundedAt", p."createdAt"),
    CASE WHEN p."paymentType" = 'refund' OR p."amount" < 0 THEN 'refund' ELSE 'payment' END,
    p."id",
    '',
    jsonb_build_object(
      'paymentReference', p."paymentReference",
      'paymentMethod', p."paymentMethod",
      'providerPaymentId', NULLIF(p."providerPaymentId", ''),
      'providerRefundId', NULLIF(p."providerRefundId", '')
    )
FROM "BookingPayment" p
JOIN "Folio" f ON f."booking" = p."booking"
WHERE p."status" IN ('completed', 'refunded')
  AND ROUND(ABS(p."amount") * 100)::INTEGER > 0;
