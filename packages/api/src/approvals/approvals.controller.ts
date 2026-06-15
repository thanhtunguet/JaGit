import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus, Sse, MessageEvent } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam, ApiBody } from "@nestjs/swagger";
import { IsString } from "class-validator";
import { Observable } from "rxjs";
import { makeRedis, approvalsChannel, loadConfig } from "@jigit/shared";
import { ApprovalsService } from "./approvals.service.js";

class DecideDto {
  @IsString()
  optionId!: string;
}

@ApiTags("Approvals")
@Controller("approvals")
export class ApprovalsController {
  constructor(private readonly svc: ApprovalsService) {}

  @Get()
  @ApiOperation({ summary: "List pending approvals across all jobs" })
  listPending() {
    return this.svc.listPending();
  }

  @Get("stream")
  @Sse()
  @ApiOperation({ summary: "SSE stream of global approval events (requested + resolved)" })
  stream(): Observable<MessageEvent> {
    const cfg = loadConfig();
    const redis = makeRedis(cfg.redisUrl);
    redis.subscribe(approvalsChannel);

    return new Observable<MessageEvent>((observer) => {
      redis.on("message", (_ch: string, msg: string) => {
        observer.next({ data: msg } as MessageEvent);
      });
      return () => {
        redis.unsubscribe(approvalsChannel);
        redis.quit();
      };
    });
  }

  @Post(":id/decide")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Approve or reject a pending approval (idempotent)" })
  @ApiParam({ name: "id", description: "Approval CUID" })
  @ApiBody({ type: DecideDto })
  decide(
    @Param("id") id: string,
    @Body() dto: DecideDto,
  ) {
    return this.svc.decide(id, dto.optionId, "dashboard");
  }
}
