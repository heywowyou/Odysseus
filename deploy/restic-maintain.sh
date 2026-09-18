#!/usr/bin/env bash
set -euo pipefail

RESTIC_IMAGE="${ODYSSEUS_RESTIC_IMAGE:-restic/restic:0.19.1}"
ENV_FILE="${ODYSSEUS_RESTIC_ENV_FILE:-/srv/odysseus/.restic.env}"
PASSWORD_FILE="${ODYSSEUS_RESTIC_PASSWORD_FILE:-/srv/odysseus/.restic-password}"
BACKUP_HOST="${ODYSSEUS_RESTIC_HOST:-odysseus-production}"

[[ -r "${ENV_FILE}" ]] || { echo "missing restic env file: ${ENV_FILE}" >&2; exit 1; }
[[ -r "${PASSWORD_FILE}" ]] || { echo "missing restic password file: ${PASSWORD_FILE}" >&2; exit 1; }

exec 9>/tmp/odysseus-restic-maintain.lock
flock -n 9 || { echo "odysseus: restic maintenance already running" >&2; exit 75; }

common=(
  --rm
  --env-file "${ENV_FILE}"
  -e RESTIC_PASSWORD_FILE=/run/secrets/restic-password
  -v "${PASSWORD_FILE}:/run/secrets/restic-password:ro"
)

docker run "${common[@]}" "${RESTIC_IMAGE}" forget \
  --host "${BACKUP_HOST}" \
  --tag odysseus-artifacts \
  --keep-daily 30 \
  --keep-weekly 8 \
  --keep-monthly 12 \
  --prune

docker run "${common[@]}" "${RESTIC_IMAGE}" check
