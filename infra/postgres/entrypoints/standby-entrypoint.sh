#!/usr/bin/env bash
# standby-entrypoint.sh — خودکارستاندبایِ streaming:
#   ۱) رمزِ تکرار فقط در فایلِ .pgpass با دسترسیِ 0600 نوشته می‌شود (هیچ رمزِ
#      متنی در postgresql.auto.conf یا خطِ فرمانِ فرآیند قرار نمی‌گیرد) و در هر
#      راه‌اندازیِ کانتینر به‌روزرسانی می‌شود.
#   ۲) اگر PGDATA خالی است: base backup زنده از primary با pg_basebackup (یا
#      از فضای شیئی هنگامِ STANDBY_BOOTSTRAP=repo)؛ سپس standby.signal +
#      postgresql.auto.conf با passfile= و restore_command؛ در نهایت exec.
#   recoveryِ نقطه‌ای (PITR) کارِ این فایل نیست → tools/pitr-restore.sh
set -euo pipefail

: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD لازم است}"
PRIMARY_HOST="${PRIMARY_HOST:-pg-primary}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
PGHA_USER="${PGHA_USER:-postgres}"
PGPASS_FILE="${STANDBY_PGPASSFILE:-/var/lib/postgresql/.pgpass}"

umask 0077
mkdir -p "$(dirname "$PGPASS_FILE")"
escaped_repl_pw="$(printf '%s' "$REPLICATION_PASSWORD" | sed -e 's/\\/\\\\/g' -e 's/:/\\:/g')"
printf '*:*:*:replicator:%s\n' "$escaped_repl_pw" > "${PGPASS_FILE}.tmp"
chmod 0600 "${PGPASS_FILE}.tmp"
if [ "$(id -u)" -eq 0 ]; then
  chown postgres:postgres "${PGPASS_FILE}.tmp"
fi
mv -f "${PGPASS_FILE}.tmp" "$PGPASS_FILE"
export PGPASSFILE="$PGPASS_FILE"
unset PGPASSWORD

esc_connval() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e "s/'/\\\\'/g"
}

write_standby_autoconf() {
  local auto_conf="$PGDATA/postgresql.auto.conf"
  local tmp_conf="${auto_conf}.tmp"
  if [ -f "$auto_conf" ]; then
    sed -E '/^(primary_conninfo|restore_command|recovery_target_timeline|hot_standby|primary_slot_name)[[:space:]]*=/d' "$auto_conf" > "$tmp_conf"
  else
    : > "$tmp_conf"
  fi
  {
    printf "primary_conninfo = 'user=replicator passfile=%s host=%s port=%s application_name=payesh-standby sslmode=disable'\n" \
      "$(esc_connval "$PGPASS_FILE")" "$(esc_connval "$PRIMARY_HOST")" "$(esc_connval "$PRIMARY_PORT")"
    echo "restore_command = 'pgbackrest --stanza=payesh archive-get %f %p'"
    echo "recovery_target_timeline = 'latest'"
    echo "hot_standby = on"
    echo "primary_slot_name = ''"
  } >> "$tmp_conf"
  chmod 0600 "$tmp_conf"
  if [ "$(id -u)" -eq 0 ]; then
    chown postgres:postgres "$tmp_conf"
  fi
  mv -f "$tmp_conf" "$auto_conf"
}

"${RENDER_CONFIG_BIN:-/opt/payesh/entrypoints/render-config.sh}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  mkdir -p "$PGDATA"
  find "$PGDATA" -mindepth 1 -delete
  if [ "$(id -u)" -eq 0 ]; then
    chown postgres:postgres "$PGDATA"
  fi
  chmod 0700 "$PGDATA"
  if [ "${STANDBY_BOOTSTRAP:-stream}" = "repo" ]; then
    echo "standby: bootstrap از فضای شیئی (pgbackrest restore --type=prefer)"
    env -u PGPASSWORD PGPASSFILE="$PGPASS_FILE" gosu postgres pgbackrest --stanza=payesh --delta --type=prefer restore
  else
    echo "standby: pg_basebackup از ${PRIMARY_HOST}:${PRIMARY_PORT}"
    env -u PGPASSWORD PGPASSFILE="$PGPASS_FILE" gosu postgres pg_basebackup -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" \
      -U replicator -D "$PGDATA" -X stream -c fast -P
  fi
  touch "$PGDATA/standby.signal"
  write_standby_autoconf
  if [ "$(id -u)" -eq 0 ]; then
    chown -R postgres:postgres "$PGDATA"
  fi
  chmod 0700 "$PGDATA"
  echo "standby: bootstrapped (standby.signal + auto.conf نوشته شد)"
elif [ -f "$PGDATA/standby.signal" ]; then
  write_standby_autoconf
fi

exec env -u PGPASSWORD PGPASSFILE="$PGPASS_FILE" "${DOCKER_ENTRYPOINT_BIN:-/usr/local/bin/docker-entrypoint.sh}" "$@"
