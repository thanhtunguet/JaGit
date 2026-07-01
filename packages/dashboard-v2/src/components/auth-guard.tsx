import { useState, useEffect, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Eye, EyeOff, ShieldAlert, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStoredToken, setStoredToken } from "@/lib/api";

export function AuthGuard({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [token, setToken] = useState<string>("");
  const [isUnauthorized, setIsUnauthorized] = useState<boolean>(true);
  const [inputVal, setInputVal] = useState<string>("");
  const [showToken, setShowToken] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    const stored = getStoredToken();
    setToken(stored);
    setIsUnauthorized(!stored);
    setIsMounted(true);

    const handleUnauthorized = () => {
      setIsUnauthorized(true);
      setErrorMsg("Session expired or invalid API token. Please authenticate again.");
    };

    const handleUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ token: string }>;
      const newToken = customEvent.detail?.token ?? getStoredToken();
      setToken(newToken);
      setIsUnauthorized(!newToken);
    };

    window.addEventListener("jigit:auth-unauthorized", handleUnauthorized);
    window.addEventListener("jigit:auth-updated", handleUpdated);
    return () => {
      window.removeEventListener("jigit:auth-unauthorized", handleUnauthorized);
      window.removeEventListener("jigit:auth-updated", handleUpdated);
    };
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = inputVal.trim();
    if (!trimmed) {
      setErrorMsg("API token cannot be empty.");
      return;
    }
    setErrorMsg("");
    setStoredToken(trimmed);
    setToken(trimmed);
    setIsUnauthorized(false);
    setInputVal("");
    queryClient.invalidateQueries();
  };

  if (!isMounted) {
    return <div className="min-h-screen w-full bg-background" />;
  }

  if (!token || isUnauthorized) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(63,182,192,0.15),rgba(255,255,255,0))] px-4 relative overflow-hidden">
        {/* Subtle decorative background glow */}
        <div className="absolute -top-40 -left-40 h-80 w-80 rounded-full bg-teal/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-amber/10 blur-3xl pointer-events-none" />

        <div className="w-full max-w-md rounded-2xl border border-hairline/80 bg-surface/90 backdrop-blur-xl shadow-2xl p-8 relative animate-in fade-in zoom-in-95 duration-300">
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal via-amber to-moss rounded-t-2xl" />

          <div className="flex flex-col items-center text-center mt-2">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 border border-hairline shadow-inner mb-4 relative group">
              <svg width="24" height="24" viewBox="0 0 18 18" fill="none" aria-hidden>
                <path d="M2 9h14" stroke="#3FB6C0" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="5" cy="9" r="1.8" fill="#3FB6C0" />
                <circle cx="9" cy="9" r="1.8" fill="#E8A33D" />
                <circle cx="13" cy="9" r="1.8" fill="#6FAE7F" />
              </svg>
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-teal animate-pulse" />
            </span>

            <div className="mono text-[11px] uppercase tracking-wider text-teal font-medium flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              Security Gateway
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mt-1 text-foreground">
              JiGit Control Room
            </h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Frontend pages require authentication. Please enter your pre-configured API token to access orchestrator telemetry and agent operations.
            </p>
          </div>

          {errorMsg && (
            <div className="mt-6 flex items-start gap-3 rounded-lg border border-brick/30 bg-brick/10 p-3 text-xs text-brick animate-in slide-in-from-top-2 duration-200">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5 text-left">
              <label className="mono text-[11px] uppercase tracking-wider text-muted-foreground block">
                Dashboard API Token
              </label>
              <div className="relative flex items-center">
                <KeyRound className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type={showToken ? "text" : "password"}
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder="e.g. jgt_live_9a8b..."
                  className="pl-9 pr-10 h-10 mono text-xs bg-background/80 border-hairline focus-visible:ring-teal"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors p-1"
                  title={showToken ? "Hide token" : "Show token"}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-10 bg-teal text-background font-medium hover:bg-teal/90 transition-all shadow-lg shadow-teal/10 flex items-center justify-center gap-2"
            >
              Authenticate Access
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-hairline/60 text-center">
            <p className="mono text-[10px] text-muted-foreground">
              Token is securely stored in local storage for continuous authentication.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
