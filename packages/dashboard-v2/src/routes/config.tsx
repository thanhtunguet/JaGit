import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil } from "lucide-react";
import {
  useAgentTemplates,
  useRepoMappings,
  useCredentials,
  useMcpServers,
  useUpdateAgentTemplate,
  useUpdateRepoMapping,
  useUpdateCredential,
} from "@/hooks/use-api";
import type { AgentTemplateItem, RepoMappingItem, CredentialListItem } from "@/lib/api";
import { formatCredentialName } from "@/lib/api";

export const Route = createFileRoute("/config")({
  head: () => ({
    meta: [
      { title: "Config · JiGit" },
      {
        name: "description",
        content:
          "Inspect and edit agent templates, repo mappings, and credentials used by the orchestrator.",
      },
    ],
  }),
  component: ConfigPage,
});

type EditTarget =
  | { kind: "agent"; id: string }
  | { kind: "repo"; id: string }
  | { kind: "credential"; id: string }
  | null;

function ConfigPage() {
  const [editing, setEditing] = useState<EditTarget>(null);
  const { data: templates = [], isLoading: templatesLoading } = useAgentTemplates();
  const { data: mappings = [], isLoading: mappingsLoading } = useRepoMappings();
  const { data: credentials = [], isLoading: credentialsLoading } = useCredentials();
  const { data: mcpServers = [] } = useMcpServers();

  const mcpServerMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of mcpServers) {
      map[s.id] = s.name;
    }
    return map;
  }, [mcpServers]);

  return (
    <AppShell>
      <div className="p-6 md:p-10 max-w-[1200px] mx-auto space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              config
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">Inspect &amp; edit</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">
              Live view of orchestration config. Edits are written back to the orchestrator via its
              admin API.
            </p>
          </div>
          <span className="mono text-[10px] px-2 py-1 rounded border border-hairline text-muted-foreground">
            admin · scoped writes
          </span>
        </header>

        <Panel title="Agent templates" endpoint="GET/PUT /api/agent-templates">
          <div className="grid grid-cols-[1.2fr_160px_90px_110px_1fr_60px] gap-4 px-5 py-2.5 mono text-[10px] uppercase tracking-wider text-muted-foreground border-b border-hairline">
            <div>name</div>
            <div>model</div>
            <div>max turns</div>
            <div>mode</div>
            <div>mcps / prompt</div>
            <div className="text-right">edit</div>
          </div>
          {templatesLoading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Loading agent templates...
            </div>
          ) : templates.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No agent templates configured.
            </div>
          ) : (
            <ul>
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="grid grid-cols-[1.2fr_160px_90px_110px_1fr_60px] gap-4 items-center px-5 py-3 border-b border-hairline last:border-0"
                >
                  <div className="font-medium text-sm truncate">{t.name}</div>
                  <div className="mono text-[12px] text-muted-foreground truncate">{t.model}</div>
                  <div className="mono text-[12px]">{t.maxTurns ?? "—"}</div>
                  <div className="mono text-[10px] uppercase tracking-wider text-teal">
                    {t.requireReviewBeforeCommit ? "supervised" : "autonomous"}
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-w-0">
                    {t.mcpServerIds && t.mcpServerIds.length > 0 ? (
                      t.mcpServerIds.map((s) => (
                        <span
                          key={s}
                          className="mono text-[10px] px-1.5 py-0.5 rounded bg-surface-2 border border-hairline truncate max-w-[120px]"
                        >
                          {mcpServerMap[s] || s}
                        </span>
                      ))
                    ) : (
                      <span className="mono text-[11px] text-muted-foreground truncate block">
                        {t.prompt}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <EditButton
                      label={`Edit agent template ${t.name}`}
                      onClick={() => setEditing({ kind: "agent", id: t.id })}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Repo mappings" endpoint="GET/PUT /api/repo-mappings">
          <div className="grid grid-cols-[120px_1.5fr_120px_1fr_60px] gap-4 px-5 py-2.5 mono text-[10px] uppercase tracking-wider text-muted-foreground border-b border-hairline">
            <div>jira project</div>
            <div>repo</div>
            <div>base branch</div>
            <div>template / rules</div>
            <div className="text-right">edit</div>
          </div>
          {mappingsLoading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Loading repo mappings...
            </div>
          ) : mappings.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No repo mappings configured.
            </div>
          ) : (
            <ul>
              {mappings.map((r) => (
                <li
                  key={r.id}
                  className="grid grid-cols-[120px_1.5fr_120px_1fr_60px] gap-4 items-center px-5 py-3 border-b border-hairline last:border-0 mono text-[12px]"
                >
                  <div className="text-teal font-medium">{r.jiraProjectKey}</div>
                  <div className="truncate">{r.gitlabProjectId}</div>
                  <div className="text-muted-foreground">{r.defaultBaseBranch}</div>
                  <div className="text-muted-foreground truncate">
                    {Object.entries(r.branchPrefixRules || {})
                      .map(([k, v]) => `${k}→${v}`)
                      .join(", ") ||
                      (r.agentTemplate?.name ? `agent: ${r.agentTemplate.name}` : "default rules")}
                  </div>
                  <div className="flex justify-end">
                    <EditButton
                      label={`Edit repo mapping ${r.gitlabProjectId}`}
                      onClick={() => setEditing({ kind: "repo", id: r.id })}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Credentials" endpoint="GET/PATCH /api/credentials">
          {credentialsLoading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Loading credentials...
            </div>
          ) : credentials.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No credentials configured.
            </div>
          ) : (
            <ul>
              {credentials.map((c) => (
                <li
                  key={c.id}
                  className="grid grid-cols-[1.2fr_140px_1.5fr_140px_60px] gap-4 items-center px-5 py-3.5 border-b border-hairline last:border-0"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{formatCredentialName(c)}</div>
                    <div className="mono text-[10px] text-muted-foreground mt-0.5 truncate">
                      id · {c.id}
                    </div>
                  </div>
                  <span className="mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-surface-2 border border-hairline text-teal w-fit">
                    {c.kind}
                  </span>
                  <div className="flex flex-wrap gap-1 min-w-0">
                    {(c.secretKeys || []).map((s) => (
                      <span
                        key={s}
                        className="mono text-[10px] px-1.5 py-0.5 rounded bg-background border border-hairline text-muted-foreground"
                      >
                        key: {s}
                      </span>
                    ))}
                  </div>
                  <div className="text-right truncate">
                    <div className="mono text-[13px] tracking-widest text-muted-foreground">
                      ••••••••
                    </div>
                    <div className="mono text-[10px] text-muted-foreground mt-0.5 truncate">
                      {Object.keys(c.meta || {}).length > 0
                        ? Object.entries(c.meta)
                            .map(([k, v]) => `${k}=${v}`)
                            .join(" · ")
                        : "configured"}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <EditButton
                      label={`Edit credential ${c.name}`}
                      onClick={() => setEditing({ kind: "credential", id: c.id })}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <EditDialog
        target={editing}
        onClose={() => setEditing(null)}
        templates={templates}
        mappings={mappings}
        credentials={credentials}
      />
    </AppShell>
  );
}

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-surface-2 text-muted-foreground hover:text-foreground hover:border-teal/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal transition-colors"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  );
}

function Panel({
  title,
  endpoint,
  children,
}: {
  title: string;
  endpoint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-hairline bg-surface overflow-hidden">
      <header className="px-5 py-4 flex items-center justify-between border-b border-hairline">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <span className="mono text-[10px] text-muted-foreground">{endpoint}</span>
      </header>
      {children}
    </section>
  );
}

function EditDialog({
  target,
  onClose,
  templates,
  mappings,
  credentials,
}: {
  target: EditTarget;
  onClose: () => void;
  templates: AgentTemplateItem[];
  mappings: RepoMappingItem[];
  credentials: CredentialListItem[];
}) {
  const open = target !== null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-surface border-hairline max-h-[90vh] overflow-y-auto">
        {target?.kind === "agent" && (
          <AgentForm template={templates.find((x) => x.id === target.id)!} onClose={onClose} />
        )}
        {target?.kind === "repo" && (
          <RepoForm mapping={mappings.find((x) => x.id === target.id)!} onClose={onClose} />
        )}
        {target?.kind === "credential" && (
          <CredentialForm
            credential={credentials.find((x) => x.id === target.id)!}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AgentForm({ template, onClose }: { template: AgentTemplateItem; onClose: () => void }) {
  const [name, setName] = useState(template.name);
  const [model, setModel] = useState(template.model);
  const [maxTurns, setMaxTurns] = useState(String(template.maxTurns ?? 10));
  const [prompt, setPrompt] = useState(template.prompt);
  const updateMutation = useUpdateAgentTemplate();

  if (!template) return null;

  const handleSave = () => {
    updateMutation.mutate(
      {
        id: template.id,
        body: {
          name,
          model,
          prompt,
          maxTurns: Number(maxTurns) || 10,
          mcpServerIds: template.mcpServerIds ?? [],
          requireReviewBeforeCommit: template.requireReviewBeforeCommit ?? false,
        },
      },
      {
        onSuccess: () => onClose(),
      },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit agent template</DialogTitle>
        <DialogDescription>
          PUT <span className="mono text-[11px]">/api/agent-templates/{template.id}</span>
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 mt-2">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Model">
          <Input value={model} onChange={(e) => setModel(e.target.value)} />
        </Field>
        <Field label="Max turns">
          <Input value={maxTurns} onChange={(e) => setMaxTurns(e.target.value)} />
        </Field>
        <Field label="System prompt">
          <Textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="font-mono text-xs"
          />
        </Field>
      </div>
      <DialogFooter className="mt-4">
        <Button variant="ghost" onClick={onClose} disabled={updateMutation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="bg-teal text-background hover:bg-teal/90"
        >
          {updateMutation.isPending ? "Saving..." : "Save changes"}
        </Button>
      </DialogFooter>
    </>
  );
}

function RepoForm({ mapping, onClose }: { mapping: RepoMappingItem; onClose: () => void }) {
  const [jp, setJp] = useState(mapping.jiraProjectKey);
  const [repo, setRepo] = useState(mapping.gitlabProjectId);
  const [base, setBase] = useState(mapping.defaultBaseBranch);
  const [rules, setRules] = useState(JSON.stringify(mapping.branchPrefixRules ?? {}, null, 2));
  const [agentTemplateId, setAgentTemplateId] = useState(mapping.agentTemplateId);
  const updateMutation = useUpdateRepoMapping();

  if (!mapping) return null;

  const handleSave = () => {
    let parsedRules = mapping.branchPrefixRules ?? {};
    try {
      parsedRules = JSON.parse(rules);
    } catch {
      // keep existing if JSON parse fails
    }
    updateMutation.mutate(
      {
        id: mapping.id,
        body: {
          jiraProjectKey: jp,
          gitlabProjectId: repo,
          defaultBaseBranch: base,
          branchPrefixRules: parsedRules,
          agentTemplateId,
        },
      },
      {
        onSuccess: () => onClose(),
      },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit repo mapping</DialogTitle>
        <DialogDescription>
          PUT <span className="mono text-[11px]">/api/repo-mappings/{mapping.id}</span>
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 mt-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jira project key">
            <Input value={jp} onChange={(e) => setJp(e.target.value)} />
          </Field>
          <Field label="Base branch">
            <Input value={base} onChange={(e) => setBase(e.target.value)} />
          </Field>
        </div>
        <Field label="GitLab project ID / Repo">
          <Input
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            className="font-mono text-xs"
          />
        </Field>
        <Field label="Agent template ID">
          <Input
            value={agentTemplateId}
            onChange={(e) => setAgentTemplateId(e.target.value)}
            className="font-mono text-xs"
          />
        </Field>
        <Field label="Branch prefix rules (JSON)">
          <Textarea
            rows={3}
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            className="font-mono text-xs"
          />
        </Field>
      </div>
      <DialogFooter className="mt-4">
        <Button variant="ghost" onClick={onClose} disabled={updateMutation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="bg-teal text-background hover:bg-teal/90"
        >
          {updateMutation.isPending ? "Saving..." : "Save changes"}
        </Button>
      </DialogFooter>
    </>
  );
}

function CredentialForm({
  credential,
  onClose,
}: {
  credential: CredentialListItem;
  onClose: () => void;
}) {
  const isAnthropic = credential.kind === "anthropic";
  const [name, setName] = useState(credential.name);
  const [meta, setMeta] = useState(JSON.stringify(credential.meta ?? {}, null, 2));
  // Anthropic-specific fields
  const [authToken, setAuthToken] = useState("");
  const [baseUrl, setBaseUrl] = useState((credential.meta as any)?.baseUrl ?? "");
  // Generic secret (non-Anthropic kinds)
  const [secret, setSecret] = useState("");
  const updateMutation = useUpdateCredential();

  if (!credential) return null;

  const handleSave = () => {
    if (isAnthropic) {
      const secrets: Record<string, string> = authToken.trim() ? { authToken: authToken.trim() } : {};
      const metaObj: Record<string, string> = { ...(credential.meta ?? {}) };
      if (baseUrl.trim()) {
        metaObj.baseUrl = baseUrl.trim();
      } else {
        delete metaObj.baseUrl;
      }
      updateMutation.mutate(
        { id: credential.id, body: { name, meta: metaObj, secrets } },
        { onSuccess: () => onClose() },
      );
      return;
    }

    let parsedMeta = credential.meta ?? {};
    try {
      parsedMeta = JSON.parse(meta);
    } catch {
      // keep existing
    }
    const primaryKey = credential.secretKeys?.[0] || "token";
    const secrets = secret.trim() ? { [primaryKey]: secret.trim() } : {};
    updateMutation.mutate(
      {
        id: credential.id,
        body: {
          name,
          meta: parsedMeta,
          secrets,
        },
      },
      {
        onSuccess: () => onClose(),
      },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit credential ({formatCredentialName(credential)})</DialogTitle>
        <DialogDescription>
          PATCH <span className="mono text-[11px]">/api/credentials/{credential.id}</span> · secret
          is write-only and never returned
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 mt-2">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Kind">
          <Input value={credential.kind} disabled className="font-mono text-xs opacity-60" />
        </Field>
        {isAnthropic ? (
          <>
            <Field label="Auth Token (ANTHROPIC_AUTH_TOKEN) — leave blank to keep existing">
              <Input
                type="password"
                placeholder="••••••••"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                className="font-mono text-xs"
              />
            </Field>
            <Field label="Base URL (ANTHROPIC_BASE_URL) — optional proxy override">
              <Input
                type="url"
                placeholder="https://api.anthropic.com"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="font-mono text-xs"
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Metadata (JSON)">
              <Textarea
                rows={2}
                value={meta}
                onChange={(e) => setMeta(e.target.value)}
                className="font-mono text-xs"
              />
            </Field>
            <Field label="Rotate secret (leave blank to keep existing)">
              <Input
                type="password"
                placeholder="••••••••"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="font-mono text-xs"
              />
            </Field>
          </>
        )}
      </div>
      <DialogFooter className="mt-4">
        <Button variant="ghost" onClick={onClose} disabled={updateMutation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="bg-teal text-background hover:bg-teal/90"
        >
          {updateMutation.isPending ? "Saving..." : "Save changes"}
        </Button>
      </DialogFooter>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
