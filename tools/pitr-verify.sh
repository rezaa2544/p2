#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# pitr-verify.sh — تأییدِ صحتِ بازیابی (چک‌لیستِ Restore-Drill)
# ───────────────────────────────────────────────────────────────────
# اجرا روی instanceِ بازیابی‌شده (معمولاً PITR در محیطِ جدا):
#   • سرور بالا و PROMOTE شده (pg_is_in_recovery=f)
#   • جدول‌هایِ حیاتیِ پایش موجود و غیرخالی (users/schools/classes/grades/attendance)
#   • بی‌اعتباریِ داده‌هایِ پس از زمانِ هدف با مقایسهٔ واقعیِ TIMESTAMPTZ در SQL
#   • sample-checksum سه جدول + latest version ردیابی‌شده
# مصرف:
#   tools/pitr-verify.sh --host-dir /var/backups/payesh-pitr/<RUN>/run --port 54329 [--expect-before 'TS']
#   PGHOST/PGPORT/PGDATABASE/PGUSER برایِ اتصالِ مستقیم هم کافی است
# خروجی: ۰ = همۀ بندها سبز؛ ۱ = هر FAIL
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
HDIR=""; PORT="54329"; EXPECT_BEFORE=""; STANZA="${PBR_STANZA:-payesh}"; TARGET_SPEC=""
while [ $# -gt 0 ]; do
  case "$1" in
    --host-dir) HDIR="$2"; shift 2;;
    --port) PORT="$2"; shift 2;;
    --expect-before) EXPECT_BEFORE="$2"; shift 2;;
    --stanza) STANZA="$2"; shift 2;;
    --target-spec) TARGET_SPEC="$2"; shift 2;;
    *) echo "ناشناخته: $1" >&2; exit 1;;
  esac
done
FAILED=0
note(){ if [ "$2" = "ok" ]; then echo "PASS: $1"; else echo "FAIL: $1"; FAILED=1; fi; }
q(){ if [ -n "$HDIR" ]; then psql -h "$HDIR" -p "$PORT" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-payesh}" -tAc "$1" 2>/dev/null
     else psql -tAc "$1" 2>/dev/null; fi; }

# ۱) connectivity
if q "SELECT 1" >/dev/null 2>&1; then note "اتصال به instanceِ بازیابی‌شده" ok; else note "اتصال به instanceِ بازیابی‌شده" bad; exit 1; fi

# ۲) promote شده
rec=""
for _ in $(seq 1 60); do
  rec="$(q "SELECT pg_is_in_recovery()" || true)"
  [ "$rec" = "f" ] && break
  sleep 1
done
[ "$rec" = "f" ] && note "ریکاوری تمام و promote شده (pg_is_in_recovery=f)" ok || note "همچنان در recovery است" bad

# ۳) جدول‌هایِ حیاتی + non-empty
for t in users schools classes grades attendance; do
  c="$(q "SELECT count(*) FROM $t" || echo ERR)"
  case "$c" in ''|ERR|0) note "جدولِ حیاتی $t (count=$c)" bad;; *) note "جدولِ حیاتی $t (count=$c)" ok;; esac
done

# ۴) اگر هدفِ زمانی داده شده: هیچ رویدادِ تازه‌تر از هدف نباید در هیچ جدولِ رویداد باشد
if [ -n "$EXPECT_BEFORE" ]; then
  if [[ ! "$EXPECT_BEFORE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}[T\ ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)?$ ]]; then
    note "قالبِ زمان هدف نامعتبر است ($EXPECT_BEFORE)" bad
  else
    latest_ok=""
    latest_bad=""
    for spec in "audit:created_at" "system_audit:timestamp" "phase6_audit_events:created_at" "notifications:created_at" "server_outbox:created_at"; do
      tbl="${spec%%:*}"
      col="${spec#*:}"
      if [ "$(q "SELECT to_regclass('public.${tbl}') IS NOT NULL" || true)" = "t" ]; then
        verdict="$(q "SELECT CASE WHEN max(\"${col}\") IS NULL THEN '' WHEN max(\"${col}\")::timestamptz <= '${EXPECT_BEFORE}'::timestamptz THEN 'ok|' || max(\"${col}\")::timestamptz::text ELSE 'after|' || max(\"${col}\")::timestamptz::text END FROM public.\"${tbl}\"" || true)"
        case "$verdict" in
          after\|*) latest_bad="${verdict#after|}" ;;
          ok\|*) latest_ok="${verdict#ok|}" ;;
        esac
      fi
    done
    if [ -n "$latest_bad" ]; then
      note "داده‌ای پس از هدفِ بازیابی وجود دارد ($latest_bad > $EXPECT_BEFORE)" bad
    elif [ -n "$latest_ok" ]; then
      note "آخرین رویداد ($latest_ok) پیش از هدفِ بازیابی ($EXPECT_BEFORE) است — target رعایت شد" ok
    else
      note "ستونِ created_at برایِ سنجشِ target پیدا نشد (چک دستی لازم است)" bad
    fi
  fi
fi

# ۵) checksumِ نمونه (سه جدول) برایِ مقایسه با runهایِ drill قبل
for t in users grades attendance; do
  h="$(q "SELECT coalesce(md5(string_agg(t::text,'|' order by id)),'') FROM (SELECT * FROM $t ORDER BY id LIMIT 200) t" || echo '')"
  echo "CHECKSUM table=$t rows200md5=$h"
done

echo "════════════════════════════════════════════"
if [ "$FAILED" = 0 ]; then echo "PITR_VERIFY: سبز — بازیابیِ $STANZA معتبر است"; else echo "PITR_VERIFY: قرمز — پیش از مصرفِ نتیجه اصلاح کن"; fi
exit "$FAILED"
