#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# tools/mutate-reports-check.sh — ممیزیِ جهشِ دوسوئیته برای سازنده‌های SQL موج ۲۳
#
# چرا دوسوئیته: سنجهٔ سازنده (tests/wave23-reports-sql.js) شکلِ SQL را می‌سنجد و
# سریع است، ولی بسیاری از جهش‌های معنایی را نمی‌گیرد؛ سنجهٔ هم‌ارزی روی
# PostgreSQLِ واقعی (tests/wave23-reports-pg.js) خروجی را با مسیرِ حافظه مقایسه
# می‌کند. جهش فقط وقتی «کشته» شده که دستِ‌کم یکی از این دو بشکند. جهشی که هر دو
# سنجه از کنارش رد شوند، نقصِ واقعیِ پوششِ تست است و باید گزارش شود.
#
# طبقه‌بندیِ خروجی:
#   ✅ کشته شد (نام سنجه)        — جهش شکستِ تست داد
#   ❌ زنده ماند                 — هیچ سنجه‌ای حساس نیست ⇒ نقصِ پوشش
#   ⚖  هم‌ارز (EQ)               — جهش معنای برنامه را عوض نمی‌کند؛ با دلیل
#   ⚠  اعمال نشد                 — لنگر در فایل پیدا نشد (فایل تغییر کرده)
#
# این اسکریپت سورسِ اصلی را دست نمی‌زند: یک سایهٔ کامل از مخزن می‌سازد، جهش را
# روی سایه اعمال می‌کند و سنجه‌ها را داخلِ همان سایه اجرا می‌کند (الگوی امنِ جهش).
#
# اجرا:
#   DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
#     bash tools/mutate-reports-check.sh
#
# اگر DATABASE_URL نباشد یا PostgreSQL بالا نباشد، فقط سنجهٔ سازنده اجرا می‌شود و
# این محدودیت در خروجی صریحاً اعلام می‌شود (سبزِ جعلی نه).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── الگوی امنِ جهش (دکترین p06/p11 و tests/helpers/mutant-kit.js) ─────────────
# سورسِ اصلی هرگز بازنویسی نمی‌شود. یک سایهٔ کامل از مخزن در پوشهٔ موقت ساخته
# می‌شود، جهش روی همان سایه اعمال می‌شود و سنجه‌ها هم **داخلِ همان سایه** اجرا
# می‌شوند. این نکته حیاتی است: SKILLS_MASTER هشدار می‌دهد کپی‌ای که ساخته شود ولی
# مسیرِ اصلی اجرا شود، هیچ چیزی را اثبات نمی‌کند. پس اگر سایه ساخته نشود، ابزار
# با خطا خارج می‌شود و هرگز به بازنویسیِ سورسِ اصلی روی نمی‌آورد.
WORK="$(mktemp -d /tmp/mutate-reports-XXXXXX)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT
tar -C "$ROOT" --exclude=.git --exclude=node_modules -cf - . | tar -C "$WORK" -xf -
if [ -d "$ROOT/node_modules" ]; then ln -s "$ROOT/node_modules" "$WORK/node_modules"; fi
F="$WORK/server/reports-sql.js"
if [ ! -f "$F" ]; then
  echo "❌ سایهٔ مخزن ساخته نشد؛ سورسِ اصلی دست‌نخورده است و هیچ جهشی اعمال نشد." >&2
  exit 2
fi
restore() { cp "$ROOT/server/reports-sql.js" "$F"; }

PG_READY=0
if [ -n "${DATABASE_URL:-}" ]; then
  if (cd "$ROOT" && timeout 120 node -e '
      const {Client}=require("pg");const c=new Client({connectionString:process.env.DATABASE_URL});
      c.connect().then(()=>c.end()).then(()=>process.exit(0)).catch(()=>process.exit(1));' >/dev/null 2>&1); then
    PG_READY=1
  fi
fi
if [ "$PG_READY" -eq 1 ]; then
  echo "▸ سنجه‌ها: سازندهٔ SQL + هم‌ارزیِ PostgreSQLِ واقعی (دوسوئیته)"
else
  echo "▸ سنجه‌ها: فقط سازندهٔ SQL — PostgreSQL در دسترس نیست، پس «زنده ماند» ممکن است"
  echo "  کاذب باشد. برای نتیجهٔ قطعی DATABASE_URL بدهید."
fi
echo ""

KILLED=0; SURVIVED=0; NOTAPPLIED=0; EQ=0; GAP=0; MISMATCH=0

# arg4 = انتظارِ از پیش مستندشده: «EQ:<دلیل>» یعنی جهش معنای برنامه را عوض
# نمی‌کند، «GAP:<دلیل>» یعنی جهش عمداً زنده می‌ماند چون نقصِ شناخته‌شدهٔ پوشش است.
# اگر نتیجهٔ واقعی با انتظار نخواند، MISMATCH می‌شود و ابزار قرمز می‌دهد — یعنی
# طبقه‌بندیِ خودش غلط است، نه اینکه تست ضعف داشته باشد.
run() { # run <name> <old> <new> [EQ:reason|GAP:reason]
  local name="$1" old="$2" new="$3" expect="${4:-}"
  restore
  if ! python3 - "$F" "$old" "$new" <<'PY' >/dev/null 2>&1
import io, sys
p, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
old = old.replace('@NL@', '\n'); new = new.replace('@NL@', '\n')
s = io.open(p, encoding='utf8').read()
assert s.count(old) >= 1, 'anchor missing'
io.open(p, 'w', encoding='utf8').write(s.replace(old, new, 1))
PY
  then
    printf '  %-46s ⚠ اعمال نشد (لنگر پیدا نشد)\n' "$name"; NOTAPPLIED=$((NOTAPPLIED+1)); MISMATCH=$((MISMATCH+1)); return
  fi
  if ! (cd "$WORK" && timeout 300 node tests/wave23-reports-sql.js >/tmp/.mut-sql.txt 2>&1); then
    local n; n=$(grep -oE '[0-9]+ ناموفق' /tmp/.mut-sql.txt | head -1)
    printf '  %-46s ✅ کشته شد — سازندهٔ SQL (%s)\n' "$name" "${n:-شکست}"
    KILLED=$((KILLED+1)); [ -n "$expect" ] && { echo "       ⚠ طبقه‌بندیِ $expect غلط بود: جهش کشته شد"; MISMATCH=$((MISMATCH+1)); }; return
  fi
  if [ "$PG_READY" -eq 1 ]; then
    if ! (cd "$WORK" && timeout 600 node tests/wave23-reports-pg.js >/tmp/.mut-pg.txt 2>&1); then
      local n; n=$(grep -oE '[0-9]+ ناموفق' /tmp/.mut-pg.txt | head -1)
      printf '  %-46s ✅ کشته شد — هم‌ارزیِ PG (%s)\n' "$name" "${n:-شکست}"
      KILLED=$((KILLED+1)); [ -n "$expect" ] && { echo "       ⚠ طبقه‌بندیِ $expect غلط بود: جهش کشته شد"; MISMATCH=$((MISMATCH+1)); }; return
    fi
  fi
  case "$expect" in
    EQ:*)  printf '  %-46s ⚖ هم‌ارز — %s\n' "$name" "${expect#EQ:}"; EQ=$((EQ+1)); return ;;
    GAP:*) printf '  %-46s ⚠ زندهٔ شناخته‌شده — %s\n' "$name" "${expect#GAP:}"; GAP=$((GAP+1)); return ;;
  esac
  printf '  %-46s ❌ زنده ماند — پوشش نسبت به آن بی‌حس است\n' "$name"
  SURVIVED=$((SURVIVED+1))
}

echo "▸ جهش‌های معنایی در NORM_EXPR / max_score (گزارش تحصیلی)"
# M1 — مرزِ pass: نمرهٔ ۱۰ باید قبول باشد.
run 'M1 norm >= 10 → > 10 (مرزِ قبولی)' \
  'count(g.norm) FILTER (WHERE g.norm >= 10)::int AS pass' \
  'count(g.norm) FILTER (WHERE g.norm > 10)::int AS pass'
# M2 — ضریبِ نرمال‌سازی به ۲۰.
run 'M2 * 20 → * 10 (ضریبِ نرمال)' \
  'COALESCE(g.score, 0) * 20 / ${MX_NUM}' \
  'COALESCE(g.score, 0) * 10 / ${MX_NUM}'
# M3 — mx=0 باید به شاخهٔ ELSE برود، نه NULL؛ >= 0 آن را به تقسیم بر صفر می‌برد.
run 'M3 MX_NUM > 0 → >= 0 (تقسیم بر صفر)' \
  'WHEN ${MX_VALID} AND ${MX_NUM} > 0 THEN' \
  'WHEN ${MX_VALID} AND ${MX_NUM} >= 0 THEN' \
  'GAP:در دو سنجهٔ این ابزار زنده است (فیکسچر max_score صفر ندارند)؛ پوششِ واقعی در tests/wave23-norm-edge-mutations.js جهش N1 کشته می‌شود'
# M4 — max_score منفی باید ردیف را حذف کند (NULL)، نه صفر.
run 'M4 max_score<0 ⇒ NULL → 0' \
  'WHEN ${MX_VALID} AND ${MX_NUM} < 0 THEN NULL' \
  'WHEN ${MX_VALID} AND ${MX_NUM} < 0 THEN 0' \
  'GAP:در دو سنجهٔ این ابزار زنده است؛ پوششِ واقعی در tests/wave23-norm-edge-mutations.js جهش N2 کشته می‌شود'
# M5 — کستِ عددی نباید اعشار را ببرد.
run 'M5 max_score::numeric → ::int (گرد کردن)' \
  'const MX_NUM = `btrim(g.max_score)::numeric`;' \
  'const MX_NUM = `btrim(g.max_score)::int`;' \
  'GAP:در دو سنجهٔ این ابزار زنده است؛ پوششِ واقعی در tests/wave23-norm-edge-mutations.js جهش N3 کشته می‌شود'
# M6 — score تهی باید صفر حساب شود، نه NULL.
run 'M6 COALESCE(g.score,0) → g.score' \
  'THEN COALESCE(g.score, 0) * 20 / ${MX_NUM}' \
  'THEN g.score * 20 / ${MX_NUM}' \
 \
  'GAP:در دو سنجهٔ این ابزار زنده است؛ پوششِ واقعی در tests/wave23-norm-edge-mutations.js جهش N4 کشته می‌شود'
echo ""
echo "▸ جهش‌های ساختاری (صفحه‌بندی، JOIN، گرد کردن)"
# M7 — LEFT JOIN باید کلاسِ بی‌نمره را با cnt=0 نگه دارد.
run 'M7 LEFT JOIN → JOIN (کلاسِ بی‌نمره می‌افتد)' \
  'LEFT JOIN g ON g.class_id = c.id AND g.school_id = c.school_id' \
  'JOIN g ON g.class_id = c.id AND g.school_id = c.school_id'
# M8 — کلیدِ keyset باید +1 ردیفِ نگاه‌بان بگیرد تا hasMore درست باشد.
run 'M8 LIMIT n+1 → n (hasMore خراب می‌شود)' \
  'const lim = clampLimit(limit) + 1;' \
  'const lim = clampLimit(limit);'
# M9 — میانگینِ کلاس تا یک رقم اعشار گرد می‌شود (همان رفتارِ مسیرِ حافظه).
run 'M9 round(...,1) → round(...,2)' \
  'THEN round((sum(g.norm) / count(g.norm))::numeric, 1) END AS avg1' \
  'THEN round((sum(g.norm) / count(g.norm))::numeric, 2) END AS avg1'
# M10 — ستونِ مالیِ تهی/خراب باید صفر شود، نه یک.
run 'M10 numOr0 ELSE 0 → ELSE 1 (مالی)' \
  'THEN btrim(${col})::numeric ELSE 0 END`;' \
  'THEN btrim(${col})::numeric ELSE 1 END`;'
# M11 — جمعِ شهریه نباید NULLها را به NULLِ کل تبدیل کند.
run 'M11 COALESCE(total,0) → total' \
  'COALESCE(sum(COALESCE(total, 0)), 0)::float8 AS total' \
  'COALESCE(sum(total), 0)::float8 AS total' \
  'EQ:sum تهی‌ها را نادیده می‌گیرد؛ روی PG راستی‌آزمایی شد (mixed 5=5 و all-NULL 0=0)'
# M12 — سقفِ صفحه نباید برداشته شود.
run 'M12 clampLimit: سقفِ MAX_PAGE حذف شد' \
  'return Math.min(Math.floor(v), MAX_PAGE);' \
  'return Math.floor(v);' \

restore
echo ""
echo "──────────────────────────────────────────────────────────────"
echo "نتیجه: کشته=$KILLED · زندهٔ بی‌حساب=$SURVIVED · زندهٔ شناخته‌شده=$GAP · هم‌ارز=$EQ · اعمال‌نشده=$NOTAPPLIED · تناقضِ طبقه‌بندی=$MISMATCH"
if [ "$GAP" -gt 0 ]; then
  echo ""
  echo "⚠ این $GAP جهش در دو سنجهٔ **این ابزار** زنده می‌ماند چون فیکسچرهایشان"
  echo "  این لبه‌ها را ندارند (max_score='0' · منفی · اعشاری · score=NULL)."
  echo "  پوششِ واقعی‌شان در tests/wave23-norm-edge-mutations.js است که هر چهار"
  echo "  جهشِ لبه را با فیکسچرِ اختصاصی و تغییرِ عدد می‌کُشد؛ آن گیت را هم اجرا کنید."
fi
if [ "$SURVIVED" -eq 0 ] && [ "$NOTAPPLIED" -eq 0 ] && [ "$MISMATCH" -eq 0 ]; then
  echo "mutate-reports-check: سبز ✅ (هر جهش یا کشته شد یا از پیش مستند و راستی‌آزمایی شده)"
  exit 0
else
  echo "mutate-reports-check: قرمز ❌ (جهشِ زندهٔ بی‌حساب، لنگرِ گم‌شده یا تناقضِ طبقه‌بندی)"
  exit 1
fi
