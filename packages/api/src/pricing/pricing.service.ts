import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../common/prisma.module.js";

export interface LiteLlmPricingResponse {
  [model: string]: {
    input_cost_per_token?: number;
    output_cost_per_token?: number;
    cache_creation_input_token_cost?: number;
    cache_read_input_token_cost?: number;
  };
}

export const BASE_TOKEN_MODEL = "claude-haiku-4-5";

@Injectable()
export class PricingService implements OnModuleInit {
  private readonly logger = new Logger(PricingService.name);
  private readonly LITELLM_PRICING_URL =
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Initial fetch on application start
    this.fetchAndSavePricing().catch((err) => {
      this.logger.error("Failed initial pricing fetch", err);
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    this.logger.log("Starting scheduled pricing fetch...");
    await this.fetchAndSavePricing();
  }

  async fetchAndSavePricing() {
    try {
      const response = await fetch(this.LITELLM_PRICING_URL, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch pricing data: ${response.statusText}`);
      }

      const data = (await response.json()) as LiteLlmPricingResponse;
      const entries = Object.entries(data).filter(
        ([, pricing]) =>
          typeof pricing.input_cost_per_token === "number" &&
          typeof pricing.output_cost_per_token === "number",
      );

      await Promise.all(
        entries.map(([model, pricing]) =>
          this.prisma.client.modelPricing.upsert({
            where: { model },
            update: {
              inputCostPerToken: pricing.input_cost_per_token!,
              outputCostPerToken: pricing.output_cost_per_token!,
              cacheCreationInputTokenCost: pricing.cache_creation_input_token_cost ?? null,
              cacheReadInputTokenCost: pricing.cache_read_input_token_cost ?? null,
            },
            create: {
              model,
              inputCostPerToken: pricing.input_cost_per_token!,
              outputCostPerToken: pricing.output_cost_per_token!,
              cacheCreationInputTokenCost: pricing.cache_creation_input_token_cost ?? null,
              cacheReadInputTokenCost: pricing.cache_read_input_token_cost ?? null,
            },
          }),
        ),
      );

      this.logger.log(`Successfully fetched and saved pricing for ${entries.length} models.`);
    } catch (error) {
      this.logger.error("Error fetching pricing from LiteLLM", error);
    }
  }

  async calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    cachedInputTokens: number = 0,
    cacheCreationInputTokens: number = 0,
  ): Promise<number | null> {
    let pricing = await this.prisma.client.modelPricing.findUnique({
      where: { model },
    });

    if (!pricing) {
      const normalizedModel = model.toLowerCase();

      // Try exact case-insensitive match
      pricing = await this.prisma.client.modelPricing.findFirst({
        where: {
          model: {
            equals: normalizedModel,
            mode: "insensitive",
          },
        },
      });

      // Try contains case-insensitive match
      if (!pricing) {
        pricing = await this.prisma.client.modelPricing.findFirst({
          where: {
            model: {
              contains: normalizedModel,
              mode: "insensitive",
            },
          },
        });
      }
    }

    if (!pricing) {
      // Return null if pricing for model is unknown
      return null;
    }

    let cost = 0;

    // Normal input tokens
    cost += inputTokens * pricing.inputCostPerToken;

    // Output tokens
    cost += outputTokens * pricing.outputCostPerToken;

    // Cached (cache read) input tokens
    // Default to 10% of input cost if not explicitly defined, like in ccusage
    const cacheReadCost = pricing.cacheReadInputTokenCost ?? (pricing.inputCostPerToken * 0.1);
    cost += cachedInputTokens * cacheReadCost;

    // Cache creation (cache write) input tokens
    // Default to 1.25x input cost if not explicitly defined, like in ccusage
    const cacheCreationCost = pricing.cacheCreationInputTokenCost ?? (pricing.inputCostPerToken * 1.25);
    cost += cacheCreationInputTokens * cacheCreationCost;

    return cost;
  }

  private async findPricing(model: string) {
    let pricing = await this.prisma.client.modelPricing.findUnique({
      where: { model },
    });
    if (!pricing) {
      const normalizedModel = model.toLowerCase();
      pricing = await this.prisma.client.modelPricing.findFirst({
        where: { model: { equals: normalizedModel, mode: "insensitive" } },
      });
      if (!pricing) {
        pricing = await this.prisma.client.modelPricing.findFirst({
          where: { model: { contains: normalizedModel, mode: "insensitive" } },
        });
      }
    }
    return pricing;
  }

  async getBaseTokenRate(): Promise<number | null> {
    const pricing = await this.findPricing(BASE_TOKEN_MODEL);
    if (!pricing || pricing.inputCostPerToken <= 0) return null;
    return pricing.inputCostPerToken;
  }

  async getModelRates(model: string): Promise<{
    inputCostPerToken: number;
    outputCostPerToken: number;
    cacheReadInputTokenCost: number | null;
    cacheCreationInputTokenCost: number | null;
  } | null> {
    const p = await this.findPricing(model);
    if (!p) return null;
    return {
      inputCostPerToken: p.inputCostPerToken,
      outputCostPerToken: p.outputCostPerToken,
      cacheReadInputTokenCost: p.cacheReadInputTokenCost ?? null,
      cacheCreationInputTokenCost: p.cacheCreationInputTokenCost ?? null,
    };
  }

  toBaseTokens(costUsd: number | null, baseRate: number | null): number | null {
    if (costUsd == null || baseRate == null || baseRate <= 0) return null;
    return costUsd / baseRate;
  }
}
