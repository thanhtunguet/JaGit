-- AlterTable
ALTER TABLE "AgentSession" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "initialCommitSha" TEXT,
ADD COLUMN     "jiraTicketId" TEXT,
ADD COLUMN     "linesAdded" INTEGER,
ADD COLUMN     "linesRemoved" INTEGER;

-- CreateIndex
CREATE INDEX "AgentSession_jiraTicketId_idx" ON "AgentSession"("jiraTicketId");
