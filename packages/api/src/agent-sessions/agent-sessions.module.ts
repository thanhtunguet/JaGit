import { Module } from "@nestjs/common";
import { AgentSessionController } from "./agent-sessions.controller.js";
import { AgentSessionService } from "./agent-sessions.service.js";
import { PricingModule } from "../pricing/pricing.module.js";

@Module({
  imports: [PricingModule],
  controllers: [AgentSessionController],
  providers: [AgentSessionService],
})
export class AgentSessionModule {}
