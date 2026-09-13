#!/usr/bin/env bash
# Wave 18 — runs the four load scenarios + soak against the staging API.
#
# ⚠ SCALE HONESTY: the roadmap target is 10M users / 20,000 rps at peak. This
# sandbox has 2 vCPU and 2 GB RAM, and the load generator, the API and
# PostgreSQL all share those 2 cores. The VU counts below are therefore a
# HARNESS-VALIDATION scale: they prove the pipeline measures real server
# behaviour, they do NOT measure national capacity. Re-run with the defaults
# baked into national-load-test.js on real staging hardware before quoting any
# capacity number.
#
# Usage: bash infra/wave18-loadtest/run-scenarios.sh

set -uo pipefail

REPO="${REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$REPO"

BASE="${PAYESH_BASE_URL:-http://127.0.0.1:3000}"
OUT="${W18_OUT:-tests/performance/results}"
mkdir -p "$OUT"

# shellcheck disable=SC1091
. /var/tmp/w18-run/testuser.env          # PHONE / NID
STUDENT_ID="${W18_STUDENT_ID:-1103}"

SUITE=tests/performance/suites/national-load-test.js
COMMON=(-e PAYESH_BASE_URL="$BASE" -e PAYESH_PHONE="$PHONE"
        -e PAYESH_NID="$NID" -e PAYESH_STUDENT_ID="$STUDENT_ID")

# name            SCENARIO  extra env…
run() {
  local name="$1" scen="$2"; shift 2
  echo
  echo "═══════════════════════════════════════════════════════════"
  echo "  $name   (SCENARIO=$scen)"
  echo "═══════════════════════════════════════════════════════════"
  local envs=()
  while [ $# -gt 0 ]; do envs+=(-e "$1"); shift; done
  k6 run "${COMMON[@]}" -e SCENARIO="$scen" "${envs[@]}" \
    --summary-export="$OUT/w18-$name.json" "$SUITE" 2>&1 \
    | grep -vE '^\s*$|VUs *[0-9]|iters/s' | tail -28
  echo "  ── k6 exit: ${PIPESTATUS[0]}  (0 = همهٔ آستانه‌ها سبز)"
}

echo "target: $BASE   user: $PHONE (teacher)   student: $STUDENT_ID"
curl -s --max-time 5 "$BASE/api/health" | head -c 160; echo

run load   load   LOAD_VUS=25  PEAK_VUS=35  DUR_LOAD=90s DUR_GAP=95s  DUR_PEAK=45s
run peak   peak   PEAK_VUS=60  DUR_PEAK=90s
run stress stress STRESS_START=15 STRESS_MAX=120 DUR_STAGE=45s
run spike  spike  SPIKE_VUS=80 DUR_SPK_A=20s DUR_SPK_B=10s DUR_SPK_C=60s DUR_SPK_D=20s
run soak   soak   LOAD_VUS=20  SOAK_DURATION=3m

echo
echo "═══════════════════════════════════════════════════════════"
echo "  خلاصهٔ سنجه‌ها"
echo "═══════════════════════════════════════════════════════════"
python3 tools/wave18-summarize-results.py "$OUT"
