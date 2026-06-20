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
        type="date"
        className={selectClassName}
        value={from}
        onChange={(e) => onChange({ from: e.target.value })}
      />

      <input
        type="date"
        className={selectClassName}
        value={to}
        onChange={(e) => onChange({ to: e.target.value })}
      />
    </div>
  );
}
