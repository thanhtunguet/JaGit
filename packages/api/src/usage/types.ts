import { z } from "zod";

export const PeriodSchema = z.enum(["today", "7days", "30days"]);
export type Period = z.infer<typeof PeriodSchema>;

export const SummaryRowSchema = z.object({
  Period: z.string(),
  "Cost (USD)": z.number(),
  "Saved (USD)": z.number(),
  "API Calls": z.number(),
  Sessions: z.number(),
  Projects: z.number(),
});

export const DailyRowSchema = z.object({
  Period: z.string(),
  Date: z.string(),
  "Cost (USD)": z.number(),
  "Saved (USD)": z.number(),
  "API Calls": z.number(),
  Sessions: z.number(),
  "Input Tokens": z.number(),
  "Output Tokens": z.number(),
  "Cache Read Tokens": z.number(),
  "Cache Write Tokens": z.number(),
});

export const ActivityRowSchema = z.object({
  Period: z.string(),
  Activity: z.string(),
  "Cost (USD)": z.number(),
  "Share (%)": z.number(),
  Turns: z.number(),
});

export const ModelRowSchema = z.object({
  Period: z.string(),
  Model: z.string(),
  "Cost (USD)": z.number(),
  "Saved (USD)": z.number(),
  "Share (%)": z.number(),
  "API Calls": z.number(),
  "Edit Turns": z.number(),
  "One-shot Rate (%)": z.number().nullable(),
  "Retries/Edit": z.number().nullable(),
  "Cost/Edit (USD)": z.number().nullable(),
  "Input Tokens": z.number(),
  "Output Tokens": z.number(),
  "Cache Read Tokens": z.number(),
  "Cache Write Tokens": z.number(),
});

export const ProjectRowSchema = z.object({
  Project: z.string(),
  "Cost (USD)": z.number(),
  "Saved (USD)": z.number(),
  "Avg/Session (USD)": z.number(),
  "Share (%)": z.number(),
  "API Calls": z.number(),
  Sessions: z.number(),
});

export const SessionRowSchema = z.object({
  Project: z.string(),
  "Session ID": z.string(),
  "Started At": z.string(),
  "Cost (USD)": z.number(),
  "Saved (USD)": z.number(),
  "API Calls": z.number(),
  Turns: z.number(),
});

export const ToolRowSchema = z.object({
  Tool: z.string(),
  Calls: z.number(),
  "Share (%)": z.number(),
});

export const ShellCommandRowSchema = z.object({
  Command: z.string(),
  Calls: z.number(),
  "Share (%)": z.number(),
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
