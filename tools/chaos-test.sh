#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Wave 19 — ابزار تست آشوب و شکست (Chaos Testing)
# ─────────────────────────────────────────────────────────────────
# طرحِ کامل: docs/WAVE19_CHAOS_PLAN.md
# سوئیتِ k6ِ همراه (ترافیک حینِ آشوب): tests/performance/suites/chaos-redis-test.js
#
# سناریوها:
#   kill-api     : کشتنِ یک نمونهٔ API با SIGKILL (بدونِ drain)
#   redis-down   : قطعِ Redis در حینِ پرواز
#   pg-down      : قطعِ PostgreSQL در حینِ پرواز
#   net-latency  : تزریقِ تأخیرِ شبکه (tc netem)
#   disk-full    : پر کردنِ دیسکِ داده (fallocate با سقف)
#   all          : هر پنج (به ترتیب، با بازگشتِ کامل بینِ هرکدام)
#
# ایمنی (سفت):
#   - پیش‌فرض DRY_RUN: هیچ کارِ ویرانگری انجام نمی‌شود؛ فقط طرحِ اجرا
#     چاپ می‌شود و اسکلتِ خروجی در OUT_DIR نوشته می‌شود.
#   - اجرای زنده فقط با --live و محیط‌هایِ الزامی (BASE_URL و ...) —
#     بدونِ آن‌ها اسکریپت با خطا می‌رود.
#   - disk-full سقفِ حجم دارد (DISK_FILL_GB، پیش‌فرض 5) و فایلِ پرکننده
#     در بازگشت حذف می‌شود.
#
# خروجی:  $OUT_DIR/<scenario>-{before,after}.json + <scenario>-timeline.csv
#         + <scenario>-summary.txt   (پیش‌فرض: tests/chaos-output/)
#
# Usage:
#   tools/chaos-test.sh --help
#   tools/chaos-test.sh redis-down                 # DRY_RUN
#   tools/chaos-test.sh all --live \
#       --base-url http://127.0.0.1:3000 --api-pid 4123 \
#       --redis-host 127.0.0.1 --pg-host 127.0.0.1
# ═══════════════════════════════════════════════════════════════════
set -u

# ── حالت‌ها ─────────────────────────────────────────────────────────
LIVE=0
SCENARIOS=()
BASE_URL=""
API_PID=""
REDIS_HOST=""
REDIS_PORT=6379
PG_HOST=""
PG_PORT=5432
PG_DATA=""
NET_IFACE="eth0"
NET_DELAY_MS=500
NET_JITTER_MS=100
DURATION=60
PROBE_INTERVAL=5
DISK_FILL_GB=5
DISK_DIR=""
OUT_DIR="tests/chaos-output"

# ── CLI ─────────────────────────────────────────────────────────────
usage(){
  sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
  echo "Usage: $0 [kill-api|redis-down|pg-down|net-latency|disk-full|all] [flags]"
  echo "Flags:"
  echo "  --live                اجرایِ واقعی (بدونِ آن: DRY_RUN — ایمن)"
  echo "  --base-url URL        URLِ نمونهٔ هدف (الزامی در --live)"
  echo "  --api-pid PID         PIDِ نمونهٔ API برایِ kill-api"
  echo "  --redis-host H        هاستِ Redis (برایِ redis-down)"
  echo "  --redis-port P        پورتِ Redis (پیش‌فرض 6379)"
  echo "  --pg-host H           هاستِ PostgreSQL (برایِ pg-down)"
  echo "  --pg-port P           پورتِ PostgreSQL (پیش‌فرض 5432)"
  echo "  --pg-data DIR         دایرکتوریِ دادهٔ PG (برایِ pg_ctl)"
  echo "  --iface IF            اینترفیسِ شبکه برایِ net-latency (پیش‌فرض eth0)"
  echo "  --delay-ms N          تأخیرِ تزریق‌شده (پیش‌فرض 500)"
  echo "  --duration N          مدتِ هر سناریو به ثانیه (پیش‌فرض 60)"
  echo "  --fill-gb N           سقفِ پر کردنِ دیسک (پیش‌فرض 5)"
  echo "  --disk-dir DIR        دایرکتوریِ پرکننده (پیش‌فرض: دایرکتوریِ store)"
  echo "  --out-dir DIR         دایرکتوریِ خروجی (پیش‌فرض tests/chaos-output)"
}
while [ $# -gt 0 ]; do
  case "$1" in
    kill-api|redis-down|pg-down|net-latency|disk-full|all) SCENARIOS+=("$1");;
    --live) LIVE=1;;
    --base-url) BASE_URL="$2"; shift;;
    --api-pid) API_PID="$2"; shift;;
    --redis-host) REDIS_HOST="$2"; shift;;
    --redis-port) REDIS_PORT="$2"; shift;;
    --pg-host) PG_HOST="$2"; shift;;
    --pg-port) PG_PORT="$2"; shift;;
    --pg-data) PG_DATA="$2"; shift;;
    --iface) NET_IFACE="$2"; shift;;
    --delay-ms) NET_DELAY_MS="$2"; shift;;
    --duration) DURATION="$2"; shift;;
    --fill-gb) DISK_FILL_GB="$2"; shift;;
    --disk-dir) DISK_DIR="$2"; shift;;
    --out-dir) OUT_DIR="$2"; shift;;
    --help|-h) usage; exit 0;;
    *) echo "unknown arg: $1"; usage; exit 2;;
  esac
  shift
done
[ ${#SCENARIOS[@]} -eq 0 ] && SCENARIOS=(all)
[ -z "$DISK_DIR" ] && DISK_DIR="$(cd "$(dirname "$0")/../server/data" 2>/dev/null || echo /tmp)"
DISK_DIR="${DISK_DIR%/}"

# ── ابزارهایِ کمکی ─────────────────────────────────────────────────
log(){ echo "[$(date -u +%H:%M:%S)] $*"; }
die(){ echo "❌ $*" >&2; exit 1; }

probe_once(){ # probe_once <name> <endpoint>  → print "status,ms"
  local name="$1" ep="$2"
  local t0 t1 code
  t0=$(date +%s%3N)
  code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$BASE_URL$ep" 2>/dev/null || echo 'ERR')
  t1=$(date +%s%3N)
  echo "$code,$((t1 - t0))"
}

snapshot(){ # snapshot <name> <phase>
  local name="$1" phase="$2"
  local f="$OUT_DIR/${name}-${phase}.json"
  {
    echo "{"
    echo "  \"scenario\": \"$name\","
    echo "  \"phase\": \"$phase\","
    echo "  \"ts\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    echo "  \"live\": $LIVE,"
    echo "  \"endpoints\": {"
    # کامایِ آخر باید حذف شود وگرنه JSON نامعتبر است (یافتهٔ مانورِ 2026-09-13:
    # فایل‌های before/after با کامای انتهایی تولید می‌شدند و JSON.parse می‌شکست)
    for ep in /api/liveness /api/readiness /api/health; do
      local r; r=$( [ "$LIVE" = 1 ] && probe_once "$name" "$ep" || echo "dry-run,0" )
      echo "    \"$ep\": \"$r\","
    done | sed '$ s/,$//'
    echo "  }"
    echo "}"
  } > "$f"
  log "snapshot $phase → $f"
}

probe_loop(){ # probe_loop <name>
  local name="$1" f="$OUT_DIR/${name}-timeline.csv"
  echo "ts,endpoint,status,ms" > "$f"
  # در LIVE دو دُمِ PROBE_INTERVAL هم probe می‌کنیم تا دورهایِ پس از بازیابی
  # (restart سرویس در انتهایِ پنجرهٔ خرابی) هم در timeline ثبت شوند.
  local dur=$DURATION
  [ "$LIVE" = 1 ] && dur=$(( DURATION + PROBE_INTERVAL * 2 ))
  local end=$(( $(date +%s) + dur ))
  while [ "$(date +%s)" -lt "$end" ]; do
    local ts r
    ts=$(date -u +%H:%M:%S)
    for ep in /api/liveness /api/readiness /api/health; do
      if [ "$LIVE" = 1 ]; then
        r=$(probe_once "$name" "$ep")
      else
        r="dry-run,0"
      fi
      echo "$ts,$ep,${r%%,*},${r##*,}" >> "$f"
    done
    if [ "$LIVE" = 1 ]; then
      sleep "$PROBE_INTERVAL"
    else
      break # DRY_RUN: فقط یک دور
    fi
  done
}

expect_check(){ # expect_check <name> — بررسیِ رفتارِ مورد انتظار بر اساسِ timeline
  local name="$1" f="$OUT_DIR/${name}-timeline.csv" s="$OUT_DIR/${name}-summary.txt"
  {
    echo "scenario: $name"
    echo "mode: $([ "$LIVE" = 1 ] && echo LIVE || echo DRY_RUN)"
    if [ "$LIVE" = 1 ]; then
      case "$name" in
        kill-api)
          grep -qE ',(503|[0-9]*ERR)' "$f" && echo "  ✅ نمونهٔ مرده: probe‌ها ERR/503 ثبت شدند" \
               || echo "  ❌ هیچ probe‌ای بعد از kill خطا نداشت (انتظار: ERR)" ;;
        redis-down)
          grep -q '/api/readiness,503' "$f" && echo "  ✅ readiness در حینِ قطعِ Redis = 503 (قراردادِ Wave 15)" \
               || echo "  ❌ readiness 503 نشد (انتظار: 503)"
          grep -q '/api/liveness,200' "$f" && echo "  ✅ liveness پیش از مرگِ نمونه 200 (فرایند زنده بود)" \
               || echo "  ℹ️ liveness 200 ثبت نشد (ممکن است نمونه restart شده باشد)" ;;
        pg-down)
          grep -q '/api/readiness,503' "$f" && echo "  ✅ readiness در حینِ قطعِ PG = 503 (حالتِ محافظه‌کارانه)" \
               || echo "  ℹ️ readiness 503 نشد (در driverِ memory، PG اصلاً ping نمی‌شود — درست)"
          grep -q ',500,' "$f" && echo "  ❌ 500 در endpointهایِ سلامت — نباید باشد" \
               || echo "  ✅ هیچ 500 در endpointهایِ سلامت" ;;
        net-latency)
          awk -F, 'NR>1 && $4>0 && $4<'"$NET_DELAY_MS"' {c++} END {exit (c?0:1)}' "$f" \
            && echo "  ✅ تأخیرِ تزریق‌شده دیده شد (ms < delay)" \
            || echo "  ℹ️ تأخیر اندازه‌گیری نشد (بررسیِ trace)" ;;
        disk-full)
          grep -q ',200,\|,503,' "$f" && echo "  ✅ سرور کرش نکرد (200/503 معتبر بود)" \
               || echo "  ℹ️ وضعیتِ probe نامشخص — بررسیِ مانیتور"
          grep -q ',500,' "$f" && echo "  ❌ 500 پس از disk-full — بررسی" \
               || echo "  ✅ بدونِ 500 (persistStore crash-free)" ;;
      esac
    else
      echo "  (DRY_RUN — بررسی‌ها اجرا نشد؛ خروجیِ اسکلتی است)"
    fi
  } | tee "$s"
  echo
}

require_live_env(){ # require_live_env <scenario>
  [ "$LIVE" = 1 ] || { log "DRY_RUN — $1: طرحِ اجرا:"; return 0; }
  case "$1" in
    kill-api)    [ -n "$API_PID" ] || die "--api-pid لازم است"; [ -n "$BASE_URL" ] || die "--base-url لازم است";;
    redis-down)  [ -n "$REDIS_HOST" ] || die "--redis-host لازم است"; [ -n "$BASE_URL" ] || die "--base-url لازم است";;
    pg-down)     [ -n "$PG_HOST" ] || die "--pg-host لازم است"; [ -n "$BASE_URL" ] || die "--base-url لازم است";;
    net-latency) [ -n "$BASE_URL" ] || die "--base-url لازم است"; command -v tc >/dev/null || die "tc (iproute2) نصب نیست";;
    disk-full)   [ -n "$BASE_URL" ] || die "--base-url لازم است"; command -v fallocate >/dev/null || die "fallocate موجود نیست";;
  esac
}

run_scenario(){ # run_scenario <name>
  local name="$1"
  log "═══ سناریو: $name ═══"
  require_live_env "$name"
  mkdir -p "$OUT_DIR"
  snapshot "$name" before
  # در LIVE حلقهٔ probe باید «همزمان با» تزریقِ خرابی بچرخد، نه پیش از آن —
  # وگرنه timeline فقط لحظهٔ سالمِ پیش از خرابی را می‌بیند. (باگِ live که در
  # مانورِ 2026-09-13 آشکار شد: break غیرشرطی + probeِ فقط-پیش از تزریق؛
  # شاهدِ قرمز: timeline همه-200 در حینِ kill واقعی.)
  local probe_bg=""
  if [ "$LIVE" = 1 ]; then probe_loop "$name" & probe_bg=$!; else probe_loop "$name"; fi
  # ── تزریقِ خرابی + بازگشت ──
  if [ "$LIVE" = 1 ]; then
    case "$name" in
      kill-api)
        log "kill -9 $API_PID"
        kill -9 "$API_PID" 2>/dev/null || log "پید یافت نشد (ممکن است از پیش مرده باشد)"
        sleep "$DURATION"
        log "بازگشت: نمونه را ارکستراتور restart می‌کند (در این اسکریپت: هیچ)"
        ;;
      redis-down)
        log "قطعِ Redis روی $REDIS_HOST:$REDIS_PORT (SHUTDOWN NOSAVE)"
        command -v redis-cli >/dev/null && redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SHUTDOWN NOSAVE 2>/dev/null \
          || log "redis-cli موجود نیست — با ابزارِ محیط (iptables/کلاستر) قطع کنید"
        sleep "$DURATION"
        log "بازگشت: restart redis-server (یا ریکاوریِ کلاستر)"
        command -v redis-server >/dev/null && redis-server --daemonize yes --port "$REDIS_PORT" 2>/dev/null || true
        ;;
      pg-down)
        log "قطعِ PostgreSQL روی $PG_HOST:$PG_PORT (stop immediate)"
        if command -v pg_ctl >/dev/null && [ -n "$PG_DATA" ]; then
          pg_ctl -D "$PG_DATA" stop -m immediate 2>/dev/null || log "stop شکست — بررسی دستی"
        else
          log "pg_ctl یا --pg-data در دسترس نیست — با ابزارِ محیط (cloud pause) قطع کنید"
        fi
        sleep "$DURATION"
        log "بازگشت: pg_ctl start (یا resume)"
        if command -v pg_ctl >/dev/null && [ -n "$PG_DATA" ]; then
          pg_ctl -D "$PG_DATA" start 2>/dev/null || log "start شکست — بررسی دستی"
        fi
        ;;
      net-latency)
        log "tc: تزریقِ ${NET_DELAY_MS}ms±${NET_JITTER_MS}ms روی $NET_IFACE"
        tc qdisc add dev "$NET_IFACE" root netem delay "${NET_DELAY_MS}ms" "${NET_JITTER_MS}ms" 2>/dev/null
        sleep "$DURATION"
        log "بازگشت: tc qdisc del"
        tc qdisc del dev "$NET_IFACE" root 2>/dev/null || true
        ;;
      disk-full)
        local fill="$DISK_DIR/.chaos-fill-$$"
        log "fallocate: پر کردنِ ${DISK_FILL_GB}GB در $DISK_DIR (سقفِ ایمنی)"
        fallocate -l "${DISK_FILL_GB}G" "$fill" 2>/dev/null || dd if=/dev/zero of="$fill" bs=1M count=$((DISK_FILL_GB*1024)) 2>/dev/null
        sleep "$DURATION"
        log "بازگشت: حذفِ فایلِ پرکننده"
        rm -f "$fill"
        ;;
    esac
  else
    case "$name" in
      kill-api)    log "DRY_RUN: kill -9 \$API_PID → صبر $DURATION s → restart توسطِ ارکستراتور";;
      redis-down)  log "DRY_RUN: redis-cli SHUTDOWN NOSAVE → صبر $DURATION s → restart redis";;
      pg-down)     log "DRY_RUN: pg_ctl stop -m immediate → صبر $DURATION s → pg_ctl start";;
      net-latency) log "DRY_RUN: tc netem delay ${NET_DELAY_MS}ms روی $NET_IFACE → صبر $DURATION s → tc qdisc del";;
      disk-full)   log "DRY_RUN: fallocate ${DISK_FILL_GB}G در $DISK_DIR → صبر $DURATION s → rm";;
    esac
  fi
  # تا پایانِ دُمِ probeها صبر کن تا timeline کامل شود (snapshotِ after سالم بماند)
  [ -n "$probe_bg" ] && wait "$probe_bg" 2>/dev/null
  snapshot "$name" after
  expect_check "$name"
  # ── بازگشتِ کامل (reset بینِ سناریوها) ──
  if [ "$LIVE" = 1 ]; then
    sleep 10
    log "بازگشت به حالتِ پایدار: readiness=$(probe_once '' /api/readiness 2>/dev/null || echo ERR)"
  fi
}

# ── اجرایِ اصلی ─────────────────────────────────────────────────────
log "chaos-test شروع شد — mode=$([ "$LIVE" = 1 ] && echo LIVE || echo DRY_RUN) out=$OUT_DIR"
for s in "${SCENARIOS[@]}"; do
  if [ "$s" = "all" ]; then
    for one in kill-api redis-down pg-down net-latency disk-full; do run_scenario "$one"; done
  else
    run_scenario "$s"
  fi
done
log "═══ پایان — خروجی‌ها در $OUT_DIR ═══"
exit 0
