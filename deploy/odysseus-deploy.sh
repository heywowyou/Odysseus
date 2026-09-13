#!/usr/bin/env bash
# Local helper: deploy the current checkout to the VPS from the operator's
# own machine, not on the server. It renders the server compose file from the
# repo's own deploy/compose.yaml and writes it to the server, rsyncs the repo
# to the VPS, builds the app image there, rolls it out with `up -d app`,
# verifies the running container's build id, and prunes build cache.
#
# No Hostinger panel click is needed afterward, and the panel's own
# "Deployer" button must NOT be clicked after a rollout: it re-runs `pull` +
# `up` from the panel's own context instead of the build-and-verify sequence
# above.
set -Eeuo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="${ODYSSEUS_DEPLOY_CONFIG_FILE:-$SCRIPT_DIR/.deploy.local.env}"

log() {
  printf '%s odysseus-deploy: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
}

fail() {
  log "error: $*"
  exit 1
}

[[ -f "$CONFIG_FILE" ]] || fail "missing $CONFIG_FILE (copy deploy/.deploy.local.env.example and fill in your VPS details)"
# shellcheck source=/dev/null
source "$CONFIG_FILE"

: "${ODYSSEUS_DEPLOY_HOST:?ODYSSEUS_DEPLOY_HOST is not set in $CONFIG_FILE}"
ODYSSEUS_DEPLOY_SSH_KEY="${ODYSSEUS_DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519}"
ODYSSEUS_DEPLOY_REMOTE_PATH="${ODYSSEUS_DEPLOY_REMOTE_PATH:-/srv/odysseus}"
ODYSSEUS_DEPLOY_COMPOSE_DIR="${ODYSSEUS_DEPLOY_COMPOSE_DIR:-/docker/odysseus}"
ODYSSEUS_DEPLOY_COMPOSE_PROJECT="${ODYSSEUS_DEPLOY_COMPOSE_PROJECT:-odysseus}"
ODYSSEUS_DEPLOY_BUILD_CACHE_KEEP="${ODYSSEUS_DEPLOY_BUILD_CACHE_KEEP:-4GB}"

[[ "$ODYSSEUS_DEPLOY_COMPOSE_PROJECT" != deploy ]] || fail "ODYSSEUS_DEPLOY_COMPOSE_PROJECT must not be 'deploy' (collides with the old release.sh project name and recreates a container/volume mismatch already fixed once on this box)"
[[ "$ODYSSEUS_DEPLOY_BUILD_CACHE_KEEP" =~ ^[1-9][0-9]*(B|KB|MB|GB|TB)$ ]] ||
  fail "ODYSSEUS_DEPLOY_BUILD_CACHE_KEEP must be a positive whole-byte Docker size, such as 4GB"

SSH_OPTS=(-i "$ODYSSEUS_DEPLOY_SSH_KEY" -o BatchMode=yes)

# Issue #74: $ODYSSEUS_DEPLOY_COMPOSE_DIR/docker-compose.yml used to be a
# hand-copied fork of deploy/compose.yaml (needed because the Hostinger
# Docker Manager panel requires the project to live in its own directory,
# separate from the rsynced repo checkout). The two drifted silently and an
# edit to deploy/compose.yaml stopped taking effect in production with no
# error. Generating the server file from the repo's own compose.yaml on
# every run makes it derived rather than maintained, so it cannot drift
# again. The path-rewriting itself lives in render-server-compose.sh, a
# small pure script with its own test (render-server-compose.test.sh), so
# it's verifiable without faking ssh/rsync for an end-to-end run of this
# whole script. release.sh (the CI-dispatched production path) already runs
# deploy/compose.yaml directly from the release checkout and is unaffected.
GENERATED_COMPOSE_FILE="$(mktemp)"
trap 'rm -f "$GENERATED_COMPOSE_FILE"' EXIT
"$SCRIPT_DIR/render-server-compose.sh" "$ODYSSEUS_DEPLOY_REMOTE_PATH" \
  <"$REPO_ROOT/deploy/compose.yaml" >"$GENERATED_COMPOSE_FILE"

log "writing the generated compose file to $ODYSSEUS_DEPLOY_HOST:$ODYSSEUS_DEPLOY_COMPOSE_DIR/docker-compose.yml"
ssh "${SSH_OPTS[@]}" "$ODYSSEUS_DEPLOY_HOST" \
  "mkdir -p '$ODYSSEUS_DEPLOY_COMPOSE_DIR' && cat > '$ODYSSEUS_DEPLOY_COMPOSE_DIR/docker-compose.yml'" \
  <"$GENERATED_COMPOSE_FILE"

log "syncing $REPO_ROOT/ to $ODYSSEUS_DEPLOY_HOST:$ODYSSEUS_DEPLOY_REMOTE_PATH/"
rsync -az --delete \
  --exclude .git \
  --exclude node_modules \
  --exclude /artifacts \
  --exclude /data \
  --exclude .env \
  -e "ssh ${SSH_OPTS[*]}" \
  "$REPO_ROOT/" "$ODYSSEUS_DEPLOY_HOST:$ODYSSEUS_DEPLOY_REMOTE_PATH/"

# Stamped into the image so a stored audit can name the code that produced
# it (trade-off 72). Deliberately not ODYSSEUS_IMAGE_TAG: that also names the
# image, and tagging anything but :latest would leave the Hostinger panel
# looking for a tag that does not exist.
BUILD_ID="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo '')"
if [[ -n "$BUILD_ID" && -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null)" ]]; then
  log "warning: working tree is dirty, so the image is stamped $BUILD_ID but does not match that commit exactly"
fi
# Alongside the commit, for /api/meta's builtAt (issue: expose build/
# revision metadata) - this build's wall-clock time, not the commit's.
BUILT_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

COMPOSE="docker compose -p '$ODYSSEUS_DEPLOY_COMPOSE_PROJECT' -f '$ODYSSEUS_DEPLOY_COMPOSE_DIR/docker-compose.yml'"

log "building the app image on the server ($ODYSSEUS_DEPLOY_COMPOSE_DIR, project $ODYSSEUS_DEPLOY_COMPOSE_PROJECT, build ${BUILD_ID:-unstamped})"
ssh "${SSH_OPTS[@]}" "$ODYSSEUS_DEPLOY_HOST" \
  "ODYSSEUS_BUILD_ID='$BUILD_ID' ODYSSEUS_BUILT_AT='$BUILT_AT' $COMPOSE build app"

# The Hostinger panel's Deployer/Renouveler button runs `pull` + `up` and
# never `build`. odysseus-app is built here and exists in no registry, so its
# pull always fails; the panel logs that failure, recreates the container from
# whatever image is already on disk, and still reports success. A stale image
# rolls out looking exactly like a good deploy - which is how a measured
# before/after once compared a build against itself. Rolling out here, in the
# same run as the build, is what makes that impossible.
log "rolling out the new image"
ssh "${SSH_OPTS[@]}" "$ODYSSEUS_DEPLOY_HOST" \
  "ODYSSEUS_BUILD_ID='$BUILD_ID' ODYSSEUS_BUILT_AT='$BUILT_AT' $COMPOSE up -d app"

log "verifying the running container came from this build"
RUNNING_BUILD="$(ssh "${SSH_OPTS[@]}" "$ODYSSEUS_DEPLOY_HOST" \
  "$COMPOSE exec -T app printenv ODYSSEUS_BUILD_ID" 2>/dev/null | tr -d '\r\n')"
[[ "$RUNNING_BUILD" == "$BUILD_ID" ]] ||
  fail "rolled out, but the running container reports build '${RUNNING_BUILD:-<none>}' rather than '${BUILD_ID:-<none>}'"

log "pruning dangling Docker images and unused build cache (keeping $ODYSSEUS_DEPLOY_BUILD_CACHE_KEEP)"
ssh "${SSH_OPTS[@]}" "$ODYSSEUS_DEPLOY_HOST" \
  "docker image prune -f && docker builder prune -f -a --keep-storage '$ODYSSEUS_DEPLOY_BUILD_CACHE_KEEP'"

log "done. Running build: ${RUNNING_BUILD:-unstamped}. No panel click needed."
