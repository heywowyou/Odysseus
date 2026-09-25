#!/usr/bin/env bash
# The release gate: everything the GitHub Actions CI used to run, run on this
# machine instead (trade-off 120). GitHub only versions the repository now.
#
#   pnpm run gate
#
# Steps, in CI's old order: the static check, both builds, the IBM Equal
# Access secondary accessibility engine, the deploy-script tests, the full
# test suite against the replica-set test MongoDB, the Trivy filesystem gate
# and its self-test, the custom Semgrep rules, and the Trivy gate over the
# production image. Needs Docker and Playwright's Chromium.
#
# A pass is recorded against the exact commit, and deploy/odysseus-deploy.sh
# refuses to ship a commit without one. The gate therefore refuses a dirty
# working tree: a pass must describe a commit, not uncommitted edits.
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

# Keep in sync with deploy/trivy-secret-gate.test.sh and
# docs/agents/coding-conventions.md, "Security scanning".
TRIVY_IMAGE='aquasec/trivy:0.74.0'
SEMGREP_IMAGE='semgrep/semgrep:1.145.0'
TRIVY_SKIP_DIRS='node_modules,.agents,.claude,.codex,.zcode,data,artifacts,reports,coverage,.pnpm-store'
TRIVY_SKIP_FILES='.env,.env.smoke,.restic.env,.restic-password'
SCAN_IMAGE='odysseus-app:gate-scan'

step() {
  printf '\n== gate: %s\n' "$*"
}

fail() {
  printf 'gate: %s\n' "$*" >&2
  exit 1
}

[[ -z "$(git status --porcelain)" ]] ||
  fail 'the working tree has uncommitted changes; commit or stash them, then rerun'
COMMIT="$(git rev-parse HEAD)"
PASS_DIR="$(git rev-parse --git-common-dir)/odysseus-gate"

export MONGODB_TEST_URI='mongodb://localhost:27018/odysseus_test'
# An unreachable test database fails the run instead of skipping the store
# tier, as it did in CI.
export REQUIRE_MONGO_TESTS=1
export IBM_TELEMETRY_DISABLED=true

step 'static check'
pnpm run check

step 'test MongoDB (single-node replica set)'
pnpm run test:store:up

step 'build'
pnpm --filter @odysseus/cli... run build
pnpm --filter @odysseus/site run build

step 'IBM Equal Access secondary accessibility engine'
bash deploy/equal-access-ci.sh

step 'deploy script tests'
pnpm run test:deploy

step 'full test suite'
pnpm run test:all

step 'Trivy filesystem gate (HIGH/CRITICAL with a known fix)'
docker run --rm -v "$PWD":/repo:ro -w /repo "$TRIVY_IMAGE" fs \
  --scanners vuln,secret,misconfig \
  --skip-dirs "$TRIVY_SKIP_DIRS" --skip-files "$TRIVY_SKIP_FILES" \
  --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 \
  --ignorefile .trivyignore.yaml /repo
bash deploy/trivy-secret-gate.test.sh

step 'custom Semgrep rules'
python3 .semgrep/test-rules.py "$SEMGREP_IMAGE"
docker run --rm -v "$PWD":/src "$SEMGREP_IMAGE" \
  semgrep scan --config /src/.semgrep/rules --error /src/packages /src/scripts

step 'Trivy production image gate (HIGH/CRITICAL with a known fix)'
docker build -t "$SCAN_IMAGE" .
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$PWD":/repo:ro -w /repo \
  "$TRIVY_IMAGE" image \
  --scanners vuln,secret,misconfig \
  --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 \
  --ignorefile .trivyignore.yaml "$SCAN_IMAGE"
docker image rm "$SCAN_IMAGE" >/dev/null

[[ "$(git rev-parse HEAD)" == "$COMMIT" && -z "$(git status --porcelain)" ]] ||
  fail 'the checkout changed while the gate ran; rerun it on the commit to ship'
mkdir -p "$PASS_DIR"
date -u '+%Y-%m-%dT%H:%M:%SZ' >"$PASS_DIR/$COMMIT"
step "passed for $COMMIT"
