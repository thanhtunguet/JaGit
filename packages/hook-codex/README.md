# @jigit/hook-codex

Reports per-session OpenAI Codex CLI usage to JiGit.

## Setup

Codex has no built-in hook mechanism, so install a shell function that wraps
the real `codex` binary and reports after each session ends:

    codex() {
      command codex "$@"
      local status=$?
      npx -y @jigit/hook-codex >/dev/null 2>&1 || true
      return $status
    }

Add that function to your shell rc (`~/.zshrc`, `~/.bashrc`, etc.) — it must
appear before any `alias`/`PATH` entry that would otherwise shadow it. On
exit, the reporter locates the most-recently-modified file under
`~/.codex/sessions/**/*.jsonl`, parses it, and posts the session summary.
Uninstall by removing the shell function.

For a permanent binary instead of `npx -y`:
`npm i -g @jigit/hook-codex`, then call `jigit-hook-codex` in the wrapper.

You can also point the reporter at a specific transcript:

    jigit-hook-codex --file ~/.codex/sessions/2026/06/20/rollout-...jsonl

## Environment

    export JAGIT_BASE_URL="https://your-jigit-host"
    export JAGIT_API_KEY="<your DASHBOARD_API_TOKEN>"

Identity defaults to `git config user.email` (read from the session's `cwd`);
override with `JAGIT_GIT_USERNAME`.

## Notes

- Token counts are cumulative per Codex session; the reporter reads the last
  non-null `token_count` event, not a sum across events.
- `costUsd` is always `null` — Codex JSONL logs do not expose a cost field.
