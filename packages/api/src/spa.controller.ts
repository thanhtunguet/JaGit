import { Controller, All, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";

/**
 * Catch-all controller that returns index.html for any unmatched route,
 * enabling React Router client-side navigation on direct URLs and page refresh.
 * Must be the last controller registered so it doesn't shadow real API routes.
 */
@Controller()
export class SpaController {
  @All("*")
  serveSpa(@Res() reply: FastifyReply) {
    return reply.sendFile("index.html");
  }
}
