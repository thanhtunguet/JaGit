import { describe, it, expect } from "vitest";
import { deriveBranchName, extractIssueKey } from "./branch.js";

const RULES = { Bug: "bugfix/", Story: "feature/", Task: "feature/", default: "feature/" };

describe("deriveBranchName", () => {
  it("uses type-specific prefix for Bug", () => {
    expect(
      deriveBranchName({ key: "JAGIT-12", type: "Bug", summary: "Fix Login!" }, RULES)
    ).toBe("bugfix/JAGIT-12-fix-login");
  });

  it("falls back to default prefix for unknown type", () => {
    expect(
      deriveBranchName({ key: "JAGIT-9", type: "Spike", summary: "Explore caching" }, RULES)
    ).toBe("feature/JAGIT-9-explore-caching");
  });

  it("truncates long summaries to 40 chars in the slug", () => {
    const summary = "This is a very long summary that should be truncated at forty chars";
    const branch = deriveBranchName({ key: "X-1", type: "Bug", summary }, RULES);
    // slug portion (after "bugfix/X-1-") must be ≤ 40 chars
    const slug = branch.replace("bugfix/X-1-", "");
    expect(slug.length).toBeLessThanOrEqual(40);
  });

  it("strips non-ASCII and special characters", () => {
    expect(
      deriveBranchName({ key: "X-2", type: "Bug", summary: "Ünîcödé & special!!" }, RULES)
    ).toBe("bugfix/X-2-unicode-special");
  });
});

describe("extractIssueKey", () => {
  it("extracts a key from a feature branch", () => {
    expect(extractIssueKey("feature/JAGIT-12-fix-login")).toBe("JAGIT-12");
  });

  it("extracts a key from a bugfix branch", () => {
    expect(extractIssueKey("bugfix/PROJ-99-some-bug")).toBe("PROJ-99");
  });

  it("returns null when no key is present", () => {
    expect(extractIssueKey("main")).toBeNull();
  });
});
