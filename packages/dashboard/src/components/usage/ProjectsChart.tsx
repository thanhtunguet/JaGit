import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ProjectRow } from "@/api/client.js";

interface Props {
  rows: ProjectRow[];
}

function shortName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function ProjectsChart({ rows }: Props) {
  const data = rows
    .slice()
    .sort((a, b) => b["Cost (USD)"] - a["Cost (USD)"])
    .slice(0, 10)
    .map((r) => ({ project: shortName(r.Project), cost: r["Cost (USD)"] }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Top Projects (30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart layout="vertical" data={data} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            <YAxis type="category" dataKey="project" width={140} tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "Cost"]}
            />
            <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
