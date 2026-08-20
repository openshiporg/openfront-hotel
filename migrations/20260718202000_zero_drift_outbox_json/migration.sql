-- Match Keystone's nullable JSON field semantics for dispatcher response snapshots.
ALTER TABLE "HotelOutboxAttempt" ALTER COLUMN "responseSnapshot" DROP NOT NULL;
ALTER TABLE "HotelOutboxEvent" ALTER COLUMN "dispatchResultSnapshot" DROP NOT NULL;
