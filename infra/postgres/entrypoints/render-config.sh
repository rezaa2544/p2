#!/usr/bin/env bash
# render-config.sh — pgbackrest.conf را از template و env می‌سازد.
# منابعِ فراخوان: infra/postgres/entrypoints/{primary,standby}-entrypoint.sh
set -euo pipefail

RENDER_TEMPLATE="${PGHA_CONF_TEMPLATE:-/opt/payesh/pgbackrest.conf.template}"
RENDER_TARGET="${PGHA_CONF_TARGET:-/etc/pgbackrest/pgbackrest.conf}"

PB_REPO_S3_BUCKET="${PB_REPO_S3_BUCKET:-payesh-pgbackrest}"
PB_REPO_S3_ENDPOINT="${PB_REPO_S3_ENDPOINT:?PB_REPO_S3_ENDPOINT لازم است (مثلاً minio:9000)}"
PB_REPO_S3_REGION="${PB_REPO_S3_REGION:-us-east-1}"
PB_REPO_S3_VERIFY_TLS="${PB_REPO_S3_VERIFY_TLS:-n}"

[ -r "$RENDER_TEMPLATE" ] || { echo "render-config: template یافت نشد: $RENDER_TEMPLATE" >&2; exit 1; }
mkdir -p "$(dirname "$RENDER_TARGET")"
sed -e "s|__REPO_S3_BUCKET__|${PB_REPO_S3_BUCKET}|g" \
    -e "s|__REPO_S3_ENDPOINT__|${PB_REPO_S3_ENDPOINT}|g" \
    -e "s|__REPO_S3_REGION__|${PB_REPO_S3_REGION}|g" \
    -e "s|__REPO_S3_VERIFY_TLS__|${PB_REPO_S3_VERIFY_TLS}|g" \
    "$RENDER_TEMPLATE" > "$RENDER_TARGET"
chmod 0640 "$RENDER_TARGET"
echo "render-config: $RENDER_TARGET ساخته شد (endpoint=${PB_REPO_S3_ENDPOINT} bucket=${PB_REPO_S3_BUCKET})"
