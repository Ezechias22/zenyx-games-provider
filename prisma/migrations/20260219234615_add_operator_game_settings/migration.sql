/*
  Warnings:

  - The primary key for the `JackpotPool` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `amount` on the `JackpotPool` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - You are about to alter the column `seed` on the `JackpotPool` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - The primary key for the `SlotSession` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the `ProgressiveJackpot` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "JackpotPool" DROP CONSTRAINT "JackpotPool_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "operatorId" SET DATA TYPE TEXT,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "seed" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ADD CONSTRAINT "JackpotPool_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "SlotSession" DROP CONSTRAINT "SlotSession_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "operatorId" SET DATA TYPE TEXT,
ALTER COLUMN "playerId" SET DATA TYPE TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT,
ADD CONSTRAINT "SlotSession_pkey" PRIMARY KEY ("id");

-- DropTable
DROP TABLE "ProgressiveJackpot";

-- CreateTable
CREATE TABLE "OperatorGameSettings" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "gameCode" TEXT NOT NULL,
    "targetRtp" DOUBLE PRECISION NOT NULL DEFAULT 0.96,
    "buyFsMul" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "bonusChance" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
    "jackpotRate" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "jackpotChance" DOUBLE PRECISION NOT NULL DEFAULT 0.00001,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorGameSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperatorGameSettings_operatorId_gameCode_idx" ON "OperatorGameSettings"("operatorId", "gameCode");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorGameSettings_operatorId_gameCode_key" ON "OperatorGameSettings"("operatorId", "gameCode");

-- AddForeignKey
ALTER TABLE "OperatorGameSettings" ADD CONSTRAINT "OperatorGameSettings_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
