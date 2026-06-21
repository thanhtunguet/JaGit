import { useEffect, useRef } from "react";
import type { AgentSessionTool } from "@/api/client.js";

export interface SessionsFiltersValue {
  tool: "" | AgentSessionTool;
  username: "" | string;
  from: string;
  to: string;
}

interface Props extends SessionsFiltersValue {
  usernames: string[];
  onChange: (patch: Partial<SessionsFiltersValue>) => void;
}

const TOOL_OPTIONS: { value: "" | AgentSessionTool; label: string }[] = [
  { value: "", label: "All tools" },
  { value: "claude-code", label: "claude-code" },
  { value: "codex", label: "codex" },
  { value: "copilot", label: "copilot" },
];

const selectClassName = "rounded-md border bg-background px-3 py-2 text-sm";

export function SessionsFilters({ tool, username, from, to, usernames, onChange }: Props) {
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fromRef.current && fromRef.current.value !== from) {
      fromRef.current.value = from;
    }
  }, [from]);

  useEffect(() => {
    if (toRef.current && toRef.current.value !== to) {
      toRef.current.value = to;
    }
  }, [to]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={selectClassName}
        value={tool}
        onChange={(e) => onChange({ tool: e.target.value as "" | AgentSessionTool })}
      >
        {TOOL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        className={selectClassName}
        value={username}
        onChange={(e) => onChange({ username: e.target.value })}
      >
        <option value="">All users</option>
        {usernames.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>

      <input
        ref={fromRef}
        type="date"
        className={selectClassName}
        defaultValue={from}
        onChange={(e) => onChange({ from: e.target.value })}
      />

      <input
        ref={toRef}
        type="date"
        className={selectClassName}
        defaultValue={to}
        onChange={(e) => onChange({ to: e.target.value })}
      />
    </div>
  );
}
