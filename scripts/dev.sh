#!/usr/bin/env bash
# Always run from the repo root, regardless of where this was invoked
# from, so .mcp.json is discovered correctly.
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

set -a
source .env
set +a

exec claude "$@"
