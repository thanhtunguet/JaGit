-- AlterTable: add HTTP transport fields to McpServerConfig
ALTER TABLE "McpServerConfig" ADD COLUMN "transport" TEXT NOT NULL DEFAULT 'stdio';
ALTER TABLE "McpServerConfig" ADD COLUMN "url" TEXT;
ALTER TABLE "McpServerConfig" ADD COLUMN "headers" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "McpServerConfig" ALTER COLUMN "command" SET DEFAULT '';
