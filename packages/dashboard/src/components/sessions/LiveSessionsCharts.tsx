import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
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

const renderColorBlockLabel = ({ x, y, fill }: any) => {
  return <rect x={x - 6} y={y - 6} width={12} height={12} fill={fill} rx={2} />;
};

export function LiveSessionsCharts({ data }: Props) {
  const toolData = data.byTool.slice(0, 10).map((t) => ({
    ...t,
    toolName: TOOL_DISPLAY_NAMES[t.tool] || t.tool,
  }));

  const tokenData = data.totalTokens ? [
    { name: "Cached Input", value: data.totalTokens.cachedInput },
    { name: "New Input", value: data.totalTokens.newInput },
    { name: "Output", value: data.totalTokens.output },
  ].filter((d) => d.value > 0) : [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cost by User</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data.byUser.slice(0, 10)}
                dataKey="costUsd"
                nameKey="username"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={renderColorBlockLabel}
              >
                {data.byUser.slice(0, 10).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                formatter={renderTooltipContent}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cost by Model</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data.byModel.slice(0, 10)}
                dataKey="costUsd"
                nameKey="model"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={renderColorBlockLabel}
              >
                {data.byModel.slice(0, 10).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                formatter={renderTooltipContent}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cost by Tool</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={toolData}
                dataKey="costUsd"
                nameKey="toolName"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={renderColorBlockLabel}
              >
                {toolData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                formatter={renderTooltipContent}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {tokenData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tokens Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={tokenData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={renderColorBlockLabel}
                >
                  {tokenData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  formatter={(value: any, name: any) => [Number(value ?? 0).toLocaleString(), String(name ?? "")]}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
