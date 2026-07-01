import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { DailyRow } from "@/api/client.js";
import type { Period } from "@/hooks/useUsageData.js";

interface Props {
  rows: DailyRow[];
  period: Period;
}

export function DailyChart({ rows, period }: Props) {
  const [mode, setMode] = useState<"individual" | "cumulative">("individual");

  const sortedRows = rows
    .filter((r) => r.Period === period)
    .sort((a, b) => a.Date.localeCompare(b.Date));

  let runningTotal = 0;
  const data = sortedRows.map((r) => {
    runningTotal += r["Cost (USD)"];
    return {
      date: r.Date.slice(5),
      cost: mode === "cumulative" ? runningTotal : r["Cost (USD)"],
    };
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm">Daily Spend</CardTitle>
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setMode("individual")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              mode === "individual"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Individual
          </button>
          <button
            onClick={() => setMode("cumulative")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              mode === "cumulative"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Cumulative
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "Cost"]}
            />
            <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
