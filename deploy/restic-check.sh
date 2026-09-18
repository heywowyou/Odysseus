#!/usr/bin/env bash
set -euo pipefail

RESTIC_IMAGE="${ODYSSEUS_RESTIC_IMAGE:-restic/restic:0.19.1}"
ENV_FILE="${ODYSSEUS_RESTIC_ENV_FILE:-/srv/odysseus/.restic.env}"
PASSWORD_FILE="${ODYSSEUS_RESTIC_PASSWORD_FILE:-/srv/odysseus/.restic-password}"

[[ -r "${ENV_FILE}" ]] || { echo "missing restic env file: ${ENV_FILE}" >&2; exit 1; }
[[ -r "${PASSWORD_FILE}" ]] || { echo "missing restic password file: ${PASSWORD_FILE}" >&2; exit 1; }

docker run --rm \
  --env-file "${ENV_FILE}" \
  -e RESTIC_PASSWORD_FILE=/run/secrets/restic-password \
  -v "${PASSWORD_FILE}:/run/secrets/restic-password:ro" \
  "${RESTIC_IMAGE}" check
