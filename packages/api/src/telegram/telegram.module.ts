import { Module } from "@nestjs/common";
import { TelegramService } from "./telegram.service.js";
import { ApprovalsModule } from "../approvals/approvals.module.js";

@Module({
  imports: [ApprovalsModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
