#!/bin/bash
# run-all-tests.sh — v3: self-healing + safe parallel regression (isolated copies + port lane)
#
# Measured (2026-09-08, sandbox 2 vCPU / 2GB RAM):
#   serial:       ~1050-1115 s (~18 min)
#   v1 (base@2):    936 s  — mutation phase stayed serial (83% of wall time)
#   v2 (copies@2):  563 s  — BUT 1 false red: server9 (base) and server-mutations
#                           (M18 boots server9) overlapped on fixed port 8994 ->
#                           EADDRINUSE -> A0a failed -> mutation "survived" (19/20)
#   v3: port-holding suites get their own SERIAL lane (they bind fixed 89xx ports);
#       everything else runs in parallel. Target: ~7 min.
#
# Safety model:
#   - mutation suites MODIFY src files + rebuild index.html  -> own copy of repo
#   - server suites WRITE server/data/payesh.json            -> own copy of repo
#   - rebuilders rebuild index.html                          -> own copy of repo
#   - read-only client base suites                            -> parallel in main dir
#   - port-holding suites (fixed 89xx/90xx ports, direct or via
#     the suite a mutation runs)                              -> one serial lane
#   Copy = tar (0.03 s) + symlinked node_modules.
#   موج ۲۰ (آرنا ۵): پوشش کامل —
#   - همهٔ پرونده‌های مستقیمِ tests/*.js (پایه + جهش‌ها)
#   - سابت‌های REST در tests/api از طریق tests/api/runner.js (درون‌فرآیندی،
#     استور را به شاخهٔ موقت کپی می‌کنند؛ در مسیرِ اصلی و موازی اجرا می‌شوند)
#   - کنارگذاشته‌های طراحی: tests/server11-child.js و tests/wave15-child.js
#     (اسکریپت‌های کارگر — با <root> <mode> اجرا می‌شوند، نه مستقل؛ S7-2)،
#     tests/helpers/ (کمکی)، tests/performance/ (بار/پایداریِ k6 — دستی و
#     بر‌اساسِ برنامهٔ رسمی؛ ورودیِ دروازهٔ انتشار، نه رگرسیونِ هر کامیت)
#   شمارِ زندهٔ سوئیت‌ها با `ls tests/*.js` سنجه می‌شود؛ اعدادِ این‌جا تقریبی‌اند.
#
# Usage:  bash scripts/run-all-tests.sh     (log: /tmp/all-tests.log, per-suite: /tmp/at-<name>.log)
# Self-heal (sandbox resets have wiped node_modules and .git/config three times):
#   jsdom missing  -> npm i --no-save jsdom
#   git identity   -> restored (Payesh Dev / dev@payesh.local)
#   git remote     -> restored from ~/.payesh_gh_token (token never stored in repo)
#   payesh.json    -> reseeded (node server/seed.js)
# Guards:
#   dirty tree (uncommitted tracked changes) -> exit 3   (mutation residue kills results)
#   /tmp < 250MB free                       -> exit 4   (tmpfs shared with platform snapshots)
set -u
cd "$(dirname "$0")/.." || exit 2
export NODE_PATH="$PWD/node_modules${PW_NODE_MODULES:+:$PW_NODE_MODULES}:/var/tmp/pw-tools/node_modules"
OUT=/tmp/all-tests.log
: > $OUT
START=$(date +%s)
WORKERS="${WORKERS:-4}"

# ── self-heal ──────────────────────────────────────────────────────────────
if ! node -e "require('$PWD/node_modules/jsdom')" >/dev/null 2>&1; then
  echo "!! jsdom missing — reinstalling" | tee -a $OUT
  npm i --no-save jsdom >>$OUT 2>&1 || { echo "!! npm install FAILED" | tee -a $OUT; exit 2; }
fi
if [ -z "$(git config user.email 2>/dev/null)" ]; then
  echo "!! git identity missing — restoring" | tee -a $OUT
  git config user.name 'Payesh Dev'
  git config user.email 'dev@payesh.local'
fi
if ! git remote get-url origin >/dev/null 2>&1 && [ -f ~/.payesh_gh_token ]; then
  echo "!! git remote missing — restoring" | tee -a $OUT
  git remote add origin "https://$(cat ~/.payesh_gh_token)@github.com/rezaa2544/p2" || true
fi
# R92: pattern must match BOTH `node server/index.js` and absolute-path spawns
# (spawn(path.join(ROOT,'server/index.js')) — the first R92 pattern missed those)
if pgrep -f 'node .*server/index\.js' >/dev/null 2>&1; then
  echo "!! stale server processes found — killing (R92: they hold fixed test ports → env false-verdicts)" | tee -a $OUT
  pkill -f 'node .*server/index\.js' || true
  sleep 1
fi
if [ ! -f server/data/payesh.json ]; then
  echo "!! payesh.json missing — reseeding" | tee -a $OUT
  node server/seed.js >>$OUT 2>&1 || { echo "!! reseed FAILED" | tee -a $OUT; exit 2; }
fi

# ── live-PostgreSQL probe ─────────────────────────────────────────────────
# tests/wave23-reports-pg.js is the parity/authorization gate for the DB-native
# report path. It self-skips with a loud NOT-RUN when no PostgreSQL is reachable,
# so a PG-less machine does not go red for a reason it cannot act on. When one IS
# reachable we REQUIRE it: the gate must not be silently skipped where it can run.
#
# G7 ROOT CAUSE (verified on origin/main 691f8d6, Node.js CI run 36348586658):
# the CI workflow exports PGURL/REDIS_URL at job level but NOT DATABASE_URL, and
# `set -u` (above) turns the bare `$DATABASE_URL` reference into a fatal
# "unbound variable" abort before the pg_isready fallback can ever run.
# The canonical connection variable for this project's tooling is DATABASE_URL
# (tools/migrate-ledger.js reads DATABASE_URL first, PGURL second), so export it
# from PGURL when only PGURL is set — then the probe sees one canonical variable
# instead of two divergent ones.
unset WAVE23_REQUIRE_PG
if [ -z "${DATABASE_URL:-}" ] && [ -n "${PGURL:-}" ]; then
  export DATABASE_URL="$PGURL"
  echo "-- DATABASE_URL derived from PGURL (canonical connection variable)" | tee -a $OUT
fi
if [ -n "${DATABASE_URL:-}" ] || (command -v pg_isready >/dev/null 2>&1 && pg_isready -h 127.0.0.1 -p 5432 -q 2>/dev/null); then
  export WAVE23_REQUIRE_PG=1
  echo "-- live PostgreSQL detected — wave23-reports-pg is REQUIRED" | tee -a $OUT
fi

# ── docs-stats pre-flight ──────────────────────────────────────────────────
# Count blocks in DOCS_METRICS / DOCUMENTATION_MAP / TEST_COVERAGE_REPORT and the
# freeze manifest are generated, not hand-typed. Check BEFORE the dirty-tree guard
# (the fixer writes files, which would trip that guard). Check-only here: we never
# write during a regression run.
if [ -f tools/docs-stats-sync.js ]; then
  if ! node tools/docs-stats-sync.js --freeze --check >> $OUT 2>&1; then
    echo "!! DOCS STATS STALE — run: node tools/docs-stats-sync.js --freeze && git commit" | tee -a $OUT
    exit 5
  fi
fi

# ── docs-refs pre-flight ───────────────────────────────────────────────────
# Docs must not point at files that do not exist. Historical debt is
# grandfathered in tools/docs-refs-baseline.json; only a NEW stale ref fails.
if [ -f tools/docs-refs-check.js ]; then
  if ! node tools/docs-refs-check.js --check >> $OUT 2>&1; then
    echo "!! STALE DOC REFERENCE — a doc points at a file that does not exist" | tee -a $OUT
    echo "   fix the reference, or if the doc is historical:" | tee -a $OUT
    echo "   node tools/docs-refs-check.js --baseline && git commit" | tee -a $OUT
    # C-01 probe: surface the snapshot so CI failures can be diffed against
    # a local run on the same SHA.
    if [ -f docs-refs-probe.json ]; then
      echo "--- docs-refs-probe.json (C-01 cross-environment snapshot) ---" | tee -a $OUT
      cat docs-refs-probe.json | tee -a $OUT
    fi
    exit 6
  fi
fi

# ── dirty-tree guard ───────────────────────────────────────────────────────
# A mutation suite killed mid-run (timeout/kill/reset) leaves src files
# MUTATED on disk -> every suite that domain touches fails in a confusing
# way. Never run the regression on a dirty tree: commit or `git checkout -- .` first.
DIRTY=$(git status --porcelain | grep -v '^?? ' | grep -v ' scripts/run-all-tests.sh$' || true)
if [ -n "$DIRTY" ]; then
  echo "!! DIRTY TREE — regression aborted (tests must run on a committed state):" | tee -a $OUT
  echo "$DIRTY" | tee -a $OUT
  exit 3
fi

# ── /tmp self-heal ─────────────────────────────────────────────────────────
# /tmp is a small shared tmpfs (~1GB) that ALSO holds platform snapshot zips.
# Suites leak temp dirs (server11 -> /tmp/payesh-s11-*/store.json 5.6MB,
# authzchk -> repo copies, run_copy -> /tmp/mut-*) and a killed run leaves
# them forever -> ENOSPC mid-run. Reclaim stale ones before every regression.
rm -rf /tmp/mut-* /tmp/payesh-* /tmp/authzchk-* 2>/dev/null || true
AVAIL_KB=$(df -Pk /tmp | awk 'NR==2 {print $4}')
if [ "$AVAIL_KB" -lt 250000 ]; then
  echo "!! /tmp too small (${AVAIL_KB}KB free) — cannot run 63 isolated-copy suites" | tee -a $OUT
  exit 4
fi

# ── environment isolation (Step 6: prevent PGURL/DATABASE_URL/REDIS_URL leakage into JSON lanes) ──
LIVE_PG_URL="${DATABASE_URL:-postgres://payesh:payesh@127.0.0.1:5432/payesh_ci}"
LIVE_ADMIN_URL="${LIVE_PG_URL%/*}/postgres"
LIVE_BENCH_URL="${LIVE_PG_URL%/*}/payesh_bench"
LIVE_IDOR_URL="${LIVE_PG_URL%/*}/payesh_db_idor"
LIVE_REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
unset DATABASE_URL PGURL REDIS_URL SYNC_TEST_DATABASE_URL
mkdir -p /tmp/chaos-drill-tmpfs 2>/dev/null || true
if [ -z "${CHROMIUM_PATH:-}" ]; then
  for cb in /usr/local/bin/chromium-headless /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome; do
    if [ -x "$cb" ]; then export CHROMIUM_PATH="$cb"; break; fi
  done
fi
if [ -d /var/tmp/pw-tools/node_modules ]; then
  export NODE_PATH="$PWD/node_modules:/var/tmp/pw-tools/node_modules${NODE_PATH:+:$NODE_PATH}"
fi
export ROOT_GIT_DIR="$PWD/.git"

LIVE_INFRA_SUITES="
tests/otp-ratelimit-mutations.js
tests/schema-migrations-live-pg.test.js
tests/migration-012-crash-recovery-live.js
tests/migration-009-live.js
tests/pg-relational-seed.js
tests/migrate-pg-constraints.js
tests/migrate-pg-constraints-mutations.js
tests/wave3-query.js
tests/wave3-query3.js
tests/wave3-parity.js
tests/wave3-parity-mutations.js
tests/wave4-sync.js
tests/wave6-11-redis-live.js
tests/wave6-11-redis-live-mutations.js
tests/wave10-pg-live.js
tests/wave10-pg-live-mutations.js
tests/wave10-tenant-live.js
tests/wave10-tenant-live-mutations.js
tests/wave18w19-multinode-live.js
tests/wave23-reports-pg.js
tests/wave23-reports-mutations.js
tests/wave23-norm-edge-mutations.js
tests/bench-phone-lookup-p11.js
tests/wave1-gate.js
tests/arena5-recovery.js
tests/b-pg-health-blackhole.js
tests/b-pg-migration-midflight-kill.js
tests/b-pg-timeout-failsafe.js
tests/canary-atomic-postgres-live-runtime.js
tests/canary-persistence.js
tests/n17-n18-tombstones-sms-wallet.test.js
tests/n21-schema-drift.test.js
tests/n22-hydrate-cap.test.js
tests/otp-redis.js
tests/outbox-lease-race-live.js
tests/p11-phone-auth-live.js
tests/partitioning.js
tests/pg-prod-boot-with-db.js
tests/pg-prod-client-error.js
tests/pg-prod-fallback-probe.js
tests/pg-prod-persistence-failure.js
tests/pg-prod-two-instance.js
tests/pg-prod-uid-idempotency.js
tests/phase2-occ-multi.js
tests/phase2-outbox-failover.js
tests/phase2-redis-fail-closed.js
tests/phase65-runtime-truth.js
tests/r5-prod-redis-boot-gate.js
tests/redis-sentinel-failover.js
tests/sync-occ-adversarial-live.js
tests/sync-replay-adversarial-live.js
tests/unified-production-verifier.js
tests/multi-instance.js
tests/queue-outage-drill.js
tests/chaos-drill-api-kill.js
tests/chaos-drill-redis-outage.js
tests/chaos-drill-pg-outage.js
tests/chaos-drill-queue-outage.js
tests/chaos-drill-network-degradation.js
tests/chaos-drill-disk-pressure.js
tests/chaos-suite.js
tests/idor-runtime.js
tests/idor-runtime-r4.js
tests/a35-regression.js
tests/wal-disk-full.js
"

DEV_MEM_AUTH_SUITES="
tests/a-next-health-blackhole.js
tests/bounded-delta-resume.js
tests/bounded-delta-resume-mutations.js
tests/delta-sync-hardening.js
tests/pull-bootstrap.js
tests/reaudit-a19-student-id-ownership.js
tests/reaudit-occ-stale-write.js
tests/reports-basic.js
tests/reports-bounded-cache.js
tests/reports-bounded-cache-mutations.js
tests/reports-export.js
tests/reports-pdf-e2e.js
tests/reports-tenant-isolation.js
tests/seed-completeness.js
tests/server11.js
tests/server13.js
tests/server4.js
tests/truncation-telemetry.js
tests/truncation-telemetry-mutations.js
tests/wave1-multi-instance.js
tests/wave1-reads.js
tests/wave1-regression-gate.js
tests/wave1-writes.js
tests/wave1-writes-mutations.js
tests/wave4-sync-all-collections.js
tests/wave5-authz.js
tests/wave5-authz-mutations.js
tests/wave9-performance.js
"

export LIVE_PG_URL LIVE_ADMIN_URL LIVE_BENCH_URL LIVE_IDOR_URL LIVE_REDIS_URL LIVE_INFRA_SUITES DEV_MEM_AUTH_SUITES

EXCLUSIVE_SUITES="
tests/g7-ci-database-env.test.js
tests/false-green-defense.test.js
tests/docs-metrics.js
tests/f1-boot-syntax-five-pass.js
tests/a11y-audit.js
tests/a11y-interactive.js
tests/a11y-keyboard.js
tests/a11y-runtime.js
tests/reports-export.js
tests/reports-pdf-e2e.js
tests/tracing-performance.js
tests/wave18-load.js
"

# ── suite lists ────────────────────────────────────────────────────────────
ALL_RAW=$(ls tests/*.js | grep -v -- '-mutations.js$' | grep -v -- '-child.js$')
if [ -f tests/api/runner.js ]; then
  ALL_RAW="$ALL_RAW"$'\n'"tests/api/runner.js"
fi
LIVE_PRESENT=$(echo "$LIVE_INFRA_SUITES" | sed '/^$/d' | while read -r s; do [ -f "$s" ] && echo "$s"; done)
EXCL_PRESENT=$(echo "$EXCLUSIVE_SUITES" | sed '/^$/d' | while read -r s; do [ -f "$s" ] && echo "$s"; done)
ALL=$(echo "$ALL_RAW" | grep -vxFf <(echo "$LIVE_PRESENT") | grep -vxFf <(echo "$EXCL_PRESENT"))
REBUILDING=$(grep -l "build.js" tests/*.js 2>/dev/null | grep -v -- '-mutations.js$' | grep -v -- '-child.js$' | grep -vxFf <(echo "$LIVE_PRESENT") | grep -vxFf <(echo "$EXCL_PRESENT"))
SERVERS=$(echo "$ALL" | grep '^tests/server')
MUTS=$(ls tests/*-mutations.js | grep -vxFf <(echo "$LIVE_PRESENT"))
PHASE2_SET=$( { echo "$REBUILDING"; echo "$SERVERS"; echo "$MUTS"; } | sed '/^$/d' | sort -u )
PHASE1_SET=$(echo "$ALL" | grep -vxFf <(echo "$PHASE2_SET"))

uses_port() {
  local f="$1"
  grep -qE "89[0-9]{2}|90[0-9]{2}" "$f" && return 0
  local refs r
  refs=$(grep -ohE "['\"]tests/[^'\"]+\.js['\"]" "$f" | tr -d "'\"" | sort -u)
  refs="$refs
$(grep -ohE "path\.join\([^)]*'tests'[^)]*'[A-Za-z0-9_.-]+\.js'\)" "$f" | grep -oE "'[A-Za-z0-9_.-]+\.js'\)" | tr -d "'\")" | sed 's|^|tests/|' | sort -u)"
  for r in $refs; do
    [ -f "$r" ] && grep -qE "89[0-9]{2}|90[0-9]{2}" "$r" && return 0
  done
  return 1
}

PORT_ALL=""
for f in $ALL $MUTS; do
  if uses_port "$f"; then PORT_ALL="$PORT_ALL $f"; fi
done
PORT_P1=$(echo $PORT_ALL | tr ' ' '\n' | grep -vxFf <(echo "$PHASE2_SET") | sed '/^$/d')
PORT_P2=$(echo $PORT_ALL | tr ' ' '\n' | grep -xFf <(echo "$PHASE2_SET") | sed '/^$/d')
LANE_A=$(echo "$PHASE1_SET" | grep -vxFf <(echo "$PORT_P1") | sed '/^$/d')
LANE_B=$(echo "$PHASE2_SET" | grep -vxFf <(echo "$PORT_P2") | sed '/^$/d')

SUITE_TIMEOUT="${SUITE_TIMEOUT:-900}"
suite_env_prefix() {
  if echo "$DEV_MEM_AUTH_SUITES" | grep -qxF "$1"; then
    echo "PAYESH_ALLOW_DEV_MEMORY_AUTHORITY=1"
  fi
}
run_one() {
  f="$1"; name=$(basename "$f" .js)
  start=$(date +%s)
  echo "[suite] START $name"
  extra_env=$(suite_env_prefix "$f")
  if [ -n "$extra_env" ]; then
    env $extra_env timeout -k 30 "$SUITE_TIMEOUT" node "$f" > /tmp/at-$name.log 2>&1
  else
    timeout -k 30 "$SUITE_TIMEOUT" node "$f" > /tmp/at-$name.log 2>&1
  fi
  code=$?
  end=$(date +%s)
  last=$(grep -E "موفق|بررسی — |✅ /|کشته" /tmp/at-$name.log | tail -1 | tr '\n' ' ' | cut -c1-100)
  if [ $code -eq 124 ]; then
    echo "RED   $name (TIMEOUT after ${SUITE_TIMEOUT}s — unfinishable suite, counted as failure)" >> $OUT
    echo "[suite] RED-TIMEOUT $name (${SUITE_TIMEOUT}s)"
    echo "::error title=RED-TIMEOUT suite $name::Timed out after ${SUITE_TIMEOUT}s"
    tail -n 30 /tmp/at-$name.log 2>/dev/null || true
  elif [ $code -eq 0 ]; then
    echo "GREEN $name ($((end-start))s)" >> $OUT
    echo "[suite] GREEN $name ($((end-start))s)"
  else
    echo "RED   $name ($((end-start))s) :: $last" >> $OUT
    echo "[suite] RED $name ($((end-start))s) :: $last"
    diag=$(tail -n 12 /tmp/at-$name.log 2>/dev/null | tr '\n' ' ' | cut -c1-400)
    echo "::error title=RED suite $name (exit $code)::$diag"
    tail -n 30 /tmp/at-$name.log 2>/dev/null || true
  fi
}

run_copy() {
  f="$1"; name=$(basename "$f" .js)
  dir=/tmp/mut-$name
  rm -rf "$dir"; mkdir -p "$dir"
  tar cf - --exclude=node_modules --exclude=.git --exclude=tmp . | (cd "$dir" && tar xf -)
  ln -s "$PWD/node_modules" "$dir/node_modules"
  ln -s "$ROOT_GIT_DIR" "$dir/.git"
  start=$(date +%s)
  echo "[suite] START $name (isolated copy)"
  extra_env=$(suite_env_prefix "$f")
  if [ -n "$extra_env" ]; then
    ( cd "$dir" && env $extra_env timeout -k 30 "$SUITE_TIMEOUT" node "tests/$name.js" > /tmp/at-$name.log 2>&1 )
  else
    ( cd "$dir" && timeout -k 30 "$SUITE_TIMEOUT" node "tests/$name.js" > /tmp/at-$name.log 2>&1 )
  fi
  code=$?
  end=$(date +%s)
  rm -rf "$dir"
  last=$(grep -E "موفق|بررسی — |✅ /|کشته" /tmp/at-$name.log | tail -1 | tr '\n' ' ' | cut -c1-100)
  if [ $code -eq 124 ]; then
    echo "RED   $name (TIMEOUT after ${SUITE_TIMEOUT}s — unfinishable suite, counted as failure)" >> $OUT
    echo "[suite] RED-TIMEOUT $name (isolated copy, ${SUITE_TIMEOUT}s)"
    echo "::error title=RED-TIMEOUT suite $name::Timed out after ${SUITE_TIMEOUT}s"
    tail -n 30 /tmp/at-$name.log 2>/dev/null || true
  elif [ $code -eq 0 ]; then
    echo "GREEN $name ($((end-start))s)" >> $OUT
    echo "[suite] GREEN $name ($((end-start))s)"
  else
    echo "RED   $name ($((end-start))s) :: $last" >> $OUT
    echo "[suite] RED $name ($((end-start))s) :: $last"
    diag=$(tail -n 12 /tmp/at-$name.log 2>/dev/null | tr '\n' ' ' | cut -c1-400)
    echo "::error title=RED suite $name (exit $code)::$diag"
    tail -n 30 /tmp/at-$name.log 2>/dev/null || true
  fi
}

run_live_one() {
  f="$1"; name=$(basename "$f" .js)
  start=$(date +%s)
  echo "[suite] START $name (live-infra)"
  redis-cli -u "$LIVE_REDIS_URL" FLUSHALL >/dev/null 2>&1 || true
  if [ "$f" = "tests/otp-ratelimit-mutations.js" ]; then
    timeout -k 30 "$SUITE_TIMEOUT" node "$f" > /tmp/at-$name.log 2>&1
    code=$?
  elif [ "$f" = "tests/wave1-gate.js" ]; then
    env PGURL="$LIVE_PG_URL" timeout -k 30 "$SUITE_TIMEOUT" node "$f" > /tmp/at-$name.log 2>&1
    code=$?
  elif [ "$f" = "tests/bench-phone-lookup-p11.js" ]; then
    psql "$LIVE_ADMIN_URL" -c "DROP DATABASE IF EXISTS payesh_bench;" >/dev/null 2>&1 || true
    psql "$LIVE_ADMIN_URL" -c "CREATE DATABASE payesh_bench;" >/dev/null 2>&1 || true
    env P11_LIVE_PG="$LIVE_BENCH_URL" P11_BENCH_N=5000 timeout -k 30 "$SUITE_TIMEOUT" node "$f" > /tmp/at-$name.log 2>&1
    code=$?
    psql "$LIVE_ADMIN_URL" -c "DROP DATABASE IF EXISTS payesh_bench;" >/dev/null 2>&1 || true
  elif [ "$f" = "tests/wal-disk-full.js" ]; then
    PGBIN_DIR=""
    if [ -f /var/tmp/pgdata-wal-drill/PG_VERSION ]; then
      WAL_PG_VER="$(cat /var/tmp/pgdata-wal-drill/PG_VERSION 2>/dev/null | tr -d '[:space:]')"
      if [ -n "$WAL_PG_VER" ] && [ -x "/usr/lib/postgresql/$WAL_PG_VER/bin/pg_basebackup" ]; then
        PGBIN_DIR="/usr/lib/postgresql/$WAL_PG_VER/bin"
      fi
    fi
    if [ -z "$PGBIN_DIR" ]; then
      PGBIN_DIR="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -n 1)"
    fi
    if [ -z "$PGBIN_DIR" ]; then PGBIN_DIR="/usr/bin"; fi
    NODE_BIN="$(command -v node)"
    id postgres >/dev/null 2>&1 || sudo useradd -r -m -s /bin/bash postgres 2>/dev/null || true
    if ! pg_isready -h 127.0.0.1 -p 55432 >/dev/null 2>&1; then
      sudo PGBIN="$PGBIN_DIR" bash infra/wal-drill/bootstrap.sh >/dev/null 2>&1 || true
    fi
    sudo -E env PATH="$PGBIN_DIR:$PATH" PGBIN="$PGBIN_DIR" NODE_PATH="${NODE_PATH:-}" timeout -k 30 "$SUITE_TIMEOUT" "$NODE_BIN" "$f" > /tmp/at-$name.log 2>&1
    code=$?
  elif [ "$f" = "tests/redis-sentinel-failover.js" ]; then
    env REDIS_URL="$LIVE_REDIS_URL" timeout -k 30 "$SUITE_TIMEOUT" node "$f" > /tmp/at-$name.log 2>&1
    code=$?
  elif [ "$f" = "tests/idor-runtime.js" ] || [ "$f" = "tests/idor-runtime-r4.js" ] || [ "$f" = "tests/a35-regression.js" ]; then
    DATABASE_URL="$LIVE_PG_URL" node tools/seed-idor-fixture.js > /tmp/at-$name-seed.log 2>&1
    env DATABASE_URL="$LIVE_IDOR_URL" PGURL="$LIVE_IDOR_URL" IDOR_DATABASE_URL="$LIVE_IDOR_URL" REDIS_URL="$LIVE_REDIS_URL" \
      PAYESH_DEMO_CODE=1 PAYESH_SMS_PHONE_LIMIT=1000 PAYESH_SMS_IP_LIMIT=1000 PAYESH_SMS_COOLDOWN_S=0 \
      timeout -k 30 "$SUITE_TIMEOUT" node "$f" > /tmp/at-$name.log 2>&1
    code=$?
  elif [ "$f" = "tests/p11-phone-auth-live.js" ]; then
    psql "$LIVE_ADMIN_URL" -c "DROP DATABASE IF EXISTS payesh_bench;" >/dev/null 2>&1 || true
    psql "$LIVE_ADMIN_URL" -c "CREATE DATABASE payesh_bench;" >/dev/null 2>&1 || true
    node server/seed.js >/dev/null 2>&1 || true
    env P11_LIVE_PG="$LIVE_BENCH_URL" PAYESH_ALLOW_DEV_MEMORY_AUTHORITY=1 \
      timeout -k 30 "$SUITE_TIMEOUT" node "$f" > /tmp/at-$name.log 2>&1
    code=$?
    psql "$LIVE_ADMIN_URL" -c "DROP DATABASE IF EXISTS payesh_bench;" >/dev/null 2>&1 || true
  else
    if [ "$f" = "tests/pg-relational-seed.js" ] || [ "$f" = "tests/sync-occ-adversarial-live.js" ] || [ "$f" = "tests/sync-replay-adversarial-live.js" ] || [ "$f" = "tests/multi-instance.js" ]; then
      psql "$LIVE_PG_URL" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" >/dev/null 2>&1 || true
      DATABASE_URL="$LIVE_PG_URL" node tools/migrate-ledger.js up >/dev/null 2>&1 || true
      if [ "$f" = "tests/multi-instance.js" ]; then
        node server/seed.js >/dev/null 2>&1 || true
        DATABASE_URL="$LIVE_PG_URL" node tools/migrate-pg.js >/dev/null 2>&1 || true
      fi
    fi
    node server/seed.js >/dev/null 2>&1 || true
    env DATABASE_URL="$LIVE_PG_URL" PGURL="$LIVE_PG_URL" PG_LIVE_PG="$LIVE_PG_URL" SYNC_TEST_DATABASE_URL="$LIVE_PG_URL" REDIS_URL="$LIVE_REDIS_URL" REDIS_LIVE_URL="$LIVE_REDIS_URL" QOD_LIVE_PG=1 PGHOST=127.0.0.1 PGPORT=5432 PGUSER=payesh PGPASSWORD=payesh PGDATABASE=payesh_ci \
      timeout -k 30 "$SUITE_TIMEOUT" node "$f" > /tmp/at-$name.log 2>&1
    code=$?
  fi
  pkill -f 'node .*server/index\.js' 2>/dev/null || true
  for _pgw in $(seq 1 20); do
    psql "$LIVE_ADMIN_URL" -c 'SELECT 1;' >/dev/null 2>&1 && break
    sleep 0.5
  done
  end=$(date +%s)
  last=$(grep -E "موفق|بررسی — |✅ /|کشته|PASS|SECURE" /tmp/at-$name.log | tail -1 | tr '\n' ' ' | cut -c1-100)
  if [ $code -eq 124 ]; then
    echo "RED   $name (TIMEOUT after ${SUITE_TIMEOUT}s — unfinishable suite, counted as failure)" >> $OUT
    echo "[suite] RED-TIMEOUT $name (live-infra, ${SUITE_TIMEOUT}s)"
    echo "::error title=RED-TIMEOUT suite $name::Timed out after ${SUITE_TIMEOUT}s"
    tail -n 30 /tmp/at-$name.log 2>/dev/null || true
  elif [ $code -eq 0 ]; then
    echo "GREEN $name ($((end-start))s)" >> $OUT
    echo "[suite] GREEN $name ($((end-start))s)"
  else
    echo "RED   $name ($((end-start))s) :: $last" >> $OUT
    echo "[suite] RED $name ($((end-start))s) :: $last"
    diag=$(tail -n 12 /tmp/at-$name.log 2>/dev/null | tr '\n' ' ' | cut -c1-400)
    echo "::error title=RED suite $name (exit $code)::$diag"
    tail -n 30 /tmp/at-$name.log 2>/dev/null || true
  fi
}

lane_sweep() { pkill -f 'node .*server/index\.js' 2>/dev/null; sleep 1; return 0; }
port_lane() {
  for f in $PORT_P1; do run_one "$f"; lane_sweep; done
  for f in $PORT_P2; do run_copy "$f"; lane_sweep; done
}
export -f suite_env_prefix run_one run_copy run_live_one uses_port port_lane
export OUT PORT_P1 PORT_P2 SUITE_TIMEOUT ROOT_GIT_DIR

NA=$(echo "$LANE_A" | sed '/^$/d' | wc -l)
NB=$(echo "$LANE_B" | sed '/^$/d' | wc -l)
NC1=$(echo "$PORT_P1" | sed '/^$/d' | wc -l)
NC2=$(echo "$PORT_P2" | sed '/^$/d' | wc -l)
echo "=== LANES: A=$NA (main, $WORKERS workers) B=$NB (copies, $WORKERS workers) PORT-serial=$NC1+$NC2" >> $OUT
echo "[lanes] A=$NA (main) B=$NB (copies) PORT-serial=$NC1+$NC2 suite_timeout=${SUITE_TIMEOUT}s"

for f in $EXCL_PRESENT; do
  run_one "$f"
  lane_sweep
done
echo "$LANE_A" | sed '/^$/d' | xargs -d '\n' -P $WORKERS -I{} bash -c 'run_one "$@"' _ {}
find /tmp -maxdepth 1 \( -name 'mut-*' -o -name 'payesh-*' \) -mmin +2 -exec rm -rf {} + 2>/dev/null || true
rm -rf /tmp/authzchk-* 2>/dev/null || true
echo "$LANE_B" | sed '/^$/d' | xargs -d '\n' -P $WORKERS -I{} bash -c 'run_copy "$@"' _ {}
port_lane
psql "$LIVE_PG_URL" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" >/dev/null 2>&1 || true
DATABASE_URL="$LIVE_PG_URL" node tools/migrate-ledger.js up >/dev/null 2>&1 || true
for f in $LIVE_PRESENT; do
  run_live_one "$f"
done
node server/seed.js >/dev/null 2>&1 || true

GREEN=$(grep -c '^GREEN' $OUT)
RED=$(grep -c '^RED' $OUT)
echo "=== TOTAL: green=$GREEN red=$RED" >> $OUT
grep '^RED' $OUT | awk '{print $2}' | sed 's/^/=== RED: /' >> $OUT
echo "=== elapsed: $(( $(date +%s) - START ))s" >> $OUT
echo "DONE" >> $OUT
echo "=== TOTAL: green=$GREEN red=$RED (elapsed: $(( $(date +%s) - START ))s)"
grep '^RED' $OUT | sed 's/^/=== RED: /'
if [ "$GREEN" -eq 0 ]; then
  echo "=== FATAL: green=0 — no suites executed; refusing to report green ===" >&2
  exit 1
fi
[ $RED -eq 0 ]
