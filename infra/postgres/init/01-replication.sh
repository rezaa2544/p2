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
EOSQL
echo "01-replication.sh: replicator + pgbouncer آماده شدند"
