import { z } from "zod";

export const PeriodSchema = z.enum(["today", "7days", "30days"]);
export type Period = z.infer<typeof PeriodSchema>;

// CSV cells are parsed as raw strings (PapaParse dynamicTyping disabled); an
// empty cell arrives as "" and should map to null rather than coercing to 0.
const nullableCoerceNumber = z.preprocess(
  (val) => (val === "" ? null : val),
  z.coerce.number().nullable(),
);

export const SummaryRowSchema = z.object({
  Period: z.string(),
  "Cost (USD)": z.coerce.number(),
  "Saved (USD)": z.coerce.number(),
  "API Calls": z.coerce.number(),
  Sessions: z.coerce.number(),
  Projects: z.coerce.number(),
});

export const DailyRowSchema = z.object({
  Period: z.string(),
  Date: z.string(),
  "Cost (USD)": z.coerce.number(),
  "Saved (USD)": z.coerce.number(),
  "API Calls": z.coerce.number(),
  Sessions: z.coerce.number(),
  "Input Tokens": z.coerce.number(),
  "Output Tokens": z.coerce.number(),
  "Cache Read Tokens": z.coerce.number(),
  "Cache Write Tokens": z.coerce.number(),
});

export const ActivityRowSchema = z.object({
  Period: z.string(),
  Activity: z.string(),
  "Cost (USD)": z.coerce.number(),
  "Share (%)": z.coerce.number(),
  Turns: z.coerce.number(),
});

export const ModelRowSchema = z.object({
  Period: z.string(),
  Model: z.string(),
  "Cost (USD)": z.coerce.number(),
  "Saved (USD)": z.coerce.number(),
  "Share (%)": z.coerce.number(),
  "API Calls": z.coerce.number(),
  "Edit Turns": z.coerce.number(),
  "One-shot Rate (%)": nullableCoerceNumber,
  "Retries/Edit": nullableCoerceNumber,
  "Cost/Edit (USD)": nullableCoerceNumber,
  "Input Tokens": z.coerce.number(),
  "Output Tokens": z.coerce.number(),
  "Cache Read Tokens": z.coerce.number(),
  "Cache Write Tokens": z.coerce.number(),
});

export const ProjectRowSchema = z.object({
  Project: z.string(),
  "Cost (USD)": z.coerce.number(),
  "Saved (USD)": z.coerce.number(),
  "Avg/Session (USD)": z.coerce.number(),
  "Share (%)": z.coerce.number(),
  "API Calls": z.coerce.number(),
  Sessions: z.coerce.number(),
});

export const SessionRowSchema = z.object({
  Project: z.string(),
  "Session ID": z.string(),
  "Started At": z.string(),
  "Cost (USD)": z.coerce.number(),
  "Saved (USD)": z.coerce.number(),
  "API Calls": z.coerce.number(),
  Turns: z.coerce.number(),
});

export const ToolRowSchema = z.object({
  Tool: z.string(),
  Calls: z.coerce.number(),
  "Share (%)": z.coerce.number(),
});

export const ShellCommandRowSchema = z.object({
  Command: z.string(),
  Calls: z.coerce.number(),
  "Share (%)": z.coerce.number(),
});

export const UsageDataSchema = z.object({
  summary: z.array(SummaryRowSchema),
  daily: z.array(DailyRowSchema),
  activity: z.array(ActivityRowSchema),
  models: z.array(ModelRowSchema),
  projects: z.array(ProjectRowSchema),
  sessions: z.array(SessionRowSchema),
  tools: z.array(ToolRowSchema),
  shellCommands: z.array(ShellCommandRowSchema),
});

export type SummaryRow = z.infer<typeof SummaryRowSchema>;
export type DailyRow = z.infer<typeof DailyRowSchema>;
export type ActivityRow = z.infer<typeof ActivityRowSchema>;
export type ModelRow = z.infer<typeof ModelRowSchema>;
export type ProjectRow = z.infer<typeof ProjectRowSchema>;
export type SessionRow = z.infer<typeof SessionRowSchema>;
export type ToolRow = z.infer<typeof ToolRowSchema>;
export type ShellCommandRow = z.infer<typeof ShellCommandRowSchema>;
export type UsageData = z.infer<typeof UsageDataSchema>;

export const ALLOWED_CSV_FILES = [
  "summary.csv",
  "daily.csv",
  "activity.csv",
  "models.csv",
  "projects.csv",
  "sessions.csv",
  "tools.csv",
  "shell-commands.csv",
] as const;

export const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB
