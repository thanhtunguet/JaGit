import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import { PricingService, USD_PER_WORKDAY, HOURS_PER_WORKDAY } from "../pricing/pricing.service.js";
import { createJiraWorklog, type CreateWorklogResult } from "@jagit/shared";

export interface LogWorkResult {
  success: boolean;
  ticketId: string;
  hoursLogged: number;
  baseTokens: number;
  reason?: string;
}

@Injectable()
export class SessionMcpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  private async resolveSession(sessionId: string | undefined, username: string) {
    const session = sessionId
      ? await this.prisma.client.agentSession.findFirst({
          where: { sessionId, user: { username } },
        })
      : await this.prisma.client.agentSession.findFirst({
          where: { user: { username } },
          orderBy: { lastUpdatedAt: "desc" },
        });

    if (!session) {
      throw new NotFoundException(
        sessionId
          ? `Session ${sessionId} not found for user ${username}`
          : `No active session found for user ${username}`
      );
    }

    return session;
  }

  async activateJira(sessionId: string | undefined, username: string, ticketId: string) {
    const session = await this.resolveSession(sessionId, username);

    if (session.jiraTicketId && session.jiraTicketId !== ticketId) {
      throw new ConflictException(
        `Session already associated with ${session.jiraTicketId}`
      );
    }

    const updated = await this.prisma.client.agentSession.update({
      where: { id: session.id },
      data: { jiraTicketId: ticketId },
      select: { id: true, sessionId: true, jiraTicketId: true },
    });

    return {
      success: true,
      sessionId: updated.sessionId,
      jiraTicketId: updated.jiraTicketId!,
      message: "Jira ticket associated with session",
    };
  }

  async logWork(sessionId: string | undefined, username: string): Promise<LogWorkResult> {
    const session = await this.resolveSession(sessionId, username);

    if (!session.jiraTicketId) {
      throw new BadRequestException(
        "Session has no associated Jira ticket; call activate-jira first"
      );
    }

    if (session.costUsd == null) {
      throw new BadRequestException(
        "Session has no recorded cost; cannot compute work duration"
      );
    }

    const baseRate = await this.pricing.getBaseTokenRate();
    if (baseRate == null) {
      throw new BadRequestException(
        "Base token rate unavailable; cannot compute work duration"
      );
    }

    const hoursLogged = (session.costUsd / USD_PER_WORKDAY) * HOURS_PER_WORKDAY;
    const durationMs = Math.round(hoursLogged * 3600 * 1000);
    const baseTokens = this.pricing.toBaseTokens(session.costUsd, baseRate);
    if (baseTokens == null) {
      throw new BadRequestException(
        "Base token rate unavailable; cannot compute work duration"
      );
    }

    const result: CreateWorklogResult = await createJiraWorklog({
      ticketId: session.jiraTicketId,
      durationMs,
      baseTokens,
    });

    return {
      success: result.success,
      ticketId: session.jiraTicketId,
      hoursLogged,
      baseTokens,
      reason: result.reason,
    };
  }
}