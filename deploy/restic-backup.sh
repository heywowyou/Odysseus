#!/usr/bin/env bash
set -euo pipefail

RESTIC_IMAGE="${ODYSSEUS_RESTIC_IMAGE:-restic/restic:0.19.1}"
ENV_FILE="${ODYSSEUS_RESTIC_ENV_FILE:-/srv/odysseus/.restic.env}"
PASSWORD_FILE="${ODYSSEUS_RESTIC_PASSWORD_FILE:-/srv/odysseus/.restic-password}"
ARTIFACT_VOLUME="${ODYSSEUS_RESTIC_ARTIFACT_VOLUME:-odysseus_artifacts}"
BACKUP_HOST="${ODYSSEUS_RESTIC_HOST:-odysseus-production}"

[[ -r "${ENV_FILE}" ]] || { echo "missing restic env file: ${ENV_FILE}" >&2; exit 1; }
[[ -r "${PASSWORD_FILE}" ]] || { echo "missing restic password file: ${PASSWORD_FILE}" >&2; exit 1; }

exec 9>/tmp/odysseus-restic-backup.lock
flock -n 9 || { echo "odysseus: restic backup already running" >&2; exit 75; }

docker run --rm \
  --hostname "${BACKUP_HOST}" \
  --env-file "${ENV_FILE}" \
  -e RESTIC_PASSWORD_FILE=/run/secrets/restic-password \
  -v "${PASSWORD_FILE}:/run/secrets/restic-password:ro" \
  -v "${ARTIFACT_VOLUME}:/data/artifacts:ro" \
  "${RESTIC_IMAGE}" \
  backup /data/artifacts \
  --host "${BACKUP_HOST}" \
  --tag odysseus-artifacts \
  --skip-if-unchanged
