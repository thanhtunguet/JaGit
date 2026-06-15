import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";

interface AgentTemplate {
  id: string;
  name: string;
  model: string;
  maxConcurrent: number;
}
interface Credential {
  id: string;
  kind: string;
  name: string;
  meta: Record<string, string>;
}
interface RepoMapping {
  id: string;
  jiraProjectKey: string;
  gitlabProjectId: string;
  defaultBaseBranch: string;
  agentTemplate: { id: string; name: string };
}

export function Config() {
  const [templates, setTemplates] = useState<AgentTemplate[] | null>(null);
  const [credentials, setCredentials] = useState<Credential[] | null>(null);
  const [mappings, setMappings] = useState<RepoMapping[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/agent-templates").then((r) => r.json()),
      fetch("/credentials").then((r) => r.json()),
      fetch("/repo-mappings").then((r) => r.json()),
    ])
      .then(([t, c, m]) => {
        setTemplates(t);
        setCredentials(c);
        setMappings(m);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Config</h2>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          This view is read-only. Edit configuration via the{" "}
          <code>pnpm seed</code> script. Secrets are redacted.
        </AlertDescription>
      </Alert>

      {/* Agent Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Agent Templates</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Max Concurrent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates === null ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 3 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : templates.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-muted-foreground py-6"
                  >
                    No agent templates. Run <code>pnpm seed</code>.
                  </TableCell>
                </TableRow>
              ) : (
                templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t.model}</Badge>
                    </TableCell>
                    <TableCell>{t.maxConcurrent}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Credentials */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Credentials</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kind</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Meta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credentials === null ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 3 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : credentials.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-muted-foreground py-6"
                  >
                    No credentials. Run <code>pnpm seed</code>.
                  </TableCell>
                </TableRow>
              ) : (
                credentials.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Badge>{c.kind}</Badge>
                    </TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-xs truncate">
                      {JSON.stringify(c.meta)}
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
        <CardHeader>
          <CardTitle className="text-sm">Repo Mappings</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jira Project</TableHead>
                <TableHead>GitLab Project ID</TableHead>
                <TableHead>Base Branch</TableHead>
                <TableHead>Agent Template</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings === null ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : mappings.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground py-6"
                  >
                    No repo mappings. Run <code>pnpm seed</code>.
                  </TableCell>
                </TableRow>
              ) : (
                mappings.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono">{m.jiraProjectKey}</TableCell>
                    <TableCell className="font-mono text-xs">{m.gitlabProjectId}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{m.defaultBaseBranch}</Badge>
                    </TableCell>
                    <TableCell>{m.agentTemplate.name}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
