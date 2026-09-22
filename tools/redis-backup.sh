#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# redis-backup.sh — پشتیبانِ خودکارِ ردیس (فاز ۲.۱)
# ───────────────────────────────────────────────────────────────────
# هر اجرا:
#   ۱. `redis-cli SAVE`          ⇒ کپیِ `dump.rdb` در مقصد پشتیبان
#   ۲. `redis-cli BGREWRITEAOF`  ⇒ انتظار برای پایان بازنویسی، سپس کپیِ
#                                   `appendonly.aof` در مقصد پشتیبان
#   ۳. پاک‌سازی نسخه‌های قدیمی‌تر از دورهٔ نگهداری (پیش‌فرض ۷ روز)
#   ۴. اگر `BACKUP_S3` تنظیم باشد (مثل `s3://payesh-backups/redis`) و
#      `aws` در دسترس باشد، فایل‌ها به فضای شیئی هم بارگذاری می‌شوند.
#
# کرون (هر ۶ ساعت):
#   0 */6 * * * /opt/payesh/tools/redis-backup.sh >> /var/log/redis/backup.log 2>&1
#
# متغیرهای محیط:
#   REDIS_HOST (پیش‌فرض 127.0.0.1) · REDIS_PORT (پیش‌فرض 6379)
#   REDIS_PASSWORD        → فقط از طریق REDISCLI_AUTH به redis-cli می‌رسد؛
#                           هرگز در خط فرمان نمی‌آید (جلوگیری از نشت در ps)
#   REDIS_DIR (پیش‌فرض /var/lib/redis/node-1) — دایرکتوری `dir` در ردیس
#   BACKUP_DIR (پیش‌فرض /var/backups/payesh-redis)
#   BACKUP_RETENTION_DAYS (پیش‌فرض 7)
#   BACKUP_S3 (اختیاری) — مسیر فضای شیئی
#   REDIS_CLI / REDIS_CLI_TIMEOUT / BACKUP_LOCK برای تست و استقرار خاص
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_DIR="${REDIS_DIR:-/var/lib/redis/node-1}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/payesh-redis}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
REDIS_CLI="${REDIS_CLI:-redis-cli}"
REDIS_CLI_TIMEOUT="${REDIS_CLI_TIMEOUT:-120}"
BACKUP_LOCK="${BACKUP_LOCK:-/tmp/payesh-redis-backup.lock}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"

rcli() {
  # رمز هرگز آرگومان نمی‌شود؛ فقط متغیر محیطیِ خودِ redis-cli
  timeout "${REDIS_CLI_TIMEOUT}" "${REDIS_CLI}" -h "${REDIS_HOST}" -p "${REDIS_PORT}" "$@"
}

log() { echo "[redis-backup ${TS}] $*"; }
die() { log "FATAL: $*" >&2; exit 1; }

# ── قفل: اجرای هم‌زمان ممنوع ──
# F-QA-08: تداخلِ قفل «موفقیت» نیست — هیچ پشتیبانی گرفته نشده است.
# خروجِ صفر باعث می‌شد cron/CI یک اجرایِ بی‌پشتیبان را سبز ببیند (سبزِ کاذب).
# کدِ ۷۵ (EX_TEMPFAIL) عمداً از ۱ (خطایِ واقعی) جدا است تا فراخوان بتواند
# «بعداً دوباره تلاش کن» را از «پشتیبان‌گیری شکست خورد» تشخیص دهد.
BACKUP_LOCK_BUSY_EXIT="${BACKUP_LOCK_BUSY_EXIT:-75}"
exec 9>"${BACKUP_LOCK}"
if ! flock -n 9; then
  log "اجرای دیگری در جریان است — هیچ پشتیبانی گرفته نشد (کد ${BACKUP_LOCK_BUSY_EXIT})." >&2
  exit "${BACKUP_LOCK_BUSY_EXIT}"
fi

if [ -n "${REDIS_PASSWORD:-}" ]; then
  export REDISCLI_AUTH="${REDIS_PASSWORD}"
fi

mkdir -p "${BACKUP_DIR}"

# ── ۰) سلامت ──
rcli PING >/dev/null || die "redis-cli PING شکست خورد (${REDIS_HOST}:${REDIS_PORT})"

# ── ۱) RDB ──
log "SAVE (RDB snapshot)…"
rcli SAVE >/dev/null || die "redis-cli SAVE شکست خورد"
[ -f "${REDIS_DIR}/dump.rdb" ] || die "فایل dump.rdb در ${REDIS_DIR} پیدا نشد"
cp -f "${REDIS_DIR}/dump.rdb" "${BACKUP_DIR}/dump-${TS}.rdb"
log "RDB ذخیره شد: ${BACKUP_DIR}/dump-${TS}.rdb"

# ── ۲) AOF ──
log "BGREWRITEAOF…"
rcli BGREWRITEAOF >/dev/null || die "redis-cli BGREWRITEAOF شکست خورد"
# نکته: «| grep -q» با pipefail ناپایدار است — به‌محضِ توافق، لوله را می‌بندد
# و نویسنده ممکن است با SIGPIPE بمیرد و خطا به‌اشتباه به این سمت بیفتد.
# پس خروجی را کامل می‌خوانیم و روی متنِ گرفته‌شده می‌سنجیم.
aof_done() { case "$(rcli INFO persistence)" in *$'\naof_rewrite_in_progress:0'*) return 0;; *) return 1;; esac; }
for _ in $(seq 1 60); do
  if aof_done; then
    break
  fi
  sleep 2
done
aof_done || die "بازنویسی AOF در مهلت مقرر تمام نشد"
if [ -f "${REDIS_DIR}/appendonly.aof" ]; then
  cp -f "${REDIS_DIR}/appendonly.aof" "${BACKUP_DIR}/appendonly-${TS}.aof"
  log "AOF ذخیره شد: ${BACKUP_DIR}/appendonly-${TS}.aof"
else
  # ردیس ۷ ممکن است ساختار چندفایلی (appendonlydir) داشته باشد
  if [ -d "${REDIS_DIR}/appendonlydir" ]; then
    mkdir -p "${BACKUP_DIR}/appendonlydir-${TS}"
    cp -f "${REDIS_DIR}/appendonlydir/"*.aof "${BACKUP_DIR}/appendonlydir-${TS}/"
    log "AOF (ساختار چندفایلی) ذخیره شد: ${BACKUP_DIR}/appendonlydir-${TS}/"
  else
    log "هشدار: فایل AOF پیدا نشد — فقط RDB پشتیبان گرفته شد"
  fi
fi

# ── ۳) بارگذاری در فضای شیئی (اختیاری) ──
if [ -n "${BACKUP_S3:-}" ]; then
  if command -v aws >/dev/null 2>&1; then
    aws s3 cp "${BACKUP_DIR}/dump-${TS}.rdb" "${BACKUP_S3}/dump-${TS}.rdb" --only-show-errors
    log "در فضای شیئی بارگذاری شد: ${BACKUP_S3}/dump-${TS}.rdb"
  else
    log "هشدار: BACKUP_S3 تنظیم است ولی `aws` نصب نیست — فقط ذخیرهٔ محلی"
  fi
fi

# ── ۴) نگهداری: حذف قدیمی‌تر از دورهٔ مقرر ──
find "${BACKUP_DIR}" -maxdepth 1 \( -name 'dump-*.rdb' -o -name 'appendonly-*.aof' \) \
  -type f -mtime "+${BACKUP_RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -maxdepth 1 -name 'appendonlydir-*' -type d \
  -mtime "+${BACKUP_RETENTION_DAYS}" -exec rm -rf {} +
log "نگهداری انجام شد (>${BACKUP_RETENTION_DAYS} روز حذف شدند)"

# ── ۵) مانیفست ──
{
  echo "timestamp=${TS}"
  echo "host=${REDIS_HOST}:${REDIS_PORT}"
  echo "rdb=${BACKUP_DIR}/dump-${TS}.rdb"
  echo "retention_days=${BACKUP_RETENTION_DAYS}"
} > "${BACKUP_DIR}/last-backup.txt"

log "پایان موفق."
