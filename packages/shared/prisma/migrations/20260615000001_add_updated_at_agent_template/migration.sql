-- AlterTable: add missing updatedAt column to AgentTemplate
ALTER TABLE "AgentTemplate" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();
