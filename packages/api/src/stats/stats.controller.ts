import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { StatsService } from "./stats.service.js";

@ApiTags("Stats")
@Controller("stats")
export class StatsController {
  constructor(private readonly svc: StatsService) {}

  @Get("overview")
  @ApiOperation({ summary: "Dashboard overview metrics (jobs, throughput, activity)" })
  @ApiResponse({ status: 200, description: "Aggregated dashboard stats" })
  getOverview() {
    return this.svc.getOverview();
  }
}
