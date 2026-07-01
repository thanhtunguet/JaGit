import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import AdmZip from "adm-zip";
import Papa from "papaparse";
import {
  UsageDataSchema,
  ALLOWED_CSV_FILES,
  type UsageData,
  type Period,
} from "./types.js";

const CSV_TO_KEY: Record<string, keyof UsageData> = {
  "summary.csv": "summary",
  "daily.csv": "daily",
  "activity.csv": "activity",
  "models.csv": "models",
  "projects.csv": "projects",
  "sessions.csv": "sessions",
  "tools.csv": "tools",
  "shell-commands.csv": "shellCommands",
};

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers() {
    return this.prisma.client.user.findMany({
      include: { _count: { select: { uploads: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async getUserUploads(username: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { username },
      include: {
        uploads: { orderBy: { uploadedAt: "desc" } },
      },
    });
    if (!user) throw new NotFoundException(`User ${username} not found`);
    return user.uploads;
  }

  async getLatestUpload(username: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { username },
      include: {
        uploads: { orderBy: { uploadedAt: "desc" }, take: 1 },
      },
    });
    if (!user) throw new NotFoundException(`User ${username} not found`);
    return user.uploads[0] ?? null;
  }

  async deleteUser(username: string) {
    await this.prisma.client.user.delete({ where: { username } });
    return { deleted: true };
  }

  async uploadUsageData(username: string, zipBuffer: Buffer): Promise<{
    userId: string;
    uploadId: string;
    uploadedAt: Date;
    filesProcessed: string[];
  }> {
    let zip: AdmZip;
    try {
      zip = new AdmZip(zipBuffer);
    } catch {
      throw new BadRequestException("Invalid ZIP file");
    }

    const entries = zip.getEntries();
    const data: Partial<UsageData> = {};
    const filesProcessed: string[] = [];

    for (const entry of entries) {
      const name = entry.entryName.split("/").pop() ?? "";
      if (!ALLOWED_CSV_FILES.includes(name as typeof ALLOWED_CSV_FILES[number])) continue;

      const csvText = entry.getData().toString("utf-8");
      const parsed = Papa.parse(csvText, { header: true, dynamicTyping: false, skipEmptyLines: true });

      if (parsed.errors.length > 0) {
        throw new BadRequestException(`Failed to parse ${name}: ${parsed.errors[0].message}`);
      }

      const key = CSV_TO_KEY[name];
      const validated = UsageDataSchema.shape[key].safeParse(parsed.data);
      if (!validated.success) {
        throw new BadRequestException(`Validation failed for ${name}: ${validated.error.message}`);
      }

      data[key] = validated.data as any;
      filesProcessed.push(name);
    }

    if (!data.summary || data.summary.length === 0) {
      throw new BadRequestException("Missing required CSV: summary.csv");
    }

    const period = this.inferPeriod(data.summary);

    const fullData = UsageDataSchema.parse({
      summary: data.summary ?? [],
      daily: data.daily ?? [],
      activity: data.activity ?? [],
      models: data.models ?? [],
      projects: data.projects ?? [],
      sessions: data.sessions ?? [],
      tools: data.tools ?? [],
      shellCommands: data.shellCommands ?? [],
    });

    const user = await this.prisma.client.user.upsert({
      where: { username },
      create: { username },
      update: {},
    });

    const upload = await this.prisma.client.usageUpload.create({
      data: {
        userId: user.id,
        period,
        data: fullData as any,
      },
    });

    return {
      userId: user.id,
      uploadId: upload.id,
      uploadedAt: upload.uploadedAt,
      filesProcessed,
    };
  }

  private inferPeriod(summaryRows: { Period: string }[]): Period {
    const periods = summaryRows.map((r) => r.Period);
    const period = periods[0] ?? "30days";
    const map: Record<string, Period> = {
      Today: "today",
      "7 Days": "7days",
      "30 Days": "30days",
    };
    return map[period] ?? "30days";
  }
}
