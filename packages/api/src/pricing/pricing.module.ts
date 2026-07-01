import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PricingService } from "./pricing.service.js";
import { PrismaModule } from "../common/prisma.module.js";

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
