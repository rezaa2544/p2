#!/usr/bin/env bash
# 01-replication.sh — /docker-entrypoint-initdb.d: نقشِ replicator + کاربرِ
# استخرِ pgbouncer. فقط در initdb اجرا می‌شود (فایلِ .sh در پوشهٔ initdb.d).
set -euo pipefail

: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD لازم است}"

if [ -n "${PGDATA:-}" ] && [ -f "$PGDATA/pg_hba.conf" ]; then
  grep -qxF 'host replication replicator all scram-sha-256' "$PGDATA/pg_hba.conf" \
    || echo 'host replication replicator all scram-sha-256' >> "$PGDATA/pg_hba.conf"
fi

psql -v ON_ERROR_STOP=1 -v repl_pw="$REPLICATION_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'EOSQL'
  SELECT format('CREATE ROLE replicator WITH LOGIN REPLICATION PASSWORD %L', :'repl_pw')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'replicator') \gexec
  SELECT format('CREATE ROLE pgbouncer WITH LOGIN PASSWORD %L', :'repl_pw')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pgbouncer') \gexec
  GRANT pg_read_all_stats TO pgbouncer;
  CREATE SCHEMA IF NOT EXISTS pgbouncer;
  DROP VIEW IF EXISTS pgbouncer.pg_shadow;
  DROP FUNCTION IF EXISTS pgbouncer.lookup_shadow();
  CREATE OR REPLACE FUNCTION pgbouncer.pg_shadow_lookup(p_usename TEXT)
  RETURNS TABLE(usename NAME, passwd TEXT)
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = pg_catalog
  AS $fn$
    SELECT u.usename, u.passwd
    FROM pg_catalog.pg_shadow AS u
    WHERE p_usename IS NOT NULL
      AND u.usename = p_usename::name
      AND (u.usesuper OR NOT u.userepl)
      AND u.usename <> 'replicator'::name
      AND u.usename <> 'pgbouncer'::name;
  $fn$;
  REVOKE ALL ON SCHEMA pgbouncer FROM PUBLIC;
  REVOKE ALL ON FUNCTION pgbouncer.pg_shadow_lookup(TEXT) FROM PUBLIC;
  GRANT USAGE ON SCHEMA pgbouncer TO pgbouncer;
  GRANT EXECUTE ON FUNCTION pgbouncer.pg_shadow_lookup(TEXT) TO pgbouncer;
  ALTER ROLE pgbouncer SET search_path = pgbouncer, pg_catalog;
EOSQL
echo "01-replication.sh: replicator + pgbouncer آماده شدند"
