import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

// __dirname = packages/api/src at runtime (same location as main.ts)
const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardDist = resolve(__dirname, "..", "..", "..", "packages", "dashboard", "dist");

describe("dashboard static serving", () => {
  it("dashboard dist directory and index.html exist on disk", () => {
    expect(existsSync(dashboardDist)).toBe(true);
    expect(existsSync(resolve(dashboardDist, "index.html"))).toBe(true);
  });

  it("has @fastify/static in api package.json dependencies", () => {
    const apiPkg = resolve(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(apiPkg, "utf-8"));
    expect(pkg.dependencies).toHaveProperty("@fastify/static");
  });
});

describe("SPA static file serving (HTTP)", () => {
  const app = Fastify();

  beforeAll(async () => {
    await app.register(fastifyStatic, {
      root: dashboardDist,
      prefix: "/",
      decorateReply: true,
      index: "index.html",
      wildcard: false,
    });
    // SPA fallback: unknown routes return index.html (mirrors SpaController in production)
    app.get("/*", (_req, reply) => {
      return (reply as any).sendFile("index.html");
    });
    await app.ready();
  });

  afterAll(() => app.close());

  it("GET / returns index.html with status 200", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
  });

  it("GET /jobs returns index.html (SPA fallback for React Router route)", async () => {
    const res = await app.inject({ method: "GET", url: "/jobs" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
  });

  it("GET /some/deep/route returns index.html (SPA fallback)", async () => {
    const res = await app.inject({ method: "GET", url: "/some/deep/route" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
  });
});
