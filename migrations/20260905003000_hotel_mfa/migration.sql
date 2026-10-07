-- AUTHORED ONLY. Applying this migration requires separate owner authorization.
ALTER TABLE "User"
  ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaSecret" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "mfaPendingSecret" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "mfaPendingExpiresAt" TIMESTAMP(3),
  ADD COLUMN "mfaLastCounter" INTEGER DEFAULT -1,
  ADD COLUMN "mfaRecoveryHashes" JSONB DEFAULT '[]';
