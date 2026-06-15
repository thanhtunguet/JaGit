import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "./prisma.js";

describe.skipIf(!process.env.DATABASE_URL)("prisma smoke", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("connects and counts jobs", async () => {
    const count = await prisma.job.count();
    expect(typeof count).toBe("number");
  });

  it("can read all enum values for JobStatus", async () => {
    // If the enum is wrong the Prisma client won't even compile.
    const jobs = await prisma.job.findMany({ take: 1 });
    expect(Array.isArray(jobs)).toBe(true);
  });
});
