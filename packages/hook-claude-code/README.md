# @jagit/hook-claude-code

Reports per-session Claude Code usage to JaGit.

## Setup

Set in your shell rc:

    export JAGIT_BASE_URL="https://your-jagit-host"
    export JAGIT_API_KEY="<your DASHBOARD_API_TOKEN>"

Add to `~/.claude/settings.json` (or per-project `.claude/settings.json`):

    {
      "hooks": {
        "Stop": [{
          "matcher": "",
          "hooks": [{ "type": "command", "command": "npx -y @jagit/hook-claude-code" }]
        }]
      }
    }

No install needed — `npx -y` fetches on demand. For a permanent binary:
`npm i -g @jagit/hook-claude-code`, then use `jagit-hook-claude-code` as the command.

Identity defaults to `git config user.email`; override with `JAGIT_GIT_USERNAME`.
