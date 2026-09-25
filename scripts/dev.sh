#!/usr/bin/env bash
# Always run from the repo root, regardless of where this was invoked
# from, so .mcp.json is discovered correctly.
#
# .env is deliberately not exported into the session (issue #485): every
# tool call, subagent and MCP server would inherit every production secret,
# and a prompt injection in a browsed page would need one `env` call to read
# them. The packages load .env themselves where they need it
# (process.loadEnvFile in packages/llm and packages/scanner config), and the
# Mongo MCP launcher passes on its one variable.
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

exec claude "$@"
