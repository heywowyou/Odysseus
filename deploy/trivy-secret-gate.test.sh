#!/usr/bin/env bash
# Issue #255: proves the release gate's secret scanning actually fires, without
# committing anything that looks like a real credential. The fixture is
# generated into a throwaway temp directory at run time and never touches
# git history.
#
# Keep TRIVY_VERSION in sync with TRIVY_IMAGE in scripts/gate.sh.
set -Eeuo pipefail

TRIVY_VERSION='v0.74.0'

fail() {
  printf 'trivy-secret-gate.test.sh: %s\n' "$*" >&2
  exit 1
}

FIXTURE_DIR="$(mktemp -d)"
LOG_FILE="$(mktemp)"
trap 'rm -rf "$FIXTURE_DIR" "$LOG_FILE"' EXIT

# A PEM private-key block is Trivy's own documented secret-scanning example.
# The base64 body is placeholder text, not a real key, and is never parsed
# as one: Trivy's secret scanner matches the PEM header/footer pattern only.
cat >"$FIXTURE_DIR/synthetic.pem" <<'EOF'
-----BEGIN RSA PRIVATE KEY-----
NOTAREALKEYNOTAREALKEYNOTAREALKEYNOTAREALKEYNOTAREALKEYNOTAREA
LKEYNOTAREALKEYNOTAREALKEYNOTAREALKEYNOTAREALKEYNOTAREALKEYNOT
AREALKEYSYNTHETICFIXTUREFORISSUE255ONLYNOTAREALKEYNOTAREALKEY
-----END RSA PRIVATE KEY-----
EOF

TRIVY_ARGS=(fs --scanners secret --severity HIGH,CRITICAL --exit-code 1)

set +e
if command -v trivy >/dev/null 2>&1; then
  trivy "${TRIVY_ARGS[@]}" "$FIXTURE_DIR" >"$LOG_FILE" 2>&1
  GATE_EXIT=$?
elif command -v docker >/dev/null 2>&1; then
  docker run --rm -v "$FIXTURE_DIR:/scan" "aquasec/trivy:${TRIVY_VERSION#v}" \
    "${TRIVY_ARGS[@]}" /scan >"$LOG_FILE" 2>&1
  GATE_EXIT=$?
else
  fail 'neither trivy nor docker is available; install trivy to reproduce this check locally'
fi
set -e

OUTPUT="$(cat "$LOG_FILE")"

if [ "$GATE_EXIT" -eq 0 ]; then
  printf '%s\n' "$OUTPUT" >&2
  fail 'Trivy did not flag the synthetic private-key fixture; the secret-scanning gate is not working'
fi

if ! grep -qi 'private' <<<"$OUTPUT"; then
  printf '%s\n' "$OUTPUT" >&2
  fail 'Trivy exited non-zero but the output does not mention the expected private-key finding'
fi

printf 'trivy-secret-gate.test.sh: gate correctly flagged the synthetic fixture\n'
