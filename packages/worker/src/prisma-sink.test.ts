import { describe, it, expect, vi } from "vitest";
import { PrismaJobSink } from "./prisma-sink.js";
import { prisma, publishEvent, jobChannel } from "@jagit/shared";

vi.mock("@jagit/shared", async (orig) => {
  const actual = await orig<any>();
  return {
    ...actual,
    prisma: {
      jobStep: {
        create: vi.fn(),
        update: vi.fn(),
      },
    },
    publishEvent: vi.fn().mockResolvedValue(undefined),
    loadConfig: () => ({ redisUrl: "redis://x" }),
  };
});

describe("PrismaJobSink.startStep", () => {
  it("publishes a step_changed event immediately so the dashboard shows the step as running", async () => {
    vi.mocked(prisma.jobStep.create).mockResolvedValue({
      id: "step-1",
      jobId: "job-1",
      name: "runAgent",
      status: "running",
      detail: {},
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      finishedAt: null,
    } as any);

    const sink = new PrismaJobSink();
    await sink.startStep("job-1", "runAgent");

    expect(publishEvent).toHaveBeenCalledWith(
      "redis://x",
      jobChannel("job-1"),
      expect.objectContaining({
        type: "step_changed",
        step: expect.objectContaining({
          id: "step-1",
          name: "runAgent",
          status: "running",
        }),
      }),
    );
  });
});
