#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER=${DB_CONTAINER:-expense-tracker-db}
DRIZZLE_DIR=${1:-"$(cd "$(dirname "$0")/../web/drizzle" && pwd)"}

run_sql() {
  docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$DB_CONTAINER" psql -U expense -d expense_tracker -v ON_ERROR_STOP=1 -qAt "$@"
}

run_sql -c 'CREATE SCHEMA IF NOT EXISTS drizzle' -c 'CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)'
last=$(run_sql -c 'SELECT coalesce(max(created_at), 0) FROM drizzle.__drizzle_migrations')

pending=0
while IFS=$'\t' read -r tag when; do
  [ "$when" -gt "$last" ] || continue
  file="$DRIZZLE_DIR/$tag.sql"
  hash=$(sha256sum "$file" | cut -d' ' -f1)
  echo "[migrate] applying $tag"
  {
    echo 'BEGIN;'
    sed 's/--> statement-breakpoint//' "$file"
    echo
    echo "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('$hash', $when);"
    echo 'COMMIT;'
  } | run_sql
  pending=$((pending + 1))
done < <(jq -r '.entries[] | "\(.tag)\t\(.when)"' "$DRIZZLE_DIR/meta/_journal.json")

echo "[migrate] $pending applied"
