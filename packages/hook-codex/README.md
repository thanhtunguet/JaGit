# @jagit/hook-codex

Reports per-session OpenAI Codex CLI usage to JaGit.

## Setup (recommended — native Codex hook)

Codex CLI has a built-in hook mechanism. Add a `Stop` hook to
`~/.codex/hooks.json` (user-level) or `.codex/hooks.json` (repo-level):

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "JAGIT_BASE_URL=https://your-jagit-host JAGIT_API_KEY=<your-token> npx -y @jagit/hook-codex",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Codex passes the session payload on stdin (including `session_id`, `model`,
`cwd`, `transcript_path`, and `stop_hook_active`). The hook reads token usage
from the transcript and reports the session to JaGit. The `stop_hook_active`
guard prevents duplicate reports when Codex re-runs the hook after a
continuation.

## Setup (legacy — shell wrapper)

If you are on an older Codex CLI version without hook support, install a shell
function that wraps the real `codex` binary and reports after each session ends:

    codex() {
      command codex "$@"
      local exit_code=$?
      npx -y @jagit/hook-codex >/dev/null 2>&1 || true
      return $exit_code
    }

Add that function to your shell rc (`~/.zshrc`, `~/.bashrc`, etc.). On exit,
the reporter locates the most-recently-modified file under
`~/.codex/sessions/**/*.jsonl`, parses it, and posts the session summary.

You can also point the reporter at a specific transcript:

    jagit-hook-codex --file ~/.codex/sessions/2026/06/20/rollout-...jsonl

## Environment

    export JAGIT_BASE_URL="https://your-jagit-host"
    export JAGIT_API_KEY="<your DASHBOARD_API_TOKEN>"

Identity defaults to `git config user.email` (read from the session's `cwd`);
override with `JAGIT_GIT_USERNAME`.

## Notes

- In native hook mode, `model` is read directly from the Codex stdin payload.
- In legacy mode, `model` is parsed from `turn_context` records in the JSONL file.
- Token counts in legacy mode are cumulative per Codex session; the reporter
  reads the last non-null `token_count` event, not a sum across events.
- In native hook mode, token counts are summed across all assistant transcript
  entries (each entry represents one turn).
- `costUsd` is always `null` — Codex logs do not expose a cost field.
