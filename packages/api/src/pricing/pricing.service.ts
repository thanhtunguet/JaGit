import { readFile } from "node:fs/promises";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { makeRedis, loadConfig } from "@jagit/shared";
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

// 67.5 USD of session cost converts to a full 8-hour logged workday.
export const USD_PER_WORKDAY = 67.5;
export const HOURS_PER_WORKDAY = 8;

@Injectable()
export class PricingService implements OnModuleInit {
  private readonly logger = new Logger(PricingService.name);
  private readonly LITELLM_PRICING_URL =
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
  private readonly LITELLM_LOCAL_JSON_PATH = process.env.LITELLM_LOCAL_JSON_PATH ?? "";

  private readonly cfg = loadConfig();
  private _redis: ReturnType<typeof makeRedis> | null = null;
  private get redis() {
    if (!this._redis) this._redis = makeRedis(this.cfg.redisUrl);
    return this._redis;
  }

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
      const data = await this.loadPricingData();
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
      this.logger.error("Error fetching/loading pricing from LiteLLM", error);
    }
  }

  private async loadPricingData(): Promise<LiteLlmPricingResponse> {
    try {
      const response = await fetch(this.LITELLM_PRICING_URL, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch pricing data: ${response.statusText}`);
      }
      return (await response.json()) as LiteLlmPricingResponse;
    } catch (fetchError) {
      if (this.LITELLM_LOCAL_JSON_PATH) {
        this.logger.warn(
          `Remote pricing fetch failed, falling back to local file: ${this.LITELLM_LOCAL_JSON_PATH}`,
          fetchError,
        );
        const raw = await readFile(this.LITELLM_LOCAL_JSON_PATH, "utf-8");
        return JSON.parse(raw) as LiteLlmPricingResponse;
      }
      throw fetchError;
    }
  }

  async calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    cachedInputTokens: number = 0,
    cacheCreationInputTokens: number = 0,
  ): Promise<number | null> {
    const pricing = await this.findPricingCached(model);

    if (!pricing) {
      // Return null if pricing for model is unknown
      return null;
    }

    const eff = this.effectiveRates(pricing);

    let cost = 0;

    // Normal input tokens
    cost += inputTokens * eff.input;

    // Output tokens
    cost += outputTokens * eff.output;

    // Cached (cache read) input tokens
    // Default to 10% of input cost if not explicitly defined, like in ccusage
    cost += cachedInputTokens * eff.cacheRead;

    // Cache creation (cache write) input tokens
    // Default to 1.25x input cost if not explicitly defined, like in ccusage
    cost += cacheCreationInputTokens * eff.cacheCreation;

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

  private async findPricingCached(model: string) {
    const key = `pricing:model:${model.toLowerCase()}`;
    try {
      const cached = await this.redis.get(key);
      if (cached !== null) return JSON.parse(cached);
    } catch {
      /* ignore cache read errors — fall back to DB */
    }
    const pricing = await this.findPricing(model);
    try {
      // Cache negative results too (shorter TTL) so we recover once the cron populates pricing.
      await this.redis.set(key, JSON.stringify(pricing ?? null), "EX", pricing ? 3600 : 300);
    } catch {
      /* ignore cache write errors */
    }
    return pricing;
  }

  effectiveRates(p: {
    inputCostPerToken: number;
    outputCostPerToken: number;
    cacheReadInputTokenCost: number | null;
    cacheCreationInputTokenCost: number | null;
  }) {
    return {
      input: p.inputCostPerToken,
      output: p.outputCostPerToken,
      cacheRead: p.cacheReadInputTokenCost ?? p.inputCostPerToken * 0.1,
      cacheCreation: p.cacheCreationInputTokenCost ?? p.inputCostPerToken * 1.25,
    };
  }

  async getBaseTokenRate(): Promise<number | null> {
    const pricing = await this.findPricingCached(BASE_TOKEN_MODEL);
    if (!pricing || pricing.inputCostPerToken <= 0) return null;
    return pricing.inputCostPerToken;
  }

  async getModelRates(model: string): Promise<{
    inputCostPerToken: number;
    outputCostPerToken: number;
    cacheReadInputTokenCost: number | null;
    cacheCreationInputTokenCost: number | null;
  } | null> {
    const p = await this.findPricingCached(model);
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
