#!/usr/bin/env bash
# WAL disk-full drill — infrastructure setup.
#
# Brings up a REAL PostgreSQL 17 cluster on port 55432 whose pg_wal directory
# lives on a size-capped tmpfs, which is what makes a genuine ENOSPC (and
# therefore a genuine PANIC) reproducible instead of simulated.
#
# Idempotent: safe to re-run after a sandbox restart, where everything outside
# /home/user (apt packages, tmpfs mounts) is lost but the repo survives.
#
# Usage:  sudo -n bash tools/wal-drill/setup-pg.sh [--force-reinit]

set -euo pipefail

PORT="${PGDRILL_PORT:-55432}"
ROOT="${PGDRILL_ROOT:-/home/user/pgdrill}"
WAL_MB="${PGDRILL_WAL_MB:-100}"
RUN_USER="${PGDRILL_USER:-pgdrill}"
FORCE_REINIT=0
[ "${1:-}" = "--force-reinit" ] && FORCE_REINIT=1

PGBIN=/usr/lib/postgresql/17/bin

log() { printf '\033[1m[setup]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[setup] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "must run as root (uses passwordless sudo in this sandbox)"

# --- 1. packages -----------------------------------------------------------
if [ ! -x "$PGBIN/initdb" ]; then
  log "installing postgresql-17 ..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get install -y -q postgresql postgresql-client >/dev/null 2>&1 \
    || apt-get install -y postgresql postgresql-client >/dev/null
  apt-get update -q >/dev/null 2>&1 || true
  apt-get install -y -q postgresql postgresql-client >/dev/null
fi
[ -x "$PGBIN/initdb" ] || die "initdb still missing after install"
log "postgres: $("$PGBIN/postgres" --version)"

# --- 2. unprivileged owner -------------------------------------------------
# The Debian package normally creates a 'postgres' user; in this sandbox it is
# absent, and postgres refuses to run as root. Create a dedicated owner instead.
id "$RUN_USER" >/dev/null 2>&1 || {
  useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin "$RUN_USER"
  log "created system user '$RUN_USER'"
}

# --- 3. tmpfs-backed pg_wal ------------------------------------------------
mkdir -p "$ROOT"/{wal/archive,run,log}
if ! mountpoint -q "$ROOT/wal"; then
  mount -t tmpfs -o "size=${WAL_MB}M,mode=0700" tmpfs "$ROOT/wal"
  log "mounted tmpfs (${WAL_MB}M) at $ROOT/wal"
else
  log "tmpfs already mounted at $ROOT/wal"
fi
chown -R "$RUN_USER:$RUN_USER" "$ROOT"
chmod 755 "$ROOT/log"   # drill test reads PANIC lines as an unprivileged user
chmod 644 "$ROOT/log"/* 2>/dev/null || true

# /home/user is 0700, so the drill user cannot even traverse into $ROOT.
# 0711 grants traversal only — it does not expose a directory listing.
[ "$(stat -c %a /home/user)" = 700 ] && chmod 711 /home/user && log "relaxed /home/user to 0711 (traverse only)"

# --- 4. cluster ------------------------------------------------------------
if [ "$FORCE_REINIT" = 1 ] || [ ! -s "$ROOT/data/PG_VERSION" ]; then
  # initdb refuses to run while the postmaster owns the data directory.
  sudo -n -u "$RUN_USER" "$PGBIN/pg_ctl" -D "$ROOT/data" -m immediate -w stop >/dev/null 2>&1 || true
  rm -rf "$ROOT/data"; mkdir -p "$ROOT/data"; chown "$RUN_USER:$RUN_USER" "$ROOT/data"
  # initdb refuses a non-empty --waldir, so clear leftover segments too.
  find "$ROOT/wal" -mindepth 1 -delete 2>/dev/null || true
  log "initdb (pg_wal -> tmpfs) ..."
  sudo -n -u "$RUN_USER" "$PGBIN/initdb" -D "$ROOT/data" --waldir="$ROOT/wal" --wal-segsize=1 \
      -U postgres --auth-local=trust --auth-host=trust --no-instructions >/dev/null
else
  log "cluster already initialised at $ROOT/data"
fi

# --- 5. postgresql.conf ----------------------------------------------------
CONF="$ROOT/data/postgresql.conf"
MARKER="# ==== WAL-DRILL-BEGIN (tools/wal-drill/setup-pg.sh) ===="
# Strip any block appended by an earlier run so re-running stays idempotent
# instead of stacking duplicate settings into the file.
sed -i "/^# ==== WAL-DRILL-BEGIN/,\$d" "$CONF"
{
  echo ""
  echo "$MARKER"
  echo "port = $PORT"
  echo "listen_addresses = '127.0.0.1'"
  echo "unix_socket_directories = '$ROOT/run'"
  echo "max_connections = 60"
  echo "shared_buffers = 64MB"
  echo "wal_level = replica"
  echo "max_wal_senders = 4"
  echo "max_replication_slots = 4"
  echo "wal_keep_size = 16MB"
  echo "hot_standby = on"
  echo "synchronous_commit = on"
  echo "full_page_writes = on"
  echo "# Small WAL budget + 1MB segments so a ${WAL_MB}M tmpfs is reachable in a drill."
  echo "min_wal_size = 2MB"
  echo "max_wal_size = 8MB"
  echo "wal_writer_delay = 200ms"
  echo "checkpoint_timeout = 5min"
  echo "archive_mode = on"
  echo "archive_command = 'cp %p $ROOT/wal/archive/%f'"
  echo "# off: the collector buffers, and on a PANIC the buffer is lost with the"
  echo "# postmaster. stderr redirected by pg_ctl -l survives the crash."
  echo "logging_collector = off"
  echo "log_directory = '$ROOT/log'"
  echo "log_filename = 'postgresql-drill.log'"
  echo "log_file_mode = 0644"
  echo "log_truncate_on_rotation = on"
  echo "log_min_messages = debug1"
  echo "log_checkpoints = on"
  echo "log_statement = 'none'"
} >> "$CONF"
chown "$RUN_USER:$RUN_USER" "$CONF"
log "postgresql.conf configured (port $PORT, wal budget 2-8MB, 1MB segments)"

# --- 6. start (idempotent: a running cluster is not an error) --------------
if sudo -n -u "$RUN_USER" "$PGBIN/pg_ctl" -D "$ROOT/data" status >/dev/null 2>&1; then
  log "postgres already running"
else
  sudo -n -u "$RUN_USER" "$PGBIN/pg_ctl" -D "$ROOT/data" -w -t 60 start >/dev/null 2>&1 || {
    tail -20 "$ROOT/data/log/"*.log 2>/dev/null >&2 || true
    die "postgres failed to start"
  }
fi

PSQL=(sudo -n -u "$RUN_USER" "$PGBIN/psql" -h "$ROOT/run" -p "$PORT" -U postgres -Atc)

# --- 7. verify the tmpfs really is pg_wal ----------------------------------
# This assertion is the whole point of the drill: if pg_wal is not the capped
# tmpfs, any "disk full" we observe later would be theatre, not evidence.
ACTUAL_WAL="$(readlink -f "$ROOT/data/pg_wal")"
log "pg_wal resolves to: $ACTUAL_WAL"
mountpoint -q "$ACTUAL_WAL" || die "pg_wal is NOT a mountpoint — the size cap would be fake"
log "pg_wal IS a mountpoint (capacity $(df -h "$ACTUAL_WAL" | awk 'NR==2{print $2}'))"

"${PSQL[@]}" "select 'ready: postgres ' || current_setting('server_version') || ' on port ' || current_setting('port')"

# --- 8. database + migrations ----------------------------------------------
# Kept in the setup so that --force-reinit yields a cluster the drill can use
# immediately, instead of leaving migrations as a manual follow-up step.
REPO="${PGDRILL_REPO:-/home/user/p2}"
DB="${PGDRILL_DB:-payesh}"
if [ ! -d "$REPO/migrations" ]; then
  log "repo migrations not found at $REPO/migrations - skipping schema load"
else
  "${PSQL[@]}" "select 1 from pg_database where datname='$DB'" | grep -q 1 \
    || "${PSQL[@]}" "create database $DB" >/dev/null
  log "applying migrations to $DB ..."
  for f in "$REPO"/migrations/[0-9]*.sql; do
    case "$f" in *.down.sql) continue ;; esac
    if sudo -n -u "$RUN_USER" "$PGBIN/psql" -h "$ROOT/run" -p "$PORT" -U postgres -d "$DB" \
         -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1; then
      log "  ok   $(basename "$f")"
    else
      log "  note $(basename "$f") not applied (already present, or not idempotent)"
    fi
  done
  # Connect to $DB itself: information_schema is per-database, so filtering on
  # table_catalog from the default 'postgres' connection always reports 0.
  TABLES="$(sudo -n -u "$RUN_USER" "$PGBIN/psql" -h "$ROOT/run" -p "$PORT" -U postgres -d "$DB" \
    -Atc "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null || echo '?')"
  log "schema ready: $TABLES public tables in $DB"
fi

log "done. connect with: psql -h $ROOT/run -p $PORT -U postgres"
