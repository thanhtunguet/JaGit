import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTokens } from "@/lib/utils";
import type { AgentSessionAggregateResponse } from "@/api/client.js";

interface Props {
  total: number;
  aggData: AgentSessionAggregateResponse | null;
}


export function SessionSummaryCards({ total, aggData }: Props) {
  const totalInputTokens = aggData
    ? aggData.totalTokens.newInput + aggData.totalTokens.cachedInput
    : 0;
  const cachedPercentage =
    totalInputTokens > 0 && aggData
      ? Math.round((aggData.totalTokens.cachedInput / totalInputTokens) * 100)
      : 0;

  const outputTokens = aggData ? aggData.totalTokens.output : 0;
  const cost = aggData ? aggData.totalCostUsd : 0;
  const missingCostCount = aggData ? aggData.missingCostCount : 0;

  const stats = [
    {
      label: "Sessions (total)",
      value: total.toLocaleString(),
      sub: null as string | null,
    },
    {
      label: "Input tokens (total)",
      value:
        cachedPercentage > 0
          ? `${formatTokens(totalInputTokens)} (${cachedPercentage}%)`
          : `${formatTokens(totalInputTokens)}`,
      sub: null,
    },
    {
      label: "Output tokens (total)",
      value: formatTokens(outputTokens),
      sub: null,
    },
    {
      label: "Cost (total)",
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
