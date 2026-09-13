#!/usr/bin/env bash
# Wave 18 — staging bootstrap for the national load test.
#
# Brings up a real PostgreSQL 17 + the Payesh API server so the k6 suites in
# tests/performance/suites/ have something real to push against. Nothing here
# is mocked: the API talks to PostgreSQL over TCP, and k6 talks to the API.
#
# Everything outside the repo directory is ephemeral in the CI sandbox, so this
# script is idempotent and meant to be re-run in one shot:
#   install -> initdb -> migrate -> seed national dataset -> start API
#
#   W18_PORT     API port, default 3000
#   W18_PGPORT   PostgreSQL port, default 55440
#   W18_SCALE    national dataset scale, default 0.001 (~10k users)
#
# ⚠ Scale honesty: the roadmap target is 10M users. `--scale 1` produces tens
# of GB, and this sandbox has 2 cores / 2 GB RAM / 20 GB disk. The default
# scale here is a harness-validation scale, NOT a capacity measurement. Set
# W18_SCALE on real staging hardware before quoting any capacity number.

set -euo pipefail

REPO="${REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"
PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"
PGPORT="${W18_PGPORT:-55440}"
PGDATA="${W18_PGDATA:-/var/tmp/pgdata-w18}"
RUN="${W18_RUN:-/var/tmp/w18-run}"
APIPORT="${W18_PORT:-3000}"
SCALE="${W18_SCALE:-0.001}"
DB="${W18_DB:-payesh_db}"
DBUSER="${W18_DBUSER:-payesh_user}"
# پسوردِ نقشِ staging: پیش‌فرض دارد تا bootstrap بی‌arg کار کند، ولی
# قابلِ override است — در استیجینگِ اشتراکی حتماً W18_DB_PASS بدهید.
DBPASS="${W18_DB_PASS:-w18_staging}"

log() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

log "1/6 PostgreSQL binaries"
if [ ! -x "$PGBIN/postgres" ]; then
  echo "    installing postgresql-17 …"
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q postgresql-17 postgresql-client-17 >/dev/null 2>&1 \
    || die "apt-get install postgresql-17 failed"
fi
"$PGBIN/postgres" --version

log "2/6 initdb -> $PGDATA (port $PGPORT)"
if ! "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  rm -rf "$PGDATA" "$RUN"
  mkdir -p "$PGDATA" "$RUN/sock" "$RUN/logs"
  chown -R postgres:postgres "$PGDATA" "$RUN"
  chmod 700 "$PGDATA"
  sudo -n -u postgres "$PGBIN/initdb" -D "$PGDATA" -U postgres \
    --auth-local=trust --auth-host=trust -E UTF8 --locale=C.UTF-8 >/dev/null 2>&1 \
    || die "initdb failed"
  cat >> "$PGDATA/postgresql.conf" <<EOF

# --- Wave 18 load-test staging ---
port = $PGPORT
listen_addresses = '127.0.0.1'
unix_socket_directories = '$RUN/sock'
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 768MB
work_mem = 8MB
maintenance_work_mem = 64MB
wal_level = replica
max_wal_size = 2GB
min_wal_size = 256MB
checkpoint_timeout = 10min
checkpoint_completion_target = 0.9
synchronous_commit = on
fsync = on
logging_collector = on
log_directory = '$RUN/logs'
log_filename = 'postgresql-%H%M%S.log'
log_min_messages = warning
EOF
  sudo -n -u postgres "$PGBIN/pg_ctl" -D "$PGDATA" -l "$RUN/pg-startup.log" -w -t 60 start >/dev/null 2>&1 \
    || { tail -20 "$RUN/pg-startup.log" >&2; die "pg_ctl start failed"; }
fi
export PGHOST="$RUN/sock" PGPORT="$PGPORT" PGUSER=postgres
"$PGBIN/psql" -tAc 'select version()' | head -1

log "3/6 role + database"
"$PGBIN/psql" -tAc "select 1 from pg_roles where rolname='$DBUSER'" | grep -q 1 \
  || "$PGBIN/psql" -q -c "create role $DBUSER login password '$DBPASS'"
"$PGBIN/psql" -tAc "select 1 from pg_database where datname='$DB'" | grep -q 1 \
  || "$PGBIN/psql" -q -c "create database $DB owner $DBUSER"
echo "    $DB (owner $DBUSER) ready"

log "4/6 migrations"
cd "$REPO"
for m in migrations/001_initial.sql migrations/002_indexes.sql migrations/003_constraints.sql \
         migrations/004_wave1_version_seq.sql migrations/004_wave3_query_indexes.sql \
         migrations/005_delta_sync_updated_at_indexes.sql migrations/006_delta_schema_gaps.sql; do
  [ -f "$m" ] || { echo "    skip (absent): $m"; continue; }
  if "$PGBIN/psql" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$m" >/dev/null 2>"$RUN/mig.err"; then
    echo "    ok   $(basename "$m")"
  else
    echo "    FAIL $(basename "$m")"; head -3 "$RUN/mig.err" >&2
  fi
done
echo "    tables: $("$PGBIN/psql" -d "$DB" -tAc "select count(*) from information_schema.tables where table_schema='public'")"

log "5/6 national dataset (scale=$SCALE)"
OUT="$REPO/data/national/scale-$SCALE"
if [ ! -d "$OUT" ]; then
  node tools/generate-national-dataset.js --scale "$SCALE" --out "$OUT" 2>&1 | tail -8
fi
du -sh "$OUT" 2>/dev/null || true

log "6/6 env for the API"
cat > "$RUN/api.env" <<EOF
PORT=$APIPORT
HOST=0.0.0.0
PAYESH_ENV=development
DATABASE_URL=postgresql://$DBUSER:w18_staging@127.0.0.1:$PGPORT/$DB
PG_POOL_MIN=5
PG_POOL_MAX=50
PG_TIMEOUT_MS=5000
# فقط استیجینگ/آزمون: بدونِ این، /api/auth/send-code کدِ دمو را برنمی‌گرداند و
# سوئیتِ k6 نمی‌تواند login کند (همهٔ درخواست‌ها 401 می‌شوند و «موفق» به‌نظر
# می‌رسند). در تولید هرگز فعال نشود — یک gateway واقعی کد را echo نمی‌کند.
PAYESH_DEMO_CODE=1
EOF
chmod 600 "$RUN/api.env"
echo "    wrote $RUN/api.env (API :$APIPORT -> PG :$PGPORT)"
echo "W18_READY=1"
