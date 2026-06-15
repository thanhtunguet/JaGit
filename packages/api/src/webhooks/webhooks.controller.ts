import { Controller, Post, Body, Headers, HttpCode, HttpStatus, Res } from "@nestjs/common";
import { ApiTags, ApiHeader, ApiOperation, ApiResponse } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import { WebhooksService } from "./webhooks.service.js";

@ApiTags("Webhooks")
@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly svc: WebhooksService) {}

  @Post("jira")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Receive Jira issue-updated webhook" })
  @ApiHeader({ name: "x-jigit-secret", required: true })
  @ApiResponse({ status: 202, description: "Job enqueued" })
  @ApiResponse({ status: 200, description: "Ignored or duplicate" })
  @ApiResponse({ status: 401, description: "Bad secret" })
  async jira(
    @Headers("x-jigit-secret") secret: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const result = await this.svc.handleJira(secret, body);
    if ("ignored" in result || "duplicate" in result) {
      res.status(200);
    }
    return result;
  }

  @Post("gitlab")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Receive GitLab webhook (Phase 2+ — stub)" })
  async gitlab() {
    return { ignored: true, reason: "gitlab triggers deferred to Phase 2+" };
  }
}
