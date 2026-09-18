#!/usr/bin/env bash
set -euo pipefail

RESTIC_IMAGE="${ODYSSEUS_RESTIC_IMAGE:-restic/restic:0.19.1}"
ENV_FILE="${ODYSSEUS_RESTIC_ENV_FILE:-/srv/odysseus/.restic.env}"
PASSWORD_FILE="${ODYSSEUS_RESTIC_PASSWORD_FILE:-/srv/odysseus/.restic-password}"
BACKUP_HOST="${ODYSSEUS_RESTIC_HOST:-odysseus-production}"
RESTORE_VOLUME="odysseus_restic_drill_$(date +%s)"

[[ -r "${ENV_FILE}" ]] || { echo "missing restic env file: ${ENV_FILE}" >&2; exit 1; }
[[ -r "${PASSWORD_FILE}" ]] || { echo "missing restic password file: ${PASSWORD_FILE}" >&2; exit 1; }

cleanup() {
  docker volume rm "${RESTORE_VOLUME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker volume create "${RESTORE_VOLUME}" >/dev/null

docker run --rm \
  --env-file "${ENV_FILE}" \
  -e RESTIC_PASSWORD_FILE=/run/secrets/restic-password \
  -v "${PASSWORD_FILE}:/run/secrets/restic-password:ro" \
  -v "${RESTORE_VOLUME}:/restore" \
  "${RESTIC_IMAGE}" \
  restore latest \
  --host "${BACKUP_HOST}" \
  --path /data/artifacts \
  --target /restore

docker run --rm -v "${RESTORE_VOLUME}:/restore:ro" alpine:3.22 \
  sh -c 'find /restore -type f -print -quit | grep -q .'

echo "odysseus: restic restore drill succeeded"
