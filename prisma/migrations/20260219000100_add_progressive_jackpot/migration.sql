CREATE TABLE IF NOT EXISTS "ProgressiveJackpot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "gameCode" TEXT NOT NULL,
  "pool" NUMERIC NOT NULL DEFAULT 0,
  "hitRate" DOUBLE PRECISION NOT NULL DEFAULT 0.00001,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgressiveJackpot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProgressiveJackpot_gameCode_key"
ON "ProgressiveJackpot"("gameCode");
