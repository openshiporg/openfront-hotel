-- Remove the invented outbox / transactional-email machinery.
-- Guest contact-form inquiries are real data: keep them in their own table before the outbox is dropped.
CREATE TABLE "HotelContactMessage" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "guestName" TEXT NOT NULL DEFAULT '',
    "replyTo" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelContactMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HotelContactMessage_reference_key" ON "HotelContactMessage"("reference");

INSERT INTO "HotelContactMessage" ("id", "reference", "guestName", "replyTo", "phone", "subject", "message", "receivedAt", "createdAt", "updatedAt")
SELECT "id", "aggregateId",
       COALESCE("payloadSnapshot"->>'guestName', ''),
       COALESCE("payloadSnapshot"->>'replyTo', ''),
       COALESCE("payloadSnapshot"->>'contactPhone', ''),
       COALESCE("payloadSnapshot"->>'contactSubject', ''),
       COALESCE("payloadSnapshot"->>'contactMessage', ''),
       "createdAt", "createdAt", CURRENT_TIMESTAMP
FROM "HotelOutboxEvent"
WHERE "topic" = 'hotel.communication.contact_received'
ON CONFLICT ("reference") DO NOTHING;

DROP TABLE "HotelOutboxAttempt";
DROP TABLE "HotelOutboxReceipt";
DROP TABLE "HotelOutboxEvent";

ALTER TABLE "HotelSettings" DROP COLUMN "prearrivalEmailEnabled", DROP COLUMN "prearrivalDays";

DELETE FROM "HotelWorkerLease" WHERE "leaseKey" IN ('progress:outbox', 'heartbeat:outbox');
