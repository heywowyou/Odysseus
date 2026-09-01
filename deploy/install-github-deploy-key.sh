#!/usr/bin/env bash
# Adds the GitHub Actions public key without assuming authorized_keys already
# ends in a newline. Run as the deploy user and provide one public key on stdin.
set -Eeuo pipefail

AUTHORIZED_KEYS="${ODYSSEUS_AUTHORIZED_KEYS:-$HOME/.ssh/authorized_keys}"
FORCED_COMMAND="${ODYSSEUS_DEPLOY_FORCED_COMMAND:-/srv/odysseus/deploy/github-deploy-command.sh}"

IFS= read -r public_key
read -r key_type key_blob key_comment extra <<<"$public_key"
[[ "$key_type" == ssh-ed25519 ]] || {
  printf 'expected one ssh-ed25519 public key on stdin\n' >&2
  exit 1
}
[[ "$key_blob" =~ ^[A-Za-z0-9+/]+={0,2}$ && -n "${key_comment:-}" && -z "${extra:-}" ]] || {
  printf 'malformed deployment public key\n' >&2
  exit 1
}

install -d -m 0700 "$(dirname "$AUTHORIZED_KEYS")"
touch "$AUTHORIZED_KEYS"
chmod 0600 "$AUTHORIZED_KEYS"

if grep -Fq -- "$key_blob" "$AUTHORIZED_KEYS"; then
  printf 'deployment key already installed\n'
  exit 0
fi

if [[ -s "$AUTHORIZED_KEYS" && "$(tail -c 1 "$AUTHORIZED_KEYS" | od -An -t u1 | tr -d ' ')" != 10 ]]; then
  printf '\n' >>"$AUTHORIZED_KEYS"
fi

printf 'restrict,command="%s" %s\n' "$FORCED_COMMAND" "$public_key" >>"$AUTHORIZED_KEYS"
printf 'deployment key installed\n'
