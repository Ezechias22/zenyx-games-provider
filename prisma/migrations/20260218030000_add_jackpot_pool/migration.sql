-- prisma/migrations/20260218030000_add_jackpot_pool/migration.sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "JackpotPool" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "operatorId" UUID NOT NULL,
  "currency" TEXT NOT NULL,
  "tier" TEXT NOT NULL,
  "amount" NUMERIC NOT NULL DEFAULT 0,
  "seed" NUMERIC NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JackpotPool_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "JackpotPool_operatorId_currency_tier_key"
ON "JackpotPool"("operatorId","currency","tier");

CREATE INDEX IF NOT EXISTS "JackpotPool_operatorId_currency_tier_idx"
ON "JackpotPool"("operatorId","currency","tier");
