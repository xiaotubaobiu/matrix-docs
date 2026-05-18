#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLE_PATH="${SCRIPT_DIR}/mcp.example.json"

if [[ ! -f "${EXAMPLE_PATH}" ]]; then
  printf 'Missing example config: %s\n' "${EXAMPLE_PATH}" >&2
  exit 1
fi

printf 'Guidance script only: no files were modified.\n'
printf 'Example config found: %s\n' "${EXAMPLE_PATH}"
printf 'Next step: copy this example into your Codex MCP configuration and replace Bearer <token>.\n'
