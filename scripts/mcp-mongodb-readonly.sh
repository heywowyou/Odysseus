#!/usr/bin/env bash
# mongodb-readonly MCP server launcher; .mcp.json points here. Reads the one
# variable the server needs, MDB_MCP_CONNECTION_STRING, from .env and passes
# only that on (issue #485): the rest of .env (model key, mailbox tokens,
# bucket keys, dashboard password) never reaches this third-party package.
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

if [ ! -f .env ]; then
  echo "mongodb-readonly MCP: .env not found at repo root; copy .env.example and set MDB_MCP_CONNECTION_STRING" >&2
  exit 1
fi

# Sourced in a subshell, so no other .env variable survives into this
# process or the server's environment.
MDB_MCP_CONNECTION_STRING="$(
  set -a
  # shellcheck disable=SC1091
  source .env >/dev/null 2>&1
  printf '%s' "${MDB_MCP_CONNECTION_STRING:-}"
)"

if [ -z "${MDB_MCP_CONNECTION_STRING:-}" ]; then
  echo "mongodb-readonly MCP: MDB_MCP_CONNECTION_STRING is empty; set it in .env (see .env.example)" >&2
  exit 1
fi

# Pinned, not @latest: npx re-resolves @latest on every start, and several
# sessions/worktrees starting at once then race to install into the same
# ~/.npm/_npx cache directory. That race left the cache half-renamed
# (ENOTEMPTY) and the server died at startup. Bump deliberately.
export MDB_MCP_CONNECTION_STRING
exec npx -y mongodb-mcp-server@3.0.3 --readOnly
