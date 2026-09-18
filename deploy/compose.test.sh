#!/usr/bin/env bash
# Plan 059 slice 4: static checks for the scan service in deploy/compose.yaml
# and its smoke overlay. The scan container's whole isolation claim is a
# property of THIS file (plan 059 section 7: "the gate checks shape, the
# deployment review checks this list"), so the properties are asserted here,
# not hoped for: no published ports, no env_file, the exact section 2.1
# environment allow-list, the shared artifacts volume, the section 6/7
# hardening, and an app block that stays on the in-process path with the
# service URL unset.
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

# The environment variable names of a service block: keys at the environment
# entry indent, all of which this file writes in caps.
env_names() {
  effective_block "$1" "$2" | grep -oE '^ {6}[A-Z][A-Z0-9_]*:' | tr -d ' :' | sort -u
}

APP_BLOCK="$(service_block "$COMPOSE" app)"
APP_EFFECTIVE="$(effective_block "$COMPOSE" app)"
SCAN_BLOCK="$(service_block "$COMPOSE" scan)"
SCAN_EFFECTIVE="$(effective_block "$COMPOSE" scan)"
ANCHOR_BLOCK="$(awk '/^x-crawl-knobs:/{inblock=1;next} inblock && /^[^ ]/{inblock=0} inblock{print}' "$COMPOSE")"

# 1. The scan service runs the documented command on the same image as app.
assert_contains "$SCAN_BLOCK" 'image: odysseus-app:' \
  "scan service does not use the app image"
assert_contains "$SCAN_EFFECTIVE" 'scan-service' \
  "scan service does not run the scan-service command"

# 2. Nothing is published. expose documents the internal port; ports would
#    put the service on the host (plan 059 section 6).
assert_contains "$SCAN_EFFECTIVE" "expose:" "scan service does not expose its internal port"
assert_not_contains "$SCAN_EFFECTIVE" "ports:" \
  "scan service publishes ports; the app must reach it over the compose network only"

# 3. No env_file: the container's environment is exactly the explicit
#    allow-list below, never a .env passthrough (plan 059 section 2.1).
assert_not_contains "$SCAN_EFFECTIVE" "env_file:" \
  "scan service declares an env_file; section 2.1 forbids any"
assert_not_contains "$SCAN_BLOCK" "../.env" \
  "scan service block references the operator .env"

# 4. The environment allow-list, exactly (plan 059 section 2.1).
ALLOWED_SCAN_ENV=(
  MAX_PAGES MAX_CRAWL_DEPTH CRAWL_DELAY_MS SCAN_CONCURRENCY
  PAGE_TIMEOUT_MS LIGHTHOUSE_TIMEOUT_MS RENDER_SETTLE_TIMEOUT_MS
  ODYSSEUS_ARTIFACTS_ROOT ODYSSEUS_CHROMIUM_EXTRA_ARGS
  ODYSSEUS_BROWSER_ISOLATION_PROFILE
  ODYSSEUS_SCAN_SERVICE_TOKEN ODYSSEUS_SCAN_SERVICE_HOST ODYSSEUS_SCAN_SERVICE_PORT
  CRUX_API_KEY
)
while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  found=''
  for allowed in "${ALLOWED_SCAN_ENV[@]}"; do
    [[ "$name" == "$allowed" ]] && found='yes' && break
  done
  [[ -n "$found" ]] || fail "scan service sets non-allow-listed environment variable '$name'"
done < <(env_names "$COMPOSE" scan)
for required in ODYSSEUS_ARTIFACTS_ROOT ODYSSEUS_CHROMIUM_EXTRA_ARGS \
  ODYSSEUS_BROWSER_ISOLATION_PROFILE ODYSSEUS_SCAN_SERVICE_TOKEN \
  ODYSSEUS_SCAN_SERVICE_HOST ODYSSEUS_SCAN_SERVICE_PORT; do
  assert_contains "$SCAN_EFFECTIVE" "$required" \
    "scan service is missing required section 2.1 variable $required"
done
# Forbidden by name: each is the reason the profile claim would be a lie.
for forbidden in MONGODB_URI MONGODB_DB_NAME OPENAI_API_KEY ODYSSEUS_DASHBOARD_PASSWORD_HASH \
  SENTRY_DSN ODYSSEUS_ARTIFACTS_BUCKET_ ODYSSEUS_PREVIEW_BUCKET_ ODYSSEUS_MAILBOX_ LANGFUSE_; do
  assert_not_contains "$SCAN_EFFECTIVE" "$forbidden" \
    "scan service sets forbidden credential variable $forbidden"
done
# The token arrives by interpolation, empty by default, so an unconfigured
# deployment provisions nothing and the service must fail closed.
assert_contains "$SCAN_EFFECTIVE" 'ODYSSEUS_SCAN_SERVICE_TOKEN: ${ODYSSEUS_SCAN_SERVICE_TOKEN:-}' \
  "scan service token is not wired through compose interpolation with an empty default"

# 5. The shared artifacts volume: both services mount the SAME named volume,
#    because the lease and the crawl checkpoint are file protocols across the
#    boundary (plan 059 sections 2 and 3.4).
assert_contains "$SCAN_EFFECTIVE" 'artifacts:/data/artifacts' \
  "scan service does not mount the shared artifacts volume"
assert_contains "$APP_EFFECTIVE" 'artifacts:/data/artifacts' \
  "app service does not mount the shared artifacts volume"

# 6. Section 6/7 hardening on the scan service.
assert_contains "$SCAN_EFFECTIVE" "cap_drop:" "scan service does not declare cap_drop"
assert_contains "$SCAN_EFFECTIVE" "- ALL" "scan service does not drop ALL capabilities"
assert_contains "$SCAN_EFFECTIVE" "no-new-privileges" \
  "scan service does not set no-new-privileges"
for limit in pids_limit mem_limit cpus shm_size; do
  assert_contains "$SCAN_EFFECTIVE" "$limit" "scan service does not set $limit"
done

# 7. The crawl knobs are defined once in the anchor and merged into BOTH
#    services, so the clamp ceiling cannot drift across the boundary
#    (plan 059 section 2.1).
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
assert_contains "$SCAN_EFFECTIVE" '<<: *crawl-knobs' \
  "scan service does not merge the shared crawl-knob anchor"

# 8. The app stays on the in-process path by default: the flag gate is
#    documented in the file but set nowhere, and the isolation profile is
#    never set on app (plan 059 sections 2.1, 5 and 8).
assert_contains "$APP_BLOCK" "ODYSSEUS_SCAN_SERVICE_URL" \
  "app block lost the documented scan-service URL wiring"
assert_not_contains "$APP_EFFECTIVE" "ODYSSEUS_SCAN_SERVICE_URL" \
  "app sets ODYSSEUS_SCAN_SERVICE_URL; the committed default must leave it unset"
assert_not_contains "$APP_EFFECTIVE" "ODYSSEUS_BROWSER_ISOLATION_PROFILE" \
  "app sets an isolation profile; app must keep failing any preflight it were to run"

# 9. The smoke overlay: a fixed fake token on the scan service, no published
#    ports, and the app still on the flag-unset default path.
SMOKE_SCAN_EFFECTIVE="$(effective_block "$SMOKE" scan)"
SMOKE_APP_EFFECTIVE="$(effective_block "$SMOKE" app)"
assert_contains "$SMOKE_SCAN_EFFECTIVE" 'ODYSSEUS_SCAN_SERVICE_TOKEN: smoke-scan-service-token' \
  "smoke overlay does not give the scan service its fake smoke token"
assert_not_contains "$SMOKE_SCAN_EFFECTIVE" "ports:" "smoke scan service publishes ports"
assert_not_contains "$SMOKE_APP_EFFECTIVE" "ODYSSEUS_SCAN_SERVICE_URL" \
  "smoke app sets ODYSSEUS_SCAN_SERVICE_URL; the default smoke rehearses the flag-unset path"

# 10. Structural validation with docker compose when it exists (CI and this
#     machine have it): the line checks above cannot prove the file still
#     parses, the anchor still merges, and the interpolation still resolves.
if docker compose version >/dev/null 2>&1; then
  docker compose -f "$COMPOSE" config --quiet ||
    fail "docker compose rejects deploy/compose.yaml"
  docker compose -f "$COMPOSE" -f "$SMOKE" config --quiet ||
    fail "docker compose rejects the compose.yaml + compose.smoke.yaml overlay"
else
  printf 'compose.test.sh: docker compose not available; skipped structural validation\n' >&2
fi

printf 'compose.test.sh: all checks passed\n'
