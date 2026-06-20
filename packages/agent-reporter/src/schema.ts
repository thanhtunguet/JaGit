import { z } from "zod";

export const AGENT_TOOLS = ["claude-code", "codex", "copilot"] as const;
export type AgentToolWire = (typeof AGENT_TOOLS)[number];

export const AgentSessionPayloadSchema = z.object({
  tool: z.enum(AGENT_TOOLS),
  sessionId: z.string().min(1).max(200),
  gitUsername: z.string().min(1).max(200),
  model: z.string().min(1).max(200),
  inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().nullable(),
  toolCallCount: z.number().int().nonnegative().nullable(),
  startedAt: z.string().datetime(),
  rawPayload: z.record(z.string(), z.unknown()).optional(),
});

export type AgentSessionPayload = z.infer<typeof AgentSessionPayloadSchema>;
