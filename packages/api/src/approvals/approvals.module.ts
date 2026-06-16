import { Module, forwardRef } from "@nestjs/common";
import { ApprovalsController } from "./approvals.controller.js";
import { ReviewRequestsController } from "./review-requests.controller.js";
import { ApprovalsService } from "./approvals.service.js";
import { TelegramModule } from "../telegram/telegram.module.js";

@Module({
  imports: [forwardRef(() => TelegramModule)],
  controllers: [ApprovalsController, ReviewRequestsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
