# @jagit/hook-copilot

Reports per-invocation GitHub Copilot CLI usage to JaGit.

## Setup

The Copilot CLI has no hook mechanism and no persistent session telemetry, so
install a shell function that wraps the real `copilot` binary and reports
after each invocation ends:

    copilot() {
      command copilot "$@"
      local status=$?
      npx -y @jagit/hook-copilot >/dev/null 2>&1 || true
      return $status
    }

Add that function to your shell rc (`~/.zshrc`, `~/.bashrc`, etc.) — it must
appear before any `alias`/`PATH` entry that would otherwise shadow it. (Users
on the legacy `gh copilot` preview wrapper can apply the same pattern to a
`gh` function instead.) Uninstall by removing the shell function.

For a permanent binary instead of `npx -y`:
`npm i -g @jagit/hook-copilot`, then call `jagit-hook-copilot` in the wrapper.

## Environment

    export JAGIT_BASE_URL="https://your-jagit-host"
    export JAGIT_API_KEY="<your DASHBOARD_API_TOKEN>"

Identity defaults to `git config user.email`; override with `JAGIT_GIT_USERNAME`.

## Notes

- Copilot CLI exposes no local token/usage telemetry (billing is seat-based),
  so each report uses a synthetic session id (`copilot-<timestamp>-<pid>`),
  zero token counts, and `model: "copilot"` unless a future CLI version
  surfaces real usage data.
- `costUsd` is always `null` and will remain so — there is no per-invocation
  cost to report under seat-based billing.
