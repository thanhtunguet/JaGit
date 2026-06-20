import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AgentSessionRow } from "@/api/client.js";

interface Props {
  rows: AgentSessionRow[];
  page: number;
  pageCount: number;
  onPageChange: (p: number) => void;
  onRowClick: (id: string) => void;
}

const TOOL_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  copilot: "Copilot",
};

function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool;
}

export function LiveSessionsTable({ rows, page, pageCount, onPageChange, onRowClick }: Props) {
  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Tool</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Last updated</TableHead>
              <TableHead className="text-right">Input</TableHead>
              <TableHead className="text-right">Cached</TableHead>
              <TableHead className="text-right">Output</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Tool calls</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  No sessions found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => onRowClick(row.id)}
                >
                  <TableCell className="font-medium">{row.user.username}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{toolLabel(row.tool)}</Badge>
                  </TableCell>
                  <TableCell>{row.model}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(row.startedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(row.lastUpdatedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">{row.inputTokens.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{row.cachedInputTokens.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{row.outputTokens.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    {row.costUsd == null ? "—" : `$${row.costUsd.toFixed(2)}`}
                  </TableCell>
                  <TableCell className="text-right">{row.toolCallCount ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-end gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 0}
            onClick={() => onPageChange(page - 1)}
          >
            Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount - 1}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
