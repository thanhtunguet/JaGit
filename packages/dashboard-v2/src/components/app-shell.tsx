import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ReactNode } from "react";
import { Lock } from "lucide-react";
import { STATS } from "@/lib/jigit-data";
import { removeStoredToken } from "@/lib/api";

type NavItem = { to: string; label: string; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/", label: "Overview", exact: true },
  { to: "/jobs", label: "Jobs" },
  { to: "/approvals", label: "Approvals" },
  { to: "/config", label: "Config" },
  { to: "/mcp-servers", label: "MCP Servers" },
  { to: "/usage", label: "Usage" },
];

export function AppShell({ children }: { children?: ReactNode }) {
  const pathname = useRouterState({ select: s => s.location.pathname });
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-hairline bg-surface">
        <div className="px-5 pt-6 pb-8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <LogoMark />
            <div className="leading-none">
              <div className="font-sans text-[15px] font-semibold tracking-tight">JiGit</div>
              <div className="mono text-[10px] text-muted-foreground mt-1">orchestrator · v0.4</div>
            </div>
          </Link>
        </div>
        <nav className="px-2.5 space-y-0.5">
          {NAV.map(item => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const badge =
              item.to === "/approvals" && STATS.approvalQueueSize > 0
                ? STATS.approvalQueueSize
                : null;
            return (
              <Link
                key={item.to}
                to={item.to as any}
                className={`flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-surface-2 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-2/60"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      active ? "bg-teal" : "bg-hairline"
                    }`}
                  />
                  {item.label}
                </span>
                {badge != null && (
                  <span className="mono text-[10px] px-1.5 py-0.5 rounded bg-amber/15 text-amber pulse-amber">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-5 py-5 border-t border-hairline flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mono text-[10px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-moss" />
              api · connected
            </div>
            <div className="mono text-[10px] text-muted-foreground mt-1">
              tg-bot · @jigit_ops_bot
            </div>
          </div>
          <button
            type="button"
            onClick={() => removeStoredToken()}
            title="Lock Session / Logout"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded-md transition-colors"
          >
            <Lock className="h-4 w-4" />
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="md:hidden border-b border-hairline px-4 py-3 flex items-center gap-3 overflow-x-auto bg-surface">
          <LogoMark />
          {NAV.map(item => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to as any}
                className={`text-sm px-2 py-1 rounded ${
                  active ? "text-foreground bg-surface-2" : "text-muted-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        {children ?? <Outlet />}
      </main>
    </div>
  );
}

function LogoMark() {
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-surface-2 border border-hairline">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <path d="M2 9h14" stroke="#3FB6C0" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="5" cy="9" r="1.8" fill="#3FB6C0" />
        <circle cx="9" cy="9" r="1.8" fill="#E8A33D" />
        <circle cx="13" cy="9" r="1.8" fill="#6FAE7F" />
      </svg>
    </span>
  );
}
