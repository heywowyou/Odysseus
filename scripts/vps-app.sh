#!/usr/bin/env bash
# Runs one command inside the production app container, for read-only
# inspection of stored audits and the maintenance scripts under /app/scripts.
# Usage (from the repository root):
#   scripts/vps-app.sh node /app/scripts/measure-audit-data-quality.mjs /data/artifacts/<host>/<run>
#   scripts/vps-app.sh --upload <local-file> <container-path>
# Reads the deploy key and host from deploy/.deploy.local.env (gitignored).
# What the command writes is the caller's decision; this script only carries it.
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/.deploy.local.env
remote() {
  ssh -i "$ODYSSEUS_DEPLOY_SSH_KEY" -o BatchMode=yes "$ODYSSEUS_DEPLOY_HOST" \
    "cd '$ODYSSEUS_DEPLOY_COMPOSE_DIR' && docker compose -p '$ODYSSEUS_DEPLOY_COMPOSE_PROJECT' exec -T app $*"
}
if [[ "${1:-}" == "--upload" ]]; then
  [[ $# -eq 3 ]] || { echo "usage: vps-app.sh --upload <local-file> <container-path>" >&2; exit 2; }
  remote "sh -c 'cat > $3'" < "$2"
  exit 0
fi
[[ $# -gt 0 ]] || { echo "usage: vps-app.sh <command...> | --upload <local-file> <container-path>" >&2; exit 2; }
remote "$@"
