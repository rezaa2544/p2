#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════
# tools/dast-live.sh — اجرایِ زندهٔ DAST (OWASP ZAP) علیهٔ استیجینگِ سبک
# ─────────────────────────────────────────────────────────────────────
# P0 #6 — امنیتِ اجرایی: این اسکریپت «محیطِ استیجینگ سبک» (API + Redis +
# store) را می‌سازد و ZAP baseline/full علیه‌اش اجرا می‌کند و گزارش HTML/JSON
# را artifact می‌کند. برایِ CI: lane DASTِ security.yml همین منطق را دارد
# (secret SECURITY_TARGET_URL ⇒ staging؛ بدونِ secret ⇒ local-boot).
#
# ایمنی (الگوی W19): پیش‌فرض **DRY_RUN** — فقط پیش‌نیازها را چک و طرح را
# چاپ می‌کند؛ هیچ فرایندی استارت/اسکن نمی‌شود. --live فقط با هدفِ صریح.
#
# استفاده (محیطِ واقعی/استیجینگ):
#   tools/dast-live.sh --dry-run
#   tools/dast-live.sh --live --target http://127.0.0.1:8080          # استیجینگِ موجود
#   tools/dast-live.sh --live                                          # استیجینگِ خودِ اسکریپت
#   tools/dast-live.sh --live --scan full --timeout 1800               # اسکنِ کامل
#
# env:
#   DAST_PORT           پورتِ API (پیش‌فرض 8090)
#   DAST_REDIS_URL      redis استیجینگ (اختیاری — با آن: production + fail-closed واقعی)
#   DAST_ENV            production|development (پیش‌فرض production اگر Redis باشد)
#   PAYESH_JWT_SECRET   کلیدِ اشتراکی JWT — الزامی در production (guard P0 #2)
#                       اگر نباشد، اسکریپت برایِ همین اجرای staging یک کلیدِ
#                       رندوم می‌سازد (فوق‌العادهٔ staging — در محیطِ واقعی
#                       باید از env اپراتور بیاید و در همهٔ نمونه‌ها یکسان باشد)
#   ZAP_IMAGE           docker image (پیش‌فرض ghcr.io/zaproxy/zaproxy:stable)
#   ZAP_BIN             مسیرِ zap-baseline.py محلی (به‌جای docker)
#   OUT_DIR             دایرکتوریِ خروجی (پیش‌فرض out/dast-live)
#
# خروجی‌ها: $OUT_DIR/{zap-report.html,zap-report.json,summary.txt,api.log}
#
# exit code: 0 = بدون FAIL · 2 = فقط WARN (advisory) · 1 = FAIL finding
#            3 = خطایِ اسکن/زیرساخت · 4 = خطایِ پارامتر
# ═════════════════════════════════════════════════════════════════════
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="dry-run"
TARGET=""
SCAN="baseline"
TIMEOUT=600
PORT="${DAST_PORT:-8090}"
OUT_DIR="${OUT_DIR:-$ROOT/out/dast-live}"
ZAP_IMAGE="${ZAP_IMAGE:-ghcr.io/zaproxy/zaproxy:stable}"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) MODE="dry-run" ;;
    --live) MODE="live" ;;
    --target) shift; TARGET="${1:-}" ;;
    --scan) shift; SCAN="${1:-baseline}" ;;
    --timeout) shift; TIMEOUT="${1:-600}" ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 4 ;;
  esac
  shift
done
if [ "$SCAN" != "baseline" ] && [ "$SCAN" != "full" ]; then
  echo "scan must be baseline|full" >&2; exit 4
fi

say(){ printf '  %s\n' "$*"; }

gen_jwt(){ head -c 48 /dev/urandom | base64 | tr -d '/+= ' | head -c 48; }

plan(){
cat <<EOF
┌─ طرحِ DAST زنده (P0 #6) ────────────────────────────────────────────
│ هدف:      ${TARGET:-<استیجینگِ خودِ اسکریپت — پورت ${PORT}>}
│ اسکن:     ${SCAN} (زیرساخت: ${ZAP_IMAGE} / ZAP_BIN)
│ زیرساخت: node server/index.js (production اگر DAST_REDIS_URL باشد) + Redis
│           + seedِ سیدشده؛ fail-closed P0-13 (بدون Redis در production استارت نمی‌کند)
│ خروجی:    $OUT_DIR/{zap-report.html,zap-report.json,summary.txt}
│ CI:        lane DASTِ security.yml — secret SECURITY_TARGET_URL ⇒ همین منطق
│            (artifact: zap-baseline-reports)
│ exit:      0 بدون FAIL · 2 فقط-WARN · 1 FAIL · 3 خطای اسکن
└────────────────────────────────────────────────────────────────────
EOF
}

precheck(){
  local rc=0
  command -v node >/dev/null 2>&1 || { say "❌ node نیست"; rc=1; }
  [ -f "$ROOT/server/index.js" ] || { say "❌ server/index.js نیست"; rc=1; }
  if [ -f "$ROOT/server/data/payesh.json" ]; then
    say "✅ seed store: server/data/payesh.json"
  else
    say "⚠️ seed store نیست — استیجینگ با node server/seed.js ساخته می‌شود"
  fi
  if [ -n "${DAST_REDIS_URL:-}" ]; then
    say "✅ DAST_REDIS_URL=$DAST_REDIS_URL (production + fail-closed)"
  else
    say "ℹ️ بدون Redis: استیجینگ development-boot (readiness 503 — اسکنِ API باز می‌ماند)"
  fi
  if [ -n "${ZAP_BIN:-}" ]; then
    if [ -x "$ZAP_BIN" ]; then say "✅ ZAP_BIN=$ZAP_BIN"; else say "❌ ZAP_BIN اجرا‌پذیر نیست"; rc=1; fi
  elif command -v docker >/dev/null 2>&1; then
    say "✅ docker برای $ZAP_IMAGE"
  else
    say "ℹ️ نه docker نه ZAP_BIN — اسکن در این محیط ممکن نیست (DRY_RUN فقط)"
  fi
  return $rc
}

# ── DRY_RUN: فقط طرح + پیش‌نیاز (هیچ کاری نمی‌شود) ────────────────────
if [ "$MODE" = "dry-run" ]; then
  echo "dast-live — DRY_RUN (هیچ استارت/اسکنی انجام نمی‌شود)"
  plan
  precheck
  mkdir -p "$OUT_DIR"
  {
    echo "dast-live DRY_RUN — $(date -u +%FT%TZ)"
    echo "target=${TARGET:-<script-staging:$PORT>}"
    echo "scan=$SCAN"
    echo "zap=${ZAP_BIN:-$ZAP_IMAGE}"
    echo "plan: boot(api,$PORT) -> wait(health) -> zap($SCAN) -> report($OUT_DIR) -> cleanup"
  } > "$OUT_DIR/dry-run-skeleton.txt"
  echo "────────────────────────────────────────────────────────────"
  echo "dast-live: DRY_RUN کامل (طرح + اسکلت در $OUT_DIR/dry-run-skeleton.txt)"
  exit 0
fi

# ── LIVE ─────────────────────────────────────────────────────────────
mkdir -p "$OUT_DIR"
API_PID=""
SEED_STORE_TMP=""
cleanup(){
  if [ -n "$API_PID" ]; then kill "$API_PID" 2>/dev/null; fi
  if [ -n "$SEED_STORE_TMP" ]; then rm -f "$SEED_STORE_TMP" 2>/dev/null; fi
}
trap cleanup EXIT

TARGET_URL="$TARGET"
if [ -z "$TARGET_URL" ]; then
  TARGET_URL="http://127.0.0.1:$PORT"
  # استورِ جدا برای استیجینگ (storeِ ریپو دست‌نخورده بماند)
  if [ ! -f "$ROOT/server/data/payesh.json" ]; then
    say "ساخت seed…"
    (cd "$ROOT" && node server/seed.js) >/dev/null 2>&1 || { say "❌ seed شکست"; exit 3; }
  fi
  SEED_STORE_TMP="$(mktemp /tmp/dast-live-store.XXXXXX.json)"
  cp "$ROOT/server/data/payesh.json" "$SEED_STORE_TMP"
  ENV_MODE="${DAST_ENV:-development}"
  if [ -n "${DAST_REDIS_URL:-}" ]; then ENV_MODE="${DAST_ENV:-production}"; fi
  # production + Redis ⇒ guardِ P0 #2: کلیدِ JWT اشتراکی الزامی (env-only).
  if [ "$ENV_MODE" = "production" ] && [ -z "${PAYESH_JWT_SECRET:-}" ]; then
    STAGE_JWT="$(gen_jwt)"
    say "ℹ️ PAYESH_JWT_SECRET نبود — کلیدِ stagingِ رندوم ساخته شد (فوق‌العادهٔ همین اجرا)"
  else
    STAGE_JWT="${PAYESH_JWT_SECRET:-}"
  fi
  say "بوتِ استیجینگ: $TARGET_URL (env=$ENV_MODE)…"
  (
    cd "$ROOT"
    export PAYESH_STORE="$SEED_STORE_TMP" PAYESH_AUDIT="$OUT_DIR/audit.log"
    export PAYESH_ENV="$ENV_MODE" NODE_ENV="$ENV_MODE"
    export PORT="$PORT" HOST=127.0.0.1 PAYESH_DEMO_CODE=1
    # در deployment واقعی TLS لبه (nginx) می‌شکند — guardِ TLS production
    # با PAYESH_BEHIND_PROXY=1 راضی می‌شود (الگوی W12 edge).
    if [ "$ENV_MODE" = "production" ]; then export PAYESH_BEHIND_PROXY=1; fi
    if [ -n "${DAST_REDIS_URL:-}" ]; then export REDIS_URL="$DAST_REDIS_URL"; fi
    if [ -n "$STAGE_JWT" ]; then export PAYESH_JWT_SECRET="$STAGE_JWT"; fi
    node server/index.js > "$OUT_DIR/api.log" 2>&1 &
    echo $! > "$OUT_DIR/api.pid"
  )
  API_PID="$(cat "$OUT_DIR/api.pid")"
  ok=0
  code=000
  for i in $(seq 1 45); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "$TARGET_URL/api/health" 2>/dev/null)"
    case "$code" in 000|"") code=000 ;; esac
    if [ "$code" != "000" ]; then ok=1; break; fi
    sleep 1
  done
  if [ "$ok" != "1" ]; then
    say "❌ استیجینگ زنده نشد (api.log: $OUT_DIR/api.log)"
    exit 3
  fi
  say "✅ استیجینگ زنده: HTTP $code"
fi

# ── ZAP ──────────────────────────────────────────────────────────────
ZAP_ARGS=(-t "$TARGET_URL" -r "$OUT_DIR/zap-report.html" -J "$OUT_DIR/zap-report.json")
if [ "$SCAN" = "full" ]; then ZAP_CMD="zap-full-scan.py"; else ZAP_CMD="zap-baseline.py"; fi

say "اجرایِ ZAP $SCAN (timeout ${TIMEOUT}s)…"
code=3
if [ -n "${ZAP_BIN:-}" ]; then
  timeout "$TIMEOUT" python3 "$ZAP_BIN" "${ZAP_ARGS[@]}" > "$OUT_DIR/zap.out" 2>&1
  code=$?
elif command -v docker >/dev/null 2>&1; then
  timeout "$TIMEOUT" docker run --rm --network=host \
    -v "$OUT_DIR:/zap/wrk/:rw" "$ZAP_IMAGE" "$ZAP_CMD" "${ZAP_ARGS[@]}" > "$OUT_DIR/zap.out" 2>&1
  code=$?
else
  say "❌ ZAP در دسترس نیست (نه docker نه ZAP_BIN) — بخشِ اسکن برای محیطِ واقعی است"
  code=3
fi
# zap baseline: 0=ok 1=FAIL 2=WARN 3+=error
{
  echo "dast-live — $(date -u +%FT%TZ)"
  echo "target=$TARGET_URL scan=$SCAN zap_exit=$code"
  case "$code" in
    0) echo "نتیجه: بدون FAIL finding" ;;
    1) echo "نتیجه: FAIL finding — بازبینیِ zap-report.html الزامی" ;;
    2) echo "نتیجه: فقط WARN (advisory) — دروازه نمی‌افتد" ;;
    *) echo "نتیجه: خطای اسکن (کد $code)" ;;
  esac
} > "$OUT_DIR/summary.txt"
cat "$OUT_DIR/summary.txt"
echo "────────────────────────────────────────────────────────────"
echo "dast-live: اسکن تمام شد (exit=$code) — گزارش: $OUT_DIR"
# ۲ (WARN-only) به‌عنوانِ «سبزِ مشاوره‌ای» نگه داشته می‌شود (الگوی CI)
exit "$code"
