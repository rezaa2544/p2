#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# pitr-restore.sh — Point-in-Time Recovery در محیطِ جدایِ سنجش (پایهٔ
# معیارهای PITR/Restore-Drill از RELIABILITY_DR_PLAN §۳ و سناریوهای DR_RUNBOOK)
# ───────────────────────────────────────────────────────────────────
# جریان:
#   ۱) انتخابِ نزدیک‌ترین base backup از stanza (pgbackrest info)
#   ۲) replayِ WAL تا زمان/نامِ هدف (--time/--name/--xid/--latest)
#   ۳) PGDATA در دایرکتوریِ ایزوله + پورتِ غیراستاندارد + fsync=off
#      (محیطِ سنجش؛ خطِ تولید را هرگز لمس نمی‌کند — fail-closed)
#   ۴) promote در نقطهٔ هدف و چاپِ connection-stringِ موقت
#
# مصرف:
#   tools/pitr-restore.sh --time "2026-09-10 09:15:00+03:30"
#   tools/pitr-restore.sh --name before_bad_release
#   tools/pitr-restore.sh --latest --no-verify
#   PGHOST/PGPORT/PGDATABASE را برایِ instance تولیدی تنظیم کن یا
#   PBR_EXEC را با wrapper کانتینری (مثلاً: PBR_EXEC="docker compose exec -T pg-backup")
#
# خروجی: ۰ موفق (دایرکتوری و پورت چاپ می‌شود)؛ ۱ هر پیش‌نیاز/بازیابیِ ناموفق
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

STANZA="${PBR_STANZA:-payesh}"
PBR_DEST_ROOT="${PBR_DEST_ROOT:-/var/backups/payesh-pitr}"
PBR_PORT="${PBR_PORT:-54329}"
PBR_BIN="${PBR_BIN:-}"
PBR_EXEC="${PBR_EXEC:-}"           # مثال: "docker compose exec -T pg-backup"
TARGET_SPEC=""                      # ریکاردِ --type/--target برای pgbackrest
NO_START=0
SKIP_VERIFY=0
declare -a RESTORE_OPTS=()

usage(){ echo "مصرف: $0 (--time 'TS'|--name N|--xid ID|--latest) [--no-start] [--no-verify] [--dest DIR] [--port N] [--stanza S]"; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --time)  [ $# -ge 2 ] || usage; TARGET_SPEC="--type=time --target=$2"; shift 2;;
    --name)  [ $# -ge 2 ] || usage; TARGET_SPEC="--type=name --target=$2"; shift 2;;
    --xid)   [ $# -ge 2 ] || usage; TARGET_SPEC="--type=xid --target=$2"; shift 2;;
    --latest) TARGET_SPEC="--type=latest"; shift;;
    --no-start) NO_START=1; shift;;
    --no-verify) SKIP_VERIFY=1; shift;;
    --dest) [ $# -ge 2 ] || usage; PBR_DEST_ROOT="$2"; shift 2;;
    --port) [ $# -ge 2 ] || usage; PBR_PORT="$2"; shift 2;;
    --stanza) [ $# -ge 2 ] || usage; STANZA="$2"; shift 2;;
    *) usage;;
  esac
done
[ -n "$TARGET_SPEC" ] || usage

run_pbr(){ # اجرایِ pgbackrest (روی میزبان یا داخلِ سرویسِ کانتینری)
  if [ -n "$PBR_EXEC" ]; then $PBR_EXEC pgbackrest "$@"; else pgbackrest "$@"; fi
}

# ── پیش‌نیازها (fail-closed) ──
if [ -z "$PBR_EXEC" ] && ! command -v pgbackrest >/dev/null 2>&1; then
  echo "FAIL: pgbackrest در PATH نیست؛ روی میزبان نصبش کن یا PBR_EXEC را روی سرویسِ کانتینری تنظیم کن (docs/HA_POSTGRES.md §۶)" >&2; exit 1
fi
if ! command -v psql >/dev/null 2>&1; then echo "FAIL: psql لازم است" >&2; exit 1; fi
if [ "$NO_START" -eq 0 ] && ! command -v pg_ctl >/dev/null 2>&1; then
  echo "FAIL: pg_ctl نیست (برایِ بوتِ محیطِ سنجش)؛ یا PATH را کامل کن یا --no-start بده" >&2; exit 1
fi

RUN_ID="pitr-$(date +%Y%m%d-%H%M%S)-$$"
RUN_DIR="$PBR_DEST_ROOT/$RUN_ID"
mkdir -p "$RUN_DIR/data" "$RUN_DIR/etc" "$RUN_DIR/run" "$RUN_DIR/log"
chmod 700 "$RUN_DIR/data"
echo "== PITR run: $RUN_DIR (stanza=$STANZA port=$PBR_PORT $TARGET_SPEC)"

# ── ۱/۲) restore با replay تا هدف ──
run_pbr --stanza="$STANZA" --pg1-path="$RUN_DIR/data" --delta $TARGET_SPEC restore

# ── تنظیمِ ایزوله (محیطِ سنجش؛ هرگز دیتای تولیدی را باز نکنید) ──
cat > "$RUN_DIR/etc/postgresql.conf" <<CONF
port = $PBR_PORT
unix_socket_directories = '$RUN_DIR/run'
listen_addresses = 'localhost'
fsync = off
synchronous_commit = off
full_page_writes = false
logging_collector = on
log_directory = '$RUN_DIR/log'
max_connections = 50
CONF
echo "restore_command = 'pgbackrest --stanza=$STANZA archive-get %f %p'" >> "$RUN_DIR/data/postgresql.auto.conf"

if [ "$NO_START" -eq 1 ]; then
  echo "OK (--no-start): دیتا در $RUN_DIR/data آماده است؛ بوتِ دستی:"
  echo "  pg_ctl -D '$RUN_DIR/data' -o \"-c config_file='$RUN_DIR/etc/postgresql.conf'\" -l '$RUN_DIR/log/postgres.log' start"
  exit 0
fi

# ── ۳) بوت تا رسیدن به هدف؛ promote خودکار (target-action) ──
pg_ctl -D "$RUN_DIR/data" -o "-c config_file=$RUN_DIR/etc/postgresql.conf" \
  -l "$RUN_DIR/log/postgres.log" -w -t 120 start

READY=0
for _ in $(seq 1 60); do
  if pg_isready -h "$RUN_DIR/run" -p "$PBR_PORT" >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
[ "$READY" = 1 ] || { echo "FAIL: سرورِ سنجش بالا نیامد؛ آخرین لاگ:" >&2; tail -20 "$RUN_DIR/log"/*.log >&2 || true; exit 1; }

# ── ۴) verify ──
if [ "$SKIP_VERIFY" -eq 0 ]; then
  PGHOST="$RUN_DIR/run" PGPORT="$PBR_PORT" PGDATABASE=postgres "$(cd "$(dirname "$0")" && pwd)/pitr-verify.sh" \
    --host-dir "$RUN_DIR/run" --port "$PBR_PORT" --stanza "$STANZA" --target-spec "$TARGET_SPEC"
fi

echo "════════════════════════════════════════════"
echo "PITR_READY dir=$RUN_DIR port=$PBR_PORT socket=$RUN_DIR/run"
echo "اتصال: psql \"host=$RUN_DIR/run port=$PBR_PORT dbname=payesh user=postgres\""
echo "پس از سنجش: pg_ctl -D '$RUN_DIR/data' stop && rm -rf '$RUN_DIR'"
echo "════════════════════════════════════════════"
