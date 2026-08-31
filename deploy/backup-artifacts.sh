#!/usr/bin/env bash
# Nightly artifacts backup (odysseus-backup.timer): tar the artifacts root,
# copy it to the odysseus-previews Scaleway bucket under backups/, then drop
# archives older than 30 days. Runs on the host as the deploy user; every
# step logs to stdout so journalctl shows what happened. Never prints
# secret values.
#
# The rclone remote named "scaleway" must exist first (rclone config, as the
# deploy user): type s3, provider Other, endpoint https://s3.fr-par.scw.cloud,
# region fr-par, with the same bucket credentials the app uses. The runbook
# walks through it.
set -euo pipefail

log() {
  printf '%s odysseus-backup: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

ARTIFACTS_ROOT="${1:-${ODYSSEUS_ARTIFACTS_ROOT:-/data/artifacts}}"
# Where deploy/compose.yaml lives on the host, used only to stream the tar
# out of the app container when the artifacts root is not visible on the
# host filesystem (the compose stack keeps it in a named volume).
COMPOSE_FILE="${ODYSSEUS_BACKUP_COMPOSE_FILE:-/srv/odysseus/deploy/compose.yaml}"
REMOTE="scaleway:odysseus-previews/backups"
RETENTION_DAYS=30

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$STAGE/odysseus-artifacts-$STAMP.tar.gz"

if [ -d "$ARTIFACTS_ROOT" ]; then
  log "archiving $ARTIFACTS_ROOT (local directory)"
  tar czf "$ARCHIVE" -C "$(dirname "$ARTIFACTS_ROOT")" "$(basename "$ARTIFACTS_ROOT")"
elif docker compose -f "$COMPOSE_FILE" ps --status running --services 2>/dev/null | grep -qx app; then
  # Default deploy shape: artifacts live in the compose volume, not on the
  # host filesystem, so stream the tar out of the running app container.
  log "archiving /data/artifacts from the app container ($COMPOSE_FILE)"
  docker compose -f "$COMPOSE_FILE" exec -T app tar czf - -C /data artifacts > "$ARCHIVE"
else
  log "skipping: artifacts root $ARTIFACTS_ROOT is missing and the app container is not running (nothing to back up)"
  exit 0
fi

# An empty archive means the tar produced nothing: uploading it would look
# like a successful backup while protecting nothing.
if [ ! -s "$ARCHIVE" ]; then
  log "error: the archive is empty, refusing to upload"
  exit 1
fi
log "archive ready: $(basename "$ARCHIVE") ($(du -h "$ARCHIVE" | cut -f1))"

log "copying to $REMOTE"
rclone copy "$ARCHIVE" "$REMOTE"

log "pruning archives older than $RETENTION_DAYS days from $REMOTE"
rclone delete "$REMOTE" --min-age "${RETENTION_DAYS}d"

log "done"
