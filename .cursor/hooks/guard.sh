#!/usr/bin/env bash
# Cursor guard hook for JiGit.
# Blocks (1) access to secret files and (2) destructive shell commands.
# Wired from beforeReadFile, preToolUse, and beforeShellExecution in hooks.json.
# Reads hook JSON on stdin; emits {permission:"deny",...} when it trips,
# otherwise {permission:"allow"}. Never exits non-zero so a parse hiccup can't
# wedge the session.
set -uo pipefail

input="$(cat)"

deny() {
  jq -n --arg r "$1" \
    '{permission:"deny",user_message:$r,agent_message:$r}'
  exit 0
}

allow() {
  echo '{"permission":"allow"}'
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

check_paths() {
  local p
  for p in "$@"; do
    if secret_path "$p"; then
      deny "Blocked: '$p' looks like a secret file. Secrets must never be read, edited, or logged. Use .env.example for the list of required variables."
    fi
  done
}

# beforeShellExecution: top-level "command"
cmd="$(printf '%s' "$input" | jq -r '.command // empty' 2>/dev/null)"
if [ -n "$cmd" ]; then
  if printf '%s' "$cmd" | grep -Eq \
    'rm[[:space:]]+(-[[:alnum:]]*[rf][[:alnum:]]*[[:space:]]+)+|git[[:space:]]+reset[[:space:]]+--hard|git[[:space:]]+push[[:space:]][^|;&]*(--force([^-]|$)|-f([[:space:]]|$))|git[[:space:]]+clean[[:space:]][^|;&]*-[[:alnum:]]*f|--no-verify|--no-gpg-sign|\bdrop[[:space:]]+(table|database)\b|truncate[[:space:]]+table|chmod[[:space:]]+-R[[:space:]]+777|mkfs|dd[[:space:]]+if=|:\(\)\s*\{[[:space:]]*:\|:'; then
    deny "Blocked: destructive or irreversible command. Get explicit human approval before running this. Command: $cmd"
  fi
  if printf '%s' "$cmd" | grep -Eiq \
    '(cat|less|more|head|tail|bat|nl|xxd|od|strings|grep|awk|sed)[[:space:]][^|;&]*(\.env([^a-zA-Z.]|$)|\.pem|\.p12|\.pfx|(^|/| )id_(rsa|ed25519)|credentials\.json|\.pgpass)'; then
    deny "Blocked: command would read a secret file. Secrets must never be printed or logged."
  fi
  allow
fi

# File-oriented events: beforeReadFile and preToolUse
path="$(printf '%s' "$input" | jq -r '
  .file_path
  // .tool_input.file_path
  // .tool_input.path
  // .tool_input.notebook_path
  // empty
' 2>/dev/null)"
glob_pattern="$(printf '%s' "$input" | jq -r '
  .tool_input.glob_pattern
  // .tool_input.pattern
  // empty
' 2>/dev/null)"
target_dir="$(printf '%s' "$input" | jq -r '.tool_input.target_directory // empty' 2>/dev/null)"

check_paths "$path" "$glob_pattern" "$target_dir"

allow
