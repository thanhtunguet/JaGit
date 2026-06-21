import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import {
  publishControl,
  publishEvent,
  approvalsChannel,
  loadConfig,
  isApproveOptionId,
} from "@jagit/shared";

export interface ReviewRequestBody {
  jobId: string;
  prompt: string;
  options: { optionId: string; name: string }[];
}

@Injectable()
export class ApprovalsService {
  private readonly cfg = loadConfig();

  constructor(private readonly prisma: PrismaService) {}

  listPending() {
    return this.prisma.client.approval.findMany({
      where: { status: "pending" },
      include: { job: { select: { id: true, jiraIssueKey: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async createReviewRequest(body: ReviewRequestBody) {
    const job = await this.prisma.client.job.findUnique({ where: { id: body.jobId } });
    if (!job) throw new NotFoundException(`Job ${body.jobId} not found`);

    const approval = await this.prisma.client.approval.create({
      data: {
        jobId: body.jobId,
        kind: "human_review",
        prompt: body.prompt,
        options: body.options as any,
        status: "pending",
      },
    });

    await publishEvent(this.cfg.redisUrl, approvalsChannel, {
      type: "approval_requested",
      approvalId: approval.id,
      jobId: body.jobId,
      prompt: body.prompt,
      options: body.options,
    });

    return { approvalId: approval.id };
  }

  /**
   * Idempotent: first call sets status to approved/rejected; subsequent calls
   * no-op (the WHERE condition on status=pending prevents double-write).
   */
  async decide(approvalId: string, optionId: string, via: string, by = "api-user") {
    const approval = await this.prisma.client.approval.findUnique({
      where: { id: approvalId },
    });
    if (!approval) throw new NotFoundException(`Approval ${approvalId} not found`);

    if (approval.status !== "pending") {
      return { alreadyDecided: true, status: approval.status };
    }

    const status = optionId.startsWith("deny") || optionId === "reject"
      ? "rejected" as const
      : "approved" as const;

    await this.prisma.client.approval.update({
      where: { id: approvalId, status: "pending" },
      data: { status, chosenOptionId: optionId, decidedVia: via, decidedBy: by, decidedAt: new Date() },
    });

    if (approval.kind === "human_review" && isApproveOptionId(optionId)) {
      await this.prisma.client.job.update({
        where: { id: approval.jobId },
        data: { reviewApprovedAt: new Date() },
      });
    }

    await publishControl(this.cfg.redisUrl, {
      type: "approval",
      jobId: approval.jobId,
      approvalId,
      chosenOptionId: optionId,
    });

    await publishEvent(this.cfg.redisUrl, approvalsChannel, {
      type: "resolved",
      approvalId,
      jobId: approval.jobId,
      status,
      chosenOptionId: optionId,
    });

    return { decided: true, status };
  }
}
