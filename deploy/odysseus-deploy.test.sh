#!/usr/bin/env bash
# Focused integration test for the Hostinger deployment helper. SSH and rsync
# are faked, while the helper's generated compose file uses the real renderer.
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT

fail() {
  printf 'odysseus-deploy.test.sh: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  grep -Fq -- "$2" "$1" || fail "$1 does not contain '$2'"
}

assert_appears_after() {
  local earlier_line later_line
  earlier_line="$(grep -nF -- "$2" "$1" | head -n 1 | cut -d: -f1)"
  later_line="$(grep -nF -- "$3" "$1" | head -n 1 | cut -d: -f1)"
  [[ -n "$earlier_line" && -n "$later_line" && "$later_line" -gt "$earlier_line" ]] ||
    fail "'$3' does not appear after '$2' in $1"
}

make_fake_commands() {
  local bin_dir="$1"
  mkdir -p "$bin_dir"

  printf '%s\n' '#!/usr/bin/env bash' \
    'printf "%s\\n" "$*" >> "$FAKE_SSH_LOG"' \
    'case "$*" in' \
    '  *"printenv ODYSSEUS_BUILD_ID"*) printf "%s\\n" "$FAKE_BUILD_ID" ;;' \
    'esac' >"$bin_dir/ssh"
  printf '%s\n' '#!/usr/bin/env bash' \
    'printf "%s\\n" "$*" >> "$FAKE_RSYNC_LOG"' >"$bin_dir/rsync"
  chmod +x "$bin_dir/ssh" "$bin_dir/rsync"
}

make_fake_commands "$TEST_ROOT/bin"
CONFIG_FILE="$TEST_ROOT/deploy.env"
printf '%s\n' \
  'ODYSSEUS_DEPLOY_HOST=deploy@vps.example' \
  'ODYSSEUS_DEPLOY_SSH_KEY=/test/odysseus-key' \
  'ODYSSEUS_DEPLOY_REMOTE_PATH=/srv/odysseus' \
  'ODYSSEUS_DEPLOY_COMPOSE_DIR=/docker/odysseus' \
  'ODYSSEUS_DEPLOY_COMPOSE_PROJECT=odysseus' \
  'ODYSSEUS_DEPLOY_BUILD_CACHE_KEEP=4GB' >"$CONFIG_FILE"

export FAKE_SSH_LOG="$TEST_ROOT/ssh.log"
export FAKE_RSYNC_LOG="$TEST_ROOT/rsync.log"
export FAKE_BUILD_ID="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
: >"$FAKE_SSH_LOG"
: >"$FAKE_RSYNC_LOG"

PATH="$TEST_ROOT/bin:$PATH" \
  ODYSSEUS_DEPLOY_CONFIG_FILE="$CONFIG_FILE" \
  "$REPO_ROOT/deploy/odysseus-deploy.sh" >/dev/null

assert_contains "$FAKE_RSYNC_LOG" '/srv/odysseus/'
# rsync --delete removes server-only files unless they are excluded (#484):
# the restic credentials live next to the checkout, and a local smoke env
# file must never be copied into production.
for server_only in /.env.smoke /.restic.env /.restic-password; do
  assert_contains "$FAKE_RSYNC_LOG" "--exclude $server_only"
done
assert_contains "$FAKE_SSH_LOG" 'docker compose -p '\''odysseus'\'' -f '\''/docker/odysseus/docker-compose.yml'\'' build app'
assert_contains "$FAKE_SSH_LOG" 'docker image prune -f && docker builder prune -f -a --keep-storage '\''4GB'\'''
assert_appears_after "$FAKE_SSH_LOG" 'printenv ODYSSEUS_BUILD_ID' 'docker builder prune -f -a'

printf 'odysseus-deploy.test.sh: all checks passed\n'
