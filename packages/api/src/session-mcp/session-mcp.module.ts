import { Module } from "@nestjs/common";
import { SessionMcpController } from "./session-mcp.controller.js";
import { SessionMcpService } from "./session-mcp.service.js";

@Module({
  controllers: [SessionMcpController],
  providers: [SessionMcpService],
})
export class SessionMcpModule {}