import { Controller, Post, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { IsString, IsArray, ValidateNested, IsOptional } from "class-validator";
import { Type } from "class-transformer";
import { AuthGuard } from "../auth/auth.guard.js";
import { loadConfig } from "@jigit/shared";
import { ApprovalsService } from "./approvals.service.js";
import { TelegramService } from "../telegram/telegram.service.js";
import { PrismaService } from "../common/prisma.module.js";

class ReviewOptionDto {
  @IsString()
  optionId!: string;

  @IsString()
  name!: string;
}

class ReviewRequestDto {
  @IsString()
  jobId!: string;

  @IsString()
  prompt!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewOptionDto)
  options?: ReviewOptionDto[];
}

@ApiTags("Approvals")
@Controller("review-requests")
export class ReviewRequestsController {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly telegram: TelegramService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
  @ApiOperation({ summary: "Create a human review approval (used by jigit MCP)" })
  async create(@Body() body: ReviewRequestDto) {
    const options = body.options?.length
      ? body.options
      : [
          { optionId: "approve", name: "Approve" },
          { optionId: "reject", name: "Request changes" },
        ];

    const result = await this.approvals.createReviewRequest({
      jobId: body.jobId,
      prompt: body.prompt,
      options,
    });

    try {
      const cred = await this.prisma.client.credential.findUnique({
        where: { kind_name: { kind: "telegram", name: "default" } },
      });
      const meta = (cred?.meta ?? {}) as Record<string, string>;
      const chatId = meta["chatId"];
      if (chatId) {
        await this.telegram.sendApproval({
          chatId,
          approvalId: result.approvalId,
          jobId: body.jobId,
          prompt: body.prompt,
          options,
        });
      }
    } catch {
      /* telegram best-effort */
    }

    return result;
  }
}
