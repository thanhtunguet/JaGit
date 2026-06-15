import { Module } from "@nestjs/common";
import { PrismaModule } from "./common/prisma.module.js";
import { QueueModule } from "./common/queue.module.js";
import { WebhooksModule } from "./webhooks/webhooks.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { ApprovalsModule } from "./approvals/approvals.module.js";
import { SseModule } from "./sse/sse.module.js";
import { ConfigModule } from "./config/config.module.js";
import { TelegramModule } from "./telegram/telegram.module.js";
import { StatsModule } from "./stats/stats.module.js";
@Module({
  imports: [
    PrismaModule,
    QueueModule,
    WebhooksModule,
    JobsModule,
    ApprovalsModule,
    SseModule,
    ConfigModule,
    TelegramModule,
    StatsModule,
  ],
  controllers: [],
})
export class AppModule {}
