import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Info, Pencil, Trash2, Plus } from "lucide-react";
import {
  listCredentials, createCredential, updateCredential, deleteCredential,
  listRepoMappings, createRepoMapping, updateRepoMapping, deleteRepoMapping,
  listAgentTemplates, createAgentTemplate, updateAgentTemplate, deleteAgentTemplate,
  type CredentialListItem, type RepoMappingItem, type AgentTemplateItem,
  getStoredToken, setStoredToken,
} from "@/api/client";

// ─── Token input ──────────────────────────────────────────────────────────────

function TokenBar() {
  const [token, setToken] = useState(getStoredToken);
  return (
    <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/40">
      <span className="text-xs text-muted-foreground shrink-0">API token:</span>
      <input
        type="password"
        className="flex-1 bg-background text-foreground text-xs font-mono outline-none placeholder:text-muted-foreground"
        placeholder="Paste DASHBOARD_API_TOKEN to enable mutations"
        value={token}
        onChange={(e) => { setToken(e.target.value); setStoredToken(e.target.value); }}
      />
    </div>
  );
}

// ─── Simple textarea-based JSON editor ───────────────────────────────────────

function JsonField({
  label, value, onChange, placeholder,
}: { label: string; value: Record<string, string>; onChange: (v: Record<string, string>) => void; placeholder?: string }) {
  const [raw, setRaw] = useState(() => JSON.stringify(value, null, 2));
  const [err, setErr] = useState(false);
  return (
    <div>
      <label className="text-xs font-medium mb-1 block text-foreground">{label}</label>
      <textarea
        className={`w-full font-mono text-xs p-2 rounded border min-h-[80px] resize-y bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring ${err ? "border-destructive" : "border-input"}`}
        value={raw}
        placeholder={placeholder}
        onChange={(e) => {
          setRaw(e.target.value);
          try { onChange(JSON.parse(e.target.value)); setErr(false); }
          catch { setErr(true); }
        }}
      />
      {err && <p className="text-xs text-destructive">Invalid JSON</p>}
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1 block text-foreground">{label}</label>
      <input
        type={type}
        className="w-full text-sm p-2 rounded border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ─── Credentials section ──────────────────────────────────────────────────────

const CREDENTIAL_KINDS = ["jira", "gitlab", "anthropic", "telegram"] as const;
const SECRET_KEYS: Record<string, string[]> = {
  jira: ["email", "token"],
  gitlab: ["token"],
  anthropic: ["apiKey"],
  telegram: ["botToken"],
};

function CredentialDialog({
  initial, onClose, onSaved,
}: {
  initial?: CredentialListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initial;
  const [kind, setKind] = useState<string>(initial?.kind ?? "gitlab");
  const [name, setName] = useState(initial?.name ?? "");
  const [meta, setMeta] = useState<Record<string, string>>(initial?.meta ?? {});
  const [secrets, setSecrets] = useState<Record<string, string>>(() => {
    const keys = SECRET_KEYS[initial?.kind ?? "gitlab"] ?? [];
    return Object.fromEntries(keys.map((k) => [k, ""]));
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAnthropic = (isEdit ? initial!.kind : kind) === "anthropic";

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await updateCredential(initial!.id, { name, meta, secrets });
      } else {
        await createCredential({ kind, name, meta, secrets });
      }
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Credential" : "New Credential"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!isEdit && (
            <div>
              <label className="text-xs font-medium mb-1 block">Kind</label>
              <select
                className="w-full text-sm p-2 rounded border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setSecrets(Object.fromEntries((SECRET_KEYS[e.target.value] ?? []).map((k) => [k, ""])));
                  setMeta({});
                }}
              >
                {CREDENTIAL_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          )}
          <Field label="Name" value={name} onChange={setName} />
          {isAnthropic ? (
            <>
              <Field
                label="Base URL"
                value={meta.baseUrl ?? ""}
                onChange={(v) => setMeta((m) => ({ ...m, baseUrl: v }))}
                placeholder="https://api.anthropic.com"
              />
              <Field
                label="Auth Token"
                type="password"
                value={secrets.apiKey ?? ""}
                onChange={(v) => setSecrets((s) => ({ ...s, apiKey: v }))}
                placeholder={isEdit ? "••••••• (unchanged)" : ""}
              />
              <JsonField
                label="Meta (optional)"
                value={meta}
                onChange={setMeta}
                placeholder='{"baseUrl": "https://api.anthropic.com", "orgId": "..."}'
              />
            </>
          ) : (
            <>
              <JsonField
                label="Meta"
                value={meta}
                onChange={setMeta}
                placeholder='{"baseUrl": "https://…"}'
              />
              <div className="space-y-2">
                <p className="text-xs font-medium">
                  Secrets {isEdit && <span className="text-muted-foreground">(leave blank to keep existing)</span>}
                </p>
                {(SECRET_KEYS[isEdit ? initial!.kind : kind] ?? []).map((k) => (
                  <Field
                    key={k}
                    label={k}
                    type="password"
                    value={secrets[k] ?? ""}
                    onChange={(v) => setSecrets((s) => ({ ...s, [k]: v }))}
                    placeholder={isEdit ? "••••••• (unchanged)" : ""}
                  />
                ))}
              </div>
            </>
          )}
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

// ─── Repo Mapping dialog ──────────────────────────────────────────────────────

function RepoMappingDialog({
  initial, templates, onClose, onSaved,
}: {
  initial?: RepoMappingItem;
  templates: AgentTemplateItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    jiraProjectKey: initial?.jiraProjectKey ?? "",
    gitlabProjectId: initial?.gitlabProjectId ?? "",
    defaultBaseBranch: initial?.defaultBaseBranch ?? "main",
    branchPrefixRules: initial?.branchPrefixRules ?? {},
    agentTemplateId: initial?.agentTemplateId ?? templates[0]?.id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await updateRepoMapping(initial.id, form);
      } else {
        await createRepoMapping(form);
      }
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Repo Mapping" : "New Repo Mapping"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field
            label="Jira Project Key"
            value={form.jiraProjectKey}
            onChange={(v) => setForm((f) => ({ ...f, jiraProjectKey: v }))}
            placeholder="ABC"
          />
          <Field
            label="GitLab Project ID"
            value={form.gitlabProjectId}
            onChange={(v) => setForm((f) => ({ ...f, gitlabProjectId: v }))}
            placeholder="group/project"
          />
          <Field
            label="Default Base Branch"
            value={form.defaultBaseBranch}
            onChange={(v) => setForm((f) => ({ ...f, defaultBaseBranch: v }))}
          />
          <JsonField
            label="Branch Prefix Rules"
            value={form.branchPrefixRules}
            onChange={(v) => setForm((f) => ({ ...f, branchPrefixRules: v }))}
            placeholder='{"Bug": "bugfix/", "Story": "feature/"}'
          />
          <div>
            <label className="text-xs font-medium mb-1 block">Agent Template</label>
            <select
              className="w-full text-sm p-2 rounded border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              value={form.agentTemplateId}
              onChange={(e) => setForm((f) => ({ ...f, agentTemplateId: e.target.value }))}
            >
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
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

// ─── Agent Template dialog ────────────────────────────────────────────────────

function AgentTemplateDialog({
  initial, onClose, onSaved,
}: {
  initial?: AgentTemplateItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    model: initial?.model ?? "claude-sonnet-4-6",
    prompt: initial?.prompt ?? "",
    maxTurns: String(initial?.maxTurns ?? ""),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        model: form.model || "claude-sonnet-4-6",
        prompt: form.prompt,
        ...(form.maxTurns ? { maxTurns: Number(form.maxTurns) } : {}),
      };
      if (initial) {
        await updateAgentTemplate(initial.id, body);
      } else {
        await createAgentTemplate(body);
      }
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Agent Template" : "New Agent Template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
          <Field
            label="Model"
            value={form.model}
            onChange={(v) => setForm((f) => ({ ...f, model: v }))}
            placeholder="e.g. claude-sonnet-4-6"
          />
          <div>
            <label className="text-xs font-medium mb-1 block">Prompt</label>
            <textarea
              className="w-full text-sm p-2 rounded border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring min-h-[100px] resize-y"
              value={form.prompt}
              onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
            />
          </div>
          <Field
            label="Max Turns (optional)"
            type="number"
            value={form.maxTurns}
            onChange={(v) => setForm((f) => ({ ...f, maxTurns: v }))}
            placeholder="e.g. 20"
          />
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

// ─── Main Config page ─────────────────────────────────────────────────────────

export function Config() {
  const [templates, setTemplates] = useState<AgentTemplateItem[] | null>(null);
  const [credentials, setCredentials] = useState<CredentialListItem[] | null>(null);
  const [mappings, setMappings] = useState<RepoMappingItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [credDialog, setCredDialog] = useState<{ open: boolean; item?: CredentialListItem }>({ open: false });
  const [mappingDialog, setMappingDialog] = useState<{ open: boolean; item?: RepoMappingItem }>({ open: false });
  const [templateDialog, setTemplateDialog] = useState<{ open: boolean; item?: AgentTemplateItem }>({ open: false });

  const reload = useCallback(() => {
    Promise.all([listAgentTemplates(), listCredentials(), listRepoMappings()])
      .then(([t, c, m]) => { setTemplates(t); setCredentials(c); setMappings(m); })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const doDelete = async (fn: () => Promise<unknown>, label: string) => {
    if (!confirm(`Delete ${label}?`)) return;
    try { await fn(); reload(); }
    catch (e: any) { alert(e.message); }
  };

  if (error)
    return (
      <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Config</h2>
      </div>

      <TokenBar />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Secrets are write-only — they are never returned to the browser. Leaving a secret field blank keeps the existing value.
        </AlertDescription>
      </Alert>

      {/* Agent Templates */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Agent Templates</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setTemplateDialog({ open: true })}>
            <Plus className="h-3 w-3 mr-1" /> New
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Max Turns</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates === null ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">No agent templates yet.</TableCell>
                </TableRow>
              ) : (
                templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="font-mono text-xs">{t.model}</TableCell>
                    <TableCell>{t.maxTurns ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setTemplateDialog({ open: true, item: t })}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => doDelete(() => deleteAgentTemplate(t.id), t.name)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Credentials */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Credentials</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setCredDialog({ open: true })}>
            <Plus className="h-3 w-3 mr-1" /> New
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kind</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Secret Keys</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {credentials === null ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : credentials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">No credentials yet.</TableCell>
                </TableRow>
              ) : (
                credentials.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell><Badge>{c.kind}</Badge></TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{(c.secretKeys ?? []).join(", ")}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCredDialog({ open: true, item: c })}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => doDelete(() => deleteCredential(c.id), c.name)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Repo Mappings */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Repo Mappings</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setMappingDialog({ open: true })} disabled={!templates?.length}>
            <Plus className="h-3 w-3 mr-1" /> New
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jira Project</TableHead>
                <TableHead>GitLab Project</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Template</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings === null ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : mappings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">No repo mappings yet.</TableCell>
                </TableRow>
              ) : (
                mappings.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono">{m.jiraProjectKey}</TableCell>
                    <TableCell className="font-mono text-xs">{m.gitlabProjectId}</TableCell>
                    <TableCell><Badge variant="secondary">{m.defaultBaseBranch}</Badge></TableCell>
                    <TableCell>{m.agentTemplate?.name ?? m.agentTemplateId}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMappingDialog({ open: true, item: m })}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => doDelete(() => deleteRepoMapping(m.id), m.jiraProjectKey)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialogs */}
      {credDialog.open && (
        <CredentialDialog
          initial={credDialog.item}
          onClose={() => setCredDialog({ open: false })}
          onSaved={() => { setCredDialog({ open: false }); reload(); }}
        />
      )}
      {mappingDialog.open && templates && (
        <RepoMappingDialog
          initial={mappingDialog.item}
          templates={templates}
          onClose={() => setMappingDialog({ open: false })}
          onSaved={() => { setMappingDialog({ open: false }); reload(); }}
        />
      )}
      {templateDialog.open && (
        <AgentTemplateDialog
          initial={templateDialog.item}
          onClose={() => setTemplateDialog({ open: false })}
          onSaved={() => { setTemplateDialog({ open: false }); reload(); }}
        />
      )}
    </div>
  );
}
