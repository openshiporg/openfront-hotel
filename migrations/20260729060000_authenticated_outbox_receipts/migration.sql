-- Receiver-side immutable evidence for authenticated hotel outbox delivery.
CREATE TABLE "HotelOutboxReceipt" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL DEFAULT '',
    "propertyKey" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "aggregateType" TEXT NOT NULL DEFAULT '',
    "aggregateId" TEXT NOT NULL DEFAULT '',
    "credentialKeyId" TEXT NOT NULL DEFAULT '',
    "bodyHash" TEXT NOT NULL DEFAULT '',
    "payloadSnapshot" JSONB DEFAULT '{}',
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelOutboxReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HotelOutboxReceipt_eventKey_key" ON "HotelOutboxReceipt"("eventKey");
CREATE INDEX "HotelOutboxReceipt_tenant_idx" ON "HotelOutboxReceipt"("propertyKey", "receivedAt");
CREATE INDEX "HotelOutboxReceipt_topic_idx" ON "HotelOutboxReceipt"("topic", "receivedAt");
