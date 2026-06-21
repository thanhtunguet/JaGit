import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PricingService } from "./pricing.service.js";
import { PrismaService } from "../common/prisma.module.js";

function makePrisma() {
  return {
    client: {
      modelPricing: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
    },
  } as unknown as PrismaService;
}

describe("PricingService", () => {
  let prisma: PrismaService;
  let svc: PricingService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new PricingService(prisma);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchAndSavePricing fetches data and upserts models", async () => {
    const mockPricingData = {
      "test-model": {
        input_cost_per_token: 0.000003,
        output_cost_per_token: 0.000015,
        cache_creation_input_token_cost: 0.00000375,
        cache_read_input_token_cost: 0.0000003,
      },
      "invalid-model": {
        input_cost_per_token: "invalid",
      },
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockPricingData,
    });

    await svc.fetchAndSavePricing();

    expect(global.fetch).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
      expect.objectContaining({ signal: expect.anything() }),
    );

    // Should only process test-model since invalid-model has wrong type
    expect((prisma as any).client.modelPricing.upsert).toHaveBeenCalledTimes(1);
    expect((prisma as any).client.modelPricing.upsert).toHaveBeenCalledWith({
      where: { model: "test-model" },
      update: {
        inputCostPerToken: 0.000003,
        outputCostPerToken: 0.000015,
        cacheCreationInputTokenCost: 0.00000375,
        cacheReadInputTokenCost: 0.0000003,
      },
      create: {
        model: "test-model",
        inputCostPerToken: 0.000003,
        outputCostPerToken: 0.000015,
        cacheCreationInputTokenCost: 0.00000375,
        cacheReadInputTokenCost: 0.0000003,
      },
    });
  });

  it("calculateCost calculates correctly with all fields present", async () => {
    (prisma as any).client.modelPricing.findUnique.mockResolvedValue({
      inputCostPerToken: 3,
      outputCostPerToken: 15,
      cacheReadInputTokenCost: 0.3,
    });

    // 10 * 3 + 20 * 15 + 5 * 0.3 = 30 + 300 + 1.5 = 331.5
    const cost = await svc.calculateCost("test-model", 10, 20, 5);
    expect(cost).toBe(331.5);
  });

  it("calculateCost falls back to 10% of input cost for cache read if null", async () => {
    (prisma as any).client.modelPricing.findUnique.mockResolvedValue({
      inputCostPerToken: 10,
      outputCostPerToken: 20,
      cacheReadInputTokenCost: null,
    });

    // 10% of 10 = 1
    // 10 * 10 + 20 * 20 + 5 * 1 = 100 + 400 + 5 = 505
    const cost = await svc.calculateCost("test-model", 10, 20, 5);
    expect(cost).toBe(505);
  });

  it("calculateCost falls back to 1.25x input cost for cache creation if null", async () => {
    (prisma as any).client.modelPricing.findUnique.mockResolvedValue({
      inputCostPerToken: 10,
      outputCostPerToken: 20,
      cacheReadInputTokenCost: null,
      cacheCreationInputTokenCost: null,
    });

    // 125% of 10 = 12.5
    // 10 * 10 + 20 * 20 + 5 * 1 (cache read) + 3 * 12.5 (cache creation) = 100 + 400 + 5 + 37.5 = 542.5
    const cost = await svc.calculateCost("test-model", 10, 20, 5, 3);
    expect(cost).toBe(542.5);
  });

  it("calculateCost uses explicit cacheCreationInputTokenCost when present", async () => {
    (prisma as any).client.modelPricing.findUnique.mockResolvedValue({
      inputCostPerToken: 3,
      outputCostPerToken: 15,
      cacheReadInputTokenCost: 0.3,
      cacheCreationInputTokenCost: 3.75,
    });

    // 10 * 3 + 20 * 15 + 5 * 0.3 + 2 * 3.75 = 30 + 300 + 1.5 + 7.5 = 339
    const cost = await svc.calculateCost("test-model", 10, 20, 5, 2);
    expect(cost).toBe(339);
  });

  it("calculateCost returns null if model not found", async () => {
    (prisma as any).client.modelPricing.findUnique.mockResolvedValue(null);
    (prisma as any).client.modelPricing.findFirst.mockResolvedValue(null);
    const cost = await svc.calculateCost("test-model", 10, 20, 5);
    expect(cost).toBeNull();
  });

  it("calculateCost falls back to case-insensitive exact match if model not found", async () => {
    (prisma as any).client.modelPricing.findUnique.mockResolvedValue(null);
    (prisma as any).client.modelPricing.findFirst.mockImplementation(async ({ where }: any) => {
      if (where?.model?.equals === "test-model") {
        return {
          inputCostPerToken: 3,
          outputCostPerToken: 15,
          cacheReadInputTokenCost: 0.3,
        };
      }
      return null;
    });

    const cost = await svc.calculateCost("TEST-MODEL", 10, 20, 5);
    expect(cost).toBe(331.5);
    expect((prisma as any).client.modelPricing.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { model: { equals: "test-model", mode: "insensitive" } },
      })
    );
  });

  it("calculateCost falls back to case-insensitive contains match if exact and equals matches not found", async () => {
    (prisma as any).client.modelPricing.findUnique.mockResolvedValue(null);
    (prisma as any).client.modelPricing.findFirst.mockImplementation(async ({ where }: any) => {
      if (where?.model?.contains === "kimi-k2.6") {
        return {
          inputCostPerToken: 3,
          outputCostPerToken: 15,
          cacheReadInputTokenCost: 0.3,
        };
      }
      return null;
    });

    const cost = await svc.calculateCost("Kimi-K2.6", 10, 20, 5);
    expect(cost).toBe(331.5);
    expect((prisma as any).client.modelPricing.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { model: { contains: "kimi-k2.6", mode: "insensitive" } },
      })
    );
  });

  it("getBaseTokenRate returns base model inputCostPerToken", async () => {
    (prisma as any).client.modelPricing.findUnique.mockResolvedValue({
      inputCostPerToken: 0.0000008,
      outputCostPerToken: 0.000004,
    });
    const rate = await svc.getBaseTokenRate();
    expect(rate).toBe(0.0000008);
    expect((prisma as any).client.modelPricing.findUnique).toHaveBeenCalledWith({
      where: { model: "claude-haiku-4-5" },
    });
  });

  it("getBaseTokenRate returns null when base model missing", async () => {
    (prisma as any).client.modelPricing.findUnique.mockResolvedValue(null);
    (prisma as any).client.modelPricing.findFirst.mockResolvedValue(null);
    expect(await svc.getBaseTokenRate()).toBeNull();
  });

  it("getBaseTokenRate returns null when rate is zero or negative", async () => {
    (prisma as any).client.modelPricing.findUnique.mockResolvedValue({
      inputCostPerToken: 0,
      outputCostPerToken: 0.000004,
    });
    expect(await svc.getBaseTokenRate()).toBeNull();
  });

  it("toBaseTokens divides cost by base rate", () => {
    expect(svc.toBaseTokens(0.0008, 0.0000008)).toBeCloseTo(1000, 6);
  });

  it("toBaseTokens returns null for null cost, null rate, or non-positive rate", () => {
    expect(svc.toBaseTokens(null, 0.0000008)).toBeNull();
    expect(svc.toBaseTokens(0.0008, null)).toBeNull();
    expect(svc.toBaseTokens(0.0008, 0)).toBeNull();
  });
});
