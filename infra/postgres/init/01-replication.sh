#!/usr/bin/env bash
# 01-replication.sh — /docker-entrypoint-initdb.d: نقشِ replicator + کاربرِ
# استخرِ pgbouncer. فقط در initdb اجرا می‌شود (فایلِ .sh در پوشهٔ initdb.d).
set -euo pipefail

: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD لازم است}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  -- replicatio ن فیزیکی؛ ONLY_LOGIN+REPLICATION، بدونِ SUPERUSER
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='replicator') THEN
      CREATE ROLE replicator WITH LOGIN REPLICATION PASSWORD '${REPLICATION_PASSWORD}';
    END IF;
  END $$;
  -- کاربرِ auth_query برایِ PgBouncer (رمز را از pg_shadow می‌خواند؛ خود
  -- pgbouncer هیچ رمزِ انباریِ تازه‌ای لازم ندارد)
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pgbouncer') THEN
      CREATE ROLE pgbouncer WITH LOGIN PASSWORD '${REPLICATION_PASSWORD}';
    END IF;
  END $$;
  GRANT pg_read_all_stats TO pgbouncer;
EOSQL
echo "01-replication.sh: replicator + pgbouncer آماده شدند"
