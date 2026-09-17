# Chat6 — Mission Report — C6-06 Release branch discipline (stale/shared branch preflight) — 2026-09-17

**Mission ID:** `C6-06` — board `docs/daily-mission-boards/2026-09-17/Chat6.md` (Shift 2), row 6:
«Release branch discipline | Acceptance: stale/shared branch preflight»
**Arena / Session:** Universal Execution Session **SHIFT 2-R** on `arena/01a0b013-p2` — Chat6 lineage
(forked from `arena/01a0a658-p2`, Chat6's Release / database / merge control line per `docs/ARENA_REGISTRY.md`)
**Execution model:** `docs/PARALLEL_FAILOVER_EXECUTION_PROTOCOL.md` + `docs/EXECUTION_CONTROL_PROTOCOL.md`
(effective 2026-09-17 — boards are work pools; ownership is non-exclusive; takeover allowed; governance change
recorded in `docs/daily-audits/2026-09-17-parallel-failover-governance-change.md`)
**Status:** EXECUTED → TESTED → REPORTED → COMMITTED → PUSHED → PR → VERIFIED (see hand-back)
**National GO/NO-GO:** NOT DECLARED (not an Arena authority). **P0/P1:** none created/renamed/closed/re-numbered.

---

## 0) Session resume & takeover record (repository recovery first)

**TAKEOVER-FROM:** prior Chat6 session on `arena/01a0a658-p2` @ `c08356f` (C6-03 STEP B focused tests +
STEP C read-only stats decision package; report at `docs/daily-reports/Chat6/2026-09-15.md`).
**PREVIOUS-STATE:** that commit's delivered content was verified **already on `origin/main`** — content diff of
`tests/config-audit.js` and `docs/daily-reports/Chat6/2026-09-15.md` between `c08356f` and `origin/main` is EMPTY
(delivered via squash-merge path; the commit object itself is not a topological ancestor — which is itself
evidence for the shared-tip/attribution problem this Mission's tooling family addresses).
**CURRENT-STATE:** `origin/main@d262b4e` merged cleanly into the session branch (merge commit; 0 behind after
merge); working tree clean; recovery checks:

| # | Check | Result |
|---|---|---|
| 1 | branch / status / HEAD | `arena/01a0b013-p2`, clean, `c08356f` before merge |
| 2 | `git rev-list --count HEAD` (post `--unshallow`) | full history, no grafts |
| 3 | open PR census (`gh pr list --state open`) | exactly **1**: **#301** (`arena/01a0b00f-p2`) = Chat6-lineage C6-01 re-open (post-governance freeze/stats resync). File set of #301 recorded in §6 for overlap control |
| 4 | recent merges | #300 (C6-01 stats sync 504→505/420→425, merged today 11:01Z), governance series `bdb981e`…`d262b4e` |
| 5 | mission selection | C6-01 re-open **actively in flight** in #301 ⇒ per protocol §4/§9 (non-overlapping files), next board row selected: **C6-06** — zero file overlap with #301 |

**Mission-selection rationale (recorded per protocol §8):** board order after completed C6-01; C6-02/C6-04/C6-05
touch `tools/docs-stats-sync.js` / freeze docs = active overlap with #301 ⇒ deferred; **C6-06** is fully
independent (new read-only tool + one existing test file + this nested report). No `git add -A`, no force-push,
no history rewrite, no reset anywhere in this Mission.

## 1) Baseline gates at merged tree (raw exits, no pipes) — pre-existing state of `main@d262b4e`

| Gate | Raw exit | Result | Ownership |
|---|---|---|---|
| `node tests/run.js` | 0 | 35/35 | — |
| `node tests/secret-scan.js` | 0 | 12/12 | — |
| `node tests/config-audit.js` | 0 | 15/15 (C6-03 pin intact) | — |
| `node tests/runbook-coverage.js` | 0 | **72/72** ← host-file baseline for §3 | this Mission |
| `node tests/docs-freeze-marker.js --check` | **1** | 11/14 — governance series added 1 doc + stale hashes | **PR #301 (open)** |
| `node tools/docs-stats-sync.js --check` | **1** | 425→427 drift (6 rows) | **PR #301 (open)** |
| `node tools/docs-refs-check.js` | **1** | **119** fresh stale refs | C7-07/refs owner |
| `node tests/docs-metrics.js` | **1** | 9/11 (360 root docs measured) | **PR #301 (open)** |
| `node tests/documentation-map-coverage.js` | **1** | 20/23 | **#301 lifts to 22/23; residual = orphan item C7-07** |
| `node tests/test-coverage-report-coverage.js` | 0 | 33/33 (test-file count 505 = 497 root + 8 API live-matched) | — |
| `node build.js --check` | 0 | green | — |

The four reds are the measured pre-existing state of pristine `main@d262b4e` (identical to #301's own pristine
measurements in its PR body). **This Mission's neutrality obligation: Δ0 on all of them.**

## 2) Implementation — `tools/branch-preflight.js` (NEW, read-only)

Release branch discipline as machine-checkable preflight (board acceptance wording). **The tool never deletes,
moves, or rewrites anything** — deletion of stale branches stays an owner decision; the tool only reports.

| Worksheet | Behavior |
|---|---|
| `--fleet [--json]` | Census of `refs/remotes/origin/*` (fallback `refs/heads/*`, source recorded in output): `MERGED-STALE` (tip ancestor/equal of main ⇒ nothing to deliver; deletion candidate, advisory), `LIVE`, `AGED` (> `--stale-days`, default 14), plus **shared-tip clusters** (≥2 branch names on the same commit = measured shared/duplicate-branch signal). Always exit 0 (advisory) unless execution error |
| `--branch <name> [--json]` | Strict preflight for a release-candidate branch. Hard (exit 1): **BP-1** ref resolves, **BP-2** tip is NOT ancestor/equal of main, **BP-3** diff main…tip non-empty. Advisory: **BP-4** base ≤ `--behind-warn` (25) commits behind main, **BP-5** tip age, **BP-6** tip not shared with other branch names |
| `--selftest` | Hermetic: builds a toy repo in `mkdtempSync` (merged + live + shared-tip + backdated commit), 17 assertions, `finally` cleanup; no network, no repo state touched |

Design honesty: shallow clones get a graft-limitation note in `notes`; fleet runs offline on fetched refs
(`--fetch` is opt-in); squash-merged branches remain topologically `LIVE` (attribution needs PR metadata —
documented limitation, §5-F1).

## 3) Focused tests — extended `tests/runbook-coverage.js` in place (72 → 77 checks)

**Deliberate no-new-file decision (test-count trap):** a new root `tests/*.js` would move the frozen test count
505→506 and re-drift `docs/TEST_COVERAGE_REPORT.md` — the exact file PR #301 just resynced; so per the C6-03
precedent (extend, don't add), five checks were appended as section `RB-BR — پیش‌پروازِ شاخه‌های انتشار`:

1. tool exists; 2. hermetic `--selftest` exit 0; 3. `--fleet --json` exit 0 + JSON shape (all five counter keys
numeric) — deterministic regardless of which refs a clone fetched; 4. **repo-level bite**: `--branch main` must
hard-FAIL (exit 1, verdict FAIL — `main` can never have anything to deliver against itself); 5. no-worksheet
invocation exits 2 (interface contract). Official counts untouched: `tests/` root still 497, `tests/api/` 8.

### Bite proof (C6-03 protocol: the test must detect tool degradation)

- Mutation: hard-fail gate replaced by `const hardFail = false;` (single-line sed) ⇒
  `node tests/runbook-coverage.js` → **EXIT 1**, bite check red (`exit=0` where 1 required), 75/77.
- Restore: reversed edit; `sha256` before mutation = after restore = `9c7f16258e91f17a536719434d85d7c42b409a359f824ef35381d45f828b4adc` (**HASH_IDENTICAL**); re-run → **77/77 EXIT 0**.

## 4) Measured fleet evidence on this repo (why the Mission mattered)

`node tools/branch-preflight.js --fleet --json` against `refs/remotes/origin/*` (233 fetched read-only; exit 0):

| Measure | Value |
|---|---|
| Remote branches (excl. main/HEAD) | **231** |
| **MERGED-STALE** (tip ancestor/equal of origin/main) | **191 (82.7%)** — advisory deletion candidates |
| LIVE (topologically unmerged) | 40 — incl. squash-delivered branches (F1) |
| AGED (>14 days) | 0 — repo churn is recent |
| **Shared-tip clusters** | **5 clusters / 13 branches** — incl. `arena/01a09881-p2` ≡ `feat/chat7-merge-queue-stabilization` @ `77cda604`, and `docs/freeze-rc28-playbook` ≡ `fix/bundle-recovery-commands` @ `ca28b716`; largest = 5 `alert-autofix-*` names on `b9e994ac` |

Demo preflight: `--branch arena/01a0a658-p2` → PASS with advisory **BP-4: 75 commits behind origin/main**
(stale-base risk correctly flagged on this very session's lineage branch).
**No branch was deleted or modified by this Mission.** Cleanup of the 191 candidates = owner decision (§6).

## 5) Findings

- **F1 (informational, inherent):** topology cannot distinguish LIVE from squash-merged-elsewhere; attribution
  needs PR metadata (`gh`) — future C6-07 territory (board row 7: true-merge attribution gate). Not built here
  (scope isolation).
- **F2 (evidence for owner):** 191 stale remote branches incl. merged `alert-autofix-*` and consumed `arena/*`
  branches; deletion is safe-but-owner-action (some are DRAFT PR heads — PR state must be reconciled first).
- **F3 (environment, recorded):** sandbox clone had a restricted fetch refspec (main only); widened read-only
  via `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune` for the census; tool degrades gracefully
  (falls back to local heads, source recorded) when remote refs are absent.
- **F4 (overlap control):** zero files in common with open PR #301 (§6); both gates it fixes stayed at the exact
  pristine-main red state before and after this Mission (Δ0 proven in §7).

## 6) Scope / files / Git discipline of THIS Mission

- **Files changed:** `tools/branch-preflight.js` (NEW, read-only tool) + `tests/runbook-coverage.js`
  (appended RB-BR section, 72→77) + this nested report. **No product code, no frozen root doc, no manifest,
  no other Arena's file.** Overlap check vs #301's file set (`DOCS_CONSISTENCY_REPORT.md`,
  `DOCS_FREEZE_v1.0.0-rc44.md`, `DOCS_HEALTH_REPORT.md`, `DOCS_METRICS.md`, `DOCUMENTATION_MAP.md`,
  `docs/daily-reports/Chat6/2026-09-17.md`, `tools/docs-stats-sync.js`): **empty intersection**.
- `git add` used with explicit paths only (never `-A`); no force-push; no rewrite; no reset of foreign work.

## 7) Post-work gates (raw exits) — neutrality proven

| Gate | Before (§1) | After | Δ |
|---|---|---|---|
| `tests/run.js` | 0 (35/35) | **0** | 0 |
| `tests/secret-scan.js` | 0 (12/12) | **0** | 0 |
| `tests/runbook-coverage.js` | 0 (72/72) | **0 (77/77)** | +5 scoped checks |
| `tests/config-audit.js` | 0 (15/15) | **0** | 0 |
| `tests/test-coverage-report-coverage.js` | 0 (33/33) | **0** | 0 — test count 505 untouched |
| `node build.js --check` | 0 | **0** | 0 |
| `docs-freeze-marker --check` | 1 (11/14) | **1** | 0 — #301's scope |
| `docs-stats-sync --check` | 1 (425→427, 6 rows) | **1 (same 6 rows)** | 0 — #301's scope |
| `docs-refs-check.js` | 1 (119) | **1 (119)** | 0 — this report cites only existing paths |
| `docs-metrics.js` / `documentation-map-coverage.js` | 1 (9/11) / 1 (20/23) | **1 / 1 (same)** | 0 — #301's scope |

## 8) NOT-RUN (exact reasons)

| Item | Reason |
|---|---|
| `tests/smoke.js` 547 / full `scripts/run-all-tests.sh` battery | No product code delta (tool + test-pin only); precedent: C6-03 delivery ran the applicable gate battery, not the boot suites |
| CI checks as an action | No workflow edits; CI availability separately constrained (billing, RISK-O-007); PR check state reported as-is |
| Branch deletion (the 191 candidates) | Tool is read-only by design; deletion = owner decision incl. PR-state reconciliation |
| Freeze/stats/refs remediation | Owned by open PR #301 + C7-07 (refs); this Mission stayed Δ0 |
| PG/Redis live paths | No product code change; no live PG/Redis in sandbox |

## 9) Hand-back

**MISSION:** C6-06 — Release branch discipline (stale/shared branch preflight), Shift 2 board row 6.
**STATUS:** EXECUTED → TESTED → REPORTED → COMMITTED → PUSHED → PR (see delivery fields below).
**WORK DONE:** read-only preflight tool (fleet census + per-branch gate + hermetic selftest) + 5-check pin in the
existing runbook-coverage suite (72→77, count 505 untouched) + bite proof + full-repo census evidence.
**FILES:** `tools/branch-preflight.js` (new), `tests/runbook-coverage.js` (extended), this report.
**TESTS:** selftest 17/17 · runbook-coverage 77/77 · run.js 35/35 · secret-scan 12/12 · config-audit 15/15 ·
test-coverage-report-coverage 33/33 · build --check 0. Bite: mutation ⇒ EXIT 1 red, restore sha256-identical.
**EXIT CODES:** recorded inline above (raw, no pipes).
**COMMIT / PUSH / PR / MERGE / MAIN VERIFICATION:** appended to the delivery log below this report at each step.
**BLOCKER:** none.
**TAKEOVER-FROM:** prior Chat6 session `arena/01a0a658-p2@c08356f` — content verified already delivered to main;
no restart needed; this Mission is the next unstarted board row, selected for zero overlap with open PR #301.

**Suggested next actions (work pool — any available Arena):**
1. Owner: reconcile + delete stale branches from the §4 census (start with merged non-PR-head branches).
2. **C6-07** (true-merge attribution gate) — directly motivated by F1/squash-attribution evidence.
3. Merge review of **PR #301** (lifts the four main-line doc-gate reds measured in §1).

---

## 10) Delivery log (appended post-facto, branch-level receipts)

| Step | Evidence |
|---|---|
| COMMIT | `ddb2ea8` — C6-06 tool + focused pin + this report (explicit paths, no `git add -A`) |
| INTEGRATION | shared-branch reconciliation: Chat10 `b029b96` (delivered by its own session via **#304 MERGED `4212895`**) + receipts `a15d9e2` preserved; 1-line refs fix `5150a27` (120→119 Δ0); main re-merged after #303/#304/#305 (conflict in the Chat10 report resolved as HEAD-side = original + fix) |
| PUSH | `arena/01a0b013-p2` → `8a034cc` (three rejected attempts absorbed by fetch→merge→push; never force) |
| PR | **#310** — MERGEABLE; checks at merge: build/SAST/secret-scan/SCA/SBOM/WAF/CodeRabbit/circleci SUCCESS, CodeQL NEUTRAL; remaining pending = Codacy ×2 + CodeQL js-ts + DAST (known-slow externals; same state class as #300/#303/#304/#305 merges) |
| MERGE | `gh pr merge 310 --merge` → merge commit **`e13e37e`** on `main` (true merge, not squash) |
| MAIN VERIFICATION | `git merge-base --is-ancestor ddb2ea8 origin/main` ⇒ **REACHABLE** (true-merge attribution — the C6-07 property, exercised by this very delivery); Chat10 `b029b96` also became reachable via this merge. Gates re-measured at `main@e13e37e`: run.js 0 · runbook-coverage 0 (77/77) · secret-scan 0 · freeze-marker 0 · stats-sync 0 · docs-metrics 0 · selftest 17/17 · refs-check 1 (119 = pre-existing C7-07 backlog, Δ0) |
| VERDICT | **DELIVERED — TESTED + COMMITTED + PUSHED + MERGED + VERIFIED ON MAIN** |

**STATUS:** DELIVERED. Next unstarted board rows for the work pool: C6-02/C6-03 (docs-count & docs-refs policy), C6-04/C6-05 (RC45 prerequisites/bump — now unblocked by #303's resync), C6-07 (true-merge attribution gate — directly motivated by F1 and by this delivery's squash-vs-merge evidence: #304 squashed, #310 true-merged).
