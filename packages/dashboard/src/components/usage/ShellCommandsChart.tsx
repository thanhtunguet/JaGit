import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { CHART_COLORS } from "@/lib/colors.js";
import type { ShellCommandRow } from "@/api/client.js";

interface Props {
  rows: ShellCommandRow[];
}

export function ShellCommandsChart({ rows }: Props) {
  const data = rows.slice().sort((a, b) => b.Calls - a.Calls).slice(0, 10).map((r) => ({ command: r.Command, calls: r.Calls }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Shell Commands (30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart layout="vertical" data={data} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="command" width={80} tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              formatter={(value) => [Number(value ?? 0).toLocaleString(), "Calls"]}
            />
            <Bar dataKey="calls" radius={[0, 3, 3, 0]}>
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
