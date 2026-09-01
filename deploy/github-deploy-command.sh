#!/usr/bin/env bash
# Forced command for the GitHub Actions deployment key. It deliberately offers
# no shell and accepts no path or argument controlled by the workflow.
set -Eeuo pipefail

DEPLOY_ROOT="${ODYSSEUS_DEPLOY_ROOT:-/srv/odysseus}"
RELEASE_SCRIPT="$DEPLOY_ROOT/deploy/release.sh"

reject() {
  printf 'GitHub deployment key: command rejected\n' >&2
  exit 1
}

case "${SSH_ORIGINAL_COMMAND:-}" in
  deploy\ [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]* )
    release_id="${SSH_ORIGINAL_COMMAND#deploy }"
    [[ "$release_id" =~ ^[0-9a-f]{40}$ ]] || reject
    archive="$(mktemp "/tmp/odysseus-$release_id.XXXXXX.tar.gz")"
    trap 'rm -f -- "$archive"' EXIT
    cat >"$archive"
    [[ -s "$archive" ]] || reject
    "$RELEASE_SCRIPT" deploy "$archive" "$release_id"
    ;;
  rollback)
    "$RELEASE_SCRIPT" rollback
    ;;
  *)
    reject
    ;;
esac
