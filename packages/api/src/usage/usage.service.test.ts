import { describe, it, expect, vi, beforeEach } from "vitest";
import { Test } from "@nestjs/testing";
import AdmZip from "adm-zip";
import { UsageService } from "./usage.service.js";
import { PrismaService } from "../common/prisma.module.js";

const mockPrisma = {
  client: {
    user: {
      upsert: vi.fn().mockResolvedValue({ id: "u1", username: "alice" }),
      findUnique: vi.fn().mockResolvedValue({ id: "u1", username: "alice", uploads: [] }),
      findMany: vi.fn().mockResolvedValue([{ id: "u1", username: "alice", _count: { uploads: 2 } }]),
      delete: vi.fn().mockResolvedValue({ id: "u1" }),
    },
    usageUpload: {
      create: vi.fn().mockResolvedValue({ id: "up1", userId: "u1", uploadedAt: new Date() }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
};

describe("UsageService", () => {
  let service: UsageService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        UsageService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(UsageService);
  });

  it("listUsers returns users with upload counts", async () => {
    const users = await service.listUsers();
    expect(users).toHaveLength(1);
    expect(users[0].username).toBe("alice");
    expect(mockPrisma.client.user.findMany).toHaveBeenCalled();
  });

  it("getUserUploads throws for unknown user", async () => {
    mockPrisma.client.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.getUserUploads("nobody")).rejects.toThrow("not found");
  });

  it("getLatestUpload returns null when no uploads", async () => {
    mockPrisma.client.user.findUnique.mockResolvedValueOnce({
      id: "u1", username: "alice", uploads: [],
    });
    const result = await service.getLatestUpload("alice");
    expect(result).toBeNull();
  });

  it("deleteUser calls prisma delete", async () => {
    await service.deleteUser("alice");
    expect(mockPrisma.client.user.delete).toHaveBeenCalledWith({
      where: { username: "alice" },
    });
  });

  it("uploadUsageData throws on invalid ZIP", async () => {
    await expect(service.uploadUsageData("alice", Buffer.from("not a zip")))
      .rejects.toThrow("Invalid ZIP file");
  });

  it("uploadUsageData accepts a numeric-looking Project value in projects.csv", async () => {
    const zip = new AdmZip();
    zip.addFile(
      "summary.csv",
      Buffer.from("Period,Cost (USD),Saved (USD),API Calls,Sessions,Projects\n30 Days,1,0,1,1,1\n"),
    );
    zip.addFile(
      "projects.csv",
      Buffer.from(
        "Project,Cost (USD),Saved (USD),Avg/Session (USD),Share (%),API Calls,Sessions\n13,0,0,0,0,3,1\n",
      ),
    );

    const result = await service.uploadUsageData("alice", zip.toBuffer());

    expect(result.filesProcessed).toContain("projects.csv");
    expect(mockPrisma.client.usageUpload.create).toHaveBeenCalled();
    const savedData = mockPrisma.client.usageUpload.create.mock.calls[0][0].data.data;
    expect(savedData.projects[0].Project).toBe("13");
  });
});
