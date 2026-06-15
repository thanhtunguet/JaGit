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
  );

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
      .build(),
  );
  SwaggerModule.setup("api/docs", app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // Health check
  app.getHttpAdapter().get("/health", (_req: unknown, res: any) => {
    res.send({ ok: true, version: "1.0.0" });
  });

  // Serve dashboard static files (built by packages/dashboard)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dashboardDist = path.resolve(__dirname, "..", "..", "..", "packages", "dashboard", "dist");
  // Register static files. NestJS registers its own not-found handler at listen() time
  // so we cannot call setNotFoundHandler here. Instead we handle SPA fallback via
  // a catch-all wildcard registered before NestJS routes close.
  await app.register(fastifyStatic, {
    root: dashboardDist,
    prefix: "/",
    decorateReply: false,
    index: "index.html",
    wildcard: false,
  });

  await app.listen(cfg.apiPort, "0.0.0.0");
  console.log(`JiGit API listening on :${cfg.apiPort}`);
  console.log(`Swagger UI → http://localhost:${cfg.apiPort}/api/docs`);
}

bootstrap();
