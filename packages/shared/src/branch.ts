export interface IssueRef {
  key: string;
  type: string;
  summary: string;
}

export type BranchRules = Record<string, string> & { default?: string };

function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")        // strip combining diacritics (Unicode property escape)
    .replace(/[^\w\s-]/g, "")      // strip non-word chars
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40)
    .replace(/-$/, "");
}

export function deriveBranchName(issue: IssueRef, rules: BranchRules): string {
  const prefix = rules[issue.type] ?? rules.default ?? "feature/";
  return `${prefix}${issue.key}-${slugify(issue.summary)}`;
}

export function extractIssueKey(branch: string): string | null {
  const match = branch.match(/([A-Z][A-Z0-9]+-\d+)/);
  return match ? match[1] : null;
}
