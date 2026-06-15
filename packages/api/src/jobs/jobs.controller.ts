import { Controller, Get, Post, Param, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { JobsService } from "./jobs.service.js";

@ApiTags("Jobs")
@Controller("jobs")
export class JobsController {
  constructor(private readonly svc: JobsService) {}

  @Get()
  @ApiOperation({ summary: "List all jobs (newest first, max 100)" })
  @ApiResponse({ status: 200, description: "Array of jobs" })
  listJobs() { return this.svc.listJobs(); }

  @Get(":id")
  @ApiOperation({ summary: "Get job details with steps, events, and pending approvals" })
  @ApiParam({ name: "id", description: "Job CUID" })
  @ApiResponse({ status: 200, description: "Job details" })
  @ApiResponse({ status: 404, description: "Job not found" })
  getJob(@Param("id") id: string) { return this.svc.getJob(id); }

  @Post(":id/stop")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Send stop signal to the running job" })
  @ApiParam({ name: "id", description: "Job CUID" })
  stop(@Param("id") id: string) { return this.svc.control(id, "stop"); }

  @Post(":id/pause")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Pause a running job (saves checkpoint)" })
  @ApiParam({ name: "id", description: "Job CUID" })
  pause(@Param("id") id: string) { return this.svc.control(id, "pause"); }

  @Post(":id/resume")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Resume a paused job" })
  @ApiParam({ name: "id", description: "Job CUID" })
  resume(@Param("id") id: string) { return this.svc.control(id, "resume"); }
}
