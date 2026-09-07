#!/bin/bash
# run-all-tests.sh — full regression with self-healing + safe parallelism
#
# Measured root cause of slowness: sandbox is 2 vCPU / 2GB RAM. 125 suites
# serial ≈ 18 min. Safe parallelism: ONLY suites that do not rebuild
# index.html (mutation harnesses AND the 10 base suites that call build.js
# must stay serial — concurrent builds corrupt each other).
#
# Usage:  bash scripts/run-all-tests.sh    (log: /tmp/all-tests.log)
# Self-heal (sandbox resets wipe node_modules / .git identity):
#   jsdom missing   -> npm i --no-save jsdom
#   git identity    -> restored (Payesh Dev)

cd "$(dirname "$0")/.." || exit 2
export NODE_PATH="$PWD/node_modules"
OUT=/tmp/all-tests.log
: > $OUT

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
export -f run_one
export OUT

# ── phase 1: safe base suites — 2 workers ──────────────────────────────────
ALL=$(ls tests/*.js | grep -v -- '-mutations.js$' | grep -v 'server11-child.js')
REBUILDING=$(grep -l "build.js" tests/*.js 2>/dev/null | grep -v -- '-mutations.js$' | grep -v 'server11-child.js')
BASE=$(echo "$ALL" | grep -vxF "$REBUILDING")
echo "=== BASE PARALLEL PHASE ($(echo "$BASE" | wc -l) suites, 2 workers)" >> $OUT
echo "$BASE" | xargs -d '\n' -P 2 -I{} bash -c 'run_one "$@"' _ {}

# ── phase 2: rebuilders + mutations — serial (shared index.html builds) ────
SERIAL=$(echo "$ALL" | grep -xF "$REBUILDING"); SERIAL="${SERIAL}
$(ls tests/*-mutations.js)"
echo "=== SERIAL PHASE ($(echo "$SERIAL" | sed '/^$/d' | wc -l) suites, rebuilders + mutations)" >> $OUT
for f in $SERIAL; do [ -n "$f" ] && run_one "$f"; done

GREEN=$(grep -c '^GREEN' $OUT)
RED=$(grep -c '^RED' $OUT)
echo "=== TOTAL: green=$GREEN red=$RED" >> $OUT
grep '^RED' $OUT | awk '{print $2}' | sed 's/^/=== RED: /' >> $OUT
echo "DONE" >> $OUT
[ $RED -eq 0 ]
