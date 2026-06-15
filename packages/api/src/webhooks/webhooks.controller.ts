import {
  CallHandler,
  Controller,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  UseInterceptors,
} from "@nestjs/common";
import { ApiTags, ApiHeader, ApiOperation, ApiResponse } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Observable } from "rxjs";
import { WebhooksService } from "./webhooks.service.js";

@Injectable()
class WebhookLogInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    console.log("[webhook]", req.method, req.url);
    console.log("[webhook] headers:", JSON.stringify(req.headers, null, 2));
    console.log("[webhook] body:", JSON.stringify(req.body, null, 2));
    return next.handle();
  }
}

@ApiTags("Webhooks")
@UseInterceptors(WebhookLogInterceptor)
@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly svc: WebhooksService) {}

  @Post("jira")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Receive Jira issue-updated webhook" })
  @ApiHeader({ name: "x-hub-signature", required: true, description: "HMAC-SHA256 from Jira (sha256=<hex>)" })
  @ApiResponse({ status: 202, description: "Job enqueued" })
  @ApiResponse({ status: 200, description: "Ignored or duplicate" })
  @ApiResponse({ status: 401, description: "Bad signature" })
  async jira(
    @Headers("x-hub-signature") hubSignature: string | undefined,
    @Body() body: unknown,
    @Req() req: FastifyRequest & { rawBody?: Buffer },
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));
    const result = await this.svc.handleJira(hubSignature, rawBody, body);
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
