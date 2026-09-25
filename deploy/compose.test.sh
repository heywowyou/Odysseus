#!/usr/bin/env bash
# Static checks for deploy/compose.yaml and its smoke overlay: the app's
# crawl-knob anchor, its CPU cap, its unpublished port, the isolation profile
# it must never claim, and that no service runs a command the image lacks.
#
# Issue #525: the plan 059 scan service ran `scan-service`, a CLI command that
# never existed, so a full `docker compose up` crash-looped it. It was removed
# (trade-off 101's amendment); check 1 keeps it from coming back unbuilt.
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="$REPO_ROOT/deploy/compose.yaml"
SMOKE="$REPO_ROOT/deploy/compose.smoke.yaml"

fail() {
  printf 'compose.test.sh: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  local haystack="$1" needle="$2"
  if [[ -f "$haystack" ]]; then
    grep -Fq -- "$needle" "$haystack" || fail "$3"
  else
    grep -Fq -- "$needle" <<<"$haystack" || fail "$3"
  fi
}

assert_not_contains() {
  local haystack="$1" needle="$2"
  if [[ -f "$haystack" ]]; then
    if grep -Fq -- "$needle" "$haystack"; then
      fail "$3"
    fi
  elif grep -Fq -- "$needle" <<<"$haystack"; then
    fail "$3"
  fi
}

# A top-level service block: from the "  name:" line to the next line at the
# same two-space indent, or end of file.
service_block() {
  local file="$1" service="$2"
  awk -v svc="$service" '
    $0 == "  " svc ":" { inblock = 1; print; next }
    inblock && /^  [A-Za-z0-9_-]+:$/ { inblock = 0 }
    inblock { print }
  ' "$file"
}

# The block with full-line comments removed: what compose would actually see
# as configuration, as opposed to what the file documents in prose.
effective_block() {
  service_block "$1" "$2" | grep -v '^[[:space:]]*#'
}

APP_EFFECTIVE="$(effective_block "$COMPOSE" app)"
ANCHOR_BLOCK="$(awk '/^x-crawl-knobs:/{inblock=1;next} inblock && /^[^ ]/{inblock=0} inblock{print}' "$COMPOSE")"

# 1. Every service command exists. The only CLI entry the image runs is the
#    app's default; a service whose command names a subcommand the CLI does
#    not register must not ship (issue #525).
while IFS= read -r subcommand; do
  [[ -n "$subcommand" ]] || continue
  grep -rqsE "\\.command\\('${subcommand}'" "$REPO_ROOT/packages/cli/src" ||
    fail "a compose service runs 'odysseus $subcommand', which packages/cli/src does not define"
done < <(grep -v '^[[:space:]]*#' "$COMPOSE" "$SMOKE" |
  grep -oE "packages/cli/dist/index.js', '[a-z:-]+'" | sed -E "s/.*', '([a-z:-]+)'/\\1/" | sort -u)
for file in "$COMPOSE" "$SMOKE"; do
  if [[ -n "$(service_block "$file" scan)" ]]; then
    fail "$file defines a scan service again; its command does not exist (issue #525)"
  fi
done

# 2. The app is never published: Caddy is the only front.
assert_contains "$APP_EFFECTIVE" "expose:" "app does not document its internal port"
assert_not_contains "$APP_EFFECTIVE" "ports:" "app publishes ports; Caddy must be the only front"

# 3. The artifacts volume.
assert_contains "$APP_EFFECTIVE" 'artifacts:/data/artifacts' \
  "app service does not mount the artifacts volume"

# 4. The app runs every audit's Chromium, so it carries a CPU cap: without one
#    a long audit gets the whole VPS throttled by the host.
assert_contains "$APP_EFFECTIVE" 'cpus: ${ODYSSEUS_APP_CPUS:-' \
  "app service does not set an overridable cpus cap"

# 5. The crawl knobs are defined once in the anchor and merged into the app.
for knob in MAX_PAGES MAX_CRAWL_DEPTH CRAWL_DELAY_MS SCAN_CONCURRENCY \
  PAGE_TIMEOUT_MS LIGHTHOUSE_TIMEOUT_MS RENDER_SETTLE_TIMEOUT_MS; do
  assert_contains "$ANCHOR_BLOCK" "$knob" "crawl-knob anchor is missing $knob"
done
assert_contains "$ANCHOR_BLOCK" "MAX_PAGES: ''" \
  "MAX_PAGES must stay pinned to '' (code-owned unlimited sentinel) in the anchor"
assert_contains "$ANCHOR_BLOCK" "MAX_CRAWL_DEPTH: ''" \
  "MAX_CRAWL_DEPTH must stay pinned to '' (code-owned unlimited sentinel) in the anchor"
assert_contains "$APP_EFFECTIVE" '<<: *crawl-knobs' \
  "app service does not merge the shared crawl-knob anchor"

# 6. The app never claims an isolation profile: it runs Chromium next to
#    every secret, which is trade-off 92's accepted risk, not an isolation.
assert_not_contains "$APP_EFFECTIVE" "ODYSSEUS_BROWSER_ISOLATION_PROFILE" \
  "app sets an isolation profile; app must keep failing any preflight it were to run"

# 7. The smoke overlay loads .env.smoke and publishes nothing new.
SMOKE_APP_EFFECTIVE="$(effective_block "$SMOKE" app)"
assert_contains "$SMOKE_APP_EFFECTIVE" '../.env.smoke' "smoke overlay does not load .env.smoke"
assert_not_contains "$SMOKE_APP_EFFECTIVE" "ports:" "smoke app publishes ports"

# 7b. Both Caddy sites compress responses (issue #512): the dashboard's
#     JSON polls and script bundle otherwise travel uncompressed.
for caddyfile in "$REPO_ROOT/deploy/Caddyfile" "$REPO_ROOT/deploy/Caddyfile.smoke"; do
  grep -Eq '^[[:space:]]*encode zstd gzip$' "$caddyfile" ||
    fail "$(basename "$caddyfile") does not compress responses"
done

# 8. Structural validation with docker compose when it exists (CI has it):
#    the line checks above cannot prove the file still parses, the anchor
#    still merges, and the interpolation still resolves.
if docker compose version >/dev/null 2>&1; then
  docker compose -f "$COMPOSE" config --quiet ||
    fail "docker compose rejects deploy/compose.yaml"
  docker compose -f "$COMPOSE" -f "$SMOKE" config --quiet ||
    fail "docker compose rejects the compose.yaml + compose.smoke.yaml overlay"
else
  printf 'compose.test.sh: docker compose not available; skipped structural validation\n' >&2
fi

printf 'compose.test.sh: all checks passed\n'
