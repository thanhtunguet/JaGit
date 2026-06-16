import { config } from "dotenv";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Load .env from monorepo root before NestJS DI initialises any providers
const __rootDir = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__rootDir, "../../../.env") });

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import { loadConfig } from "@jigit/shared";

async function bootstrap() {
  const cfg = loadConfig();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
    { rawBody: true },
  );

  // All API routes under /api
  app.setGlobalPrefix("api");

  // Global validation
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // CORS (dashboard on same origin in prod; localhost:5173 in dev)
  app.enableCors({ origin: [cfg.publicBaseUrl, "http://localhost:5173"] });

  // Swagger UI
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("JiGit API")
      .setDescription("AI coding orchestration — Jira + GitLab + Claude Code")
      .setVersion("1.0")
      .addTag("Jobs")
      .addTag("Webhooks")
      .addTag("Approvals")
      .addTag("Config (read-only)")
      .addTag("Stats")
      .build(),
  );
  SwaggerModule.setup("docs", app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // Health check
  app.getHttpAdapter().get("/health", (_req: unknown, res: any) => {
    res.send({ ok: true, version: "1.0.0" });
  });

  // Serve dashboard static files (built by packages/dashboard).
  // wildcard: false — @fastify/static serves exact file paths (JS, CSS, assets).
  const dashboardDist = path.resolve(__rootDir, "..", "..", "..", "packages", "dashboard", "dist");
  await app.register(fastifyStatic, {
    root: dashboardDist,
    prefix: "/",
    decorateReply: true,
    index: "index.html",
    wildcard: false,
  });

  const host = "0.0.0.0";

  await app.listen(cfg.apiPort, host);
  console.log(`JiGit API listening on ${host}:${cfg.apiPort}`);
  console.log(`Swagger UI → http://${host}:${cfg.apiPort}/api/docs`);
}

bootstrap();
