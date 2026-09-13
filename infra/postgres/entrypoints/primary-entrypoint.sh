#!/usr/bin/env bash
# primary-entrypoint.sh — bootstrapِ ایمیجِ رسمیِ postgres + فعال‌سازیِ
# archive به فضای شیئی (pgbackrest). پس از آن exec docker-entrypoint.sh.
set -euo pipefail

/opt/payesh/entrypoints/render-config.sh

# archive فقط پس از initdb اعمال می‌شود (flagهای زیر با -c از command
# compose هم پاس می‌شوند؛ اینجا برایِ اطمینان در restartها):
cat >> "$PGDATA/postgresql.auto.conf" 2>/dev/null <<'CONF' || true
# payesh-ha (primary) — بازنویسیِ idempotent نیست؛ compose flag مرجع است
CONF

exec /usr/local/bin/docker-entrypoint.sh "$@"
