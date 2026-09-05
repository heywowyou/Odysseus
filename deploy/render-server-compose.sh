#!/usr/bin/env bash
# Rewrites deploy/compose.yaml's file-relative paths (resolved by Compose
# against the compose file's own directory) into absolute ones, so the
# result is safe to write anywhere else - specifically
# $ODYSSEUS_DEPLOY_COMPOSE_DIR on the VPS (issue #74), a directory required
# by the Hostinger Docker Manager panel and separate from the rsynced repo
# checkout at $ODYSSEUS_DEPLOY_REMOTE_PATH. Kept as its own small, pure
# script (stdin to stdout) so odysseus-deploy.sh's generation step is
# testable without faking ssh or rsync - see render-server-compose.test.sh.
#
# Usage: render-server-compose.sh <remote-repo-path> < deploy/compose.yaml
set -Eeuo pipefail

fail() {
  printf 'render-server-compose.sh: error: %s\n' "$*" >&2
  exit 1
}

[[ $# -eq 1 ]] || fail "usage: render-server-compose.sh <remote-repo-path> < deploy/compose.yaml"
REMOTE_PATH="$1"

GENERATED="$(
  sed \
    -e "s#context: \\.\\.\$#context: ${REMOTE_PATH}#" \
    -e "s#\\.\\./\\.env\\.smoke\$#${REMOTE_PATH}/.env.smoke#" \
    -e "s#\\.\\./\\.env\$#${REMOTE_PATH}/.env#" \
    -e "s#\\./Caddyfile:#${REMOTE_PATH}/deploy/Caddyfile:#"
)"

# A pattern deploy/compose.yaml is later edited to use, that none of the
# substitutions above cover, must fail loudly here rather than silently
# ship a server file that still resolves the old relative path against the
# wrong directory - exactly the failure mode issue #74 reported.
for known_relative_path in 'context: ..' 'path: ../.env' './Caddyfile:'; do
  if grep -qF -- "$known_relative_path" <<<"$GENERATED"; then
    fail "the generated compose file still contains an unrewritten relative path ('$known_relative_path') - add a substitution for it above"
  fi
done

printf '%s\n' "$GENERATED"
