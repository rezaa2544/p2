#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# run-benchmarks.sh — اجرای جامع اسکریپت‌های تست بار و بنچ‌مارک k6
# سامانه پایش (فاز ۵ — ارزیابی عملکرد و پایداری در مقیاس کشوری)
# ═══════════════════════════════════════════════════════════════════

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DIR/../.." && pwd)"

# رنگ‌بندی ترمینال
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

ENV="local"
TARGET_SCENARIO=""
TARGET_SUITE=""
CUSTOM_VUS=""
CUSTOM_DURATION=""
SPAWN_LOCAL_SERVER=false
LOCAL_SERVER_PID=""
BASE_URL=""

print_banner() {
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}🚀 سامانه پایش — اسکریپت اجرای آزمون‌های کارایی و پایداری k6 (فاز ۵)${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
}

usage() {
  echo "راهنمای استفاده از اسکریپت:"
  echo "  $0 [گزینه‌ها]"
  echo ""
  echo "گزینه‌ها:"
  echo "  --scenario <name>    اجرای یک سناریوی خاص (01-login, 02-bootstrap, 03-attendance, 04-grades, 05-notifications, 06-sync-batch, all)"
  echo "  --suite <name>       اجرای یک سوئیت تست (saturation, chaos-redis, soak-24h, spike-mehr, all)"
  echo "  --env <environment>  انتخاب محیط هدف: local (پیش‌فرض), staging, production, cluster"
  echo "  --base-url <url>     تنظیم مستقیم آدرس URL سرور هدف"
  echo "  --vus <number>       تنظیم تعداد کاربران همزمان (VU) به عنوان Override"
  echo "  --duration <time>    تنظیم مدت زمان اجرای آزمون (مثال: 30s, 2m, 24h)"
  echo "  -h, --help           نمایش این راهنما"
  echo ""
  echo "مثال‌ها:"
  echo "  $0 --scenario 01-login"
  echo "  $0 --scenario all --env local"
  echo "  $0 --suite saturation"
  echo "  $0 --suite spike-mehr --base-url http://127.0.0.1:3000"
  exit 0
}

# پردازش پارامترهای خط فرمان
while [[ $# -gt 0 ]]; do
  case $1 in
    --scenario)
      TARGET_SCENARIO="$2"
      shift 2
      ;;
    --suite)
      TARGET_SUITE="$2"
      shift 2
      ;;
    --env)
      ENV="$2"
      shift 2
      ;;
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --vus)
      CUSTOM_VUS="$2"
      shift 2
      ;;
    --duration)
      CUSTOM_DURATION="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo -e "${RED}خطا: گزینه ناشناخته $1${NC}"
      usage
      ;;
  esac
done

# بررسی نصب بودن k6
if ! command -v k6 &> /dev/null; then
  echo -e "${RED}❌ ابزار k6 یافت نشد! لطفاً ابتدا آن را نصب کنید:${NC}"
  echo "   npm install -g k6 یا دانلود از https://k6.io"
  exit 1
fi

# تعیین Base URL
if [ -z "$BASE_URL" ]; then
  case $ENV in
    local)
      BASE_URL="http://127.0.0.1:3000"
      ;;
    staging)
      BASE_URL="https://staging.payesh.ir"
      ;;
    production)
      BASE_URL="https://api.payesh.ir"
      ;;
    cluster)
      BASE_URL="http://load-test-cluster.payesh.internal:8080"
      ;;
    *)
      BASE_URL="http://127.0.0.1:3000"
      ;;
  esac
fi

cleanup() {
  if [ "$SPAWN_LOCAL_SERVER" = true ] && [ -n "$LOCAL_SERVER_PID" ]; then
    echo -e "\n${YELLOW}⏹️ در حال متوقف‌سازی سرور محلی موقت (PID: $LOCAL_SERVER_PID)...${NC}"
    kill -TERM "$LOCAL_SERVER_PID" 2>/dev/null || true
    wait "$LOCAL_SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# اگر محیط local است و سرور در حال اجرا نیست، سرور موقت راه‌اندازی شود
if [ "$ENV" = "local" ] && [[ "$BASE_URL" =~ 127\.0\.0\.1:3000|localhost:3000 ]]; then
  if ! curl -s "http://127.0.0.1:3000/api/health" &> /dev/null; then
    echo -e "${YELLOW}⚡ سرور محلی فعال روی پورت ۳۰۰۰ یافت نشد. راه‌اندازی سرور آزمون محلی...${NC}"
    cd "$ROOT_DIR"
    PORT=3000 \
    PAYESH_DEMO_CODE=1 \
    PAYESH_SMS_PROVIDER=mock \
    PAYESH_SMS_DRY_RUN=1 \
    PAYESH_SMS_MAX_PER_DAY=1000000 \
    PAYESH_SMS_COOLDOWN_S=0 \
    PAYESH_SMS_DAILY_CAP=1000000 \
    PAYESH_SMS_IP_LIMIT=1000000 \
    PAYESH_SMS_PHONE_LIMIT=1000000 \
    PAYESH_LOGIN_IP_LIMIT=1000000 \
    node server/index.js &
    LOCAL_SERVER_PID=$!
    SPAWN_LOCAL_SERVER=true
    sleep 2
    if ! curl -s "http://127.0.0.1:3000/api/health" &> /dev/null; then
      echo -e "${RED}❌ خطا در راه‌اندازی سرور آزمون محلی!${NC}"
      exit 1
    fi
    echo -e "${GREEN}✅ سرور محلی با موفقیت راه‌اندازی شد.${NC}"
  fi
fi

print_banner
echo -e "محیط هدف: ${GREEN}$ENV${NC} ($BASE_URL)"
echo ""

run_k6_file() {
  local script_path="$1"
  local test_name="$2"
  
  echo -e "${BLUE}▶ در حال اجرای:${NC} ${YELLOW}$test_name${NC} ($script_path)"
  
  local k6_args=()
  k6_args+=("-e" "BASE_URL=$BASE_URL")
  
  if [ -n "$CUSTOM_VUS" ]; then
    k6_args+=("--vus" "$CUSTOM_VUS")
  fi
  if [ -n "$CUSTOM_DURATION" ]; then
    k6_args+=("--duration" "$CUSTOM_DURATION")
  fi

  k6 run "${k6_args[@]}" "$script_path"
  local status=$?
  
  if [ $status -eq 0 ]; then
    echo -e "${GREEN}✔ آزمون $test_name با موفقیت به پایان رسید.${NC}\n"
  else
    echo -e "${RED}✖ آزمون $test_name با خطا مواجه شد (کد خروج: $status).${NC}\n"
    return $status
  fi
}

ALL_PASSED=true

# اجرای سناریوها
if [ -n "$TARGET_SCENARIO" ]; then
  if [ "$TARGET_SCENARIO" = "all" ]; then
    for s in "$DIR/scenarios/"*.js; do
      [ -e "$s" ] || continue
      name="$(basename "$s" .js)"
      run_k6_file "$s" "سناریوی $name" || ALL_PASSED=false
    done
  else
    file="$DIR/scenarios/$TARGET_SCENARIO.js"
    if [ ! -f "$file" ]; then
      file="$DIR/scenarios/0$TARGET_SCENARIO.js"
    fi
    if [ -f "$file" ]; then
      run_k6_file "$file" "سناریوی $TARGET_SCENARIO" || ALL_PASSED=false
    else
      echo -e "${RED}❌ فایل سناریو یافت نشد: $TARGET_SCENARIO${NC}"
      exit 1
    fi
  fi
fi

# اجرای سوئیت‌ها
if [ -n "$TARGET_SUITE" ]; then
  if [ "$TARGET_SUITE" = "all" ]; then
    for s in "$DIR/suites/"*.js; do
      [ -e "$s" ] || continue
      name="$(basename "$s" .js)"
      # برای soak-24h در اجرای سراسری، مدت زمان کوتاه تنظیم می‌شود مگر آنکه کاربر override داده باشد
      if [ "$name" = "soak-24h-test" ] && [ -z "$CUSTOM_DURATION" ]; then
        SOAK_DURATION="10s" run_k6_file "$s" "سوئیت $name (تست کوتاه)" || ALL_PASSED=false
      else
        run_k6_file "$s" "سوئیت $name" || ALL_PASSED=false
      fi
    done
  else
    file="$DIR/suites/$TARGET_SUITE.js"
    if [ ! -f "$file" ]; then
      file="$DIR/suites/$TARGET_SUITE-test.js"
    fi
    if [ -f "$file" ]; then
      run_k6_file "$file" "سوئیت $TARGET_SUITE" || ALL_PASSED=false
    else
      echo -e "${RED}❌ فایل سوئیت یافت نشد: $TARGET_SUITE${NC}"
      exit 1
    fi
  fi
fi

# اگر هیچ گزینه‌ای داده نشده بود، سناریوی پیش‌فرض اجرا شود
if [ -z "$TARGET_SCENARIO" ] && [ -z "$TARGET_SUITE" ]; then
  echo -e "${YELLOW}هیچ سناریو یا سوئیتی مشخص نشده است. اجرای پیش‌فرض سناریوی ورود (01-login)...${NC}"
  run_k6_file "$DIR/scenarios/01-login.js" "سناریوی ورود (01-login)" || ALL_PASSED=false
fi

if [ "$ALL_PASSED" = true ]; then
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}🎉 تمام آزمون‌های عملکردی انتخاب‌شده با موفقیت ۱۰۰٪ پاس شدند ✅[0m"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
  exit 0
else
  echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}"
  echo -e "${RED}❌ برخی از آزمون‌های عملکردی با خطا یا نقض آستانه‌های SLO مواجه شدند.${NC}"
  echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}"
  exit 1
fi
