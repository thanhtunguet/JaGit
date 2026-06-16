import { z } from "zod";
import { CredentialKindSchema } from "./credentials.js";

export const McpTransportSchema = z.enum(["stdio", "http"]);

export const McpEnvCredentialRefSchema = z.object({
  type: z.literal("credential"),
  kind: CredentialKindSchema,
  name: z.string().min(1),
  secretKey: z.string().min(1),
});

export const McpEnvValueSchema = z.union([z.string(), McpEnvCredentialRefSchema]);

const mcpKeyValues = z.record(z.string(), McpEnvValueSchema).default({});

export const McpServerConfigBodySchema = z
  .object({
    name: z.string().min(1),
    transport: McpTransportSchema.default("stdio"),
    enabled: z.boolean().default(true),
    // stdio
    command: z.string().optional(),
    args: z.array(z.string()).default([]),
    env: mcpKeyValues,
    // http
    url: z.string().url().optional(),
    headers: mcpKeyValues,
  })
  .superRefine((data, ctx) => {
    if (data.transport === "stdio") {
      if (!data.command?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "command is required for stdio transport",
          path: ["command"],
        });
      }
    }
    if (data.transport === "http") {
      if (!data.url?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "url is required for http transport",
          path: ["url"],
        });
      }
    }
  });

export type McpServerConfigBody = z.infer<typeof McpServerConfigBodySchema>;
export type McpTransport = z.infer<typeof McpTransportSchema>;
export type McpEnvValue = z.infer<typeof McpEnvValueSchema>;
export type McpEnvCredentialRef = z.infer<typeof McpEnvCredentialRefSchema>;

export type CredentialResolver = (
  kind: z.infer<typeof CredentialKindSchema>,
  name: string,
) => Promise<Record<string, string>>;

/** Resolve MCP env/header map to plain string values. */
export async function resolveMcpEnv(
  env: Record<string, McpEnvValue>,
  resolveCredential: CredentialResolver,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      out[key] = value;
      continue;
    }

    const secrets = await resolveCredential(value.kind, value.name);
    const secret = secrets[value.secretKey];
    if (!secret) {
      throw new Error(
        `Credential ${value.kind}/${value.name} missing secret key "${value.secretKey}"`,
      );
    }
    out[key] = secret;
  }

  return out;
}

/** Whether a chosen approval option counts as human approval for commit guard. */
export function isApproveOptionId(optionId: string): boolean {
  if (optionId.startsWith("deny") || optionId === "reject") return false;
  return optionId === "approve" || optionId === "allow" || optionId.startsWith("allow");
}

export const DEFAULT_REVIEW_OPTIONS = [
  { optionId: "approve", name: "Approve" },
  { optionId: "reject", name: "Request changes" },
] as const;
