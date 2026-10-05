#!/bin/bash
set -u
docker-entrypoint.sh postgres "$@" &
until pg_isready -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do sleep 0.5; done
if [ "${APP_DISABLED:-0}" = "1" ]; then
  wait
fi
cd "$APP_DIR" || exit 1
while true; do
  setpriv --reuid="$HOST_UID" --regid="$HOST_GID" --clear-groups node /cluster.cjs
  echo "next exited ($?), restarting"
  sleep 0.5
done
