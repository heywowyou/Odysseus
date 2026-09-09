#!/usr/bin/env bash
# Forced command for the GitHub Actions deployment key. It deliberately offers
# no shell and accepts no path or free-form argument controlled by the
# workflow: the only accepted forms are deploy <40-hex-sha> with the release
# archive on standard input, that same command with the single literal token
# force-running appended (it tells the release controller to proceed over
# running jobs), and rollback. Anything else is rejected.
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
    force_running=0
    # The optional token must match exactly and must be last: an extra word
    # or even a trailing space survives into release_id and fails the SHA
    # check below.
    if [[ "$release_id" == *' force-running' ]]; then
      force_running=1
      release_id="${release_id%' force-running'}"
    fi
    [[ "$release_id" =~ ^[0-9a-f]{40}$ ]] || reject
    archive="$(mktemp "/tmp/odysseus-$release_id.XXXXXX.tar.gz")"
    trap 'rm -f -- "$archive"' EXIT
    cat >"$archive"
    [[ -s "$archive" ]] || reject
    if [[ "$force_running" == 1 ]]; then
      export ODYSSEUS_DEPLOY_FORCE_RUNNING=1
    fi
    "$RELEASE_SCRIPT" deploy "$archive" "$release_id"
    ;;
  rollback)
    "$RELEASE_SCRIPT" rollback
    ;;
  *)
    reject
    ;;
esac
