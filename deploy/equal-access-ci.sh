#!/usr/bin/env bash
set -euo pipefail

# Secondary accessibility engine for the real operator shell. axe remains the
# primary in-test checker; this catches a different ruleset without adding the
# checker and its browser stack to the workspace lockfile.
PORT="${ODYSSEUS_EQUAL_ACCESS_PORT:-4611}"
BASE="http://127.0.0.1:${PORT}"
LOG="$(mktemp)"
TARGETS="$(mktemp --suffix=.txt)"
SERVER_PID=""

cleanup() {
  if [[ -n "${SERVER_PID}" ]]; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
  rm -f "${LOG}" "${TARGETS}"
}
trap cleanup EXIT

export IBM_TELEMETRY_DISABLED=true
export ODYSSEUS_INTERFACE_HOST=127.0.0.1
export MONGODB_URI="${MONGODB_TEST_URI:-mongodb://127.0.0.1:27018/odysseus_test}"
export MONGODB_DB_NAME="${MONGODB_DB_NAME:-odysseus_test}"

node packages/cli/dist/index.js serve --port "${PORT}" >"${LOG}" 2>&1 &
SERVER_PID=$!

ready=0
for _ in $(seq 1 60); do
  if curl --fail --silent "${BASE}/health/ready" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "${ready}" != "1" ]]; then
  cat "${LOG}" >&2
  echo "odysseus: dashboard did not become ready for Equal Access scan" >&2
  exit 1
fi

# Loopback without a configured dashboard password renders the authenticated
# operator shell by design. This deliberately exercises the real application
# HTML rather than a synthetic accessibility fixture.
printf '%s\n' "${BASE}/" >"${TARGETS}"

# The checker drives Puppeteer, whose own browser download is a second
# Chromium to fetch and needs unzip. Hand it the Playwright Chromium the test
# suites already require instead.
PUPPETEER_EXECUTABLE_PATH="${PUPPETEER_EXECUTABLE_PATH:-$(node -p "require('playwright').chromium.executablePath()")}"
[[ -x "${PUPPETEER_EXECUTABLE_PATH}" ]] || {
  echo "odysseus: no Chromium at ${PUPPETEER_EXECUTABLE_PATH}; run pnpm exec playwright install chromium" >&2
  exit 1
}
export PUPPETEER_EXECUTABLE_PATH
npx --yes --package accessibility-checker@4.0.34 achecker "${TARGETS}"
