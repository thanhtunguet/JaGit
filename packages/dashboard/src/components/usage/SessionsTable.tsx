import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SessionRow } from "@/api/client.js";

interface Props {
  rows: SessionRow[];
}

function shortName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function SessionsTable({ rows }: Props) {
  const top20 = rows.slice().sort((a, b) => b["Cost (USD)"] - a["Cost (USD)"]).slice(0, 20);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Top Sessions (30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Started</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">API Calls</TableHead>
              <TableHead className="text-right">Turns</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top20.map((s) => (
              <TableRow key={s["Session ID"]}>
                <TableCell className="font-medium">{shortName(s.Project)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(s["Started At"]).toISOString().slice(0, 16).replace("T", " ")}
                </TableCell>
                <TableCell className="text-right font-mono">${s["Cost (USD)"].toFixed(2)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{s["API Calls"]}</TableCell>
                <TableCell className="text-right text-muted-foreground">{s.Turns}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
