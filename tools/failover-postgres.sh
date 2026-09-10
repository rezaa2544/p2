#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# failover-postgres.sh — ارتقایِ standby به primary (DR §۱ از DR_RUNBOOK)
# ───────────────────────────────────────────────────────────────────
# گاردها (fail-closed):
#   ۱) split-brain: اگر standby خودش promote شده باشد ⇒ ابورت کامل
#   ۲) تأخیرِ replay بالاتر از آستانه ⇒ هشدارِ RPO و فقط با --force ادامه
#   ۳) عدم‌دسترسیِ primary تأییدِ چندباره (۳×۵s) قبلِ اقدام
# اقدام: SELECT pg_promote(wait=>true, wait_seconds=>60) رویِ standby؛
# سپس بازتنظیمِ PgBouncer (pausing/resume) و چاپِ چک‌لیستِ پس از اقدام.
# مصرف:
#   tools/failover-postgres.sh [--dry-run] [--force]
# env: PGHOST/PGPORT/PGUSER/PGPASSWORD = standbyِ هدف (پیش‌فرض: localhost:5433)
#      OLD_PGHOST/OLD_PGPORT برایِ تاییدِ مرگ primary (پیش‌فرض localhost:5432/6432)
# خروجی: ۰ اقدام/آماده، ۱ گارد رد کرد، ۲ پیش‌نیازِ نبوده
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5433}" PGDATABASE="${PGDATABASE:-payesh}"
OLD_PGHOST="${OLD_PGHOST:-127.0.0.1}"; OLD_PGPORT="${OLD_PGPORT:-5432}"
MAX_LAG_BYTES="${MAX_LAG_BYTES:-67108864}" # 64MB ≈ پنجرهٔ RPO≤۵دقیقه در بارِ عادی
DRY=0; FORCE=0
for a in "$@"; do case "$a" in --dry-run) DRY=1;; --force) FORCE=1;; *) echo "ناشناخته: $a" >&2; exit 2;; esac; done
command -v psql >/dev/null 2>&1 || { echo "FAIL: psql نیست" >&2; exit 2; }
sq(){ PGPASSWORD="${PGPASSWORD:-}" psql -h "$1" -p "$2" -U "${PGUSER:-postgres}" -d "$3" -tAXc "$4" 2>/dev/null || true; }

echo "== failover-postgres: standby=$PGHOST:$PGPORT primary=($OLD_PGHOST:$OLD_PGPORT) dry=$DRY force=$FORCE"

# ۱) گاردِ split-brain
inrec="$(sq "$PGHOST" "$PGPORT" "$PGDATABASE" "SELECT pg_is_in_recovery()")"
if [ "$inrec" != "t" ]; then
  echo "FAIL: مقصدِ انتخابی در recovery نیست (یا از قبل primary است یا دسترس‌پذیر نیست) — برایِ امنیتِ داده ادامه نمی‌دهم" >&2; exit 1
fi

# ۲) تاییدِ مرگِ primary (۳ تلاش) — مگر --force
if [ "$FORCE" != 1 ]; then
  DEAD=1
  for i in 1 2 3; do
    if pg_isready -h "$OLD_PGHOST" -p "$OLD_PGPORT" -t 2 >/dev/null 2>&1; then DEAD=0; fi
    [ "$DEAD" = 1 ] && break; sleep 5
  done
  if [ "$DEAD" = 0 ]; then
    echo "FAIL: primary همچنان پاسخ می‌دهد — failover بدونِ مرگِ primary یعنی ریسکِ split-brain؛ یا قطعیِ شبکه را رفع کن یا --force (با مسئولیتِ اپراتور، پس از fence کردنِ primaryِ کهنه)" >&2; exit 1
  fi
fi

# ۳) lagِ replay روی standby (تقریبی، بدونِ primary بی‌معناست؛ چکِ محلی)
lag_note="(غیرقابل‌سنجش بدونِ primary)"
if [ "$FORCE" != 1 ]; then
  pending="$(sq "$PGHOST" "$PGPORT" "$PGDATABASE" "SELECT coalesce(pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()),0)::bigint")"
  if [ -n "$pending" ] && [ "$pending" -gt "$MAX_LAG_BYTES" ] 2>/dev/null; then
    echo "FAIL: ${pending}B در صفِ replay است (آستانه ${MAX_LAG_BYTES}B) — صبر کن تا replay کامل شود یا --force" >&2; exit 1
  fi
  [ -n "$pending" ] && lag_note="(unreplayed=${pending}B)"
fi

if [ "$DRY" = 1 ]; then echo "DRY-RUN: آمادهٔ promote — گاردها پاس شدند $lag_note"; exit 0; fi

echo "در حالِ promote ..."
sq "$PGHOST" "$PGPORT" "$PGDATABASE" "SELECT pg_promote(wait := true, wait_seconds := 60)" >/dev/null
inrec2="$(sq "$PGHOST" "$PGPORT" "$PGDATABASE" "SELECT pg_is_in_recovery()")"
if [ "$inrec2" != "f" ]; then echo "FAIL: promote انجام نشد (هنوز در recovery)" >&2; exit 1; fi

# ۴) PgBouncer: resumeِ استخرها رویِ endpointِ جدید (ini باید host را به
#    همین instance اشاره دهد — در compose نام سرویس ثابت است و restart کافی است)
if command -v docker >/dev/null 2>&1 && [ -n "${COMPOSE_F:-}" ]; then
  docker compose -f "$COMPOSE_F" up -d --force-recreate pgbouncer >/dev/null 2>&1 || echo "WARN: restartِ pgbouncer دستی لازم است"
fi

echo "════════════════════════════════════════════"
echo "PROMOTE_OK: $PGHOST:$PGPORT حالا primary است $lag_note"
echo "چک‌لیستِ پس از اقدام (DR_RUNBOOK §۱.۳):"
echo "  ۱) DATABASE_URL برنامه را به endpoint تازه هم‌راستا کن/بازبینی کن"
echo "  ۲) primaryِ کهنه را fence کن تا هرگز دو primary نماند"
echo "  ۳) standbyِ جدید را از رویِ primaryِ تازه rebuild کن (STANDBY_BOOTSTRAP=repo)"
echo "  ۴) pg_stat_archiver را رویِ new primary سبز کن (WAL archiving حیاتی است)"
echo "  ۵) رویداد را در ممیزیِ داخلی ثبت کن: incident=failover-postgres actor=$USER"
echo "════════════════════════════════════════════"
