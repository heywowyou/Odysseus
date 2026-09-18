#!/usr/bin/env bash
set -euo pipefail

for script in deploy/restic-backup.sh deploy/restic-check.sh deploy/restic-restore-drill.sh deploy/restic-maintain.sh; do
  bash -n "$script"
  grep -q 'restic/restic:0.19.1' "$script"
  if grep -q '/srv/odysseus/.env[^.-]' "$script"; then
    echo "odysseus: restic script must never consume the application .env: $script" >&2
    exit 1
  fi
done

grep -q 'RESTIC_REPOSITORY=' deploy/.restic.env.example
grep -q 'AWS_ACCESS_KEY_ID=' deploy/.restic.env.example

echo "odysseus: restic deployment scripts passed static checks"

grep -q -- '--keep-daily 30' deploy/restic-maintain.sh
grep -q -- '--keep-weekly 8' deploy/restic-maintain.sh
grep -q -- '--keep-monthly 12' deploy/restic-maintain.sh
grep -q -- '--prune' deploy/restic-maintain.sh
