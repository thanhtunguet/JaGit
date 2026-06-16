-- AlterTable
ALTER TABLE "AgentTemplate" ADD COLUMN "mcpServerIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "AgentTemplate" ADD COLUMN "requireReviewBeforeCommit" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "reviewApprovedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "McpServerConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "args" JSONB NOT NULL DEFAULT '[]',
    "env" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpServerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpServerConfig_name_key" ON "McpServerConfig"("name");
