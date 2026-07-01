import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { AgentSessionAggregateResponse } from "@/api/client.js";

interface Props {
  data: AgentSessionAggregateResponse;
}

const COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#ec4899", // pink
  "#f97316", // orange
  "#6366f1", // indigo
];

const renderTooltipContent = (value: any) => [`$${Number(value ?? 0).toFixed(2)}`, "Cost"];

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  "claude_code": "Claude Code",
  codex: "Codex",
  copilot: "Copilot",
};

const renderColorBlockLabel = ({ x, y, fill, percent }: any) => {
  return (
    <g>
      <rect x={x - 6} y={y - 6} width={12} height={12} fill={fill} rx={2}>
        <title>{`${(percent * 100).toFixed(1)}%`}</title>
      </rect>
    </g>
  );
};

interface ChartCardProps {
  title: string;
  data: any[];
  dataKey: string;
  nameKey: string;
  legendData: Array<{ color: string; value: string }>;
  tooltipFormatter?: (value: any, name: any) => any[];
}

function ChartCard({ title, data, dataKey, nameKey, legendData, tooltipFormatter }: ChartCardProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="shrink h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey={dataKey}
                nameKey={nameKey}
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={renderColorBlockLabel}
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                formatter={tooltipFormatter || renderTooltipContent}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="grow">
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-2 text-xs pt-4">
            {legendData.map((entry, index) => (
              <li key={`item-${index}`} className="flex items-center overflow-hidden" title={entry.value}>
                <span
                  className="w-3 h-3 rounded-sm mr-2 flex-shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="truncate text-muted-foreground">{entry.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export function LiveSessionsCharts({ data }: Props) {
  const userPieData = data.byUser.slice(0, 10);
  const userLegendData = userPieData.map((entry, index) => ({
    color: COLORS[index % COLORS.length],
    value: entry.username,
  }));

  const modelPieData = data.byModel.slice(0, 10);
  const modelLegendData = modelPieData.map((entry, index) => ({
    color: COLORS[index % COLORS.length],
    value: entry.model,
  }));

  const toolPieData = data.byTool.slice(0, 10).map((t) => ({
    ...t,
    toolName: TOOL_DISPLAY_NAMES[t.tool] || t.tool,
  }));
  const toolLegendData = toolPieData.map((entry, index) => ({
    color: COLORS[index % COLORS.length],
    value: entry.toolName,
  }));

  const tokenPieData = data.totalTokens ? [
    { name: "Cached Input", value: data.totalTokens.cachedInput },
    { name: "New Input", value: data.totalTokens.newInput },
    { name: "Output", value: data.totalTokens.output },
  ].filter((d) => d.value > 0) : [];
  const tokenLegendData = tokenPieData.map((entry, index) => ({
    color: COLORS[index % COLORS.length],
    value: entry.name,
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <ChartCard
        title="Cost by User"
        data={userPieData}
        dataKey="costUsd"
        nameKey="username"
        legendData={userLegendData}
      />
      <ChartCard
        title="Cost by Model"
        data={modelPieData}
        dataKey="costUsd"
        nameKey="model"
        legendData={modelLegendData}
      />
      <ChartCard
        title="Cost by Tool"
        data={toolPieData}
        dataKey="costUsd"
        nameKey="toolName"
        legendData={toolLegendData}
      />
      {tokenPieData.length > 0 && (
        <ChartCard
          title="Tokens Breakdown"
          data={tokenPieData}
          dataKey="value"
          nameKey="name"
          legendData={tokenLegendData}
          tooltipFormatter={(value: any, name: any) => [Number(value ?? 0).toLocaleString(), String(name ?? "")]}
        />
      )}
    </div>
  );
}
