#!/usr/bin/env bash
# PreToolUse guard for JiGit.
# Blocks (1) access to secret files and (2) destructive shell commands.
# Reads the hook JSON on stdin; emits a deny decision as JSON when it trips,
# otherwise stays silent (allow). Never exits non-zero so a parse hiccup can't
# wedge the session.
set -uo pipefail

input="$(cat)"
tool="$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)"

deny() {
  jq -n --arg r "$1" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

# Files that look like secrets. .env.example / .sample / .template are allowed
# so the required-variable reference stays readable.
secret_path() {
  local p="$1" base
  [ -z "$p" ] && return 1
  base="$(basename "$p")"
  case "$base" in
    .env.example|.env.sample|.env.template|.env.dist) return 1 ;;
  esac
  printf '%s' "$p" | grep -Eiq \
    '(^|/)\.env(\.|$)|\.(pem|key|p12|pfx)$|(^|/)id_(rsa|ed25519|ecdsa|dsa)|(^|/)credentials\.json$|(^|/)\.pgpass$' \
    && return 0
  return 1
}

case "$tool" in
  Read|Edit|Write|NotebookEdit|Glob|Grep)
    path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.path // .tool_input.notebook_path // empty' 2>/dev/null)"
    if secret_path "$path"; then
      deny "Blocked: '$path' looks like a secret file. Secrets must never be read, edited, or logged. Use .env.example for the list of required variables."
    fi
    ;;
  Bash)
    cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"
    # Destructive / irreversible operations — require explicit human action.
    if printf '%s' "$cmd" | grep -Eq \
      'rm[[:space:]]+(-[[:alnum:]]*[rf][[:alnum:]]*[[:space:]]+)+|git[[:space:]]+reset[[:space:]]+--hard|git[[:space:]]+push[[:space:]][^|;&]*(--force([^-]|$)|-f([[:space:]]|$))|git[[:space:]]+clean[[:space:]][^|;&]*-[[:alnum:]]*f|--no-verify|--no-gpg-sign|\bdrop[[:space:]]+(table|database)\b|truncate[[:space:]]+table|chmod[[:space:]]+-R[[:space:]]+777|mkfs|dd[[:space:]]+if=|:\(\)\s*\{[[:space:]]*:\|:'; then
      deny "Blocked: destructive or irreversible command. Get explicit human approval before running this. Command: $cmd"
    fi
    # Reading a secret file by piping it through a pager / printer.
    if printf '%s' "$cmd" | grep -Eiq \
      '(cat|less|more|head|tail|bat|nl|xxd|od|strings|grep|awk|sed)[[:space:]][^|;&]*(\.env([^a-zA-Z.]|$)|\.pem|\.p12|\.pfx|(^|/| )id_(rsa|ed25519)|credentials\.json|\.pgpass)'; then
      deny "Blocked: command would read a secret file. Secrets must never be printed or logged."
    fi
    ;;
esac

exit 0
