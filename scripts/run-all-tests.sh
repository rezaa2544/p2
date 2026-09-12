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
#   - کنارگذاشته‌های طراحی: tests/server11-child.js (اسکریپتِ کارگر)،
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

# ── suite lists ────────────────────────────────────────────────────────────
ALL=$(ls tests/*.js | grep -v -- '-mutations.js$' | grep -v 'server11-child.js')
# موج ۲۰: سابت‌های REST فاز ۳ (زیرپوشهٔ tests/api) هم جزو رگرسیون‌اند —
# دونده‌شان متوالی اجرا می‌کند و استور را ایزوله می‌کند؛ یک واحدِ موازی‌پذیر.
if [ -f tests/api/runner.js ]; then
  ALL="$ALL"$'\n'"tests/api/runner.js"
fi
REBUILDING=$(grep -l "build.js" tests/*.js 2>/dev/null | grep -v -- '-mutations.js$' | grep -v 'server11-child.js')
SERVERS=$(echo "$ALL" | grep '^tests/server')
MUTS=$(ls tests/*-mutations.js)
PHASE2_SET=$( { echo "$REBUILDING"; echo "$SERVERS"; echo "$MUTS"; } | sed '/^$/d' | sort -u )
PHASE1_SET=$(echo "$ALL" | grep -vxFf <(echo "$PHASE2_SET"))

# port-holding detection: literal 89xx/90xx port in the suite file, OR (for
# mutation suites) in any suite file they boot — both `suite: 'tests/x.js'`
# fields and quoted 'tests/x.js' arguments (R92: old-style mutate() calls)
uses_port() {
  local f="$1"
  grep -qE "89[0-9]{2}|90[0-9]{2}" "$f" && return 0
  local refs r
  refs=$(grep -ohE "['\"]tests/[^'\"]+\.js['\"]" "$f" | tr -d "'\"" | sort -u)
  # دروازهٔ انتشار: ارجاع‌های ‍path.join(..., 'tests', 'X.js') مسیرِ تحتانیِ
  # «‍tests/» ندارند و از تورِ بالا می‌افتادند (نمونه: جهش‌های ‍wave5 که سوئیتِ
  # پایه‌شان پورت ۹۰۳۴ دارد و موازی اجرا می‌شد). این‌جا آن‌ها را هم کشف می‌کنیم.
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
# R92: after each suite, kill any leaked server (crashed suites leave them holding
# fixed ports → next suite dies before its expected check → env false-verdicts)
lane_sweep() { pkill -f 'node .*server/index\.js' 2>/dev/null; sleep 1; return 0; }
port_lane() {
  for f in $PORT_P1; do run_one "$f"; lane_sweep; done
  for f in $PORT_P2; do run_copy "$f"; lane_sweep; done
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
# mid-run sweep: server suites leak /tmp/payesh-*/store.json (5.6MB each).
# R92: only delete idle dirs (modified >2 min ago) — the port lane may be
# inside /tmp/mut-* or /tmp/payesh-* concurrently (sim_full3 store!);
# -mmin +2 protects live suites, still cleans leaks
find /tmp -maxdepth 1 \( -name 'mut-*' -o -name 'payesh-*' \) -mmin +2 -exec rm -rf {} + 2>/dev/null || true
rm -rf /tmp/authzchk-* 2>/dev/null || true
echo "$LANE_B" | sed '/^$/d' | xargs -d '\n' -P $WORKERS -I{} bash -c 'run_copy "$@"' _ {}
wait $PORT_PID

GREEN=$(grep -c '^GREEN' $OUT)
RED=$(grep -c '^RED' $OUT)
echo "=== TOTAL: green=$GREEN red=$RED" >> $OUT
grep '^RED' $OUT | awk '{print $2}' | sed 's/^/=== RED: /' >> $OUT
echo "=== elapsed: $(( $(date +%s) - START ))s" >> $OUT
echo "DONE" >> $OUT
[ $RED -eq 0 ]
