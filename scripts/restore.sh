#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
stamp=${1:?Pass a backup timestamp}
case "$stamp" in *[!0-9TZ]*) echo 'Invalid timestamp'; exit 1;; esac
test -f "backups/$stamp.dump"
test -f "backups/$stamp.files.tar.gz"
if [ "${CONFIRM_RESTORE:-}" != "$stamp" ]; then
  echo 'Restore replaces the database. Take a current backup and set CONFIRM_RESTORE to the selected timestamp.'
  exit 1
fi
docker compose stop web api
docker compose exec -T db pg_restore -U postgres -d qayd --clean --if-exists --exit-on-error < "backups/$stamp.dump"
docker compose run --rm -T --no-deps api tar -C /app/storage -xzf - < "backups/$stamp.files.tar.gz"
docker compose up -d api web
