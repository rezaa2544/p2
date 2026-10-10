# FT-METRIC-01 / Final Scoped Fix — Path Conversion & Fail-Closed Verification

**Mission:** `# PAYESH — FT-METRIC-01 / Final Scoped Fix — Git Bash Path Conversion & Fail-Closed Verification`
**Author:** Atria/ZCode (scoped fix executor)
**Baseline HEAD (per mission brief):** `fd83a39927300e65396bfef57980c71abdb87c9d`
**Initial status:** `REVALIDATION_REQUIRED`
**Proposed final status:** `FIXED-SCOPED` (all §۵ acceptance criteria met — see §۹ for the one honest caveat)

---

## 1. Repo Truth

| Field | Value |
|---|---|
| Repo path (host) | `C:\Users\R.M\AppData\Local\hermes\sandboxes\docker\default\workspace\p2` |
| Repo path (Git Bash) | `/c/Users/R.M/AppData/Local/hermes/sandboxes/docker/default/workspace/p2` |
| Branch | `ft-metric-01` |
| HEAD | `fd83a39927300e65396bfef57980c71abdb87c9d` (unchanged from baseline) |
| Platform | win32 10.0.22631 x64, real Git Bash, `cygpath` (cygwin) 3.6.9 at `/usr/bin/cygpath` |

**Git status — initial and final are identical** (the only edit of this mission was to an **untracked** file, so `git status` did not change):

```
 M tools/ft/benchmark.js              <- pre-existing from Mission 1, NOT touched this mission
?? tools/ft/FT-METRIC-01-FINAL-REPORT.md
?? tools/ft/FT-METRIC-01-INDEPENDENT-VERIFICATION.md
?? tools/ft/FT-METRIC-01-PERMANENT-CONTROLS.md
?? tools/ft/FT-METRIC-01-REMEDIATION-REPORT.md
?? tools/ft/FT-METRIC-01-REPORT.md
?? tools/ft/metric-v2-comparison.json
?? tools/ft/metric-v2-partial-report.json
?? tools/ft/metric-v2.js
?? tools/ft/mutation-test.sh           <- the file this mission edited (untracked)
?? tools/ft/tests/
```

Tracked files: `benchmark.js` is the only tracked file with a working-tree change (`3 insertions, 3 deletions` — a Mission-1 legacy edit, verified untouched this mission by sha256 in §۳). Untracked files: 10. **No untracked file was deleted or overwritten.**

---

## 2. Root Cause

**The reported defect (Hermes prior report):** in `tools/ft/mutation-test.sh`, `METRIC` and `TEST` are built as `$FT_DIR/metric-v2.js` and `$FT_DIR/tests/metric-v2.test.js`, where `FT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"`. In Git Bash for Windows, `pwd` yields the **MSYS** shape `/c/Users/R.M/...`. Shell tools (`sha256sum`, `cp`, `[ -f ]`) accept either shape, but a **native Windows Node.js build** rejects `/c/...` with `ENOENT`, whereas the Cygwin/Git-for-Windows Node build accepts it. The pre-existing `WORK_DIR` conversion (lines 48–57, added in Mission 1) already handled this for the temp dir, but `METRIC`/`TEST` were left unconverted, so on a native-Windows Node every mutation run would fail to read the metric and report `ERROR` with a misleading message.

**Evidence — raw paths as produced before this fix (Git Bash, this box):**

```
FT_DIR=/c/Users/R.M/AppData/Local/hermes/sandboxes/docker/default/workspace/p2/tools/ft
METRIC=/c/Users/R.M/AppData/Local/hermes/sandboxes/docker/default/workspace/p2/tools/ft/metric-v2.js
TEST=/c/Users/R.M/AppData/Local/hermes/sandboxes/docker/default/workspace/p2/tools/ft/tests/metric-v2.test.js
```

**Honest verification result (per the brief's instruction not to treat the prior report as final):**
the `ENOENT` failure is **NOT reproducible with the real Node on this box** — `/c/Program Files/nodejs/node` reads the MSYS path fine (18674 bytes read). The defect requires a **native-Windows Node build**, which is not installed here. It was therefore **simulated**: a fake `node` wrapper rejected any argument starting with `/c/` and otherwise exec'd the real Node. Under that simulation the pre-fix script indeed failed, and the post-fix script converted and succeeded. This is disclosed plainly in §۷ and is the reason the fix is probe-based rather than unconditional.

**Why not copy Hermes's snippet verbatim:** the suggested unconditional form would call `cygpath -m` on every run, converting paths even in environments where Node already reads them — a needless behavior change in working setups — and it has no fail-loud branch when `cygpath` is absent *and* Node cannot read the path (it would silently leave an unreadable path in place). The probe-based form below converts only on demonstrated need, is idempotent, and fails closed.

---

## 3. Changed Files

**Exactly one file changed in this mission:** `tools/ft/mutation-test.sh` (untracked).

| File | sha256 before | sha256 after | Changed? |
|---|---|---|---|
| `tools/ft/mutation-test.sh` | `e224f3a1d3ea7989c9afdcf74dd81160d30805f0d868466a36f572a0de4edd3f` | `fe5f0577176555ccced1d3096bdf6db1ccee5660793ae33b71f8c95910a5dcfc` | **YES (this mission)** |
| `tools/ft/metric-v2.js` | `1f7937e5c337e4e5bd59a708eb93a10f62aecdfc87b5372ef0ed42f7c1f52309` | same | NO |
| `tools/ft/tests/metric-v2.test.js` | `c200ab1d02f83e3b82e836b6d52f27f1aa9ffb128ec0d1fdc152a6b9da79704e` | same | NO |
| `tools/ft/benchmark.js` | `eb4e8d860cccdae9174d06ace08d7ef61a6361fed462876f773ebe70db5564ff` | same | NO (Mission-1 legacy ` M`) |

**The inserted block** (lines 38–64, between the `[ -f ... ]` existence checks at 36–37 and the `# ---- baseline` block):

```bash
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
```

**Design properties, each verified in §۴/§۶:**

1. **Convert only on need** — the probe `node -e 'require("fs").readFileSync(process.argv[1])'` runs first; the path is left untouched when Node already reads it.
2. **No unexpected stop without cygpath** — if Node reads the path, cygpath is never consulted, so a cygpath-less POSIX environment is unaffected. If Node *cannot* read it and cygpath is missing, the script exits `2` with a `FATAL` message rather than proceeding to 6 misleading `ERROR`s.
3. **Paths still target the expected files** — verified by sha256 match against the known-good hashes (§۴).
4. **Spaces handled** — every expansion is quoted (`"$p"`, `"$(...)"`).
5. **Conversion/file errors not hidden** — three distinct `FATAL` paths, each returning `2`, propagated by `|| exit 2`.
6. **Idempotent (no double-conversion corruption)** — `cygpath -m` on an already-Windows path returns it unchanged; proven by identical sha256 of both path shapes (§۴).

---

## 4. Path Verification

**BEFORE conversion (raw, from `pwd`):**

```
METRIC=/c/Users/R.M/AppData/Local/hermes/sandboxes/docker/default/workspace/p2/tools/ft/metric-v2.js
TEST=/c/Users/R.M/AppData/Local/hermes/sandboxes/docker/default/workspace/p2/tools/ft/tests/metric-v2.test.js
```

**AFTER conversion (actual guard output, this environment — real Node reads MSYS paths, so the probe leaves them unchanged):**

```
metric:  /c/Users/R.M/AppData/Local/hermes/sandboxes/docker/default/workspace/p2/tools/ft/metric-v2.js
sha256:  1f7937e5c337e4e5bd59a708eb93a10f62aecdfc87b5372ef0ed42f7c1f52309
test:    /c/Users/R.M/AppData/Local/hermes/sandboxes/docker/default/workspace/p2/tools/ft/tests/metric-v2.test.js
```

**Node read confirmation** — both files are readable by Node and hash to the expected values:

```
1f7937e5c337e4e5bd59a708eb93a10f62aecdfc87b5372ef0ed42f7c1f52309 *tools/ft/metric-v2.js
c200ab1d02f83e3b82e836b6d52f27f1aa9ffb128ec0d1fdc152a6b9da79704e *tools/ft/tests/metric-v2.test.js
```

**Simulated native-Windows Node (the actual defect trigger)** — a fake `node` rejected `/c/*` arguments:

| Scenario | Input path | Result | Exit |
|---|---|---|---|
| 1. Real Node + MSYS path | `/c/.../metric-v2.js` | unchanged (probe passes) | 0 |
| 2. Fake node (rejects `/c/*`) + MSYS path | `/c/.../metric-v2.js` → `C:/.../metric-v2.js` | converted, then readable by real Node: **YES** | 0 |
| 3. Fake node + nonexistent path | `/c/no/such/file/anywhere.js` | `FATAL: cygpath conversion still not readable by Node: C:/no/such/file/anywhere.js` | 2 |
| 4. No cygpath + unreadable path | MSYS path | `FATAL: Node cannot read this path and cygpath is unavailable` | 2 |
| 5. No cygpath + Node-readable path | MSYS path | unchanged (cygpath never needed) | 0 |

**Idempotency** — `cygpath -m` on an already-converted path returns it unchanged; `sha256sum` of the file reached via both path shapes is identical, so a repeated conversion cannot corrupt a valid path.

---

## 5. Mutation Guard Results

**Real guard, real Git Bash, real Node — verbatim final run:**

```
=== FT-METRIC-01 mutation guard ===
metric:  /c/Users/R.M/.../tools/ft/metric-v2.js
sha256:  1f7937e5c337e4e5bd59a708eb93a10f62aecdfc87b5372ef0ed42f7c1f52309
test:    /c/Users/R.M/.../tools/ft/tests/metric-v2.test.js

=== RESULTS ===
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
GUARD_EXIT=0
```

**Simulated controlled failures (fail-closed / false-green proofs):**

| Controlled fault injected | KILLED | SURVIVED | ERROR | Guard verdict | Exit |
|---|---|---|---|---|---|
| Broken metric (`function 123diffTokens` — syntax error) | 0 | 0 | 6 | `GUARD: FAIL — a fault survived or a run was ambiguous; the suite has a blind spot.` | **1** |
| Harmless mutation (comment edit `// v1 compatibility tokenizer:` → `// v1 compatibility tokenizer (harmless edit):` in an exact copy of the real metric) | 6 | **1** | 0 | `GUARD: FAIL — ...` | **1** |
| (none — healthy baseline) | 6 | 0 | 0 | `GUARD: PASS` | **0** |

**Key invariants confirmed:**
- A crash is classified `ERROR`, never `KILLED` (liveness probe at lines 181–200).
- `N_SURVIVED>0 || N_ERROR>0 ⇒ exit 1` (line 244) — no `KILLED=0 SURVIVED=0 ERROR=6` and no `SURVIVED=1` can ever produce `GUARD: PASS` or exit 0.
- Real source untouched after all runs: `metric-v2.js` sha256 = `1f7937e5c337e4e5bd59a708eb93a10f62aecdfc87b5372ef0ed42f7c1f52309`.

---

## 6. Test Matrix

All commands run in **real Windows Git Bash** (`win32 10.0.22631 x64`), repo root `/c/Users/R.M/AppData/Local/hermes/sandboxes/docker/default/workspace/p2`. `cygpath` present unless a scenario removes it.

| # | Test | Command | Environment | Key output | Exit | Status |
|---|---|---|---|---|---|---|
| 1 | Real paths point to the right files + Node reads them | `bash tools/ft/mutation-test.sh` (inspect header) + `sha256sum` | Git Bash, real Node | sha256 `1f7937e5…` / `c200ab1d…` match known-good | 0 | **PASS** |
| 2 | Mutation Guard executes end-to-end | `bash tools/ft/mutation-test.sh` | Git Bash, real Node | `KILLED=6 SURVIVED=0 ERROR=0 (total 6)`, `GUARD: PASS` | 0 | **PASS** |
| 3 | Mutation counts recorded | same as #2 | Git Bash | `KILLED=6 SURVIVED=0 ERROR=0` | 0 | **PASS** |
| 4 | fail-closed: a mutation execution error ends non-zero | `bash "$TEMP/ft-failclosed-test.sh"` (broken metric, `function 123diffTokens`) | Git Bash | `KILLED=0 SURVIVED=0 ERROR=6 (total 6)`, `GUARD: FAIL` | **1** | **PASS** |
| 5a | false-green: `ERROR=6` cannot declare success | same as #4 | Git Bash | no `GUARD: PASS`; exit 1 | **1** | **PASS** |
| 5b | false-green: a surviving fault cannot declare success | `bash "$TEMP/ft-surviving-test.sh"` (harmless comment mutation in exact copy) | Git Bash | `SURVIVED \| MUTHARMLESS \| exit=0 \| 19 passed, 0 failed`; `KILLED=6 SURVIVED=1 ERROR=0`; `GUARD: FAIL` | **1** | **PASS** |
| 6 | Behavior preservation: valid run still reports success | `bash tools/ft/mutation-test.sh` | Git Bash | `GUARD: PASS`, identical to pre-fix run | **0** | **PASS** |
| 7 | Cleanup on success and failure paths | count `/tmp/ftmut.*` and `/tmp/ftfail.*` before/after runs | Git Bash | `ftmut.*` count unchanged (15 pre-existing, none new), `ftfail.*` = 0; trap `rm -rf "$WORK_DIR"` on EXIT | — | **PASS** |
| P1 | Path conversion under simulated native-Windows Node (5 scenarios) | `bash "$TEMP/ft-path-test.sh"` (fake `node` rejecting `/c/*`) | Git Bash + simulated native Node | scenarios 1–5 as tabled in §۴ | 0/0/2/2/0 | **PASS** |
| P2 | Idempotency of `cygpath -m` | `cygpath -m` on already-converted path + `sha256sum` both shapes | Git Bash | identical hashes | 0 | **PASS** |

**`NOT RUN` declarations (per §۴ limitation):**
- **No test was skipped.** All 7 mandatory tests ran on real Windows Git Bash.
- One caveat is not a skip but a scope limitation and is stated explicitly: the *defect trigger* — a **native-Windows Node build rejecting `/c/...`** — does not exist on this box (the installed Node reads MSYS paths). It was therefore **simulated** with a fake `node` wrapper (test P1). A run against a genuinely native Windows Node build was **NOT RUN** because that binary is not installed here. No Linux run or copy was presented as proof of Windows behavior.

---

## 7. Residual Risks

1. **The primary defect was validated by simulation, not by a native-Windows Node binary.** The real Node on this box reads `/c/...` without error, so the `ENOENT` Hermes reported could not be reproduced against a real Node here. The fake-`node` wrapper proves the guard's *logic* converts and fails closed correctly, but a live native-Windows Node run remains unverified (`NOT RUN`). This is the single largest residual risk and it is environmental, not fixable from this box.
2. **Probe cost.** Each invocation now runs up to 2 extra short-lived `node` processes per path (4 total per guard run). Negligible for a 6-mutation guard; noted for completeness.
3. **`node` must be on `PATH` at guard start** for the probe to be meaningful. If `node` is absent entirely, the probe fails and the script exits `2` with `FATAL: Node cannot read this path and cygpath is unavailable` — fail-closed and loud, but the message names cygpath rather than the missing `node`. A missing-`node` guard run was not separately tested.
4. **`benchmark.js` working-tree change is pre-existing** (Mission 1, 3 lines) and was left exactly as found. It is uncommitted and unchanged by this mission; whoever commits later should attribute it correctly.
5. **Untracked `mutation-test.sh`** means the fix has no commit receipt — by design (§۶ forbids commits). The sha256 in §۳/§۸ is the receipt of record.

---

## 8. Hermes Handoff

### Final diff (`tools/ft/mutation-test.sh`, the only changed file)

Context: lines 36–37 are unchanged anchors; the block below is inserted between them and the `# ---- baseline` line.

```diff
   [ -f "$METRIC" ] || { echo "FATAL: metric not found: $METRIC" >&2; exit 2; }
   [ -f "$TEST" ]  || { echo "FATAL: test not found: $TEST"  >&2; exit 2; }
 
+# FT_DIR comes from `pwd`, which in Git Bash for Windows yields an MSYS path
+# (/c/...). The shell tools (sha256sum, cp) read either shape, but a NATIVE
+# Windows Node build rejects /c/... with ENOENT where the Cygwin/Git-for-Windows
+# Node build accepts it. Probe each path: keep it as-is when Node can already
+# open it, convert with `cygpath -m` only when it cannot, and fail loudly if
+# conversion is unavailable or still unreadable — otherwise every mutation
+# would report ERROR with a misleading message (FT-METRIC-01 path-shape fix).
+node_readable() {
+  local p="$1" conv
+  if node -e 'require("fs").readFileSync(process.argv[1])' "$p" 2>/dev/null; then
+    printf '%s' "$p"
+    return 0
+  fi
+  if ! command -v cygpath >/dev/null 2>&1; then
+    echo "FATAL: Node cannot read this path and cygpath is unavailable: $p" >&2
+    return 2
+  fi
+  conv="$(cygpath -m "$p")" || { echo "FATAL: cygpath failed on: $p" >&2; return 2; }
+  if ! node -e 'require("fs").readFileSync(process.argv[1])' "$conv" 2>/dev/null; then
+    echo "FATAL: cygpath conversion still not readable by Node: $conv" >&2
+    return 2
+  fi
+  printf '%s' "$conv"
+}
+METRIC="$(node_readable "$METRIC")" || exit 2
+TEST="$(node_readable "$TEST")" || exit 2
+
 # ---- baseline: the working tree must be in a known state -------------------
```

### Reproduction commands

```bash
cd /c/Users/R.M/AppData/Local/hermes/sandboxes/docker/default/workspace/p2

# Tests 1/2/3/6/7 — the real guard, real Git Bash, real Node
bash tools/ft/mutation-test.sh; echo "GUARD_EXIT=$?"

# Test 4/5a — fail-closed with a syntax-broken metric
bash "$TEMP/ft-failclosed-test.sh"

# Test 5b — false-green with a harmless SURVIVING mutation
bash "$TEMP/ft-surviving-test.sh"

# P1 — path conversion under a simulated native-Windows Node (fake node rejects /c/*)
bash "$TEMP/ft-path-test.sh"

# Source integrity (must be unchanged by any run)
sha256sum tools/ft/metric-v2.js tools/ft/tests/metric-v2.test.js tools/ft/benchmark.js
```

Helper scripts (temp, outside the repo, untracked — nothing in the repo was added for these):
`ft-path-test.sh` (`f3c1a1de3bfd…`), `ft-failclosed-test.sh` (`871fb5ec4f8a…`), `ft-surviving-test.sh` (`e7aac7aabdc5…`).

### Hashes of record

| File | sha256 |
|---|---|
| `tools/ft/mutation-test.sh` (**changed**) | `fe5f0577176555ccced1d3096bdf6db1ccee5660793ae33b71f8c95910a5dcfc` |
| `tools/ft/mutation-test.sh` (before) | `e224f3a1d3ea7989c9afdcf74dd81160d30805f0d868466a36f572a0de4edd3f` |
| `tools/ft/metric-v2.js` (untouched) | `1f7937e5c337e4e5bd59a708eb93a10f62aecdfc87b5372ef0ed42f7c1f52309` |
| `tools/ft/tests/metric-v2.test.js` (untouched) | `c200ab1d02f83e3b82e836b6d52f27f1aa9ffb128ec0d1fdc152a6b9da79704e` |
| `tools/ft/benchmark.js` (untouched this mission) | `eb4e8d860cccdae9174d06ace08d7ef61a6361fed462876f773ebe70db5564ff` |
| HEAD | `fd83a39927300e65396bfef57980c71abdb87c9d` |

### Expected canonical outputs

Healthy run: `KILLED=6  SURVIVED=0  ERROR=0  (total 6)` / `GUARD: PASS — every injected fault was detected.` / exit `0`.
Broken metric: `KILLED=0  SURVIVED=0  ERROR=6  (total 6)` / `GUARD: FAIL` / exit `1`.
Surviving fault: `KILLED=6  SURVIVED=1  ERROR=0  (total 7)` / `GUARD: FAIL` / exit `1`.

---

## 9. Final Status

**`FIXED-SCOPED`** — with one disclosed limitation.

Acceptance criteria from §۵, each met:

| Criterion | Verdict |
|---|---|
| `METRIC`/`TEST` correct in the target environment | **MET** — paths verified by sha256; conversion proven under simulated native Node |
| Mutation Guard gives a correct, reproducible result on a valid run | **MET** — 6/6 KILLED reproduced repeatedly, exit 0 |
| Any real mutation error yields a non-zero exit | **MET** — broken metric → exit 1 |
| No `ERROR` counted as `KILLED` | **MET** — liveness probe gates classification |
| No error scenario turns into a false-green | **MET** — both `ERROR=6` and `SURVIVED=1` exit 1 |
| Unexecuted tests stay explicitly `NOT RUN` | **MET** — only the live native-Windows-Node run is `NOT RUN` (§۶) |

**Disclosed limitation (does not violate any criterion but qualifies the confidence):** the `ENOENT` trigger requires a native-Windows Node build, which is not installed on this box; the fix's conversion and fail-closed behavior were validated against a **simulated** such Node, not a real one. If the independent verifier has a genuine native-Windows Node, re-running `bash tools/ft/mutation-test.sh` under it is the one additional check that would raise this from simulated to fully live.

---

## 10. Git Safety

Explicit confirmation: **no `git commit`, `git push`, `git merge`, `git rebase`, `git tag`, or any release operation was performed in this mission.**

- HEAD at start: `fd83a39927300e65396bfef57980c71abdb87c9d` — HEAD at end: **identical**.
- No file was staged (`git add` never run).
- The single edited file, `tools/ft/mutation-test.sh`, is **untracked**; the edit therefore produced no working-tree diff to any tracked file and no commit is needed for the fix to exist on disk.
- `benchmark.js`'s pre-existing working-tree modification was left exactly as found and was not touched, staged, or reverted.
- No untracked file was deleted or overwritten.
- Scope was held: `metric-v2.js`, `benchmark.js`, `benchmark-report.json`, the DIFF path, and historical results were not modified. No full-repo scan and no model retraining was started.
