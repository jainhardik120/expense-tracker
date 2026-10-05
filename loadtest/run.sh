#!/bin/bash
set -u
cd "$(dirname "$0")" || exit 1
CONTAINER=${CONTAINER:-et-ci}
OUT=${OUT:-results}
PAGES=${PAGES:-dashboard budget statements reports investments}
LEVELS=${LEVELS:-10 25 50 100}
DURATION=${DURATION:-45s}
WARMUP=${WARMUP:-15s}
SETTLE=${SETTLE:-5}
mkdir -p "$OUT"

psql_exec() {
  docker exec "$CONTAINER" psql -U "${POSTGRES_USER:-expense}" -d "${POSTGRES_DB:-expense_tracker}" "$@"
}

path_for() {
  case "$1" in
    dashboard) echo "/" ;;
    inbox-*) echo "/inbox/${1#inbox-}" ;;
    *) echo "/$1" ;;
  esac
}

cpu_usec() {
  docker exec "$CONTAINER" awk '/^usage_usec/ {print $2}' /sys/fs/cgroup/cpu.stat
}

restarts() {
  docker logs "$CONTAINER" 2>&1 | grep -c 'exited'
}

sample_stats() {
  while true; do
    docker stats --no-stream --format '{{.MemUsage}}|{{.CPUPerc}}' "$CONTAINER"
    sleep 1
  done
}

k6_limit() {
  local seconds
  case "$1" in
    *m) seconds=$((${1%m} * 60)) ;;
    *s) seconds=${1%s} ;;
    *) seconds=$1 ;;
  esac
  echo $((seconds + 120))
}

for page in $PAGES; do
  path=$(path_for "$page")
  first_level=${LEVELS%% *}
  timeout "$(k6_limit "$WARMUP")" k6 run -q --no-color -e USERS_FILE="$USERS_FILE" -e BASE="$BASE" \
    -e PAGE_PATH="$path" -e VUS="$first_level" -e DURATION="$WARMUP" page.js > /dev/null 2>&1 || true
  psql_exec -tAc "select pg_stat_statements_reset()" > /dev/null
  for vus in $LEVELS; do
    label="$page-$vus"
    restarts_before=$(restarts)
    sample_stats > "$OUT/$label.stats" 2> /dev/null &
    stats=$!
    cpu_before=$(cpu_usec)
    timeout "$(k6_limit "$DURATION")" k6 run -q --no-color -e USERS_FILE="$USERS_FILE" -e BASE="$BASE" \
      -e PAGE_PATH="$path" -e VUS="$vus" -e DURATION="$DURATION" --summary-export "$OUT/$label.json" \
      page.js > "$OUT/$label.log" 2>&1 || true
    cpu_after=$(cpu_usec)
    kill "$stats" 2> /dev/null || true
    wait "$stats" 2> /dev/null || true
    oom=$(docker inspect "$CONTAINER" --format '{{.State.OOMKilled}}')
    printf '{"page":"%s","path":"%s","vus":%s,"cpuUsec":%s,"restarts":%s,"oomKilled":%s}\n' \
      "$page" "$path" "$vus" "$((cpu_after - cpu_before))" "$(( $(restarts) - restarts_before ))" "$oom" \
      > "$OUT/$label.meta.json"
    echo "$label done"
    sleep "$SETTLE"
  done
  psql_exec -tA -F $'\t' -c "
    select calls, round(total_exec_time::numeric, 1), round(mean_exec_time::numeric, 2),
           round(mean_plan_time::numeric, 2), rows / greatest(calls, 1),
           (shared_blks_hit + shared_blks_read) / greatest(calls, 1),
           left(regexp_replace(query, '\s+', ' ', 'g'), 160)
    from pg_stat_statements
    where dbid = (select oid from pg_database where datname = current_database())
      and query not like '%pg_stat_statements%'
    order by total_exec_time desc limit 8" > "$OUT/$page.queries.tsv"
done
