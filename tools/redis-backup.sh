#!/usr/bin/env bash
# Local Redis RDB + complete AOF snapshot. Accept only the committed manifest;
# a file's existence or redis-cli exit 0 alone is not success. See DR_EVIDENCE_CONTRACT.
set -euo pipefail
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"; REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_DIR="${REDIS_DIR:-/var/lib/redis/node-1}"; BACKUP_DIR="${BACKUP_DIR:-/var/backups/payesh-redis}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"; BACKUP_LOCK="${BACKUP_LOCK:-/var/lock/payesh-redis-backup.lock}"
REDIS_CLI="${REDIS_CLI:-redis-cli}"; REDIS_CLI_TIMEOUT="${REDIS_CLI_TIMEOUT:-15}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"; STAGE=''
log(){ echo "[redis-backup $TS] $*"; }
die(){ log "FATAL: $*" >&2; exit 1; }
rcli(){ timeout "$REDIS_CLI_TIMEOUT" "$REDIS_CLI" --raw -h "$REDIS_HOST" -p "$REDIS_PORT" "$@"; }
exec 9>"$BACKUP_LOCK"
flock -n 9 || { log 'lock busy; no backup created' >&2; exit 75; }
# Local file copy is intentionally native/loopback only; use a remote-native job otherwise.
case "$REDIS_HOST" in 127.0.0.1|localhost|::1) ;; *) die 'remote endpoint cannot attest local Redis files';; esac
[[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] || die 'invalid retention'
if [ -n "${BACKUP_S3:-}" ]; then
  command -v aws >/dev/null || die 'BACKUP_S3 requested but aws is missing'
  [[ "${BACKUP_S3_OWNER:-}" =~ ^[0-9]{12}$ ]] || die 'BACKUP_S3_OWNER expected account ID required'
fi
[ -z "${REDIS_PASSWORD:-}" ] || export REDISCLI_AUTH="$REDIS_PASSWORD"
[ "$(rcli PING)" = PONG ] || die 'PING failed semantically'
config(){ local response; response="$(rcli CONFIG GET "$1")" || return; [ "$(printf '%s\n' "$response" | head -1)" = "$1" ] || return 1; printf '%s\n' "$response" | tail -n +2; }
DIR_ACTUAL="$(config dir)" || die 'cannot attest Redis dir'
DBFILE="$(config dbfilename)" || die 'cannot attest Redis dbfilename'
[ "$(realpath -e "$REDIS_DIR")" = "$(realpath -e "$DIR_ACTUAL")" ] || die 'REDIS_DIR does not match endpoint configuration'
[[ "$DBFILE" =~ ^[a-zA-Z0-9_.-]+$ ]] && [ "$DBFILE" != .. ] || die 'unsafe dbfilename'
identity(){ rcli INFO server | tr -d '\r' | sed -n 's/^run_id://p'; }
RUN_ID="$(identity)"; [[ "$RUN_ID" =~ ^[a-f0-9]{40}$ ]] || die 'missing Redis run_id'
mkdir -p "$BACKUP_DIR"; BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"
[ ! -e "$BACKUP_DIR/dump-$TS.rdb" ] || die 'snapshot name collision; retry with new timestamp'
STAGE="$(mktemp -d "$BACKUP_DIR/.stage-XXXXXXXX")"
trap 'rm -rf -- "$STAGE"' EXIT
[ "$(rcli SAVE)" = OK ] || die 'SAVE failed semantically'
[ -f "$REDIS_DIR/$DBFILE" ] && [ ! -L "$REDIS_DIR/$DBFILE" ] || die 'invalid RDB file'
cp -- "$REDIS_DIR/$DBFILE" "$STAGE/dump-$TS.rdb"
redis-check-rdb "$STAGE/dump-$TS.rdb" >/dev/null || die 'RDB checksum validation failed'
AOF_ENABLED="$(config appendonly)" || die 'cannot read appendonly mode'
if [ "$AOF_ENABLED" = yes ]; then
  response="$(rcli BGREWRITEAOF)" || die 'BGREWRITEAOF transport failure'
  case "$response" in *'rewriting started'*|*'rewriting scheduled'*) ;; *) die 'BGREWRITEAOF rejected';; esac
  done_rewrite=0
  for _ in $(seq 1 60); do
    info="$(rcli INFO persistence | tr -d '\r')" || die 'persistence query failed'
    if grep -qx 'aof_rewrite_in_progress:0' <<< "$info" && grep -qx 'aof_rewrite_scheduled:0' <<< "$info"; then done_rewrite=1; break; fi
    sleep 2
  done
  [ "$done_rewrite" = 1 ] && grep -qx 'aof_last_bgrewrite_status:ok' <<< "$info" || die 'AOF rewrite incomplete/failed'
  # Complete manifest and all referenced files; stable generation + parser check.
  if [ -d "$REDIS_DIR/appendonlydir" ]; then
    python3 "$(dirname "$0")/redis-aof-snapshot.py" "$REDIS_DIR/appendonlydir" "$STAGE/appendonlydir-$TS"
  elif [ -f "$REDIS_DIR/appendonly.aof" ] && [ ! -L "$REDIS_DIR/appendonly.aof" ]; then
    cp -- "$REDIS_DIR/appendonly.aof" "$STAGE/appendonly-$TS.aof"
    redis-check-aof "$STAGE/appendonly-$TS.aof" >/dev/null || die 'AOF incomplete/corrupt'
  else die 'AOF enabled but supported persistence files absent'; fi
elif [ "$AOF_ENABLED" != no ]; then die 'unknown AOF configuration'; fi
[ "$(identity)" = "$RUN_ID" ] || die 'Redis restarted during backup'
{
  echo "timestamp=$TS"; echo "host=$REDIS_HOST:$REDIS_PORT"; echo "run_id=$RUN_ID"
  echo "rdb=$BACKUP_DIR/dump-$TS.rdb"; echo "retention_days=$BACKUP_RETENTION_DAYS"
  echo 'consistency=independent-RDB-and-AOF-snapshots-not-a-shared-transaction'
} > "$STAGE/manifest-$TS.txt"
(cd "$STAGE"; find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
if [ -n "${BACKUP_S3:-}" ]; then
  tar -C "$STAGE" -czf "$BACKUP_DIR/.bundle-$TS-$$.tar.gz" .
  BUNDLE="$BACKUP_DIR/.bundle-$TS-$$.tar.gz"
  trap 'rm -rf -- "$STAGE"; rm -f -- "${BUNDLE:-}"' EXIT
  python3 "$(dirname "$0")/backup-s3-publish.py" "$BUNDLE" "$BACKUP_S3" "$BACKUP_S3_OWNER" > "$STAGE/offsite-receipt.json"
fi
# Publish the completion marker last. Incomplete artifacts must never be accepted
# merely because they exist. Hash catalogue is per run, never silently overwritten.
for f in "$STAGE"/dump-* "$STAGE"/appendonly*; do [ ! -e "$f" ] || mv -- "$f" "$BACKUP_DIR/"; done
mv "$STAGE/SHA256SUMS" "$BACKUP_DIR/checksums-$TS.txt"
[ ! -f "$STAGE/offsite-receipt.json" ] || mv "$STAGE/offsite-receipt.json" "$BACKUP_DIR/offsite-$TS.json"
mv "$STAGE/manifest-$TS.txt" "$BACKUP_DIR/manifest-$TS.txt"
cp "$BACKUP_DIR/manifest-$TS.txt" "$STAGE/last-backup.txt"
mv "$STAGE/last-backup.txt" "$BACKUP_DIR/last-backup.txt"
# Retention only after a complete backup and (if requested) remote readback.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'dump-*.rdb' -o -name 'appendonly-*.aof' -o -name 'manifest-*.txt' -o -name 'checksums-*.txt' -o -name 'offsite-*.json' \) -mtime "+$BACKUP_RETENTION_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'appendonlydir-*' -type d -mtime "+$BACKUP_RETENTION_DAYS" -exec rm -rf {} +
log 'BACKUP_COMPLETE: semantic checks passed; restore drill still required'
