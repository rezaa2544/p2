#!/usr/bin/env bash
# primary-entrypoint.sh — bootstrapِ ایمیجِ رسمیِ postgres + فعال‌سازیِ
# archive به فضای شیئی (pgbackrest). پس از آن exec docker-entrypoint.sh.
set -euo pipefail

/opt/payesh/entrypoints/render-config.sh

# Archive-WAL flags are supplied explicitly by Compose after initdb. Do not
# create postgresql.auto.conf here: a new PGDATA must stay empty for initdb.
exec /usr/local/bin/docker-entrypoint.sh "$@"
