#!/usr/bin/env bash
# One-command production deployment from the Odysseus VPS.
# Pulls main into the VPS checkout, syncs the production tree, builds safely,
# refuses to interrupt running jobs, preserves the current image for rollback,
# rolls out app only, and automatically restores the previous image if
# readiness verification fails.
set -Eeuo pipefail

CHECKOUT="${ODYSSEUS_VPS_CHECKOUT:-/tmp/odysseus-latest}"
PROD_ROOT="${ODYSSEUS_VPS_PROD_ROOT:-/srv/odysseus}"
COMPOSE_FILE="${ODYSSEUS_VPS_COMPOSE_FILE:-/docker/odysseus/docker-compose.yml}"
PROJECT="${ODYSSEUS_VPS_COMPOSE_PROJECT:-odysseus}"
HEALTH_URL="${ODYSSEUS_DEPLOY_HEALTH_URL:-https://app.odysseusaudit.com/health/ready}"
HEALTH_HOST="${ODYSSEUS_DEPLOY_HEALTH_HOST:-app.odysseusaudit.com}"
LOCK_FILE="${ODYSSEUS_VPS_DEPLOY_LOCK:-/var/lock/odysseus-vps-deploy.lock}"

log() { printf '%s odysseus-vps-deploy: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; }
fail() { log "error: $*"; exit 1; }

exec 9>"$LOCK_FILE"
flock -n 9 || fail "another VPS deployment is already running"

[[ -d "$CHECKOUT/.git" ]] || fail "Git checkout missing at $CHECKOUT"
[[ -r "$PROD_ROOT/.env" ]] || fail "production environment missing at $PROD_ROOT/.env"

log "updating main"
git -C "$CHECKOUT" diff --quiet && git -C "$CHECKOUT" diff --cached --quiet ||
  fail "checkout has local changes; refusing to overwrite them"
git -C "$CHECKOUT" checkout main >/dev/null
git -C "$CHECKOUT" pull --ff-only
BUILD_ID="$(git -C "$CHECKOUT" rev-parse --short=8 HEAD)"
BUILT_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
log "deploying $BUILD_ID"

log "syncing source to $PROD_ROOT"
rsync -az --delete   --exclude='.git/'   --exclude='node_modules/'   --exclude='/artifacts/'   --exclude='/data/'   --exclude='.env'   "$CHECKOUT/" "$PROD_ROOT/"

log "rendering and validating production Compose"
COMPOSE_TMP="$(mktemp "$(dirname "$COMPOSE_FILE")/.docker-compose.XXXXXX.yml")"
trap 'rm -f "$COMPOSE_TMP"' EXIT
"$PROD_ROOT/deploy/render-server-compose.sh" "$PROD_ROOT"   < "$PROD_ROOT/deploy/compose.yaml" > "$COMPOSE_TMP"
docker compose -p "$PROJECT" -f "$COMPOSE_TMP" config >/dev/null
mv -f "$COMPOSE_TMP" "$COMPOSE_FILE"
trap - EXIT

log "building $BUILD_ID (production is still untouched)"
ODYSSEUS_BUILD_ID="$BUILD_ID" ODYSSEUS_BUILT_AT="$BUILT_AT"   docker compose -p "$PROJECT" -f "$COMPOSE_FILE" build app

log "checking for running jobs"
JOBS="$(
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE"     exec -T -w /app/packages/store app     node --input-type=module --eval '
import mongoose from "mongoose";
const options = {};
if (process.env.MONGODB_DB_NAME) options.dbName = process.env.MONGODB_DB_NAME;
await mongoose.connect(process.env.MONGODB_URI, options);
const running = await mongoose.connection.collection("jobs")
  .find({ status: "running" })
  .project({ jobId: 1, phase: 1, type: 1, siteUrl: 1 })
  .toArray();
process.stdout.write(JSON.stringify(running));
await mongoose.disconnect();
'
)" || fail "running-jobs probe failed; refusing to restart production"
[[ "$JOBS" == "[]" ]] || fail "running job(s) detected; deployment stopped safely: $JOBS"

OLD_BUILD_ID="$(
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE"     exec -T app printenv ODYSSEUS_BUILD_ID | tr -d '\r\n'
)"
[[ -n "$OLD_BUILD_ID" ]] || OLD_BUILD_ID="unknown-$(date -u +%Y%m%d%H%M%S)"
OLD_IMAGE_ID="$(docker inspect odysseus-app-1 --format '{{.Image}}')"
ROLLBACK_TAG="odysseus-app:rollback-$OLD_BUILD_ID"
docker image tag "$OLD_IMAGE_ID" "$ROLLBACK_TAG"
log "rollback image preserved as $ROLLBACK_TAG"

log "starting $BUILD_ID"
ODYSSEUS_BUILD_ID="$BUILD_ID" ODYSSEUS_BUILT_AT="$BUILT_AT"   docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d app

verify() {
  local running_build response
  running_build="$(
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE"       exec -T app printenv ODYSSEUS_BUILD_ID 2>/dev/null | tr -d '\r\n'
  )" || return 1
  [[ "$running_build" == "$BUILD_ID" ]] || return 1

  for _ in $(seq 1 30); do
    response="$(curl --fail --silent --show-error       --connect-timeout 5 --max-time 10       --resolve "$HEALTH_HOST:443:127.0.0.1" "$HEALTH_URL" 2>/dev/null || true)"
    if [[ "$response" == '{"status":"ready","database":"ok","queue":"ok"}' ]]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

if ! verify; then
  log "verification failed; restoring $OLD_BUILD_ID"
  docker image tag "$ROLLBACK_TAG" odysseus-app:latest
  ODYSSEUS_BUILD_ID="$OLD_BUILD_ID"     docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --force-recreate app
  fail "new build failed verification; previous image was restored. Inspect app logs."
fi

log "deployment successful: $BUILD_ID"
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" ps app
printf '\nReady: %s\n' "$BUILD_ID"
