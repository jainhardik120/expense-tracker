#!/usr/bin/env bash
set -euo pipefail

ET_CONFIG_DIR="$HOME/.config/expense-tracker"
STANDBY_ENV="$ET_CONFIG_DIR/standby.env"
DB_CONTAINER=expense-tracker-db
DB_IMAGE=expense-tracker-db:18.6

started=$(date +%s)
docker exec "$DB_CONTAINER" pg_dump -U expense -d expense_tracker -Fc --no-owner --no-acl --no-statistics --exclude-extension=pg_trgm |
  docker run --rm -i --env-file "$STANDBY_ENV" "$DB_IMAGE" sh -c \
    'exec pg_restore -d "$STANDBY_DATABASE_URL" --clean --if-exists --no-owner --no-acl --single-transaction --exit-on-error'
echo "[standby] copied to the standby database in $(($(date +%s) - started))s"
