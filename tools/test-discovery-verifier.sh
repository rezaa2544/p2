#!/usr/bin/env bash
set -eo pipefail

echo "============================================================"
echo "Phase 7.5 CI Honesty & Test Discovery Verifier"
echo "============================================================"

# 1. Discover all test scripts in tests/ directory
TEST_FILES=$(find tests -maxdepth 2 -name "*.js" | sort)
TOTAL_TESTS=$(echo "$TEST_FILES" | wc -l)

echo "Discovered $TOTAL_TESTS test files in tests/ directory."

# 2. Check for dishonest self-skips (e.g. process.exit(0) / exit(2) on missing dependency)
SKIPS=$(grep -rn "jsdom نصب نیست" tests/ || true)
if [ -n "$SKIPS" ]; then
  echo "Warning: Found legacy skip comments in test files (will be enforced fail-fast):"
  echo "$SKIPS" | head -n 10
fi

# 3. Execute primary test discovery matrix
echo -e "\n[1/3] Executing tests/run.js..."
node tests/run.js

echo -e "\n[2/3] Executing tests/smoke.js..."
node --expose-gc --max-old-space-size=2048 tests/smoke.js

echo -e "\n[3/3] Executing tools/production-verifier.sh..."
./tools/production-verifier.sh

echo "============================================================"
echo "Phase 7.5 Test Discovery Verifier: SUCCESS ✅"
echo "============================================================"
