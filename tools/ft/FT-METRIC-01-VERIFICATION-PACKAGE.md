# FT-METRIC-01 — Independent Verification Package (for Hermes)

Scope: verify ONLY the items below. Do not re-scan the whole repo, do not expand scope, do not add unrelated findings.

## Repo truth

- Path: `/c/Users/R.M/AppData/Local/hermes/sandboxes/docker/default/workspace/p2`
- Branch: `ft-metric-01`
- HEAD: `fd83a39927300e65396bfef57980c71abdb87c9d` (== reported baseline, unchanged)
- Remote: `origin https://github.com/rezaa2544/p2.git` — NOT reachable from this box
- Tracked files modified: 1 (`tools/ft/benchmark.js`, 3 insertions / 3 deletions — pre-existing from Mission 1)
- Untracked under `tools/ft/`: 11 files
- Environment: MINGW64_NT-10.0-22631 (real Windows Git Bash), Node v24.21.0, `cygpath` available

## Files and hashes (all verified post-test)

| File | sha256 | Status |
|---|---|---|
| `tools/ft/metric-v2.js` | `1f7937e5c337e4e5bd59a708eb93a10f62aecdfc87b5372ef0ed42f7c1f52309` | untracked, not modified this mission |
| `tools/ft/tests/metric-v2.test.js` | `c200ab1d02f83e3b82e836b6d52f27f1aa9ffb128ec0d1fdc152a6b9da79704e` | untracked, not modified this mission |
| `tools/ft/benchmark.js` | `eb4e8d860cccdae9174d06ace08d7ef61a6361fed462876f773ebe70db5564ff` | tracked, pre-existing working-tree edit (Mission 1) |
| `tools/ft/mutation-test.sh` | `fe5f0577176555ccced1d3096bdf6db1ccee5660793ae33b71f8c95910a5dcfc` | untracked, contains `node_readable()` |

## The fix under verification

1. **`tb.size` → `tb.length`** in `overlap()` (metric-v2.js line 116-120), `sim()` (benchmark.js line 23-27), `sim()` (compare.js line 19-22). `toks()` returns an Array; `.size` on an Array is `undefined`, so the old code returned `NaN` for every score.
2. **`node_readable()` probe-based path conversion** in `mutation-test.sh` (lines 38-64): probes with `node -e 'readFileSync'`, converts with `cygpath -m` only when Node cannot read the path, exits 2 with `FATAL` when conversion is unavailable or still unreadable.

## Reproduction commands (all run in this environment)

```bash
cd /c/Users/R.M/AppData/Local/hermes/sandboxes/docker/default/workspace/p2

# 1. Full suite (19 checks) — expected: "19 passed, 0 failed", exit 0
node tools/ft/tests/metric-v2.test.js; echo "EXIT=$?"

# 2. Mutation Guard (6 mutations) — expected: KILLED=6 SURVIVED=0 ERROR=0, "GUARD: PASS", exit 0
bash tools/ft/mutation-test.sh; echo "GUARD_EXIT=$?"

# 3. Test 4b negative control — re-inject tb.size bug into a TEMP COPY, expect the suite to fail
node "$TEMP/ft-inject-bug.js" \
  tools/ft/metric-v2.js \
  tools/ft/tests/metric-v2.test.js \
  /tmp/ft-buggy-copy.js
#   expected: "FAIL 4b. v1 word-overlap is blind to symbol-only patch payload",
#   "18 passed, 1 failed", suite exit 1, real metric-v2.js hash UNCHANGED

# 4. fail-closed — broken metric (syntax error) through the real guard logic
bash "$TEMP/ft-failclosed-test.sh"
#   expected: KILLED=0 SURVIVED=0 ERROR=6, "GUARD: FAIL", GUARD_EXIT=1

# 5. SURVIVED control — a harmless mutation must be SURVIVED and must fail the guard
bash "$TEMP/ft-surviving-test.sh"
#   expected: "SURVIVED | MUTHARMLESS | exit=0 | 19 passed, 0 failed",
#   KILLED=6 SURVIVED=1 ERROR=0, "GUARD: FAIL", GUARD_EXIT=1
```

## Verbatim outputs recorded this mission

**CMD 1 — `node tools/ft/tests/metric-v2.test.js`** (Node v24.21.0, MINGW64):
```
19 passed, 0 failed
```
EXIT=0. Test 4b line: `PASS  4b. v1 word-overlap is blind to symbol-only patch payload (positive + negative control)`

**CMD 2 — `bash tools/ft/mutation-test.sh`**:
```
KILLED | MUT1 | exit=1 | 17 passed, 2 failed
    1. exact prompt echo is flagged ECHO and fails
    12. summary aggregates match the rows
KILLED | MUT2 | exit=1 | 17 passed, 2 failed
    3b. fenced diff block with no hunk headers -> FORMAT_FAIL
    R1. FORMAT_FAIL reports a non-zero content score, not a forced zero
KILLED | MUT2b | exit=1 | 18 passed, 1 failed
    R3. diff with fewer than MIN_DIFF_LINES content lines is FORMAT_FAIL
KILLED | MUT3 | exit=1 | 17 passed, 2 failed
    4b. v1 word-overlap is blind to symbol-only patch payload (positive + negative control)
    R2. diff header without payload lines scores 0 under v2 line-tokens
KILLED | MUT4 | exit=1 | 18 passed, 1 failed
    R1. FORMAT_FAIL reports a non-zero content score, not a forced zero
KILLED | MUT5 | exit=1 | 18 passed, 1 failed
    4b. v1 word-overlap is blind to symbol-only patch payload (positive + negative control)

KILLED=6  SURVIVED=0  ERROR=0  (total 6)
GUARD: PASS — every injected fault was detected.
```
GUARD_EXIT=0

**CMD 3 — bug re-injection negative control** (`tb.length`→`tb.size` in `overlap()` body only, temp copy):
```
bug re-injected into copy: /tmp/ft-buggy-copy.js
  |   FAIL  4b. v1 word-overlap is blind to symbol-only patch payload (positive + negative control)
  | 18 passed, 1 failed
BUGGY_SUITE_EXIT=1
```
Real source hash after run: `1f7937e5c337e4e5bd59a708eb93a10f62aecdfc87b5372ef0ed42f7c1f52309` (unchanged).

**CMD 4 — fail-closed (broken metric, `function 123diffTokens` syntax error):**
```
KILLED=0  SURVIVED=0  ERROR=6  (total 6)
GUARD: FAIL — a fault survived or a run was ambiguous; the suite has a blind spot.
GUARD_EXIT=1 (expected NON-zero)
no false-green — correct
cleanup: OK
```

**CMD 5 — SURVIVED control (harmless comment mutation in an exact metric copy):**
```
harmless metric identical to real? YES
SURVIVED | MUTHARMLESS | exit=0 | 19 passed, 0 failed
KILLED=6  SURVIVED=1  ERROR=0  (total 7)
GUARD: FAIL — a fault survived or a run was ambiguous; the suite has a blind spot.
GUARD_EXIT=1 (expected 1)
no false-green — correct
real source untouched: 1f7937e5c337e4e5bd59a708eb93a10f62aecdfc87b5372ef0ed42f7c1f52309
cleanup: OK
```

**Contract tests (overlap/sim, isolated scope, read-only):** 24/24 PASS, exit 0. Covers identity→1.0, partial overlap (0.75 = 3/4 shared tokens), no-overlap→0, empty response→0, empty expected→0, both empty→0, all finite, no NaN, denominator is `tb.length` (3/5 = 0.6); same contract for both `sim()` implementations.

## Environmental limitation

The reported `ENOENT` on MSYS `/c/...` paths is NOT reproducible with the real Node on this box (Node v24.21.0 reads `/c/...` fine). The defect requires a native-Windows Node build, which is not installed. The `node_readable()` logic was validated with a simulated native Node (a fake `node` rejecting `/c/*` args). A run against a genuine native-Windows Node is **NOT RUN**.

## Historical benchmark status

`tools/ft/benchmark-report.json` (408 bytes, tracked, untouched): `base_mean_similarity: 0.126`, `tuned_mean_similarity: 0.21`, `n: 2`, `delta: 0.084`.
The raw inference outputs needed for a real rerun (`bench-base.jsonl`, `bench-tuned.jsonl`) are NOT in the repository — gitignored by design (`.gitignore` line 79: `tools/ft/bench-*.jsonl`) and never committed. **A real benchmark rerun is therefore impossible.** The historical numbers are reported as-is and are NOT re-derived or presented as fresh results.

## Questions for Hermes (yes/no, with file path + evidence if no)

1. Do the fixes exist in the current checkout files? (check the two source shapes above against the hashes)
2. Are the acceptance criteria met per the evidence?
3. Is the Guard fail-closed on error?
4. Does test 4b actually detect the relevant bug (per CMD 3)?
5. Does the final report contradict any real file or output?
6. Is any other unresolved blocker left inside this scope?
