import { Controller, Get, Param, Sse, MessageEvent } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam } from "@nestjs/swagger";
import { Observable } from "rxjs";
import { makeRedis, jobChannel, loadConfig } from "@jigit/shared";

@ApiTags("Jobs")
@Controller("jobs")
export class SseController {
  private readonly cfg = loadConfig();

  @Get(":id/stream")
  @Sse()
  @ApiOperation({ summary: "SSE stream of live job events" })
  @ApiParam({ name: "id", description: "Job CUID" })
  stream(@Param("id") id: string): Observable<MessageEvent> {
    const redis = makeRedis(this.cfg.redisUrl);
    const channel = jobChannel(id);
    redis.subscribe(channel);

    return new Observable<MessageEvent>((observer) => {
      redis.on("message", (_ch: string, msg: string) => {
        observer.next({ data: msg } as MessageEvent);
      });

      return () => {
        redis.unsubscribe(channel);
        redis.quit();
      };
    });
  }
}
