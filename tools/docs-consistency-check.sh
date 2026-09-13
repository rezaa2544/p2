#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#   docs-consistency-check.sh — ممیزی هماهنگی اعداد و ادعاها بین اسناد
#   منبع مقادیر مرجع: docs/CAPACITY_MODEL.md (مصوب §33) + اسناد هم‌خانواده
#   خروجی: جدول بررسی‌ها روی استاندارد + بلوک ماشینی در
#          docs/DOCS_CONSISTENCY_REPORT.md (بین نشانگرهای MACHINE)
#   کد خروجی: ۰ = هماهنگ · ۱ = دست‌کم یک تعارض
#   اجرا: bash tools/docs-consistency-check.sh
# ═══════════════════════════════════════════════════════════════════
set -u
cd "$(dirname "$0")/.." || exit 1
DOCS=docs
PASS=0; FAIL=0; ROWS=""

chk() { # نام | شرط (0=موفق) | مدرک
  local name="$1" ok="$2" note="${3:-}"
  if [ "$ok" -eq 0 ]; then PASS=$((PASS+1)); ROWS="${ROWS}| ✅ | ${name} | ${note} |\n"
    printf '  ✅ %s\n' "$name"
  else FAIL=$((FAIL+1)); ROWS="${ROWS}| ❌ | ${name} | ${note} |\n"
    printf '  ❌ %s — %s\n' "$name" "$note"; fi
}
has() { grep -qF -- "$2" "$1" 2>/dev/null; }
hasnt() { ! grep -qF -- "$1" $DOCS/*.md 2>/dev/null; }

echo "▸ مقادیر مرجع (CAPACITY_MODEL)"
has $DOCS/CAPACITY_MODEL.md "۱۰٬۰۰۰٬۰۰۰"; chk "کاربر ثبت‌شده: ۱۰ میلیون" $? "مرجع"
has $DOCS/CAPACITY_MODEL.md "۶٬۰۰۰٬۰۰۰";  chk "فعال روزانه: ۶ میلیون" $? "مرجع"
has $DOCS/CAPACITY_MODEL.md "۲٬۵۰۰٬۰۰۰";  chk "پیک همزمان: ۲٫۵ میلیون" $? "مرجع"
has $DOCS/CAPACITY_MODEL.md "۲۰٬۰۰۰";     chk "RPS پیک: ۲۰ هزار" $? "مرجع"
has $DOCS/CAPACITY_MODEL.md "۲٬۵۰۰";      chk "نوشتن پیک: ۲۵۰۰/ثانیه" $? "مرجع"
has $DOCS/CAPACITY_MODEL.md "۸۳۳";        chk "ورود پیک: ۸۳۳/ثانیه" $? "مرجع"

echo "▸ هم‌خوانی مقیاس در سایر اسناد"
has $DOCS/NATIONAL_ARCHITECTURE.md "۱۰ میلیون / ۶ میلیون"; chk "معماری ملی: ۱۰ میلیون / ۶ میلیون" $? "در برابر مرجع"
has $DOCS/LOAD_TEST_PLAN.md "۲۰٬۰۰۰ RPS"; chk "طرح بار: پیک ۲۰هزار RPS" $? "در برابر مرجع"
has $DOCS/LOAD_TEST_PLAN.md "۲٬۵۰۰ نوشتن/ثانیه"; chk "طرح بار: ۲۵۰۰ نوشتن/ثانیه" $? "در برابر مرجع"
has $DOCS/PILOT_ROLLOUT_PLAN.md "۲۰هزار ریت ملی"; chk "پایلوت: نسبت در برابر ۲۰هزار ریت ملی" $? "در برابر مرجع"
BAD=""
for f in $DOCS/*.md; do
  case "$f" in *DOCS_CONSISTENCY_REPORT.md) continue;; esac
  if grep -qE "(^|[^٫۰-۹])۵ میلیون کاربر هم ?زمان|(^|[^٫۰-۹])۵ میلیون کاربر هم‌زمان|۵٬۰۰۰٬۰۰۰ کاربر" "$f" 2>/dev/null; then
    grep -qF "یادداشت جایگزینی (ممیزی" "$f" || BAD="$BAD ${f##*/}";
  fi
done
[ -z "$BAD" ]; chk "هر رقم ۵ میلیون همزمان با یادداشت جایگزینی پرچم خورده" $? "${BAD:-همهٔ اسناد}"
has $DOCS/SCALE_10M.md "۲٫۵ میلیون کاربر همزمان"; chk "اسکیل ۱۰ میلیون با مرجع هم‌تراز شد" $? "رفع تعارض #۱"

echo "▸ دیتاست ملی (خانوادهٔ مصوب)"
has $DOCS/LOAD_TEST_PLAN.md "۲۱۴ هزار"; chk "کلاس‌ها: ۲۱۴ هزار (مصوب)" $? "طرح بار §۲"
has $DOCS/LOAD_TEST_PLAN.md "۲۸۸ میلیون"; chk "نمره‌ها: ۲۸۸ میلیون (مصوب)" $? "طرح بار §۲ + مدل ظرفیت"
has $DOCS/LOAD_TEST_RESULTS.md "۲۱۴٬۰۰۰"; chk "نتایج بار: شمار کلاس ۲۱۴ هزار" $? "در برابر مرجع"
has $DOCS/LOAD_TEST_PLAN.md "هشدار انحراف (ممیزی هماهنگی"; chk "هشدار انحراف مولد در طرح بار ثبت است" $? "تعارض #۲ — قلم باز ۲"
has $DOCS/WAVE18_LOAD_TEST_PLAN.md "یادداشت هماهنگی (ممیزی"; chk "یادداشت انحراف در طرح ویو۱۸ ثبت است" $? "تعارض #۲"
grep -q "یادداشتِ ممیزیِ هماهنگی" tools/generate-national-dataset.js; chk "یادداشت انحراف در سرصفحهٔ مولد ثبت است" $? "تعارض #۲"

echo "▸ SLO (اهداف سطح خدمت)"
has $DOCS/ROADMAP.md "p99 < 1s"; chk "نقشه راه §۲۹: صدک۹۹ < ۱ ثانیه" $? "مرجع"
has $DOCS/ROADMAP.md "5xx < 0.1%"; chk "نقشه راه §۲۹: خطا < ۰٫۱٪" $? "مرجع"
has $DOCS/LOAD_TEST_PLAN.md "p99 < ۱ ثانیه"; chk "طرح بار: صدک۹۹ < ۱ ثانیه" $? "در برابر مرجع"
has $DOCS/LOAD_TEST_PLAN.md "5xx < ۰.۱٪"; chk "طرح بار: خطا < ۰٫۱٪" $? "در برابر مرجع"
has $DOCS/PILOT_ROLLOUT_PLAN.md "زیر ۳۰۰ میلی‌ثانیه"; chk "پایلوت: صدک۹۵ < ۳۰۰ میلی‌ثانیه" $? "در برابر مرجع"
has $DOCS/PRODUCTION_RUNBOOK.md "p95 بیش از ۳۰۰ میلی‌ثانیه"; chk "ران‌بوک: هشدار تأخیر روی ۳۰۰ میلی‌ثانیه" $? "در برابر مرجع"
grep -qF '"http_req_failed": ["rate<0.001"]' tests/performance/config/thresholds.json; chk "آستانهٔ سراسری کی‌شش: خطا < ۰٫۱٪" $? "رفع تعارض #۳"
grep -qF '"p(95)<250"' tests/performance/config/thresholds.json; chk "آستانهٔ تأخیر کی‌شش سخت‌گیرانه‌تر از سقف (عملیاتی)" $? "توضیح در طرح بار §۱.۱"
has $DOCS/LOAD_TEST_PLAN.md "یادداشت هماهنگی (ممیزی ۲۰۲۶-۰۹-۱۰)"; chk "توضیح سخت‌گیری تأخیر در طرح بار ثبت است" $? "رفع تعارض #۳"

echo "▸ RPO/RTO (سقف‌های سیاست)"
has $DOCS/DISASTER_RECOVERY.md "≤ ۵ دقیقه"; chk "بازیابی: آر‌پی‌او ≤ ۵ دقیقه" $? "سند فاجعه §۱"
has $DOCS/DISASTER_RECOVERY.md "≤ ۱۵ دقیقه"; chk "بازیابی: آر‌تی‌او ≤ ۱۵ دقیقه" $? "سند فاجعه §۱"
has $DOCS/HA_POSTGRES.md "RTO ≤ ۱۵د"; chk "ها-پستگرس: آر‌تی‌او ≤ ۱۵ دقیقه" $? "در برابر برنامهٔ پایایی"
has $DOCS/HA_POSTGRES.md "RPO ≤ ۵د"; chk "ها-پستگرس: آر‌پی‌او ≤ ۵ دقیقه" $? "در برابر برنامهٔ پایایی"
has $DOCS/RELIABILITY_DR_PLAN.md "کمتر از ۱۵ دقیقه"; chk "برنامهٔ پایایی: آر‌تی‌او < ۱۵ دقیقه" $? "مرجع بالادستی"
has $DOCS/RELIABILITY_DR_PLAN.md "کمتر از ۵ دقیقه"; chk "برنامهٔ پایایی: آر‌پی‌او < ۵ دقیقه" $? "مرجع بالادستی"
has $DOCS/PRODUCTION_READINESS_CHECKLIST.md "RTO کمتر از ۱۵ دقیقه، RPO کمتر از ۵ دقیقه"; chk "چک‌لیست آمادگی با برنامهٔ پایایی هم‌خوان است" $? "در برابر مرجع"

echo "▸ مهاجرت‌ها و موج‌ها"
# ۲۰۲۶-۰۰۹-۱۱: تصادمِ شمارهٔ ۰۰۴ رفع شد — 004_wave3_query_indexes به ۰۰۷
# شماره‌گذاریِ مجدد شد (۰۰۶ پیش‌تر توسط 006_delta_schema_gaps گرفته شده بود).
# دلیل و تحلیل: docs/MIGRATION_DECISION.md · ممیزی: docs/MIGRATION_AUDIT.md
# ۲۰۲۶-۰۹-۱۱ (موج ۱۰): به‌جای پین‌کردنِ شمار، خودِ قاعده سنجیده می‌شود —
# شمارِ فایل‌ها باید با بیشینهٔ شماره یکی باشد و شماره‌ها از ۰۰۱ پیوسته؛
# اسناد هم باید بازهٔ «۰۰۱–<آخرین>» را بگویند (بدونِ پینِ عدد).
MIG=$(ls migrations/*.sql 2>/dev/null | grep -v '\.down\.sql$' | wc -l)
DUPNUMS=$(ls migrations/*.sql 2>/dev/null | grep -v '\.down\.sql$' | grep -oE '[0-9]{3}' | sort | uniq -d | tr '\n' ' ')
[ -z "$DUPNUMS" ]; chk "هیچ شمارهٔ مهاجرت تکراری نیست (سیاستِ شماره‌گذاریِ پیوسته)" $? "تکراری: ${DUPNUMS:-هیچ}"
SEQ=$(ls migrations/*.sql 2>/dev/null | grep -v '\.down\.sql$' | grep -oE '[0-9]{3}' | sort | tr '\n' ' ')
EXP=$(i=1; while [ "$i" -le "$MIG" ]; do printf '%03d ' "$i"; i=$((i+1)); done)
[ "$SEQ" = "$EXP" ]; chk "شماره‌ها از ۰۰۱ تا آخرین ($MIG فایل) پیوسته‌اند" $? "یافت‌شده: $SEQ"
LAST=$(printf '%s' "$SEQ" | awk '{print $NF}')
[ "$((10#$LAST))" -eq "$MIG" ]; chk "شمارِ مهاجرت‌های روی دیسک = بیشینهٔ شماره" $? "شمار: $MIG · بیشینه: $LAST"
LAST_FA=$(printf '%s' "$LAST" | sed 'y/0123456789/۰۱۲۳۴۵۶۷۸۹/')
has $DOCS/DOCS_INDEX.md "۰۰۱–$LAST_FA"; chk "نمایه: فهرست مهاجرت ۰۰۱–$LAST_FA" $? "در برابر دیسک"
has $DOCS/RELEASE_NOTES.md "مهاجرت‌های نسخه‌دار ۰۰۱–$LAST_FA"; chk "یادداشت انتشار: مهاجرت‌های ۰۰۱–$LAST_FA" $? "در برابر دیسک"
has $DOCS/RELEASE_NOTES.md "| ۲۰ |"; chk "جدول موج‌ها تا موج ۲۰ کامل است" $? "یادداشت انتشار §۲"

echo "▸ ردیاب P0 و پایلوت"
has $DOCS/P0_BLOCKER_TRACKER.md "پ0-۶"; chk "ردیاب: هر شش کارت پ0 ثبت‌اند" $? "پ0-۱ تا پ0-۶"
has $DOCS/P0_BLOCKER_TRACKER.md "**۴** (پ0-۲، پ0-۳، پ0-۵"; chk "ردیاب: ۴ در حال رفع" $? "جمع شش‌تایی"
has $DOCS/P0_BLOCKER_TRACKER.md "**۲** (پ0-۱، پ0-۴"; chk "ردیاب: ۲ بلاک‌شده" $? "جمع شش‌تایی"
has $DOCS/GO_LIVE_PACKAGE.md "۱۷.۵هزار کاربر"; chk "بستهٔ گو-لایو: پایلوت ۱۷٫۵ هزار کاربر" $? "در برابر طرح پایلوت"
has $DOCS/GO_LIVE_PACKAGE.md "≈ ۴۰ مدرسه"; chk "بستهٔ گو-لایو: ≈ ۴۰ مدرسه" $? "در برابر طرح پایلوت"
has $DOCS/PILOT_ROLLOUT_PLAN.md "۳۰ تا ۵۰ مدرسه"; chk "پایلوت: ۳۰ تا ۵۰ مدرسه" $? "مرجع پایلوت"
has $DOCS/PILOT_ROLLOUT_PLAN.md "≈ ۱۰٬۰۰۰"; chk "پایلوت: ≈ ۱۰ هزار دانش‌آموز" $? "مرجع پایلوت"

echo "▸ یادداشت‌های نام‌گذاری دیتاست (تعارض #۴)"
N=0
for f in docs/LOAD_TEST_PLAN.md docs/LOAD_TEST_RESULTS.md docs/P0_BLOCKER_TRACKER.md docs/PRODUCTION_READINESS_CHECKLIST.md; do
  has "$f" "generate-national-dataset.js" && N=$((N+1)); done
[ "$N" -eq 4 ]; chk "یادداشت مولد هم‌ارز در هر ۴ سند ثبت است" $? "ثبت در $N از ۴ سند"

echo "▸ گیت‌های زندهٔ اسناد"
C547=$(grep -lF "۵۴۷" $DOCS/FAQ.md $DOCS/GO_LIVE_PACKAGE.md $DOCS/ONBOARDING_NEW_DEVELOPER.md $DOCS/TROUBLESHOOTING.md $DOCS/RELEASE_NOTES.md 2>/dev/null | wc -l)
[ "$C547" -ge 4 ]; chk "ادعای دود ۵۴۷ در اسناد هم‌خوان نوشته شده" $? "در $C547 سند"

echo ""
echo "──────────────────────────────────────────"
echo "نتیجه: $PASS هماهنگ / $FAIL تعارض"

# بلوک ماشینی گزارش
TS=$(date -u +%Y-%m-%d)
{
  echo "<!-- MACHINE:START — تولیدِ tools/docs-consistency-check.sh؛ دستی ویرایش نکنید -->"
  echo "## بررسی ماشینی (آخرین اجرا: $TS)"
  echo ""
  echo "| نتیجه | بررسی | مدرک |"
  echo "|---|---|---|"
  printf "%b" "$ROWS"
  echo ""
  echo "**نتیجه: $PASS هماهنگ / $FAIL تعارض**"
  echo "<!-- MACHINE:END -->"
} > /tmp/consistency-machine.md
python3 - "$DOCS/DOCS_CONSISTENCY_REPORT.md" <<'PYEOF'
import sys, re
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
blk = open('/tmp/consistency-machine.md', encoding='utf-8').read()
pat = re.compile(r'<!-- MACHINE:START.*?<!-- MACHINE:END -->\n?', re.S)
blk = '\n' + blk.lstrip('\n')
if pat.search(s):
    s = pat.sub(lambda m: blk.lstrip('\n'), s)
else:
    s = s.rstrip('\n') + '\n' + blk
open(p, 'w', encoding='utf-8').write(s)
PYEOF
echo "بلوک ماشینی در $DOCS/DOCS_CONSISTENCY_REPORT.md به‌روز شد."
[ "$FAIL" -eq 0 ]
