import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SummaryRow } from "@/api/client.js";
import type { Period } from "@/hooks/useUsageData.js";

interface Props {
  rows: SummaryRow[];
  period: Period;
}

export function SummaryCards({ rows, period }: Props) {
  const row = rows.find((r) => r.Period === period);
  if (!row) return null;

  const avgPerSession = row.Sessions > 0 ? `$${(row["Cost (USD)"] / row.Sessions).toFixed(2)}` : "$0.00";

  const stats = [
    { label: "Total Cost", value: `$${row["Cost (USD)"].toFixed(2)}`, sub: `$${row["Saved (USD)"].toFixed(2)} saved` },
    { label: "API Calls", value: row["API Calls"].toLocaleString(), sub: `${row.Sessions} sessions` },
    { label: "Projects", value: String(row.Projects), sub: "active" },
    { label: "Avg / Session", value: avgPerSession, sub: `${row.Sessions} sessions` },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
