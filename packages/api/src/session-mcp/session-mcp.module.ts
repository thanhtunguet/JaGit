import { Module } from "@nestjs/common";
import { SessionMcpController } from "./session-mcp.controller.js";
import { SessionMcpService } from "./session-mcp.service.js";
import { PricingModule } from "../pricing/pricing.module.js";

@Module({
  imports: [PricingModule],
  controllers: [SessionMcpController],
  providers: [SessionMcpService],
})
export class SessionMcpModule {}