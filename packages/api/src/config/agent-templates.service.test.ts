import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentTemplatesService } from "./agent-templates.service.js";

const mockPrisma = {
  client: {
    agentTemplate: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
};

describe("AgentTemplatesService", () => {
  let svc: AgentTemplatesService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new AgentTemplatesService(mockPrisma as any);
  });

  describe("create", () => {
    it("defaults model to claude-sonnet-4-6 when not provided", async () => {
      mockPrisma.client.agentTemplate.create.mockResolvedValue({ id: "tpl-1" });
      await svc.create({ name: "default", prompt: "You are a coding agent." });
      expect(mockPrisma.client.agentTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ model: "claude-sonnet-4-6" }),
      });
    });

    it("uses provided model when specified", async () => {
      mockPrisma.client.agentTemplate.create.mockResolvedValue({ id: "tpl-1" });
      await svc.create({ name: "opus", model: "claude-opus-4-5", prompt: "Prompt." });
      expect(mockPrisma.client.agentTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ model: "claude-opus-4-5" }),
      });
    });
  });

  describe("update", () => {
    it("defaults model to claude-sonnet-4-6 when not provided", async () => {
      mockPrisma.client.agentTemplate.findUnique.mockResolvedValue({ id: "tpl-1", name: "default" });
      mockPrisma.client.agentTemplate.update.mockResolvedValue({ id: "tpl-1" });
      await svc.update("tpl-1", { name: "default", prompt: "Updated." });
      expect(mockPrisma.client.agentTemplate.update).toHaveBeenCalledWith({
        where: { id: "tpl-1" },
        data: expect.objectContaining({ model: "claude-sonnet-4-6" }),
      });
    });

    it("uses provided model when specified", async () => {
      mockPrisma.client.agentTemplate.findUnique.mockResolvedValue({ id: "tpl-1", name: "default" });
      mockPrisma.client.agentTemplate.update.mockResolvedValue({ id: "tpl-1" });
      await svc.update("tpl-1", { name: "default", model: "claude-opus-4-5", prompt: "Updated." });
      expect(mockPrisma.client.agentTemplate.update).toHaveBeenCalledWith({
        where: { id: "tpl-1" },
        data: expect.objectContaining({ model: "claude-opus-4-5" }),
      });
    });
  });
});
