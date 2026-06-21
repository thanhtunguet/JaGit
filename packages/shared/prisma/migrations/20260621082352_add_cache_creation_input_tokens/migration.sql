-- AlterTable
ALTER TABLE "AgentSession" ADD COLUMN     "cacheCreationInputTokens" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ModelPricing" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputCostPerToken" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outputCostPerToken" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cacheCreationInputTokenCost" DOUBLE PRECISION,
    "cacheReadInputTokenCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelPricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelPricing_model_key" ON "ModelPricing"("model");

-- CreateIndex
CREATE INDEX "ModelPricing_model_idx" ON "ModelPricing"("model");
