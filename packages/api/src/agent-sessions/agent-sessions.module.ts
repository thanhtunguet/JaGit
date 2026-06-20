import { Module } from "@nestjs/common";
import { AgentSessionController } from "./agent-sessions.controller.js";
import { AgentSessionService } from "./agent-sessions.service.js";

@Module({
  controllers: [AgentSessionController],
  providers: [AgentSessionService],
})
export class AgentSessionModule {}
