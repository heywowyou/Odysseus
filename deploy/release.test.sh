#!/usr/bin/env bash
# Focused integration test for the VPS release controller. Docker and curl are
# faked, but the archive extraction, release pointers and rollback state are real.
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT

fail() {
  printf 'release.test.sh: %s\n' "$*" >&2
  exit 1
}

assert_eq() {
  [[ "$1" == "$2" ]] || fail "expected '$2', got '$1'"
}

assert_contains() {
  grep -Fq -- "$2" "$1" || fail "$1 does not contain '$2'"
}

assert_not_contains() {
  if grep -Fq -- "$2" "$1"; then
    fail "$1 unexpectedly contains '$2'"
  fi
}

make_fake_commands() {
  local bin_dir="$1"
  mkdir -p "$bin_dir"

  printf '%s\n' '#!/usr/bin/env bash' \
    'printf "tag=%s %s\\n" "${ODYSSEUS_IMAGE_TAG:-}" "$*" >> "$FAKE_DOCKER_LOG"' \
    'exit 0' >"$bin_dir/docker"
  printf '%s\n' '#!/usr/bin/env bash' \
    'if [[ -n "${FAKE_CURL_FAIL_ONCE_FILE:-}" && ! -e "$FAKE_CURL_FAIL_ONCE_FILE" ]]; then' \
    '  : > "$FAKE_CURL_FAIL_ONCE_FILE"' \
    '  exit 7' \
    'fi' \
    'printf "%s\\n" "$*" >> "$FAKE_CURL_LOG"' \
    'printf "{\"status\":\"ready\",\"database\":\"ok\",\"queue\":\"ok\"}"' >"$bin_dir/curl"
  printf '%s\n' '#!/usr/bin/env bash' 'exit 0' >"$bin_dir/sleep"
  chmod +x "$bin_dir/docker" "$bin_dir/curl" "$bin_dir/sleep"
}

make_legacy_root() {
  local deploy_root="$1"
  mkdir -p "$deploy_root/deploy"
  printf 'test-only=true\n' >"$deploy_root/.env"
  printf 'services: {}\n' >"$deploy_root/deploy/compose.yaml"
  cp "$REPO_ROOT/deploy/release.sh" "$deploy_root/deploy/release.sh"
  cp "$REPO_ROOT/deploy/github-deploy-command.sh" \
    "$deploy_root/deploy/github-deploy-command.sh"
  cp "$REPO_ROOT/deploy/install-github-deploy-key.sh" \
    "$deploy_root/deploy/install-github-deploy-key.sh"
}

make_release_archive() {
  local destination="$1"
  local source_dir="$TEST_ROOT/archive-source"
  rm -rf -- "$source_dir"
  mkdir -p "$source_dir/deploy"
  printf 'FROM scratch\n' >"$source_dir/Dockerfile"
  printf 'services: {}\n' >"$source_dir/deploy/compose.yaml"
  printf ':80 {}\n' >"$source_dir/deploy/Caddyfile"
  cp "$REPO_ROOT/deploy/release.sh" "$source_dir/deploy/release.sh"
  cp "$REPO_ROOT/deploy/github-deploy-command.sh" \
    "$source_dir/deploy/github-deploy-command.sh"
  cp "$REPO_ROOT/deploy/install-github-deploy-key.sh" \
    "$source_dir/deploy/install-github-deploy-key.sh"
  tar -czf "$destination" -C "$source_dir" .
}

run_controller() {
  local deploy_root="$1"
  shift
  PATH="$TEST_ROOT/bin:$PATH" \
    FAKE_DOCKER_LOG="$TEST_ROOT/docker.log" \
    ODYSSEUS_DEPLOY_ROOT="$deploy_root" \
    ODYSSEUS_DEPLOY_HEALTH_ATTEMPTS=1 \
    ODYSSEUS_DEPLOY_HEALTH_DELAY_SECONDS=0 \
    "$REPO_ROOT/deploy/release.sh" "$@"
}

make_fake_commands "$TEST_ROOT/bin"
: >"$TEST_ROOT/docker.log"
export FAKE_CURL_LOG="$TEST_ROOT/curl.log"
ARCHIVE="$TEST_ROOT/release.tar.gz"
RELEASE_ID=0123456789abcdef0123456789abcdef01234567
make_release_archive "$ARCHIVE"

DEPLOY_ROOT="$TEST_ROOT/production"
make_legacy_root "$DEPLOY_ROOT"

# Six pre-existing releases with staggered mtimes: the five most recent keep
# their trees, the oldest is deleted outright, and none of them may keep its
# image once the deploy finishes (only current and previous earn an image).
STALE_IDS=(
  1111111111111111111111111111111111111111
  2222222222222222222222222222222222222222
  3333333333333333333333333333333333333333
  4444444444444444444444444444444444444444
  5555555555555555555555555555555555555555
  6666666666666666666666666666666666666666
)
for index in "${!STALE_IDS[@]}"; do
  stale_id="${STALE_IDS[$index]}"
  mkdir -p "$DEPLOY_ROOT/releases/$stale_id"
  printf '%s\n' "$stale_id" >"$DEPLOY_ROOT/releases/$stale_id/.odysseus-release"
  touch -d "2020-01-$((index + 1)) 12:00:00" "$DEPLOY_ROOT/releases/$stale_id"
done

run_controller "$DEPLOY_ROOT" deploy "$ARCHIVE" "$RELEASE_ID"

assert_eq "$(readlink -f "$DEPLOY_ROOT/current")" "$DEPLOY_ROOT/releases/$RELEASE_ID"
assert_eq "$(<"$DEPLOY_ROOT/previous-release")" "$DEPLOY_ROOT"
assert_eq "$(readlink "$DEPLOY_ROOT/releases/$RELEASE_ID/.env")" "$DEPLOY_ROOT/.env"
assert_contains "$TEST_ROOT/docker.log" "tag=$RELEASE_ID"
assert_contains "$TEST_ROOT/docker.log" 'up -d --remove-orphans'

[[ ! -e "$DEPLOY_ROOT/releases/${STALE_IDS[0]}" ]] ||
  fail 'the oldest stale release was not pruned'
for index in 1 2 3 4 5; do
  [[ -d "$DEPLOY_ROOT/releases/${STALE_IDS[$index]}" ]] ||
    fail "retained stale release ${STALE_IDS[$index]} was deleted"
done
for stale_id in "${STALE_IDS[@]}"; do
  assert_contains "$TEST_ROOT/docker.log" "image rm odysseus-app:$stale_id"
done
assert_not_contains "$TEST_ROOT/docker.log" "image rm odysseus-app:$RELEASE_ID"
assert_contains "$TEST_ROOT/docker.log" 'image prune -f'
assert_contains "$TEST_ROOT/docker.log" 'builder prune -f -a --keep-storage 4GB'

# The live check must pin the domain to this machine: a plain request follows
# public DNS and can green-light a deploy against a different box (2026-09-09).
assert_contains "$FAKE_CURL_LOG" '--resolve app.odysseusaudit.com:443:127.0.0.1'
assert_contains "$FAKE_CURL_LOG" 'https://app.odysseusaudit.com/health/ready'

run_controller "$DEPLOY_ROOT" rollback
assert_eq "$(readlink -f "$DEPLOY_ROOT/current")" "$DEPLOY_ROOT"
assert_eq "$(<"$DEPLOY_ROOT/previous-release")" "$DEPLOY_ROOT/releases/$RELEASE_ID"
assert_eq "$(grep -Fc 'https://app.odysseusaudit.com/health/ready' "$FAKE_CURL_LOG")" 2

FAILED_ROOT="$TEST_ROOT/failed-production"
make_legacy_root "$FAILED_ROOT"
export FAKE_CURL_FAIL_ONCE_FILE="$TEST_ROOT/curl-failed-once"
if run_controller "$FAILED_ROOT" deploy "$ARCHIVE" "$RELEASE_ID"; then
  fail 'a failed first health check unexpectedly reported a successful deployment'
fi
unset FAKE_CURL_FAIL_ONCE_FILE
[[ ! -e "$FAILED_ROOT/current" ]] || fail 'failed deployment changed the current pointer'
assert_contains "$TEST_ROOT/docker.log" "$FAILED_ROOT/deploy/compose.yaml up -d --no-build"

if SSH_ORIGINAL_COMMAND='cat /srv/odysseus/.env' \
  ODYSSEUS_DEPLOY_ROOT="$DEPLOY_ROOT" \
  "$REPO_ROOT/deploy/github-deploy-command.sh"; then
  fail 'the restricted SSH command accepted an arbitrary command'
fi

AUTHORIZED_KEYS="$TEST_ROOT/authorized_keys"
printf 'ssh-ed25519 AAAAC3NzaExisting operator' >"$AUTHORIZED_KEYS"
printf 'ssh-ed25519 AAAAC3NzaDeploy github-actions-production-deploy\n' |
  ODYSSEUS_AUTHORIZED_KEYS="$AUTHORIZED_KEYS" \
  ODYSSEUS_DEPLOY_FORCED_COMMAND='/srv/odysseus/deploy/github-deploy-command.sh' \
  "$REPO_ROOT/deploy/install-github-deploy-key.sh"
assert_eq "$(wc -l <"$AUTHORIZED_KEYS" | tr -d ' ')" 2
assert_contains "$AUTHORIZED_KEYS" 'AAAAC3NzaExisting operator'
assert_contains "$AUTHORIZED_KEYS" \
  'restrict,command="/srv/odysseus/deploy/github-deploy-command.sh" ssh-ed25519 AAAAC3NzaDeploy'

# Reinstalling the same key is idempotent.
printf 'ssh-ed25519 AAAAC3NzaDeploy github-actions-production-deploy\n' |
  ODYSSEUS_AUTHORIZED_KEYS="$AUTHORIZED_KEYS" \
  "$REPO_ROOT/deploy/install-github-deploy-key.sh"
assert_eq "$(wc -l <"$AUTHORIZED_KEYS" | tr -d ' ')" 2

printf 'release.test.sh: all checks passed\n'
