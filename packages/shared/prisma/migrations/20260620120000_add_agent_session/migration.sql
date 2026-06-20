-- CreateEnum
CREATE TYPE "AgentTool" AS ENUM ('claude_code', 'codex', 'copilot');

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "tool" "AgentTool" NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION,
    "toolCallCount" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentSession_userId_lastUpdatedAt_idx" ON "AgentSession"("userId", "lastUpdatedAt");

-- CreateIndex
CREATE INDEX "AgentSession_tool_lastUpdatedAt_idx" ON "AgentSession"("tool", "lastUpdatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_tool_sessionId_key" ON "AgentSession"("tool", "sessionId");

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

