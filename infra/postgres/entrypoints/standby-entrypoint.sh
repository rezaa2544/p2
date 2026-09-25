#!/usr/bin/env bash
# standby-entrypoint.sh — خودکارستاندبایِ streaming:
#   ۱) اگر PGDATA خالی است: base backup زنده از primary (pg_basebackup با
#      -R → primary_conninfo خودش نوشته می‌شود). اگر STANDBY_BOOTSTRAP=repo
#      باشد، به‌جایش از فضای شیئی restore می‌شود (PITR-not-target: --type=latest)
#      و primary_conninfo از env ساخته می‌شود.
#   ۲) standby.signal + restore_command برایِ دنبال‌کردنِ archive در شکافِ
#      شبکه؛ سپس exec postgres.
#   recoveryِ نقطه‌ای (PITR) کارِ این فایل نیست → tools/pitr-restore.sh
set -euo pipefail

: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD لازم است}"
PRIMARY_HOST="${PRIMARY_HOST:-pg-primary}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
PGHA_USER="${PGHA_USER:-postgres}"

/opt/payesh/entrypoints/render-config.sh

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  rm -rf "$PGDATA"; mkdir -p "$PGDATA"; chmod 0700 "$PGDATA"
  if [ "${STANDBY_BOOTSTRAP:-stream}" = "repo" ]; then
    echo "standby: bootstrap از فضای شیئی (pgbackrest restore --type=prefer)"
    pgbackrest --stanza=payesh --delta --type=prefer restore
  else
    echo "standby: pg_basebackup از ${PRIMARY_HOST}:${PRIMARY_PORT}"
    PGPASSWORD="$REPLICATION_PASSWORD" pg_basebackup -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" \
      -U replicator -D "$PGDATA" -R -X stream -c fast -P -S "" 2>/dev/null \
    || PGPASSWORD="$REPLICATION_PASSWORD" pg_basebackup -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" \
      -U replicator -D "$PGDATA" -R -X stream -c fast -P
  fi
  touch "$PGDATA/standby.signal"
  {
    echo "primary_conninfo = 'user=replicator password=${REPLICATION_PASSWORD} host=${PRIMARY_HOST} port=${PRIMARY_PORT} application_name=payesh-standby sslmode=disable'"
    echo "restore_command = 'pgbackrest --stanza=payesh archive-get %f %p'"
    echo "recovery_target_timeline = 'latest'"
    echo "hot_standby = on"
    echo "primary_slot_name = ''"
  } >> "$PGDATA/postgresql.auto.conf"
  echo "standby: bootstrapped (standby.signal + auto.conf نوشته شد)"
fi

exec /usr/local/bin/docker-entrypoint.sh "$@"
