import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Eye,
  EyeOff,
  LayoutGrid,
  List as ListIcon,
  Plus,
  Server,
  Trash2,
  Pencil,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useMcpServers,
  useCreateMcpServer,
  useUpdateMcpServer,
  useDeleteMcpServer,
} from "@/hooks/use-api";
import type { McpServerItem, McpServerInput, McpEnvValue, McpTransport } from "@/lib/api";

export const Route = createFileRoute("/mcp-servers")({
  head: () => ({
    meta: [
      { title: "MCP Servers · JiGit" },
      {
        name: "description",
        content: "Configured Model Context Protocol servers available to agents.",
      },
    ],
  }),
  component: McpPage,
});

function toneFor(enabled: boolean) {
  return enabled ? "moss" : "brick";
}

function parseEnvValue(raw: string): McpEnvValue {
  const m = raw.match(/^credential:([^/]+)\/([^#]+)#(.+)$/);
  if (m) {
    return { type: "credential", kind: m[1], name: m[2], secretKey: m[3] };
  }
  return raw;
}

function formatEnvValue(val: McpEnvValue): string {
  if (typeof val === "object" && val !== null && val.type === "credential") {
    return `credential:${val.kind}/${val.name}#${val.secretKey}`;
  }
  return String(val ?? "");
}

function McpPage() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<McpServerItem | null>(null);
  const [formState, setFormState] = useState<{ open: boolean; server?: McpServerItem | null }>({
    open: false,
    server: null,
  });

  const { data: mcpServers = [], isLoading } = useMcpServers();
  const deleteMutation = useDeleteMcpServer();

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this MCP server?")) {
      deleteMutation.mutate(id, {
        onSuccess: () => {
          if (selected?.id === id) setSelected(null);
        },
      });
    }
  };

  return (
    <AppShell>
      <div className="p-6 md:p-10 max-w-[1200px] mx-auto">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              mcp servers
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">
              {mcpServers.length} configured
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Tool surfaces exposed to running agents via Model Context Protocol.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="inline-flex rounded-md border border-hairline bg-surface p-0.5"
              role="tablist"
              aria-label="View mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={view === "grid"}
                onClick={() => setView("grid")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm mono text-[11px] uppercase tracking-wider transition-colors ${
                  view === "grid"
                    ? "bg-surface-2 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Grid
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "list"}
                onClick={() => setView("list")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm mono text-[11px] uppercase tracking-wider transition-colors ${
                  view === "list"
                    ? "bg-surface-2 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ListIcon className="h-3.5 w-3.5" /> List
              </button>
            </div>
            <Button
              size="sm"
              onClick={() => setFormState({ open: true, server: null })}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" /> New server
            </Button>
          </div>
        </header>

        {isLoading && mcpServers.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Loading MCP servers...
          </div>
        ) : mcpServers.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-hairline rounded-xl bg-surface">
            <Server className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-base font-medium">No MCP servers configured</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-sm mx-auto">
              Configure Model Context Protocol servers to expose external tools and data sources to
              your agents.
            </p>
            <Button
              size="sm"
              onClick={() => setFormState({ open: true, server: null })}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" /> Add MCP server
            </Button>
          </div>
        ) : view === "grid" ? (
          <ul className="grid md:grid-cols-2 gap-4">
            {mcpServers.map((s) => {
              const tone = toneFor(s.enabled);
              const subtitle =
                s.transport === "http"
                  ? (s.url ?? "http server")
                  : [s.command, ...(s.args || [])].filter(Boolean).join(" ");

              return (
                <li key={s.id}>
                  <div
                    onClick={() => setSelected(s)}
                    className="w-full text-left rounded-xl border border-hairline bg-surface p-5 flex flex-col gap-4 transition-colors hover:border-foreground/30 cursor-pointer"
                  >
                    <header className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5">
                          <span className={`h-2 w-2 rounded-full bg-${tone}`} />
                          <h3 className="text-base font-semibold">{s.name}</h3>
                          <span className="mono text-[10px] px-1.5 py-0.5 rounded bg-surface-2 border border-hairline text-muted-foreground">
                            {s.transport}
                          </span>
                        </div>
                        <div className="mono text-[11px] text-muted-foreground mt-1.5 break-all">
                          {subtitle}
                        </div>
                      </div>
                      <span className={`mono text-[10px] uppercase tracking-wider text-${tone}`}>
                        {s.enabled ? "enabled" : "disabled"}
                      </span>
                    </header>

                    <div>
                      <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                        {s.transport === "stdio" ? "arguments" : "url"}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {s.transport === "stdio" ? (
                          s.args && s.args.length > 0 ? (
                            s.args.map((arg, i) => (
                              <span
                                key={i}
                                className="mono text-[11px] px-2 py-0.5 rounded bg-background border border-hairline"
                              >
                                {arg}
                              </span>
                            ))
                          ) : (
                            <span className="mono text-[11px] text-muted-foreground italic">
                              none
                            </span>
                          )
                        ) : (
                          <span className="mono text-[11px] px-2 py-0.5 rounded bg-background border border-hairline break-all">
                            {s.url ?? "http"}
                          </span>
                        )}
                      </div>
                    </div>

                    <footer className="flex items-center justify-between pt-3 border-t border-hairline mono text-[10px] text-muted-foreground">
                      <span>id · {s.id}</span>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          onClick={() => setFormState({ open: true, server: s })}
                          aria-label="Edit server"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-brick"
                          onClick={() => handleDelete(s.id)}
                          aria-label="Delete server"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </footer>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-xl border border-hairline bg-surface overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-hairline hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Transport</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Command / URL</TableHead>
                  <TableHead className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    ID
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mcpServers.map((s) => {
                  const tone = toneFor(s.enabled);
                  const subtitle =
                    s.transport === "http"
                      ? (s.url ?? "http server")
                      : [s.command, ...(s.args || [])].filter(Boolean).join(" ");

                  return (
                    <TableRow
                      key={s.id}
                      onClick={() => setSelected(s)}
                      className="border-hairline cursor-pointer"
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2.5">
                          <span className={`h-2 w-2 rounded-full bg-${tone}`} />
                          {s.name}
                        </div>
                      </TableCell>
                      <TableCell className="mono text-[11px] text-muted-foreground">
                        {s.transport}
                      </TableCell>
                      <TableCell>
                        <span className={`mono text-[10px] uppercase tracking-wider text-${tone}`}>
                          {s.enabled ? "enabled" : "disabled"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell mono text-[11px] text-muted-foreground truncate max-w-[240px]">
                        {subtitle}
                      </TableCell>
                      <TableCell className="mono text-[11px] text-muted-foreground">
                        {s.id}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => setFormState({ open: true, server: s })}
                            aria-label="Edit server"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-brick"
                            onClick={() => handleDelete(s.id)}
                            aria-label="Delete server"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <ServerDetailsDialog
        server={selected}
        onClose={() => setSelected(null)}
        onEdit={(s) => {
          setSelected(null);
          setFormState({ open: true, server: s });
        }}
        onDelete={(id) => {
          setSelected(null);
          handleDelete(id);
        }}
      />
      <ServerFormDialog
        open={formState.open}
        server={formState.server}
        onClose={() => setFormState({ open: false, server: null })}
      />
    </AppShell>
  );
}

function ServerDetailsDialog({
  server,
  onClose,
  onEdit,
  onDelete,
}: {
  server: McpServerItem | null;
  onClose: () => void;
  onEdit: (server: McpServerItem) => void;
  onDelete: (id: string) => void;
}) {
  const open = server !== null;
  const tone = server ? toneFor(server.enabled) : "moss";

  const envItems = server
    ? Object.entries(server.env || {}).map(([k, v]) => ({
        key: k,
        value: formatEnvValue(v),
        secret: /token|key|secret|password|auth|cert/i.test(k) || typeof v === "object",
      }))
    : [];

  const headerItems = server
    ? Object.entries(server.headers || {}).map(([k, v]) => ({
        key: k,
        value: formatEnvValue(v),
        secret: /token|key|secret|password|auth|cert/i.test(k) || typeof v === "object",
      }))
    : [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        {server && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                <Server className="h-4 w-4 text-muted-foreground" />
                {server.name}
                <span className={`mono text-[10px] uppercase tracking-wider text-${tone}`}>
                  • {server.enabled ? "enabled" : "disabled"}
                </span>
              </DialogTitle>
              <DialogDescription className="mono text-[11px] break-all">
                {server.transport === "stdio" ? server.command : server.url}
              </DialogDescription>
            </DialogHeader>

            <div className="grid sm:grid-cols-3 gap-3 mt-1">
              <Field label="ID" value={server.id} />
              <Field label="Transport" value={server.transport} />
              <Field label="Status" value={server.enabled ? "enabled" : "disabled"} />
            </div>

            <div className="mt-2">
              {server.transport === "stdio" ? (
                <Field label="Command" value={server.command} />
              ) : (
                <Field label="URL" value={server.url || "none"} />
              )}
            </div>

            <div className="mt-2 p-3 rounded-md bg-surface-2 border border-hairline mono text-[11px] text-muted-foreground flex items-center justify-between">
              <span>Tools discovery</span>
              <span className="text-foreground">Dynamic via MCP protocol</span>
            </div>

            {server.transport === "stdio" && (
              <div className="mt-2">
                <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  arguments ({server.args?.length ?? 0})
                </div>
                {server.args && server.args.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 p-3 rounded-md border border-hairline bg-surface">
                    {server.args.map((arg, idx) => (
                      <span
                        key={idx}
                        className="mono text-[11px] px-2 py-0.5 rounded bg-background border border-hairline"
                      >
                        {arg}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-hairline px-3 py-3 mono text-[11px] text-muted-foreground">
                    No arguments configured.
                  </div>
                )}
              </div>
            )}

            {server.transport === "stdio" ? (
              <KvReadonly
                label={`env vars (${envItems.length})`}
                items={envItems}
                emptyHint="No environment variables configured."
              />
            ) : (
              <KvReadonly
                label={`headers (${headerItems.length})`}
                items={headerItems}
                emptyHint="No headers configured."
              />
            )}

            <DialogFooter className="flex items-center justify-between sm:justify-between w-full pt-2 mt-4 border-t border-hairline">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => onEdit(server)}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => onDelete(server.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function KvReadonly({
  label,
  items,
  emptyHint,
}: {
  label: string;
  items: Array<{ key: string; value: string; secret?: boolean }>;
  emptyHint: string;
}) {
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  return (
    <div className="mt-2">
      <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        {label}
      </div>
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-hairline px-3 py-4 mono text-[11px] text-muted-foreground">
          {emptyHint}
        </div>
      ) : (
        <ul className="rounded-md border border-hairline divide-y divide-hairline overflow-hidden">
          {items.map((kv, i) => (
            <li
              key={`${kv.key}-${i}`}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-3 px-3 py-2 bg-surface"
            >
              <span className="mono text-[12px] truncate">{kv.key}</span>
              <span className="mono text-[12px] text-muted-foreground truncate">
                {kv.secret && !revealed[i] ? "••••••••" : kv.value}
              </span>
              {kv.secret ? (
                <button
                  type="button"
                  onClick={() => setRevealed((r) => ({ ...r, [i]: !r[i] }))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={revealed[i] ? "Hide value" : "Reveal value"}
                >
                  {revealed[i] ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-surface px-3 py-2">
      <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mono text-[12px] mt-0.5 break-all">{value}</div>
    </div>
  );
}

function ServerFormDialog({
  open,
  server,
  onClose,
}: {
  open: boolean;
  server?: McpServerItem | null;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransport>("stdio");
  const [enabled, setEnabled] = useState(true);
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [env, setEnv] = useState<Array<{ key: string; value: string }>>([{ key: "", value: "" }]);
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>([
    { key: "", value: "" },
  ]);

  useEffect(() => {
    if (open) {
      if (server) {
        setName(server.name);
        setTransport(server.transport);
        setEnabled(server.enabled);
        setCommand(server.command || "");
        setArgs(server.args ? server.args.join(" ") : "");
        setUrl(server.url || "");

        const envEntries = Object.entries(server.env || {}).map(([key, val]) => ({
          key,
          value: formatEnvValue(val),
        }));
        setEnv(envEntries.length > 0 ? envEntries : [{ key: "", value: "" }]);

        const headerEntries = Object.entries(server.headers || {}).map(([key, val]) => ({
          key,
          value: formatEnvValue(val),
        }));
        setHeaders(headerEntries.length > 0 ? headerEntries : [{ key: "", value: "" }]);
      } else {
        setName("");
        setTransport("stdio");
        setEnabled(true);
        setCommand("");
        setArgs("");
        setUrl("");
        setEnv([{ key: "", value: "" }]);
        setHeaders([{ key: "", value: "" }]);
      }
    }
  }, [open, server]);

  const createMutation = useCreateMcpServer();
  const updateMutation = useUpdateMcpServer();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const isStdio = transport === "stdio";
  const kvLabel = isStdio ? "Environment variables" : "Headers";
  const kvHint = isStdio
    ? "Passed to the spawned process. Hint: use credential:kind/name#key"
    : "Sent on every request. Hint: use credential:kind/name#key";
  const kvItems = isStdio ? env : headers;
  const setKv = isStdio ? setEnv : setHeaders;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const envMap: Record<string, McpEnvValue> = {};
    for (const item of env) {
      if (item.key.trim()) {
        envMap[item.key.trim()] = parseEnvValue(item.value.trim());
      }
    }

    const headersMap: Record<string, McpEnvValue> = {};
    for (const item of headers) {
      if (item.key.trim()) {
        headersMap[item.key.trim()] = parseEnvValue(item.value.trim());
      }
    }

    const argsList = args
      .split(/\s+/)
      .map((a) => a.trim())
      .filter(Boolean);

    const body: McpServerInput = {
      name: name.trim(),
      transport,
      enabled,
      ...(transport === "stdio"
        ? { command: command.trim(), args: argsList, env: envMap }
        : { url: url.trim(), headers: headersMap }),
    };

    if (server) {
      updateMutation.mutate({ id: server.id, body }, { onSuccess: onClose });
    } else {
      createMutation.mutate(body, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{server ? "Edit MCP server" : "New MCP server"}</DialogTitle>
          <DialogDescription>
            Configure a Model Context Protocol server. Agents will pick up new tools on next session
            start.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-3" onSubmit={handleSubmit}>
          <div className="grid gap-1.5">
            <Label htmlFor="mcp-name">Name</Label>
            <Input
              id="mcp-name"
              placeholder="e.g. gitlab"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mcp-transport">Transport</Label>
              <Select value={transport} onValueChange={(v) => setTransport(v as McpTransport)}>
                <SelectTrigger id="mcp-transport">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">stdio</SelectItem>
                  <SelectItem value="http">http</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mcp-enabled">Status</Label>
              <Select
                value={enabled ? "enabled" : "disabled"}
                onValueChange={(v) => setEnabled(v === "enabled")}
              >
                <SelectTrigger id="mcp-enabled">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enabled">Enabled</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isStdio ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="mcp-command">Command</Label>
                <Input
                  id="mcp-command"
                  placeholder="npx"
                  className="font-mono text-[12px]"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mcp-args">Arguments (space-separated)</Label>
                <Input
                  id="mcp-args"
                  placeholder="-y @modelcontextprotocol/server-gitlab"
                  className="font-mono text-[12px]"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="mcp-url">URL</Label>
              <Input
                id="mcp-url"
                placeholder="https://mcp.internal/gitlab"
                className="font-mono text-[12px]"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>
          )}

          <div className="grid gap-2 pt-2 border-t border-hairline">
            <div className="flex items-baseline justify-between">
              <div>
                <Label>{kvLabel}</Label>
                <div className="mono text-[10px] text-muted-foreground mt-0.5">{kvHint}</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 mono text-[11px]"
                onClick={() => setKv((items) => [...items, { key: "", value: "" }])}
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
            <div className="grid gap-1.5">
              {kvItems.map((kv, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] gap-1.5"
                >
                  <Input
                    value={kv.key}
                    onChange={(e) =>
                      setKv((items) =>
                        items.map((it, j) => (j === i ? { ...it, key: e.target.value } : it)),
                      )
                    }
                    placeholder={isStdio ? "API_TOKEN" : "Authorization"}
                    className="font-mono text-[12px] h-8"
                  />
                  <Input
                    value={kv.value}
                    onChange={(e) =>
                      setKv((items) =>
                        items.map((it, j) => (j === i ? { ...it, value: e.target.value } : it)),
                      )
                    }
                    placeholder={isStdio ? "value or credential:..." : "Bearer …"}
                    className="font-mono text-[12px] h-8"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-brick"
                    onClick={() =>
                      setKv((items) =>
                        items.length === 1
                          ? [{ key: "", value: "" }]
                          : items.filter((_, j) => j !== i),
                      )
                    }
                    aria-label="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {server ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
