import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { LayoutDashboard, Briefcase, Settings } from "lucide-react";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/config", label: "Config", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
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
