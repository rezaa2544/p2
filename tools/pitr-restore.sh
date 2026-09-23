#!/usr/bin/env bash
# Isolated native PostgreSQL recovery. --no-start/--no-verify are preparation,
# not successful restore evidence. Real verification requires an approved
# expected dataset manifest captured at the intended committed recovery point.
set -euo pipefail
STANZA="${PBR_STANZA:-payesh}"; DEST="${PBR_DEST_ROOT:-/var/backups/payesh-pitr}"; PORT="${PBR_PORT:-54329}"
MANIFEST="${PITR_EXPECT_MANIFEST:-}"; NO_START=0; NO_VERIFY=0; SELECTED=0; STARTED=0
export PGDATABASE="${PGDATABASE:-payesh}" PGUSER="${PGUSER:-postgres}" PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-5}"
declare -a OPTS=()
usage(){ echo "usage: $0 (--time TS|--name NAME|--xid ID|--latest) [--manifest FILE] [--dest DIR] [--port PORT] [--stanza NAME] [--no-start] [--no-verify]" >&2; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    --time|--name|--xid)
      [ $# -ge 2 ] && [ -n "$2" ] && [ "$SELECTED" = 0 ] || usage
      OPTS=("--type=${1#--}" "--target=$2" '--target-action=promote'); SELECTED=1; shift 2;;
    --latest) [ "$SELECTED" = 0 ] || usage; OPTS=(--type=default); SELECTED=1; shift;;
    --native) shift;; # compatible alias for the documented native-only mode
    --manifest) [ $# -ge 2 ] || usage; MANIFEST="$2"; shift 2;;
    --dest) [ $# -ge 2 ] || usage; DEST="$2"; shift 2;;
    --port) [ $# -ge 2 ] || usage; PORT="$2"; shift 2;;
    --stanza) [ $# -ge 2 ] || usage; STANZA="$2"; shift 2;;
    --no-start) NO_START=1; shift;;
    --no-verify) NO_VERIFY=1; shift;;
    *) usage;;
  esac
done
[ "$SELECTED" = 1 ] || usage
[[ "$PORT" =~ ^[0-9]{1,5}$ ]] && ((10#$PORT>0 && 10#$PORT<65536)) || usage
[[ "$STANZA" =~ ^[a-zA-Z0-9_-]+$ ]] || usage
[ -z "${PBR_EXEC:-}" ] || { echo 'FAIL: container restore must run wholly inside its target namespace; native wrapper does not support PBR_EXEC' >&2; exit 1; }
if [ "$NO_START" = 0 ] && [ "$NO_VERIFY" = 0 ]; then
  [ -r "$MANIFEST" ] || { echo 'FAIL: --manifest required for verified recovery' >&2; exit 1; }
fi
for bin in pgbackrest psql pg_ctl pg_controldata python3; do command -v "$bin" >/dev/null || { echo "FAIL: missing $bin" >&2; exit 1; }; done
mkdir -p "$DEST"; DEST="$(cd "$DEST" && pwd)"
# Config path interpolation is deliberately restricted (no SQL/conf quoting ambiguity).
[[ "$DEST" =~ ^/[a-zA-Z0-9_./-]+$ ]] || { echo 'FAIL: unsafe destination path' >&2; exit 1; }
RUN_DIR="$(mktemp -d "$DEST/pitr-XXXXXXXX")"; chmod 700 "$RUN_DIR"
mkdir -p "$RUN_DIR/data" "$RUN_DIR/run" "$RUN_DIR/log" "$RUN_DIR/etc"; chmod 700 "$RUN_DIR/data"
cleanup(){ local rc=$?; if [ "$rc" != 0 ] && [ "$STARTED" = 1 ]; then pg_ctl -D "$RUN_DIR/data" -m immediate -w stop >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT
printf 'PITR_RUN_DIR=%s\n' "$RUN_DIR"
pgbackrest --stanza="$STANZA" --pg1-path="$RUN_DIR/data" "${OPTS[@]}" restore
# Preserve pgBackRest's restore_command (including target pg1-path/config).
# Standby safety limits must be no lower than the values recorded in WAL.
CONTROL="$(LC_ALL=C pg_controldata "$RUN_DIR/data")"
cat > "$RUN_DIR/etc/postgresql.conf" <<CONF
port = $PORT
unix_socket_directories = '$RUN_DIR/run'
listen_addresses = 'localhost'
fsync = on
synchronous_commit = on
full_page_writes = on
logging_collector = on
log_directory = '$RUN_DIR/log'
CONF
for spec in 'max_connections:max_connections' 'max_worker_processes:max_worker_processes' 'max_wal_senders:max_wal_senders' 'max_prepared_xacts:max_prepared_transactions' 'max_locks_per_xact:max_locks_per_transaction'; do
  key="${spec%%:*}"; setting="${spec##*:}"
  value="$(printf '%s\n' "$CONTROL" | awk -F: -v k="$key setting" '$1==k {gsub(/ /,"",$2);print $2}')"
  [[ "$value" =~ ^[0-9]+$ ]] || { echo "FAIL: missing recovery control limit $key" >&2; exit 1; }
  printf '%s = %s\n' "$setting" "$value" >> "$RUN_DIR/etc/postgresql.conf"
done
if [ "$NO_START" = 1 ]; then echo "PITR_PREPARED_NOT_VERIFIED dir=$RUN_DIR"; exit 0; fi
STARTED=1
pg_ctl -D "$RUN_DIR/data" -o "-c config_file=$RUN_DIR/etc/postgresql.conf" -l "$RUN_DIR/log/boot.log" -w -t 120 start
READY=0
for _ in $(seq 1 120); do
  if [ "$(PGHOST="$RUN_DIR/run" PGPORT="$PORT" psql -X -tAc 'SELECT pg_is_in_recovery()' 2>/dev/null || true)" = f ]; then READY=1; break; fi
  sleep 1
done
[ "$READY" = 1 ] || { echo 'FAIL: target did not finish recovery' >&2; exit 1; }
if [ "$NO_VERIFY" = 1 ]; then echo "PITR_RUNNING_NOT_VERIFIED dir=$RUN_DIR"; exit 0; fi
PGHOST="$RUN_DIR/run" PGPORT="$PORT" bash "$(dirname "$0")/pitr-verify.sh" --manifest "$MANIFEST" --expect-data-dir "$RUN_DIR/data"
echo "PITR_READY dir=$RUN_DIR port=$PORT socket=$RUN_DIR/run"
echo "Cleanup: pg_ctl -D '$RUN_DIR/data' -m fast -w stop"
