#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# بازگشتِ اضطراری به Blue — «npm run rollback»
# سند: docs/CANARY_DEPLOYMENT.md §۱-۴
# ترتیب (عمدی): اسنپ‌شات ← توقفِ Green ← Blue سالم ← nginx به Blue ← راستی‌آزمایی.
# nginx فقط پس از «nginx -t» سبز reload می‌شود؛ هیچ migrate:downای زده نمی‌شود.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

BLUE_PORT="${BLUE_PORT:-3001}"
BLUE_UNIT="${BLUE_UNIT:-payesh-blue}"
GREEN_UNIT="${GREEN_UNIT:-payesh-green}"
JSON_STORE="${JSON_STORE:-/home/payesh/data/payesh.json}"
BACKUP_DIR="${BACKUP_DIR:-/home/payesh/backups}"
NGINX_SPLIT_CONF="${NGINX_SPLIT_CONF:-/etc/nginx/payesh-split.conf}"
PUBLIC_URL="${PUBLIC_URL:-https://payesh.example}"
CANARY_STORE="${CANARY_STORE:-json}"
DRY_RUN="${DRY_RUN:-0}"

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  sed -n '2,7p' "$0"; exit 0
fi

die(){ echo "❌ $*" >&2; exit 1; }
run(){ if [ "$DRY_RUN" = 1 ]; then echo "DRY-RUN: + $*"; else "$@"; fi; }

for t in systemctl curl; do
  command -v "$t" >/dev/null 2>&1 || { [ "$DRY_RUN" = 1 ] && echo "DRY-RUN: missing tool $t (would fail-closed)" || die "missing tool: $t"; }
done

# ۱) اسنپ‌شاتِ پیشِ‌برگشت (اضطراری: نبودِ pg_dump مانع نیست، هشدار می‌دهد)
if [ "$CANARY_STORE" = "pg" ]; then
  if command -v pg_dump >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
    run bash -c "pg_dump \"\$DATABASE_URL\" -f '$BACKUP_DIR/pre-rollback-$(date +%Y%m%d-%H%M%S).sql'"
  else
    echo "⚠️  pg snapshot skipped (no pg_dump/DATABASE_URL) — continuing, traffic rollback first"
  fi
else
  if [ -f "$JSON_STORE" ]; then
    run cp "$JSON_STORE" "$BACKUP_DIR/pre-rollback-$(date +%Y%m%d-%H%M%S).json"
  elif [ "$DRY_RUN" != 1 ]; then
    die "JSON store not found: $JSON_STORE"
  else
    echo "DRY-RUN: JSON store not found here; prod would fail-closed"
  fi
fi

# ۲) توقفِ Green (اگر خوابیده بود، خطا مانع نیست)
run systemctl stop "$GREEN_UNIT" || true

# ۳) Blue باید روشن و سالم باشد — وگرنه nginx دست نمی‌خورد
run systemctl start "$BLUE_UNIT"
if [ "$DRY_RUN" = 1 ]; then
  echo "DRY-RUN: + curl :$BLUE_PORT/api/health (expects 200 + ok:true)"
else
  curl -fsS --max-time 10 "http://127.0.0.1:${BLUE_PORT}/api/health" | grep -q '"ok":true' \
    || die "Blue is not healthy — nginx untouched (still previous state)"
  echo "Blue healthy: :$BLUE_PORT"
fi

# ۴) nginx به ۱۰۰٪ Blue (فقط با کانفیگِ معتبر)
if [ "$DRY_RUN" = 1 ]; then
  echo "DRY-RUN: would write $NGINX_SPLIT_CONF (100% blue) + nginx -t + reload"
else
  command -v nginx >/dev/null 2>&1 || die "missing tool: nginx"
  cat > "$NGINX_SPLIT_CONF" <<EOF
upstream payesh_blue  { server 127.0.0.1:${BLUE_PORT} max_fails=2 fail_timeout=10s; }
split_clients \$remote_addr \$payesh_backend {
  * payesh_blue;
}
EOF
  nginx -t && systemctl reload nginx
fi

# ۵) راستی‌آزماییِ عمومی
run curl -fsS "$PUBLIC_URL/api/health"
echo "✅ traffic is 100% Blue"
