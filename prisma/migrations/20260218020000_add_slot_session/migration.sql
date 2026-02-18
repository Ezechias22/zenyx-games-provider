-- Enable UUID generator (Railway Postgres usually supports it, but we ensure it)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create SlotSession table
CREATE TABLE IF NOT EXISTS "SlotSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "operatorId" UUID NOT NULL,
  "playerId" UUID NOT NULL,
  "gameCode" TEXT NOT NULL,
  "data" TEXT NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SlotSession_pkey" PRIMARY KEY ("id")
);

-- Unique constraint for upsert key
CREATE UNIQUE INDEX IF NOT EXISTS "SlotSession_operatorId_playerId_gameCode_key"
ON "SlotSession"("operatorId", "playerId", "gameCode");

-- Optional index (helps queries)
CREATE INDEX IF NOT EXISTS "SlotSession_operatorId_playerId_gameCode_idx"
ON "SlotSession"("operatorId", "playerId", "gameCode");