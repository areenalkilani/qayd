#!/bin/sh
set -eu
umask 077
cd "$(dirname "$0")/.."
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
if [ -z "$(docker compose ps --status running -q api)" ]; then
  echo 'API must be running before this coordinated backup.' >&2
  exit 1
fi
resume_api() { docker compose start api; }
trap resume_api EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Stop all application writes until both snapshots are complete.
docker compose stop -t 60 api
docker compose exec -T db pg_dump -U postgres -d qayd -Fc > "backups/$stamp.dump.partial"
docker compose run --rm -T --no-deps api tar -C /app/storage -czf - . > "backups/$stamp.files.tar.gz.partial"
mv "backups/$stamp.dump.partial" "backups/$stamp.dump"
mv "backups/$stamp.files.tar.gz.partial" "backups/$stamp.files.tar.gz"
docker compose start api
trap - EXIT INT TERM
printf 'Backup saved: %s\n' "$stamp"
