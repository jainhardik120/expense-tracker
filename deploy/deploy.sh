#!/usr/bin/env bash
set -euo pipefail

BRANCH=master
REMOTE=https://github.com/jainhardik120/expense-tracker.git
REPO_DIR="$HOME/deploy/expense-tracker"
export ET_CONFIG_DIR="$HOME/.config/expense-tracker"
export ET_DATA_DIR="$HOME/.local/share/expense-tracker"
ENV_FILE="$ET_CONFIG_DIR/prod.env"
STATE_FILE="$ET_CONFIG_DIR/compose.env"
FAILED_FILE="$ET_CONFIG_DIR/failed-sha"
CANDIDATE=expense-tracker-candidate
HEALTH_TRIES=40
KEEP_IMAGES=3

log() {
  echo "[deploy] $*"
}

env_value() {
  grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'
}

compose() {
  docker compose --project-directory "$REPO_DIR/deploy" -f "$REPO_DIR/deploy/docker-compose.yml" \
    --env-file "$STATE_FILE" "$@"
}

wait_healthy() {
  local status=''
  for _ in $(seq 1 "$HEALTH_TRIES"); do
    status=$(docker inspect --format '{{.State.Health.Status}}' "$1" 2>/dev/null || echo missing)
    [ "$status" = healthy ] && return 0
    sleep 3
  done
  log "$1 ended as $status"
  return 1
}

build_image() {
  docker build "$REPO_DIR/web" \
    --tag "$1" \
    --label "org.opencontainers.image.revision=$2" \
    --build-arg "NEXT_PUBLIC_BASE_URL=$(env_value NEXT_PUBLIC_BASE_URL)" \
    --build-arg "NEXT_PUBLIC_POSTHOG_KEY=$(env_value NEXT_PUBLIC_POSTHOG_KEY)" \
    --build-arg "NEXT_PUBLIC_POSTHOG_HOST=$(env_value NEXT_PUBLIC_POSTHOG_HOST)"
}

check_candidate() {
  docker rm -f "$CANDIDATE" >/dev/null 2>&1 || true
  docker run -d --name "$CANDIDATE" --env-file "$ENV_FILE" \
    -e OTEL_SDK_DISABLED=true "$1" >/dev/null
  local result=0
  wait_healthy "$CANDIDATE" || result=1
  [ "$result" = 0 ] || docker logs --tail 40 "$CANDIDATE" 2>&1 || true
  docker rm -f "$CANDIDATE" >/dev/null
  return "$result"
}

swap_app() {
  local previous=$1 image=$2
  echo "APP_IMAGE=$image" >"$STATE_FILE"
  compose up -d --no-deps app
  if wait_healthy expense-tracker-app; then
    return 0
  fi
  log "new image is unhealthy"
  if [ -n "$previous" ]; then
    echo "APP_IMAGE=$previous" >"$STATE_FILE"
    compose up -d --no-deps app
    log "rolled back to $previous"
  fi
  return 1
}

prune_images() {
  docker image ls expense-tracker --format '{{.CreatedAt}}|{{.Repository}}:{{.Tag}}' | sort -r |
    tail -n +"$((KEEP_IMAGES + 1))" | cut -d'|' -f2 | xargs -r docker image rm >/dev/null || true
}

deploy() {
  local sha=$1 previous_sha=$2
  local previous_image='' image="expense-tracker:${sha:0:12}"
  [ -f "$STATE_FILE" ] && previous_image=$(cut -d= -f2- "$STATE_FILE")

  if [ -n "$previous_sha" ] && git -C "$REPO_DIR" cat-file -e "$previous_sha" 2>/dev/null &&
    git -C "$REPO_DIR" diff --quiet "$previous_sha" "$sha" -- web deploy; then
    log "nothing to rebuild in ${sha:0:12}"
    echo "$sha" >"$ET_CONFIG_DIR/deployed-sha"
    return 0
  fi

  log "building ${sha:0:12}"
  if ! build_image "$image" "$sha" || ! check_candidate "$image" ||
    ! swap_app "$previous_image" "$image"; then
    echo "$sha" >"$FAILED_FILE"
    log "deploy of ${sha:0:12} failed, the running version stays up"
    return 1
  fi

  compose up -d --remove-orphans
  if [ -n "$previous_sha" ] && ! git -C "$REPO_DIR" diff --quiet "$previous_sha" "$sha" -- deploy; then
    compose up -d --force-recreate alloy jaeger prometheus loki grafana
  fi
  echo "$sha" >"$ET_CONFIG_DIR/deployed-sha"
  rm -f "$FAILED_FILE"
  prune_images
  log "${sha:0:12} is live"
}

main() {
  mkdir -p "$ET_DATA_DIR/postgres"
  exec 9>"$ET_CONFIG_DIR/deploy.lock"
  flock -n 9 || exit 0

  local sha deployed='' failed=''
  sha=$(git ls-remote "$REMOTE" "refs/heads/$BRANCH" | cut -f1)
  [ -n "$sha" ] || exit 1
  [ -f "$ET_CONFIG_DIR/deployed-sha" ] && deployed=$(cat "$ET_CONFIG_DIR/deployed-sha")
  [ -f "$FAILED_FILE" ] && failed=$(cat "$FAILED_FILE")
  if [ "$sha" = "$deployed" ] || [ "$sha" = "$failed" ]; then
    exit 0
  fi

  git -C "$REPO_DIR" fetch --quiet origin "$BRANCH"
  git -C "$REPO_DIR" reset --quiet --hard "$sha"
  git -C "$REPO_DIR" clean -fdq
  deploy "$sha" "$deployed"
}

main "$@"
exit
