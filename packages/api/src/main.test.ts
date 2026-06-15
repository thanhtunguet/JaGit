import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

// __dirname = packages/api/src at runtime (same location as main.ts)
const __dirname = dirname(fileURLToPath(import.meta.url));

describe("dashboard static serving", () => {
  it("resolves dashboard dist directory relative to main.ts location", () => {
    const dashboardDist = resolve(__dirname, "..", "..", "..", "packages", "dashboard", "dist");
    expect(existsSync(dashboardDist)).toBe(true);
    expect(existsSync(resolve(dashboardDist, "index.html"))).toBe(true);
  });

  it("has @fastify/static in api package.json dependencies", () => {
    const apiPkg = resolve(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(apiPkg, "utf-8"));
    expect(pkg.dependencies).toHaveProperty("@fastify/static");
  });
});
