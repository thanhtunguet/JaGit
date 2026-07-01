#!/usr/bin/env bash
# Export CodeBurn data and upload it to the dashboard server.
#
# Runs `npx -y codeburn export`, zips the CSVs, and POSTs them to the server.
#
# Usage:
#   codeburn-upload.sh [options]
#
# Options:
#   -s, --server URL     Dashboard server base URL (env: CODEBURN_SERVER)
#   -u, --username NAME  Username to upload as (default: git config user.name)
#   -k, --api-key KEY    API key for authentication (env: JAGIT_API_KEY)
#   -t, --token TOKEN    API token for authentication (env: CODEBURN_API_TOKEN)
#   -d, --dir PATH       Upload CSVs from this directory instead of running export
#   -h, --help           Show this help
#
set -euo pipefail

DEFAULT_SERVER="https://codeburn.thkathon.cloud"

CSV_FILES=(
  summary.csv
  daily.csv
  activity.csv
  models.csv
  projects.csv
  sessions.csv
  tools.csv
  shell-commands.csv
)

usage() {
  sed -n '2,15p' "$0" | sed 's/^# \?//'
}

urlencode() {
  python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

resolve_username() {
  local user="${1:-}"
  if [[ -n "${user}" ]]; then
    echo "${user}"
    return
  fi

  user="$(git config user.name 2>/dev/null || true)"
  user="${user#"${user%%[![:space:]]*}"}"
  user="${user%"${user##*[![:space:]]}"}"

  if [[ -z "${user}" ]]; then
    echo "error: could not read git user.name; use --username" >&2
    exit 1
  fi
  echo "${user}"
}

run_codeburn_export() {
  local line export_dir="" candidate

  echo "Running: npx -y codeburn export" >&2
  while IFS= read -r line; do
    echo "${line}" >&2
    if [[ "${line}" == *"to: "* ]]; then
      candidate="${line##*to: }"
      candidate="${candidate#"${candidate%%[![:space:]]*}"}"
      candidate="${candidate%"${candidate##*[![:space:]]}"}"
      if [[ -n "${candidate}" ]]; then
        export_dir="${candidate}"
      fi
    fi
  done < <(npx -y codeburn export 2>&3)
  exec 3>&-

  if [[ -z "${export_dir}" ]]; then
    echo "error: could not find exported directory path in codeburn output" >&2
    exit 1
  fi

  echo "Exported to: ${export_dir}" >&2
  echo "${export_dir}"
}

build_zip() {
  local export_dir="$1"
  local zip_path="$2"
  local found=0 name path

  rm -f "${zip_path}"

  for name in "${CSV_FILES[@]}"; do
    path="${export_dir}/${name}"
    if [[ ! -f "${path}" ]]; then
      echo "  skipping ${name} (not found)" >&2
      continue
    fi

    zip -j -q "${zip_path}" "${path}"
    echo "  + ${name} ($(wc -c < "${path}" | tr -d ' ') bytes)"
    found=$((found + 1))
  done

  if [[ "${found}" -eq 0 ]]; then
    echo "error: no CSV files found in ${export_dir}" >&2
    exit 1
  fi

  echo "Zipped ${found} file(s) ($(wc -c < "${zip_path}" | tr -d ' ') bytes)"
}

prompt_remove() {
  local dir="$1"
  local answer

  printf '\nRemove exported directory %s? [y/N] ' "${dir}"
  read -r answer || answer=""
  if [[ "$(printf '%s' "${answer}" | tr '[:upper:]' '[:lower:]')" == "y" ]]; then
    rm -rf "${dir}"
    echo "Removed ${dir}"
  fi
}

server="${CODEBURN_SERVER:-${DEFAULT_SERVER}}"
username=""
api_key="${JAGIT_API_KEY:-}"
token="${CODEBURN_API_TOKEN:-}"
export_dir=""
auto_exported=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--server)
      server="$2"
      shift 2
      ;;
    -u|--username)
      username="$2"
      shift 2
      ;;
    -k|--api-key)
      api_key="$2"
      shift 2
      ;;
    -t|--token)
      token="$2"
      shift 2
      ;;
    -d|--dir)
      export_dir="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

username="$(resolve_username "${username}")"
echo "Uploading as: ${username}"

if [[ -z "${export_dir}" ]]; then
  exec 3>&2
  export_dir="$(run_codeburn_export)"
  auto_exported=1
else
  echo "Using export directory: ${export_dir}"
fi

if [[ ! -d "${export_dir}" ]]; then
  echo "error: export directory not found: ${export_dir}" >&2
  exit 1
fi

zip_path="$(mktemp -t codeburn-export.XXXXXX.zip)"
trap 'rm -f "${zip_path}"' EXIT

build_zip "${export_dir}" "${zip_path}"

upload_url="${server%/}/api/usage/upload"
echo "Uploading to ${upload_url} …"

response_file="$(mktemp)"

curl_args=(
  -sS
  -o "${response_file}"
  -w '%{http_code}'
  -F "username=${username}"
  -F "file=@${zip_path};filename=export.zip"
)

auth_token=""
if [[ -n "${api_key}" ]]; then
  auth_token="${api_key}"
elif [[ -n "${token}" ]]; then
  auth_token="${token}"
fi

if [[ -n "${auth_token}" ]]; then
  curl_args+=(-H "Authorization: Bearer ${auth_token}")
else
  echo "Warning: No API key or token provided. Upload may fail if server requires authentication." >&2
fi

http_code="$(curl "${curl_args[@]}" "${upload_url}")"
response="$(tr -d '\r' < "${response_file}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
rm -f "${response_file}"

if [[ "${http_code}" != "200" && "${http_code}" != "201" ]]; then
  echo "server returned ${http_code}: ${response}" >&2
  exit 1
fi

echo "Done. Server response: ${response}"

if [[ "${auto_exported}" -eq 1 ]]; then
  prompt_remove "${export_dir}"
fi
