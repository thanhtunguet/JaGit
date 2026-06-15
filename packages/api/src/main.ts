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

  await app.listen(cfg.apiPort, "0.0.0.0");
  console.log(`JiGit API listening on :${cfg.apiPort}`);
  console.log(`Swagger UI → http://localhost:${cfg.apiPort}/api/docs`);
}

bootstrap();
