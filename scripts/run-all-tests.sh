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
#   125 canonical suites = 90 base + 35 mutations
#   (tests/server11-child.js is a worker script, not a suite — excluded by design)
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
export NODE_PATH="$PWD/node_modules"
OUT=/tmp/all-tests.log
: > $OUT
START=$(date +%s)
WORKERS=2

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
if pgrep -f 'node server/index.js' >/dev/null 2>&1; then
  echo "!! stale server processes found — killing (R92: they hold fixed test ports → env false-alives)" | tee -a $OUT
  pkill -f 'node server/index.js' || true
  sleep 1
fi
if [ ! -f server/data/payesh.json ]; then
  echo "!! payesh.json missing — reseeding" | tee -a $OUT
  node server/seed.js >>$OUT 2>&1 || { echo "!! reseed FAILED" | tee -a $OUT; exit 2; }
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

# ── suite lists ────────────────────────────────────────────────────────────
ALL=$(ls tests/*.js | grep -v -- '-mutations.js$' | grep -v 'server11-child.js')
REBUILDING=$(grep -l "build.js" tests/*.js 2>/dev/null | grep -v -- '-mutations.js$' | grep -v 'server11-child.js')
SERVERS=$(echo "$ALL" | grep '^tests/server')
MUTS=$(ls tests/*-mutations.js)
PHASE2_SET=$( { echo "$REBUILDING"; echo "$SERVERS"; echo "$MUTS"; } | sed '/^$/d' | sort -u )
PHASE1_SET=$(echo "$ALL" | grep -vxFf <(echo "$PHASE2_SET"))

# port-holding detection: literal 89xx/90xx port in the suite file, OR (for
# mutation suites) in the suite file(s) they boot via `suite: 'tests/x.js'`
uses_port() {
  local f="$1"
  grep -qE "89[0-9]{2}|90[0-9]{2}" "$f" && return 0
  local refs
  refs=$(grep -oE "suite[[:space:]]*:[[:space:]]*['\"][^'\"]+\.js" "$f" | sed -E "s/.*['\"]//")
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
LANE_A=$(echo "$PHASE1_SET" | grep -vxFf <(echo "$PORT_P1") | sed '/^$/d')   # main dir, @2
LANE_B=$(echo "$PHASE2_SET" | grep -vxFf <(echo "$PORT_P2") | sed '/^$/d')   # copies, @2

# ── runner: in-place (read-only suites, main dir) ──────────────────────────
run_one() {
  f="$1"; name=$(basename "$f" .js)
  start=$(date +%s)
  node "$f" > /tmp/at-$name.log 2>&1
  code=$?
  end=$(date +%s)
  last=$(grep -E "موفق|بررسی — |✅ /|کشته" /tmp/at-$name.log | tail -1 | tr '\n' ' ' | cut -c1-100)
  if [ $code -eq 0 ]; then
    echo "GREEN $name ($((end-start))s)" >> $OUT
  else
    echo "RED   $name ($((end-start))s) :: $last" >> $OUT
  fi
}

# ── runner: isolated copy (rebuilders + server + mutations) ────────────────
run_copy() {
  f="$1"; name=$(basename "$f" .js)
  dir=/tmp/mut-$name
  rm -rf "$dir"; mkdir -p "$dir"
  tar cf - --exclude=node_modules --exclude=.git --exclude=tmp . | (cd "$dir" && tar xf -)
  ln -s "$PWD/node_modules" "$dir/node_modules"
  start=$(date +%s)
  ( cd "$dir" && node "tests/$name.js" > /tmp/at-$name.log 2>&1 )
  code=$?
  end=$(date +%s)
  rm -rf "$dir"
  last=$(grep -E "موفق|بررسی — |✅ /|کشته" /tmp/at-$name.log | tail -1 | tr '\n' ' ' | cut -c1-100)
  if [ $code -eq 0 ]; then
    echo "GREEN $name ($((end-start))s)" >> $OUT
  else
    echo "RED   $name ($((end-start))s) :: $last" >> $OUT
  fi
}

# ── serial lane: port-holding suites (fixed 89xx/90xx — never in parallel) ─
port_lane() {
  for f in $PORT_P1; do run_one "$f"; done
  for f in $PORT_P2; do run_copy "$f"; done
}
export -f run_one run_copy uses_port port_lane
export OUT PORT_P1 PORT_P2

NA=$(echo "$LANE_A" | sed '/^$/d' | wc -l)
NB=$(echo "$LANE_B" | sed '/^$/d' | wc -l)
NC1=$(echo "$PORT_P1" | sed '/^$/d' | wc -l)
NC2=$(echo "$PORT_P2" | sed '/^$/d' | wc -l)
echo "=== LANES: A=$NA (main, $WORKERS workers) B=$NB (copies, $WORKERS workers) PORT-serial=$NC1+$NC2" >> $OUT

port_lane &
PORT_PID=$!
echo "$LANE_A" | sed '/^$/d' | xargs -d '\n' -P $WORKERS -I{} bash -c 'run_one "$@"' _ {}
# mid-run sweep: server suites leak /tmp/payesh-*/store.json (5.6MB each)
rm -rf /tmp/mut-* /tmp/payesh-* /tmp/authzchk-* 2>/dev/null || true
echo "$LANE_B" | sed '/^$/d' | xargs -d '\n' -P $WORKERS -I{} bash -c 'run_copy "$@"' _ {}
wait $PORT_PID

GREEN=$(grep -c '^GREEN' $OUT)
RED=$(grep -c '^RED' $OUT)
echo "=== TOTAL: green=$GREEN red=$RED" >> $OUT
grep '^RED' $OUT | awk '{print $2}' | sed 's/^/=== RED: /' >> $OUT
echo "=== elapsed: $(( $(date +%s) - START ))s" >> $OUT
echo "DONE" >> $OUT
[ $RED -eq 0 ]
