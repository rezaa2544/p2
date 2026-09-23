#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# failover-redis.sh — تحریکِ failover ردیس از راهِ Sentinel (DR §۲)
# ───────────────────────────────────────────────────────────────────
# Sentinel خودش خودکار failover می‌کند (down-after=5s + quorum=2)؛ این
# اسکریپت برایِ سناریوهایِ «تحریکِ دستی قبلِ اسکلدِ خودکار» (maintenance
# window، DC-drill) است — نه جایِ آن.
# گاردها: masterِ فعلی باید واقعاً down باشد (مگر --force)؛ آدرسِ تازه
# پس از failover تأیید می‌شود (تا ۴۵ ثانیه poll).
# مصرف:
#   tools/failover-redis.sh [--dry-run] [--force]
# env: SENTINELS="h1:26379,h2:26379,h3:26379"  MASTER_NAME=mymaster  REDIS_PASSWORD=...
# خروجی: ۰ موفق/آماده، ۱ گارد/شکست، ۲ پیش‌نیازِ نبوده
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
SENTINELS="${SENTINELS:-127.0.0.1:26379,127.0.0.1:26380,127.0.0.1:26381}"
MASTER_NAME="${MASTER_NAME:-mymaster}"
DRY=0; FORCE=0
for a in "$@"; do case "$a" in --dry-run) DRY=1;; --force) FORCE=1;; *) echo "ناشناخته: $a" >&2; exit 2;; esac; done
[ -z "${REDIS_PASSWORD:-}" ] || export REDISCLI_AUTH="$REDIS_PASSWORD"
command -v redis-cli >/dev/null 2>&1 || { echo "FAIL: redis-cli نیست" >&2; exit 2; }
sc(){ # sc <sentinel-addr> <args...>
  local s="$1"; shift; local h="${s%%:*}" p="${s##*:}"
  timeout 10 redis-cli --raw -h "$h" -p "$p" "$@"
}

# یک sentinelِ سالم پیدا کن
SENT=""
IFS=',' read -ra LIST <<< "$SENTINELS"
for s in "${LIST[@]}"; do
  if [ "$(sc "$s" ping 2>/dev/null || true)" = PONG ]; then SENT="$s"; break; fi
done
[ -n "$SENT" ] || { echo "FAIL: هیچ sentinel پاسخگو نیست ($SENTINELS) — خود sentinel‌ها را نجات بده" >&2; exit 1; }
echo "== failover-redis: via $SENT name=$MASTER_NAME"

CUR="$(sc "$SENT" SENTINEL get-master-addr-by-name "$MASTER_NAME" | paste -sd, - || true)"
[ -n "$CUR" ] || { echo "FAIL: sentinel آدرسی برایِ $MASTER_NAME ندارد" >&2; exit 1; }
echo "master فعلی: $CUR"

if [ "$FORCE" != 1 ]; then
  MH="${CUR%%,*}"; MP="${CUR##*,}"
  if timeout 10 redis-cli --raw -h "$MH" -p "$MP" ping 2>/dev/null | grep -q PONG; then
    echo "FAIL: masterِ $MH:$MP زنده است — failoverِ دستی رویِ masterِ سالم ریسکِ دو-رئیس؛ --force (فقط در maintenance window)" >&2; exit 1
  fi
fi

if [ "$DRY" = 1 ]; then echo "DRY-RUN: آمادهٔ SENTINEL FAILOVER — گاردها پاس شدند"; exit 0; fi

[ "$(sc "$SENT" SENTINEL FAILOVER "$MASTER_NAME")" = OK ] || { echo "FAIL: Sentinel rejected FAILOVER" >&2; exit 1; }
echo "failover تحریک شد؛ در انتظارِ آدرسِ تازه ..."
for i in $(seq 1 45); do
  NEW="$(sc "$SENT" SENTINEL get-master-addr-by-name "$MASTER_NAME" | paste -sd, - || true)"
  [ "$NEW" != "$CUR" ] && [ -n "$NEW" ] && { echo "NEW_MASTER=$NEW"; break; }
  sleep 1
done
[ "${NEW:-$CUR}" != "$CUR" ] || { echo "FAIL: بعد از ۴۵ ثانیه master تغییر نکرد — sentinel‌ها را بررسی کن (auth? quorum?)" >&2; exit 1; }

NH="${NEW%%,*}"; NP="${NEW##*,}"
[[ "$NP" =~ ^[0-9]{1,5}$ ]] && ((10#$NP>0 && 10#$NP<65536)) || { echo "FAIL: invalid sentinel port" >&2; exit 1; }
timeout 10 redis-cli --raw -h "$NH" -p "$NP" INFO replication | grep -q 'role:master' \
  && echo "تأیید: $NEW نقشِ master گرفت" || { echo "FAIL: $NEW خود را master معرفی نمی‌کند" >&2; exit 1; }
echo "چک‌لیستِ پس از اقدام (DR_RUNBOOK §۲.۳):"
echo "  ۱) سرریزِ client (server/redis.js) خودکار به آدرسِ نو می‌رود؛ خطایِ re-connect در لاگ را ببین"
echo "  ۲) replicaِ کهنه/جدید را به masterِ نو بچسبان (SENTINEL removes + replicaof)"
echo "  ۳) اگر masterِ کهنه زنده شد: خودش را به‌عنوان replica بیاور — هرگز نه دو master"
