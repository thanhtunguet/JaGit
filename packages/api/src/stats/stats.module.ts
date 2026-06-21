import { Module } from "@nestjs/common";
import { StatsController } from "./stats.controller.js";
import { StatsService } from "./stats.service.js";
import { PricingModule } from "../pricing/pricing.module.js";

@Module({ imports: [PricingModule], controllers: [StatsController], providers: [StatsService] })
export class StatsModule {}
