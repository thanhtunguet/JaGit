import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentSessionRow } from "@/api/client.js";

interface Props {
  rows: AgentSessionRow[];
  total: number;
}

function formatTokens(tokens: number): string {
  if (tokens < 10000) {
    return tokens.toLocaleString();
  }
  if (tokens >= 1_000_000_000) {
    return `${(tokens / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 3 })}B`;
  }
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 3 })}M`;
  }
  return `${(tokens / 1_000).toLocaleString(undefined, { maximumFractionDigits: 3 })}k`;
}

export function SessionSummaryCards({ rows, total }: Props) {
  const rawInputTokens = rows.reduce((sum, r) => sum + r.inputTokens, 0);
  const cacheCreationTokens = rows.reduce(
    (sum, r) => sum + (r.cacheCreationInputTokens || 0),
    0,
  );
  const cachedInputTokens = rows.reduce(
    (sum, r) => sum + (r.cachedInputTokens || 0),
    0,
  );

  const totalInputTokens =
    rawInputTokens + cacheCreationTokens + cachedInputTokens;
  const cachedPercentage =
    totalInputTokens > 0
      ? Math.round((cachedInputTokens / totalInputTokens) * 100)
      : 0;

  const outputTokens = rows.reduce((sum, r) => sum + r.outputTokens, 0);
  const knownCostRows = rows.filter((r) => r.costUsd != null);
  const cost = knownCostRows.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  const missingCostCount = rows.length - knownCostRows.length;

  const stats = [
    {
      label: "Sessions (total)",
      value: total.toLocaleString(),
      sub: null as string | null,
    },
    {
      label: "Input tokens (page)",
      value:
        cachedPercentage > 0
          ? `${formatTokens(totalInputTokens)} (${cachedPercentage}%)`
          : `${formatTokens(totalInputTokens)}`,
      sub: null,
    },
    {
      label: "Output tokens (page)",
      value: formatTokens(outputTokens),
      sub: null,
    },
    {
      label: "Cost (page)",
      value: `$${cost.toFixed(2)}`,
      sub: missingCostCount > 0 ? `${missingCostCount} missing cost` : null,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {s.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.value}</div>
            {s.sub && (
              <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
