import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  createMcpServer,
  updateMcpServer,
  listCredentials,
  type McpServerItem,
  type McpEnvValue,
  type McpTransport,
  type CredentialListItem,
} from "@/api/client";

type KeyValueRow = {
  key: string;
  mode: "literal" | "credential";
  literal: string;
  credKind: string;
  credName: string;
  secretKey: string;
};

function Field({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1 block">{label}</label>
      <input
        className="w-full text-sm p-2 rounded border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function keyValuesToRows(map: Record<string, McpEnvValue>): KeyValueRow[] {
  return Object.entries(map).map(([key, value]) => {
    if (typeof value === "string") {
      return { key, mode: "literal", literal: value, credKind: "gitlab", credName: "default", secretKey: "token" };
    }
    return {
      key,
      mode: "credential",
      literal: "",
      credKind: value.kind,
      credName: value.name,
      secretKey: value.secretKey,
    };
  });
}

function rowsToKeyValues(rows: KeyValueRow[]): Record<string, McpEnvValue> {
  const out: Record<string, McpEnvValue> = {};
  for (const row of rows) {
    if (!row.key.trim()) continue;
    if (row.mode === "literal") {
      out[row.key] = row.literal;
    } else {
      out[row.key] = {
        type: "credential",
        kind: row.credKind,
        name: row.credName,
        secretKey: row.secretKey,
      };
    }
  }
  return out;
}

function KeyValueEditor({
  label,
  rows,
  onChange,
  credentials,
}: {
  label: string;
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  credentials: CredentialListItem[];
}) {
  const addRow = () => {
    onChange([
      ...rows,
      { key: "", mode: "literal", literal: "", credKind: "gitlab", credName: "default", secretKey: "token" },
    ]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <Button type="button" size="sm" variant="outline" onClick={addRow}>
          Add
        </Button>
      </div>
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">No entries — optional.</p>
      )}
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-end border rounded-md p-2">
          <div className="col-span-3">
            <Field
              label="Key"
              value={row.key}
              onChange={(v) => onChange(rows.map((r, j) => (j === i ? { ...r, key: v } : r)))}
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium mb-1 block">Type</label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={row.mode}
              onChange={(e) => {
                const mode = e.target.value as "literal" | "credential";
                onChange(rows.map((r, j) => (j === i ? { ...r, mode } : r)));
              }}
            >
              <option value="literal">Literal</option>
              <option value="credential">Credential</option>
            </select>
          </div>
          {row.mode === "literal" ? (
            <div className="col-span-6">
              <Field
                label="Value"
                value={row.literal}
                onChange={(v) => onChange(rows.map((r, j) => (j === i ? { ...r, literal: v } : r)))}
              />
            </div>
          ) : (
            <>
              <div className="col-span-2">
                <label className="text-xs font-medium mb-1 block">Credential</label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={`${row.credKind}:${row.credName}`}
                  onChange={(e) => {
                    const [credKind, credName] = e.target.value.split(":");
                    onChange(
                      rows.map((r, j) =>
                        j === i ? { ...r, credKind, credName, secretKey: r.secretKey || "token" } : r,
                      ),
                    );
                  }}
                >
                  {credentials.map((c) => (
                    <option key={c.id} value={`${c.kind}:${c.name}`}>
                      {c.kind}/{c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-4">
                <Field
                  label="Secret key"
                  value={row.secretKey}
                  onChange={(v) => onChange(rows.map((r, j) => (j === i ? { ...r, secretKey: v } : r)))}
                  placeholder="token, apiKey, …"
                />
              </div>
            </>
          )}
          <div className="col-span-1 pb-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              ×
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function McpServerDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial?: McpServerItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [transport, setTransport] = useState<McpTransport>(initial?.transport ?? "stdio");
  const [command, setCommand] = useState(initial?.command ?? "npx");
  const [argsText, setArgsText] = useState((initial?.args ?? []).join(", "));
  const [url, setUrl] = useState(initial?.url ?? "");
  const [envRows, setEnvRows] = useState<KeyValueRow[]>(() =>
    initial?.env ? keyValuesToRows(initial.env) : [],
  );
  const [headerRows, setHeaderRows] = useState<KeyValueRow[]>(() =>
    initial?.headers ? keyValuesToRows(initial.headers) : [],
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [credentials, setCredentials] = useState<CredentialListItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCredentials().then(setCredentials).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body =
        transport === "http"
          ? {
              name,
              transport: "http" as const,
              url,
              headers: rowsToKeyValues(headerRows),
              enabled,
            }
          : {
              name,
              transport: "stdio" as const,
              command,
              args: argsText.split(",").map((s) => s.trim()).filter(Boolean),
              env: rowsToKeyValues(envRows),
              enabled,
            };

      if (initial) await updateMcpServer(initial.id, body);
      else await createMcpServer(body);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit MCP Server" : "New MCP Server"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Name" value={name} onChange={setName} placeholder="filesystem" />

          <div>
            <label className="text-xs font-medium mb-1 block">Transport</label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={transport}
              onChange={(e) => setTransport(e.target.value as McpTransport)}
            >
              <option value="stdio">stdio — spawn local process</option>
              <option value="http">http — remote MCP endpoint</option>
            </select>
          </div>

          {transport === "stdio" ? (
            <>
              <Field label="Command" value={command} onChange={setCommand} placeholder="npx" />
              <Field
                label="Args (comma-separated)"
                value={argsText}
                onChange={setArgsText}
                placeholder="-y, @modelcontextprotocol/server-filesystem, /tmp"
              />
              <KeyValueEditor
                label="Environment variables"
                rows={envRows}
                onChange={setEnvRows}
                credentials={credentials}
              />
            </>
          ) : (
            <>
              <Field
                label="URL"
                value={url}
                onChange={setUrl}
                placeholder="https://mcp.example.com/v1"
              />
              <KeyValueEditor
                label="HTTP headers"
                rows={headerRows}
                onChange={setHeaderRows}
                credentials={credentials}
              />
            </>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Enabled
          </label>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
