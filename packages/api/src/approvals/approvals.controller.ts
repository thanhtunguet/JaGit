import { Controller, Post, Param, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam, ApiBody } from "@nestjs/swagger";
import { IsString } from "class-validator";
import { ApprovalsService } from "./approvals.service.js";

class DecideDto {
  @IsString()
  optionId!: string;
}

@ApiTags("Approvals")
@Controller("approvals")
export class ApprovalsController {
  constructor(private readonly svc: ApprovalsService) {}

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
