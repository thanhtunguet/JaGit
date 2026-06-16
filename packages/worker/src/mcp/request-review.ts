import { waitForApprovalDecision } from "@jigit/shared";

export interface ReviewOption {
  optionId: string;
  name: string;
}

const DEFAULT_OPTIONS: ReviewOption[] = [
  { optionId: "approve", name: "Approve" },
  { optionId: "reject", name: "Request changes" },
];

export interface ExecuteRequestReviewOpts {
  jobId: string;
  prompt: string;
  options?: ReviewOption[];
  publicBaseUrl: string;
  apiToken: string;
  redisUrl: string;
  approvalTimeoutMs: number;
}

export interface RequestReviewResult {
  chosenOptionId: string;
  status: "approved" | "rejected";
}

export async function executeRequestReview(
  opts: ExecuteRequestReviewOpts,
): Promise<RequestReviewResult> {
  const options = opts.options?.length ? opts.options : DEFAULT_OPTIONS;
  const denyOptionId =
    options.find((o) => o.optionId.startsWith("deny") || o.optionId === "reject")?.optionId
    ?? "reject";

  const base = opts.publicBaseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/api/review-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiToken}`,
    },
    body: JSON.stringify({
      jobId: opts.jobId,
      prompt: opts.prompt,
      options,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`review-requests failed (${res.status}): ${text}`);
  }

  const { approvalId } = (await res.json()) as { approvalId: string };

  const chosenOptionId = await waitForApprovalDecision({
    redisUrl: opts.redisUrl,
    jobId: opts.jobId,
    approvalId,
    timeoutMs: opts.approvalTimeoutMs,
    denyOptionId,
  });

  const status =
    chosenOptionId.startsWith("deny") || chosenOptionId === "reject"
      ? "rejected"
      : "approved";

  return { chosenOptionId, status };
}

export function readJigitEnv(): ExecuteRequestReviewOpts {
  const jobId = process.env["JIGIT_JOB_ID"];
  const redisUrl = process.env["REDIS_URL"];
  const publicBaseUrl = process.env["PUBLIC_BASE_URL"];
  const apiToken = process.env["DASHBOARD_API_TOKEN"];
  const timeoutRaw = process.env["APPROVAL_TIMEOUT_MS"];

  if (!jobId || !redisUrl || !publicBaseUrl || !apiToken) {
    throw new Error(
      "jigit MCP requires JIGIT_JOB_ID, REDIS_URL, PUBLIC_BASE_URL, DASHBOARD_API_TOKEN",
    );
  }

  return {
    jobId,
    redisUrl,
    publicBaseUrl,
    apiToken,
    approvalTimeoutMs: timeoutRaw ? Number(timeoutRaw) : 1_800_000,
    prompt: "",
  };
}
