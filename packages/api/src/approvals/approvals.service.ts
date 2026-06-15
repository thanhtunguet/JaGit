import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import { publishControl, loadConfig } from "@jigit/shared";

@Injectable()
export class ApprovalsService {
  private readonly cfg = loadConfig();

  constructor(private readonly prisma: PrismaService) {}

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

    await publishControl(this.cfg.redisUrl, {
      type: "approval",
      jobId: approval.jobId,
      approvalId,
      chosenOptionId: optionId,
    });

    return { decided: true, status };
  }
}
