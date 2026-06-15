import { Global, Module } from "@nestjs/common";
import { createQueue, loadConfig } from "@jigit/shared";

export const QUEUE_TOKEN = "JIGIT_QUEUE";

@Global()
@Module({
  providers: [
    {
      provide: QUEUE_TOKEN,
      useFactory: () => {
        const cfg = loadConfig();
        return createQueue(cfg.redisUrl);
      },
    },
  ],
  exports: [QUEUE_TOKEN],
})
export class QueueModule {}
