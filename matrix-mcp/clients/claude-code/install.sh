#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLE_PATH="${SCRIPT_DIR}/mcp.example.json"
TARGET="${HOME}/.claude.json"

if [[ ! -f "${EXAMPLE_PATH}" ]]; then
  printf 'Missing example config: %s\n' "${EXAMPLE_PATH}" >&2
  exit 1
fi

printf 'Guidance script only: no files were modified.\n'
printf 'Example config found: %s\n' "${EXAMPLE_PATH}"
printf 'Suggested Claude Code config target: %s\n' "${TARGET}"
printf 'Next step: copy the example into your MCP config and replace Bearer <token>.\n'
