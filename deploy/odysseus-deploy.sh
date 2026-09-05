#!/usr/bin/env bash
# Local helper: rsync the repo to the VPS and rebuild the app image there.
# Run from the operator's own machine, not on the server.
#
# This does NOT run `docker compose up`. Hostinger's Docker Manager panel's
# own "Deployer" button runs `pull` + `up` but never `build`, even though the
# compose file declares a `build:` section, so the image has to be rebuilt by
# hand before every click or the panel silently redeploys stale code. This
# script does that rebuild; clicking "Deployer" in the panel afterward stays
# the deliberate final step.
set -Eeuo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$SCRIPT_DIR/.deploy.local.env"

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

[[ "$ODYSSEUS_DEPLOY_COMPOSE_PROJECT" != deploy ]] || fail "ODYSSEUS_DEPLOY_COMPOSE_PROJECT must not be 'deploy' (collides with the old release.sh project name and recreates a container/volume mismatch already fixed once on this box)"

SSH_OPTS=(-i "$ODYSSEUS_DEPLOY_SSH_KEY" -o BatchMode=yes)

log "syncing $REPO_ROOT/ to $ODYSSEUS_DEPLOY_HOST:$ODYSSEUS_DEPLOY_REMOTE_PATH/"
rsync -az --delete \
  --exclude .git \
  --exclude node_modules \
  --exclude /artifacts \
  --exclude /data \
  --exclude .env \
  -e "ssh ${SSH_OPTS[*]}" \
  "$REPO_ROOT/" "$ODYSSEUS_DEPLOY_HOST:$ODYSSEUS_DEPLOY_REMOTE_PATH/"

log "building the app image on the server ($ODYSSEUS_DEPLOY_COMPOSE_DIR, project $ODYSSEUS_DEPLOY_COMPOSE_PROJECT)"
ssh "${SSH_OPTS[@]}" "$ODYSSEUS_DEPLOY_HOST" \
  "docker compose -p '$ODYSSEUS_DEPLOY_COMPOSE_PROJECT' -f '$ODYSSEUS_DEPLOY_COMPOSE_DIR/docker-compose.yml' build app"

log "done. Image built and ready. Click Deployer in the Hostinger Docker Manager panel to roll it out."
