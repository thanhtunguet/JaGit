import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { CHART_COLORS } from "@/lib/colors.js";
import type { ActivityRow } from "@/api/client.js";
import type { Period } from "@/hooks/useUsageData.js";

interface Props {
  rows: ActivityRow[];
  period: Period;
}

export function ActivityChart({ rows, period }: Props) {
  const data = rows
    .filter((r) => r.Period === period)
    .sort((a, b) => b["Cost (USD)"] - a["Cost (USD)"])
    .map((r) => ({ activity: r.Activity, cost: r["Cost (USD)"] }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Activity Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart layout="vertical" data={data} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            <YAxis type="category" dataKey="activity" width={110} tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "Cost"]}
            />
            <Bar dataKey="cost" radius={[0, 3, 3, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
