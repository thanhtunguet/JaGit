import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { LayoutDashboard, Briefcase, Settings, CheckSquare, Plug, BarChart3 } from "lucide-react";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/usage", label: "Usage", icon: BarChart3 },
  { to: "/approvals", label: "Approvals", icon: CheckSquare },
  { to: "/mcp-servers", label: "MCP Servers", icon: Plug },
  { to: "/config", label: "Config", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  // Seed pending count on load and react to SSE events
  useEffect(() => {
    fetch("/api/approvals")
      .then((r) => r.json())
      .then((arr: unknown[]) => setPendingCount(arr.length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/approvals/stream");
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data);
        if (evt.type === "approval_requested") setPendingCount((n) => n + 1);
        if (evt.type === "resolved") setPendingCount((n) => Math.max(0, n - 1));
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-border bg-card">
        <div className="px-6 py-4">
          <h1 className="text-lg font-semibold tracking-tight">JiGit</h1>
          <p className="text-xs text-muted-foreground">AI Coding Orchestrator</p>
        </div>
        <Separator />
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname === to
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              aria-current={pathname === to ? "page" : undefined}
            >
              <Icon className="h-4 w-4" />
              {label}
              {to === "/approvals" && pendingCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold w-5 h-5">
                  {pendingCount}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </aside>
      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-screen-xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
