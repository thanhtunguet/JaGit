# @jagit/hook-copilot

Reports GitHub Copilot agent session usage to JaGit. Supports two modes:

1. **VS Code agent hook** (recommended) — hooks into the VS Code Copilot agent `Stop` lifecycle event, receiving a structured JSON payload from stdin including `session_id`, `cwd`, and `transcript_path`. Token counts and model name are read from Copilot debug logs (`main.jsonl`) by mapping `session_id` to the debug-log session folder.
2. **Legacy shell wrapper** — wraps the Copilot CLI binary and fires after each invocation. No per-call telemetry is available under seat-based billing, so token counts are always zero.

## Setup — VS Code Agent Hook (Recommended)

Add the hook to your workspace's `.github/hooks/jagit.json` (or any [supported hook location](https://code.visualstudio.com/docs/agent-customization/hooks#_hook-file-locations)):

```json
{
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": "npx -y @jagit/hook-copilot"
      }
    ]
  }
}
```

VS Code automatically loads this file. When the Copilot agent session ends, JaGit receives the session report (session ID, model, aggregated token counts, tool call count).

For a permanent binary instead of `npx -y`: `npm i -g @jagit/hook-copilot`, then use `jagit-hook-copilot` as the command.

## Setup — Legacy Shell Wrapper (Copilot CLI)

If you are using the Copilot CLI directly (not the VS Code agent), install a shell function that wraps the real `copilot` binary and reports after each invocation ends:

```sh
copilot() {
  command copilot "$@"
  local status=$?
  npx -y @jagit/hook-copilot >/dev/null 2>&1 || true
  return $status
}
```

Add that function to your shell rc (`~/.zshrc`, `~/.bashrc`, etc.). Uninstall by removing the shell function.

## Environment

```sh
export JAGIT_BASE_URL="https://your-jagit-host"
export JAGIT_API_KEY="<your DASHBOARD_API_TOKEN>"
```

Identity defaults to `git config user.email`; override with `JAGIT_GIT_USERNAME`.

## Notes

- In **VS Code agent hook mode**, tool-call count and start time are read from `transcript_path`; model/token usage is read from `~/.config/Code/User/workspaceStorage/<workspace-id>/GitHub.copilot-chat/debug-logs/<session-id>/main.jsonl`.
- Workspace detection prefers a workspace that contains the incoming `session_id`. If no exact session match is found, it falls back to the most recently updated workspace debug-log directory near the Stop-hook timestamp.
- In **legacy shell wrapper mode**, token counts are always zero (`costUsd: null`) since the Copilot CLI exposes no per-invocation telemetry under seat-based billing.
- `costUsd` is always `null` — there is no per-session USD cost to report.
