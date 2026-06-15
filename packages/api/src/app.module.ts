import { Module } from "@nestjs/common";
import { PrismaModule } from "./common/prisma.module.js";
import { QueueModule } from "./common/queue.module.js";
import { WebhooksModule } from "./webhooks/webhooks.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { ApprovalsModule } from "./approvals/approvals.module.js";
import { SseModule } from "./sse/sse.module.js";
import { ConfigViewModule } from "./config-view/config-view.module.js";
import { TelegramModule } from "./telegram/telegram.module.js";
import { SpaController } from "./spa.controller.js";

@Module({
  imports: [
    PrismaModule,
    QueueModule,
    WebhooksModule,
    JobsModule,
    ApprovalsModule,
    SseModule,
    ConfigViewModule,
    TelegramModule,
  ],
  controllers: [SpaController],
})
export class AppModule {}
