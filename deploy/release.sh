#!/usr/bin/env bash
# Installs one immutable Git archive and switches the production Compose stack
# to it. This script runs on the VPS as the unprivileged deploy user.
set -Eeuo pipefail

DEPLOY_ROOT="${ODYSSEUS_DEPLOY_ROOT:-/srv/odysseus}"
RELEASES_DIR="$DEPLOY_ROOT/releases"
CURRENT_LINK="$DEPLOY_ROOT/current"
PREVIOUS_FILE="$DEPLOY_ROOT/previous-release"
LOCK_FILE="$DEPLOY_ROOT/.deploy.lock"
HEALTH_URL="${ODYSSEUS_DEPLOY_HEALTH_URL:-https://app.odysseusaudit.com/}"
HEALTH_ATTEMPTS="${ODYSSEUS_DEPLOY_HEALTH_ATTEMPTS:-30}"
HEALTH_DELAY_SECONDS="${ODYSSEUS_DEPLOY_HEALTH_DELAY_SECONDS:-2}"
# Ceiling for Docker build cache after each deploy. The VPS disk is 30 GB and
# one build moves roughly 6 GB through the cache, so an uncapped cache filled
# the disk within two weeks of releases (2026-09-03 outage).
BUILD_CACHE_KEEP="${ODYSSEUS_BUILD_CACHE_KEEP:-4GB}"
COMPOSE_PROJECT_NAME=deploy

# The live check must validate THIS machine's stack, never whatever public DNS
# currently points at: on 2026-09-09 the domain and PRODUCTION_HOST had drifted
# apart (stale variable after the Hostinger migration), so a deploy to the
# abandoned box passed its health gate against the real box still serving the
# domain. The host and port are parsed from the health URL so an operator
# override keeps working.
HEALTH_HOST="$(printf '%s' "$HEALTH_URL" | sed -E 's#^[a-zA-Z]+://([^/:?]+).*#\1#')"
case "$HEALTH_URL" in
  http://*) HEALTH_PORT=80 ;;
  *) HEALTH_PORT=443 ;;
esac

log() {
  printf '%s odysseus-deploy: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
}

fail() {
  log "error: $*"
  exit 1
}

is_release_id() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]]
}

release_tag_for() {
  local release_path="$1"
  local candidate
  candidate="$(basename "$release_path")"
  if is_release_id "$candidate"; then
    printf '%s\n' "$candidate"
  else
    printf '%s\n' latest
  fi
}

compose() {
  local release_path="$1"
  local image_tag="$2"
  shift 2
  ODYSSEUS_IMAGE_TAG="$image_tag" docker compose \
    --project-name "$COMPOSE_PROJECT_NAME" \
    --env-file "$DEPLOY_ROOT/.env" \
    -f "$release_path/deploy/compose.yaml" "$@"
}

health_is_ready() {
  local response code redirect_url
  response="$(curl --silent --show-error --output /dev/null \
    --connect-timeout 5 --max-time 10 \
    --resolve "$HEALTH_HOST:$HEALTH_PORT:127.0.0.1" \
    --write-out '%{http_code} %{redirect_url}' "$HEALTH_URL")" || return 1
  read -r code redirect_url <<<"$response"
  [[ "$code" == 302 && "$redirect_url" == */login ]]
}

wait_until_ready() {
  local attempt
  for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1)); do
    if health_is_ready; then
      log "health check passed ($HEALTH_URL redirects to /login)"
      return 0
    fi
    if ((attempt < HEALTH_ATTEMPTS)); then
      sleep "$HEALTH_DELAY_SECONDS"
    fi
  done
  return 1
}

set_current_link() {
  local target="$1"
  local pending_link="$DEPLOY_ROOT/.current.$$"
  ln -s "$target" "$pending_link"
  mv -Tf "$pending_link" "$CURRENT_LINK"
}

write_previous_release() {
  local target="$1"
  local pending_file="$DEPLOY_ROOT/.previous-release.$$"
  printf '%s\n' "$target" >"$pending_file"
  mv -f "$pending_file" "$PREVIOUS_FILE"
}

validate_release_path() {
  local target="$1"
  if [[ "$target" == "$DEPLOY_ROOT" ]]; then
    return 0
  fi
  local target_parent target_name
  target_parent="$(dirname "$target")"
  target_name="$(basename "$target")"
  [[ "$target_parent" == "$RELEASES_DIR" ]] || fail "release is outside $RELEASES_DIR"
  is_release_id "$target_name" || fail "invalid release directory: $target"
}

validate_archive_members() {
  local archive="$1"
  local member
  while IFS= read -r member; do
    case "$member" in
      /* | ../* | */../* | */..)
        fail "archive contains an unsafe path: $member"
        ;;
    esac
  done < <(tar -tzf "$archive")
}

prepare_release() {
  local archive="$1"
  local release_id="$2"
  local release_path="$RELEASES_DIR/$release_id"

  if [[ -d "$release_path" ]]; then
    [[ "$(<"$release_path/.odysseus-release")" == "$release_id" ]] ||
      fail "existing release has no matching identity marker: $release_path"
    printf '%s\n' "$release_path"
    return 0
  fi

  local staging="$RELEASES_DIR/.incoming-$release_id-$$"
  mkdir -p "$staging"
  trap 'rm -rf -- "$staging"' RETURN
  validate_archive_members "$archive"
  tar -xzf "$archive" -C "$staging"

  [[ -f "$staging/Dockerfile" ]] || fail 'release has no Dockerfile'
  [[ -f "$staging/deploy/compose.yaml" ]] || fail 'release has no Compose file'
  [[ -f "$staging/deploy/Caddyfile" ]] || fail 'release has no Caddyfile'
  [[ -f "$staging/deploy/release.sh" ]] || fail 'release has no release controller'
  [[ -f "$staging/deploy/github-deploy-command.sh" ]] || fail 'release has no forced command'
  [[ -f "$staging/deploy/install-github-deploy-key.sh" ]] || fail 'release has no key installer'
  [[ ! -e "$staging/.env" ]] || fail 'release archive unexpectedly contains .env'
  ln -s "$DEPLOY_ROOT/.env" "$staging/.env"
  printf '%s\n' "$release_id" >"$staging/.odysseus-release"
  mv "$staging" "$release_path"
  trap - RETURN
  printf '%s\n' "$release_path"
}

current_release_path() {
  if [[ -L "$CURRENT_LINK" ]]; then
    readlink -f "$CURRENT_LINK"
  else
    # The first automated deployment starts from the original synced tree.
    printf '%s\n' "$DEPLOY_ROOT"
  fi
}

restore_release() {
  local target="$1"
  local target_tag
  validate_release_path "$target"
  target_tag="$(release_tag_for "$target")"
  log "restoring $(basename "$target")"
  compose "$target" "$target_tag" up -d --no-build --remove-orphans
  wait_until_ready
}

install_controllers() {
  local release_path="$1"
  # The forced SSH command lives outside release directories. Refresh it only
  # after the new app has passed its live check, so a broken release cannot
  # replace the recovery path used by the next deployment.
  install -m 0755 "$release_path/deploy/release.sh" "$DEPLOY_ROOT/deploy/release.sh"
  install -m 0755 "$release_path/deploy/github-deploy-command.sh" \
    "$DEPLOY_ROOT/deploy/github-deploy-command.sh"
  install -m 0755 "$release_path/deploy/install-github-deploy-key.sh" \
    "$DEPLOY_ROOT/deploy/install-github-deploy-key.sh"
}

prune_old_releases() {
  local current_path previous_path path name retained=0
  current_path="$(readlink -f "$CURRENT_LINK")"
  previous_path="$(<"$PREVIOUS_FILE")"

  # Disk policy: the server of record keeps data (artifacts volume, .env) and
  # the small release trees; images are regenerable and are what filled the
  # disk on 2026-09-03. Only the current and previous releases keep their
  # image, which is what makes the documented rollback instant; restoring any
  # older release rebuilds first (rollback_release handles a missing image).
  while IFS= read -r path; do
    name="$(basename "$path")"
    is_release_id "$name" || continue
    if [[ "$path" == "$current_path" || "$path" == "$previous_path" ]]; then
      continue
    fi
    if [[ $retained -ge 5 ]]; then
      log "pruning old release $name"
      rm -rf -- "$path"
    else
      retained=$((retained + 1))
    fi
    docker image rm "odysseus-app:$name" >/dev/null 2>&1 || true
  done < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' |
    sort -nr | cut -d' ' -f2-)

  # Unnamed leftovers pin cache the same way; the builder cache itself is
  # capped last so it can reclaim layers freed by the removals above.
  docker image prune -f >/dev/null 2>&1 || true
  docker builder prune -f -a --keep-storage "$BUILD_CACHE_KEEP" >/dev/null 2>&1 || true
}

# One-shot probe the deploy guard runs inside the currently running app
# container before recreating it. Stdout must stay exactly one JSON line,
# the running jobs as an array; the per-job lines go to stderr and land in
# the deploy log. The script carries no single quotes so it embeds in the
# single-quoted shell string below unchanged, and it never prints the URI.
JOBS_PROBE='
  import mongoose from "mongoose";
  const options = {};
  if (process.env.MONGODB_DB_NAME) {
    options.dbName = process.env.MONGODB_DB_NAME;
  }
  await mongoose.connect(process.env.MONGODB_URI, options);
  const running = await mongoose.connection
    .collection("jobs")
    .find({ status: "running" })
    .project({ jobId: 1, phase: 1, type: 1, siteUrl: 1 })
    .toArray();
  for (const job of running) {
    console.error(
      "running job: jobId=" + job.jobId + " type=" + job.type +
        " phase=" + job.phase + " site=" + (job.siteUrl ?? "-"),
    );
  }
  await mongoose.disconnect();
  process.stdout.write(JSON.stringify(running) + "\n", (error) => {
    process.exit(error ? 1 : 0);
  });
'

# Issue #124: recreating the app container kills any job it is running (the
# 2026-09-08 redeploy destroyed a five-hour audit mid-content-scan), so the
# deploy refuses while the jobs collection still reports a running job. The
# probe is deliberately fail-closed: a running container that cannot be
# asked about the queue, or that answers with anything unreadable, refuses
# the deploy rather than guessing. A container that is not running at all
# has nothing live to protect; startup recovery requeues whatever Mongo
# still calls running. ODYSSEUS_DEPLOY_FORCE_RUNNING lifts the refusal for
# the operator who accepts interrupting the listed jobs.
assert_no_running_jobs() {
  local previous_path="$1"
  local previous_tag ps_running probe_output job_count jobs_left
  previous_tag="$(release_tag_for "$previous_path")"

  if ! ps_running="$(compose "$previous_path" "$previous_tag" ps --status running --quiet app)"; then
    fail 'could not inspect the running app container; the job queue state is unknown, so the deploy is refused'
  fi
  if [[ -z "$ps_running" ]]; then
    log 'no running app container; no live audit to protect'
    return 0
  fi

  # The probe cannot go through the compose helper: timeout cannot wrap a
  # shell function, so the helper's docker compose arguments are repeated
  # here. The workdir is store's package directory, the one place in the
  # image whose node_modules resolves mongoose (pnpm installs per package).
  if ! probe_output="$(ODYSSEUS_IMAGE_TAG="$previous_tag" timeout 30 docker compose \
    --project-name "$COMPOSE_PROJECT_NAME" \
    --env-file "$DEPLOY_ROOT/.env" \
    -f "$previous_path/deploy/compose.yaml" \
    exec -T -w /app/packages/store app \
    node --input-type=module --eval "$JOBS_PROBE")"; then
    fail 'the running-jobs probe failed; the job queue state is unknown, so recreating the app container is refused'
  fi
  if [[ "$probe_output" != "["*"]" || "$probe_output" == *$'\n'* ]]; then
    fail 'the running-jobs probe returned an unreadable answer; the job queue state is unknown, so recreating the app container is refused'
  fi
  if [[ "$probe_output" == '[]' ]]; then
    log 'no jobs are running; the app container can be recreated safely'
    return 0
  fi

  job_count=0
  jobs_left="$probe_output"
  while [[ "$jobs_left" == *'"jobId"'* ]]; do
    job_count=$((job_count + 1))
    jobs_left="${jobs_left#*\"jobId\"}"
  done

  if [[ -n "${ODYSSEUS_DEPLOY_FORCE_RUNNING:-}" ]]; then
    log "ODYSSEUS_DEPLOY_FORCE_RUNNING is set: recreating the app container over $job_count running job(s) at the operator's explicit request"
    log 'the jobs listed above are interrupted by this deploy; a full-audit job resumes from its checkpoint on next startup'
    return 0
  fi
  fail "$job_count job(s) are running; recreating the app container now would kill them. To deploy anyway, add the force-running token to the deploy command, or set ODYSSEUS_DEPLOY_FORCE_RUNNING=1 for this run"
}

deploy_release() {
  local archive="$1"
  local release_id="$2"
  is_release_id "$release_id" || fail 'release id must be a full lowercase Git commit SHA'
  [[ -r "$archive" ]] || fail "release archive is not readable: $archive"
  [[ -r "$DEPLOY_ROOT/.env" ]] || fail "production environment is missing: $DEPLOY_ROOT/.env"
  mkdir -p "$RELEASES_DIR"

  local release_path previous_path
  release_path="$(prepare_release "$archive" "$release_id")"
  previous_path="$(current_release_path)"
  validate_release_path "$previous_path"

  log "building release $release_id"
  compose "$release_path" "$release_id" build app
  assert_no_running_jobs "$previous_path"
  log "starting release $release_id"
  compose "$release_path" "$release_id" up -d --remove-orphans

  if ! wait_until_ready; then
    log "release $release_id failed its live check; restoring $(basename "$previous_path")"
    restore_release "$previous_path" ||
      fail 'new release and automatic restore both failed; inspect the Compose logs now'
    fail "release $release_id failed its live check; the previous release is running"
  fi

  if [[ "$previous_path" != "$release_path" ]]; then
    write_previous_release "$previous_path"
  fi
  set_current_link "$release_path"
  install_controllers "$release_path"
  prune_old_releases
  log "release $release_id is current"
}

rollback_release() {
  [[ -r "$PREVIOUS_FILE" ]] || fail 'no previous release has been recorded yet'
  local current_path target target_tag
  current_path="$(current_release_path)"
  target="$(<"$PREVIOUS_FILE")"
  validate_release_path "$target"
  [[ -f "$target/deploy/compose.yaml" ]] || fail "previous release is incomplete: $target"
  target_tag="$(release_tag_for "$target")"

  if ! docker image inspect "odysseus-app:$target_tag" >/dev/null 2>&1; then
    log "image odysseus-app:$target_tag is missing; rebuilding it before rollback"
    compose "$target" "$target_tag" build app
  fi

  restore_release "$target" || fail 'rollback failed its live check; inspect the Compose logs now'
  write_previous_release "$current_path"
  set_current_link "$target"
  log "rollback complete; $(basename "$target") is current"
}

usage() {
  printf 'usage: %s deploy ARCHIVE FULL_COMMIT_SHA | rollback\n' "$0" >&2
  exit 2
}

main() {
  mkdir -p "$DEPLOY_ROOT"
  exec 9>"$LOCK_FILE"
  flock -n 9 || fail 'another production deployment is already running'

  case "${1:-}" in
    deploy)
      [[ $# -eq 3 ]] || usage
      deploy_release "$2" "$3"
      ;;
    rollback)
      [[ $# -eq 1 ]] || usage
      rollback_release
      ;;
    *)
      usage
      ;;
  esac
}

main "$@"
