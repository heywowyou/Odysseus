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

# The release gate reads git state, so git is pointed at a throwaway
# one-commit repository: the result never depends on the real checkout's
# commit or uncommitted edits. rsync is faked, so its content is irrelevant.
GATE_REPO="$TEST_ROOT/gate-repo"
mkdir -p "$GATE_REPO"
git -C "$GATE_REPO" init -q
git -C "$GATE_REPO" -c user.name=test -c user.email=test@example.invalid \
  commit -q --allow-empty -m 'gate fixture'
export GIT_DIR="$GATE_REPO/.git" GIT_WORK_TREE="$GATE_REPO"
GATE_COMMIT="$(git rev-parse HEAD)"

export FAKE_SSH_LOG="$TEST_ROOT/ssh.log"
export FAKE_RSYNC_LOG="$TEST_ROOT/rsync.log"
export FAKE_BUILD_ID="$(git rev-parse --short HEAD)"

run_deploy() {
  : >"$FAKE_SSH_LOG"
  : >"$FAKE_RSYNC_LOG"
  PATH="$TEST_ROOT/bin:$PATH" \
    ODYSSEUS_DEPLOY_CONFIG_FILE="$CONFIG_FILE" \
    "$REPO_ROOT/deploy/odysseus-deploy.sh" 2>"$TEST_ROOT/stderr.log"
}

assert_refused() {
  if run_deploy; then fail "deployed although $1"; fi
  assert_contains "$TEST_ROOT/stderr.log" "$2"
  [[ ! -s "$FAKE_SSH_LOG" && ! -s "$FAKE_RSYNC_LOG" ]] || fail "reached the server although $1"
}

assert_refused 'the commit never passed the gate' 'has not passed pnpm run gate'

mkdir -p "$GATE_REPO/.git/odysseus-gate"
printf '2026-09-25T00:00:00Z\n' >"$GATE_REPO/.git/odysseus-gate/$GATE_COMMIT"
: >"$GATE_REPO/uncommitted"
assert_refused 'the working tree is dirty' 'uncommitted changes'
rm "$GATE_REPO/uncommitted"

rm "$GATE_REPO/.git/odysseus-gate/$GATE_COMMIT"
ODYSSEUS_DEPLOY_SKIP_GATE=1 run_deploy >/dev/null || fail 'the logged override did not deploy'
assert_contains "$TEST_ROOT/stderr.log" 'without checking the release gate'

printf '2026-09-25T00:00:00Z\n' >"$GATE_REPO/.git/odysseus-gate/$GATE_COMMIT"
run_deploy >/dev/null || fail 'a clean commit that passed the gate did not deploy'
assert_contains "$TEST_ROOT/stderr.log" "release gate passed for $GATE_COMMIT"

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
