import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";

@Injectable()
export class SessionMcpService {
  constructor(private readonly prisma: PrismaService) {}

  async activateJira(sessionId: string | undefined, username: string, ticketId: string) {
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
}