#!/usr/bin/env bash
# Issue #74: the server compose file used to be a hand-copied fork of
# deploy/compose.yaml that silently drifted. render-server-compose.sh
# derives it instead; this test checks the path rewriting directly, no
# ssh/rsync faking needed.
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$REPO_ROOT/deploy/render-server-compose.sh"

fail() {
  printf 'render-server-compose.test.sh: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  grep -Fq -- "$2" <<<"$1" || fail "output does not contain '$2'"
}

assert_not_contains() {
  if grep -Fq -- "$2" <<<"$1"; then
    fail "output unexpectedly contains '$2'"
  fi
}

# 1. Rewrites every known relative path in the real deploy/compose.yaml to
#    an absolute one under the given remote path.
OUTPUT="$("$SCRIPT" /srv/odysseus <"$REPO_ROOT/deploy/compose.yaml")"
assert_contains "$OUTPUT" 'context: /srv/odysseus'
assert_contains "$OUTPUT" 'path: /srv/odysseus/.env'
assert_contains "$OUTPUT" 'path: /srv/odysseus/.env.smoke'
assert_contains "$OUTPUT" '/srv/odysseus/deploy/Caddyfile:/etc/caddy/Caddyfile:ro'
assert_not_contains "$OUTPUT" 'context: ..'
assert_not_contains "$OUTPUT" '../.env'
assert_not_contains "$OUTPUT" './Caddyfile:'

# 2. A different remote path is honoured, not hardcoded.
OUTPUT_OTHER="$("$SCRIPT" /opt/odysseus <"$REPO_ROOT/deploy/compose.yaml")"
assert_contains "$OUTPUT_OTHER" 'context: /opt/odysseus'
assert_contains "$OUTPUT_OTHER" 'path: /opt/odysseus/.env'

# 3. Prose mentioning ".env" or "Caddyfile" outside the paths compose
#    actually resolves must survive untouched (the substitutions are
#    exact-string, not a blanket rewrite of every mention).
assert_contains "$OUTPUT" 'see .env'
assert_contains "$OUTPUT" 'see deploy/Caddyfile'

# 4. A known relative-path shape that the exact-match substitutions don't
#    catch (here: trailing text after "context: .." defeats the end-of-
#    line anchor, the same way reformatting deploy/compose.yaml one day
#    could) must fail loudly rather than silently ship a server file that
#    still resolves it against the wrong directory - the exact failure
#    mode issue #74 reported.
if printf 'services:\n  app:\n    build:\n      # keep context: .. in sync\n' |
  "$SCRIPT" /srv/odysseus >/dev/null 2>&1; then
  fail "expected a non-zero exit when a known relative path survives unrewritten"
fi

printf 'render-server-compose.test.sh: all checks passed\n' >&2
