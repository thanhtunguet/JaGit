import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  listMcpServers,
  deleteMcpServer,
  type McpServerItem,
} from "@/api/client";
import { McpServerDialog } from "@/components/McpServerDialog";

export function McpServers() {
  const [items, setItems] = useState<McpServerItem[] | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; item?: McpServerItem }>(
    { open: false },
  );
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    listMcpServers()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const doDelete = async (id: string, name: string) => {
    if (!confirm(`Delete MCP server "${name}"?`)) return;
    try {
      await deleteMcpServer(id);
      reload();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">MCP Servers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            MCP servers (stdio or HTTP) injected into agent sessions via Agent
            Templates. The built-in <code className="text-xs">jagit</code>{" "}
            review server is always included (stdio).
          </p>
        </div>
        <Button onClick={() => setDialog({ open: true })}>
          <Plus className="h-4 w-4 mr-1" /> New MCP Server
        </Button>
      </div>

      {error && (
        <Card>
          <CardContent className="pt-6 text-destructive text-sm">
            {error}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configured servers</CardTitle>
        </CardHeader>
        <CardContent>
          {items === null ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No MCP servers configured yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Transport</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="font-mono text-xs uppercase"
                      >
                        {item.transport}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-md truncate">
                      {item.transport === "http"
                        ? (item.url ?? "—")
                        : `${item.command} ${item.args.join(" ")}`.trim()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.enabled ? "default" : "secondary"}>
                        {item.enabled ? "enabled" : "disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setDialog({ open: true, item })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => doDelete(item.id, item.name)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialog.open && (
        <McpServerDialog
          initial={dialog.item}
          onClose={() => setDialog({ open: false })}
          onSaved={() => {
            setDialog({ open: false });
            reload();
          }}
        />
      )}
    </div>
  );
}
