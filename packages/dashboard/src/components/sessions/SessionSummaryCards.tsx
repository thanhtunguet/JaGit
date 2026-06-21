import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { formatTokens, formatBaseTokens } from "@/lib/utils";
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
  const bt = aggData ? aggData.baseTokens : null;

  const stats: Array<{ label: string; value: string; sub: string | null; tooltip: string | null }> = [
    {
      label: "Sessions (total)",
      value: total.toLocaleString(),
      sub: null,
      tooltip: null,
    },
    {
      label: "Input tokens (total)",
      value:
        cachedPercentage > 0
          ? `${formatTokens(totalInputTokens)} (${cachedPercentage}%)`
          : `${formatTokens(totalInputTokens)}`,
      sub: null,
      tooltip: aggData
        ? `New input: ${formatTokens(aggData.totalTokens.newInput)} · Cached: ${formatTokens(aggData.totalTokens.cachedInput)} (${cachedPercentage}%) · Base Tokens: ${formatBaseTokens(bt ? bt.input : null)}`
        : null,
    },
    {
      label: "Output tokens (total)",
      value: formatTokens(outputTokens),
      sub: null,
      tooltip: aggData
        ? `Output: ${formatTokens(outputTokens)} · Base Tokens: ${formatBaseTokens(bt ? bt.output : null)}`
        : null,
    },
    {
      label: "Cost (total)",
      value: `$${cost.toFixed(2)}`,
      sub: missingCostCount > 0 ? `${missingCostCount} missing cost` : null,
      tooltip: aggData
        ? `Input: ${formatTokens(totalInputTokens)} · Output: ${formatTokens(outputTokens)} · Base Tokens: ${formatBaseTokens(bt ? bt.total : null)}`
        : null,
    },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {s.tooltip ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-2xl font-bold cursor-help w-fit">{s.value}</div>
                  </TooltipTrigger>
                  <TooltipContent>{s.tooltip}</TooltipContent>
                </Tooltip>
              ) : (
                <div className="text-2xl font-bold">{s.value}</div>
              )}
              {s.sub && (
                <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </TooltipProvider>
  );
}
