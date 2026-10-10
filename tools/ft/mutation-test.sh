#!/usr/bin/env bash
# tools/ft/mutation-test.sh — PERMANENT mutation guard for tools/ft/metric-v2.js
#
# Purpose: prove the metric-v2 test suite is a REAL guard, not a hardcoded
# echo chamber. Each mutation is a small, semantically meaningful fault
# injected into a COPY of the metric; the suite must turn red.
#
# SAFETY MODEL (why the original file can never be corrupted)
#   - Every mutation is applied to a COPY in a private temp directory.
#   - The original metric-v2.js is never opened for writing by this script.
#   - sha256 of the original is recorded before the run and re-verified after
#     every mutation and at the end. Any mismatch aborts immediately.
#   - The test suite is pointed at the mutated copy via FT_METRIC_V2_PATH
#     (a hook in tests/metric-v2.test.js), so the test file itself is never
#     copied or edited.
#
# KILL CLASSIFICATION — a non-zero exit alone is NOT a kill. The mission rule:
#   exit code is a valid detection only when the failure is caused by the
#   mutated behavior, not a syntax error, environment breakage, or an
#   unrelated cause. So:
#     exit 0                                  -> SURVIVED
#     exit != 0 AND stdout reports "N passed, M failed" with M > 0 -> KILLED
#     exit != 0 AND no such line (crash/syntax/env)                -> ERROR
#
# Exit status: 0 only if every mutation is KILLED and no ERROR occurred.
# Any SURVIVED or ERROR makes the script exit 1.
#
# Usage: bash tools/ft/mutation-test.sh
set -u

FT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
METRIC="$FT_DIR/metric-v2.js"
TEST="$FT_DIR/tests/metric-v2.test.js"
REPORT_BASE="$FT_DIR/FT-METRIC-01-INDEPENDENT-VERIFICATION.md"

[ -f "$METRIC" ] || { echo "FATAL: metric not found: $METRIC" >&2; exit 2; }
[ -f "$TEST" ]  || { echo "FATAL: test not found: $TEST"  >&2; exit 2; }

# FT_DIR comes from `pwd`, which in Git Bash for Windows yields an MSYS path
# (/c/...). The shell tools (sha256sum, cp) read either shape, but a NATIVE
# Windows Node build rejects /c/... with ENOENT where the Cygwin/Git-for-Windows
# Node build accepts it. Probe each path: keep it as-is when Node can already
# open it, convert with `cygpath -m` only when it cannot, and fail loudly if
# conversion is unavailable or still unreadable — otherwise every mutation
# would report ERROR with a misleading message (FT-METRIC-01 path-shape fix).
node_readable() {
  local p="$1" conv
  if node -e 'require("fs").readFileSync(process.argv[1])' "$p" 2>/dev/null; then
    printf '%s' "$p"
    return 0
  fi
  if ! command -v cygpath >/dev/null 2>&1; then
    echo "FATAL: Node cannot read this path and cygpath is unavailable: $p" >&2
    return 2
  fi
  conv="$(cygpath -m "$p")" || { echo "FATAL: cygpath failed on: $p" >&2; return 2; }
  if ! node -e 'require("fs").readFileSync(process.argv[1])' "$conv" 2>/dev/null; then
    echo "FATAL: cygpath conversion still not readable by Node: $conv" >&2
    return 2
  fi
  printf '%s' "$conv"
}
METRIC="$(node_readable "$METRIC")" || exit 2
TEST="$(node_readable "$TEST")" || exit 2

# ---- baseline: the working tree must be in a known state -------------------
BASE_SHA="$(sha256sum "$METRIC" | cut -d' ' -f1)"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ftmut.XXXXXX")" || { echo "FATAL: mktemp failed" >&2; exit 2; }

# Node.js may not be able to open the path mktemp produced. On Linux/macOS the
# POSIX path is directly readable. On Git Bash for Windows mktemp returns an
# MSYS path (/tmp/...) that a native Windows Node build may reject with ENOENT.
# Detect this and convert with cygpath; if conversion is impossible, fail loudly
# rather than letting every mutation report ERROR with a misleading message.
if ! node -e 'require("fs").statSync(process.argv[1])' "$WORK_DIR" 2>/dev/null; then
  if command -v cygpath >/dev/null 2>&1; then
    WORK_DIR="$(cygpath -w "$WORK_DIR")"
  else
    rm -rf "$WORK_DIR"
    echo "FATAL: temp dir is unreadable by Node and cygpath is unavailable." >&2
    echo "       mktemp gave a path Node cannot open; cannot continue safely." >&2
    exit 2
  fi
fi
trap 'rm -rf "$WORK_DIR"' EXIT

# ---- the mutation table ----------------------------------------------------
# Each mutation is held in a pair of variables <id>_N (needle) and <id>_R
# (replacement). The needle must occur EXACTLY once in the metric.
# NOTE: a '|' delimiter CANNOT be used here — MUT5's needle contains the JS
# `||` operator, which would split mid-token and corrupt the substitution.
MUT_IDS=(MUT1 MUT2 MUT2b MUT3 MUT4 MUT5)

MUT1_N='return { status: '"'"'EXACT'"'"', detail: '"'"'response == instruction'"'"' };'
MUT1_R='return { status: '"'"'NONE'"'"', detail: '"'"'response == instruction'"'"' };'

MUT2_N='const MIN_DIFF_HUNKS = 1;'
MUT2_R='const MIN_DIFF_HUNKS = 0;'

MUT2b_N='const MIN_DIFF_LINES = 3;'
MUT2b_R='const MIN_DIFF_LINES = 0;'

MUT3_N='function diffTokens(diffBody) {
  const out = [];'
MUT3_R='function diffTokens(diffBody) {
  return toks(diffBody);
  const out = [];'

MUT4_N='      content_score_v2: round(cs.score),'
MUT4_R='      content_score_v2: fmt.status === '"'"'FORMAT_FAIL'"'"' ? 0 : round(cs.score),'

# MUT5 targets the PLAIN path / overlap() directly (FT-METRIC-01-R1 regression):
# re-injecting .size on the Array guard makes overlap() return 0 for every
# input. The 4b positive/negative control must catch it. This needle occurs
# exactly once — diffOverlap() uses a different guard shape.
MUT5_N='if (!ta.size || !tb.length) return 0;'
MUT5_R='if (!ta.size || !tb.size) return 0;'


N_KILLED=0
N_SURVIVED=0
N_ERROR=0
RESULTS=()

apply_mutation() {
  # $1 = source copy, $2 = needle, $3 = replacement
  # Exits 3 if the needle does not occur exactly once (unsafe to continue).
  NEEDLE="$2" REPL="$3" node -e '
    const fs = require("fs");
    const f = process.argv[1];
    const s = fs.readFileSync(f, "utf8");
    const n = process.env.NEEDLE, r = process.env.REPL;
    const parts = s.split(n);
    if (parts.length !== 2) {
      console.error("OCCURRENCES=" + (parts.length - 1) + " (expected exactly 1)");
      process.exit(3);
    }
    fs.writeFileSync(f, parts.join(r));
  ' "$1"
}

verify_original() {
  local now sha
  now="$(sha256sum "$METRIC" | cut -d' ' -f1)"
  if [ "$now" != "$BASE_SHA" ]; then
    echo "FATAL: original metric-v2.js was modified during the run." >&2
    echo "  expected $BASE_SHA" >&2
    echo "  actual   $now" >&2
    exit 2
  fi
}

echo "=== FT-METRIC-01 mutation guard ==="
echo "metric:  $METRIC"
echo "sha256:  $BASE_SHA"
echo "test:    $TEST"
echo

for id in "${MUT_IDS[@]}"; do
  eval "needle=\"\${${id}_N}\""
  eval "repl=\"\${${id}_R}\""

  copy="$WORK_DIR/$id.js"
  cp "$METRIC" "$copy" || {
    N_ERROR=$((N_ERROR + 1))
    RESULTS+=("ERROR | $id | could not stage a copy of the metric")
    verify_original
    continue
  }

  # Apply, capturing whether the needle was found exactly once.
  apply_out="$(apply_mutation "$copy" "$needle" "$repl" 2>&1)"
  apply_code=$?
  if [ $apply_code -ne 0 ]; then
    N_ERROR=$((N_ERROR + 1))
    RESULTS+=("ERROR | $id | mutation did not apply cleanly: $apply_out")
    verify_original
    continue
  fi

  # Liveness probe — the mission rule: an exit code is valid detection only when
  # the failure is caused by the MUTATED BEHAVIOUR, not a syntax error, an
  # import error or environment breakage. A mutated copy that cannot even run a
  # trivial row is an ERROR, never a KILL: its failures carry no information
  # about whether the suite detects the fault.
  probe_rows="$WORK_DIR/probe.jsonl"
  printf '%s\n' '{"instruction":"probe","expected":"the quick brown fox jumps","response":"the quick brown fox jumps"}' > "$probe_rows"
  probe_code=0
  probe_out="$(node "$copy" --rows "$probe_rows" 2>&1)" || probe_code=$?
  probe_json=""
  if [ "$probe_code" -eq 0 ]; then
    probe_json="$(printf '%s' "$probe_out" | node -e '
      let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
        try { const j = JSON.parse(s); if (j && j.rows) { process.stdout.write("ok"); return; } } catch (e) {}
        process.stdout.write("bad");
      });')"
  fi
  if [ "$probe_code" -ne 0 ] || [ "$probe_json" != "ok" ]; then
    N_ERROR=$((N_ERROR + 1))
    RESULTS+=("ERROR | $id | mutated copy does not run cleanly (probe exit=$probe_code, json=${probe_json:-none}): ${probe_out:0:200}")
    verify_original
    continue
  fi

  # Run the REAL suite against the mutated copy only.
  run_out="$(FT_METRIC_V2_PATH="$copy" node "$TEST" 2>&1)"
  run_code=$?

  # Extract the pass/fail summary line the test harness prints.
  summary="$(printf '%s\n' "$run_out" | grep -E '[0-9]+ passed, [0-9]+ failed' | tail -n 1)"
  n_failed=0
  if [ -n "$summary" ]; then
    n_failed="$(printf '%s' "$summary" | grep -oE '[0-9]+ failed' | head -n 1 | grep -oE '^[0-9]+')"
  fi

  if [ "$run_code" -eq 0 ]; then
    verdict="SURVIVED"
    N_SURVIVED=$((N_SURVIVED + 1))
  elif [ -n "$summary" ] && [ "$n_failed" -gt 0 ]; then
    verdict="KILLED"
    N_KILLED=$((N_KILLED + 1))
  else
    verdict="ERROR"
    N_ERROR=$((N_ERROR + 1))
  fi

  failing="$(printf '%s\n' "$run_out" | grep -E '^  FAIL' | sed 's/^  FAIL  /    /')"
  RESULTS+=("$verdict | $id | exit=$run_code | $summary${failing:+
$failing}")

  # The original must be untouched after every single mutation.
  verify_original
done

echo "=== RESULTS ==="
for r in "${RESULTS[@]}"; do printf '%s\n' "$r"; done
echo
echo "KILLED=$N_KILLED  SURVIVED=$N_SURVIVED  ERROR=$N_ERROR  (total ${#MUT_IDS[@]})"

# Final integrity re-check.
verify_original
rm -rf "$WORK_DIR"

if [ "$N_SURVIVED" -gt 0 ] || [ "$N_ERROR" -gt 0 ]; then
  echo "GUARD: FAIL — a fault survived or a run was ambiguous; the suite has a blind spot." >&2
  exit 1
fi
echo "GUARD: PASS — every injected fault was detected."
exit 0
