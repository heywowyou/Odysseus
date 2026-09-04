#!/usr/bin/env bash
# mongodb-readonly MCP server launcher; .mcp.json points here. Sources .env
# at the point of use so the Atlas read-only credentials reach the server
# even when Claude Code was started with a bare `claude` instead of
# `codysseus` (scripts/dev.sh).
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

if [ ! -f .env ]; then
  echo "mongodb-readonly MCP: .env not found at repo root; copy .env.example and set MDB_MCP_CONNECTION_STRING" >&2
  exit 1
fi

set -a
source .env
set +a

if [ -z "${MDB_MCP_CONNECTION_STRING:-}" ]; then
  echo "mongodb-readonly MCP: MDB_MCP_CONNECTION_STRING is empty; set it in .env (see .env.example)" >&2
  exit 1
fi

exec npx -y mongodb-mcp-server@latest --readOnly
