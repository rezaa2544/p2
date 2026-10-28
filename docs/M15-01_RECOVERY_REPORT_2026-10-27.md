# M15-01 FINAL RECOVERY — EVIDENCE REPORT (2026-10-27)

Snapshot taken at `2026-10-27T14:5xZ` on branch `arena/f75d9f00-p2`, PR **#498**.

Nothing in this file is a plan or an intention. Every row is either a measured result with
its command/run id, or it is explicitly labelled **NOT RUN** / **BLOCKED**. Where a number
came from a local run it says so; where it came from GitHub Actions it names the run and the
job id and says whether the *step level* or the *log level* was readable.

---

## 1. Identity of what was measured

| Field | Value |
|---|---|
| Branch | `arena/f75d9f00-p2` |
| Head (mission 1 record) | `06ba3da3a16f8cc60e0c4ec9039f1029b65f91cb` |
| Head (mission 2, see §9) | recorded in §9.1 after the re-emit |
| Source commit the registry evidence was produced on | `523b6d366157c202335ff385ed1808f241798389` |
| Ancestry | `06ba3da3` ← `523b6d36` ← `0cc0ed42` ← `dcc7060e` ← `fff1beae` (origin/main) |
| Metadata commit shape | `git rev-list --parents -n 1 06ba3da3` = 2 tokens (single parent); `git diff --name-only --no-renames 523b6d36 06ba3da3` = exactly `docs/verification/VERIFICATION_REGISTRY.json` |
| Registry | `status=RUNTIME_VERIFIED`, `binding_mode=lineage`, `closure_scope=[M15-01-A,B,C]`, `blocked_items=29`, witness 16 paths |
| PR | #498 → `main` |

---

## 2. The four defects that were actually broken, and the measurements that prove it

### 2.1 The strict gate could never pass again (root cause of "632/66" and "audit exit 2")

V-02 (and the provenance audit) required `head_bound == evidence head`. Any commit after an
evidence run therefore reddened every binding check permanently, and the only repair was to
re-run the whole suite and re-emit after **every** commit.

Measured on a clean checkout of `origin/main` (`fff1beae`, nothing local):

```
node tools/strict-verification-gate.js   → exit 1, RESULT 633 pass / 65 fail
                                           every failure: V-02/G9
                                           head_bound=bf263bf2 vs evidence_sha=fff1beae
node tools/registry-provenance.js --audit → exit 2, 29 UNBOUND, same head-bind mismatch
```

`registry-provenance.js` was not merely *stricter*: it used a different rule
(`DEPENDENCY_SETS` + `provenance.dependency_hash`, a field no item carries), which is why one
file produced "65 fails" from one tool and "29 UNBOUND" from the other. Two implementations,
two contracts.

**Repair.** `tools/lib/verification-witness.js` is now the single implementation, called by the
gate, the provenance audit and the registry builder:

* `binding_mode: "legacy"` — `head_bound` must equal the evidence head (checkout HEAD, or the
  parent of a single-parent registry-only metadata commit). Unchanged; old registries still
  work.
* `binding_mode: "lineage"` — `head_bound` is the immutable **source** commit: it must be a
  real commit **and** an ancestor of the checkout. The registry carries `witness.paths`
  (must equal the set **recomputed from the registry**, so scope cannot be shrunk after the
  fact) and `witness.blobs` (git blob sha1 at the source commit, must match at the source
  commit **and** at HEAD). An unrelated docs/dependency commit keeps the evidence valid; any
  edit to a witnessed path makes it stale and it is **rejected**, naming the path.

Measured after the repair, on the landed commit:

```
node tools/strict-verification-gate.js          → exit 0, RESULT 709 pass / 0 fail
                                                  EVIDENCE_SHA 523b6d36 (metadata-only registry commit)
                                                  VERIFIED_ITEMS 3/32 (in closure scope: 3/3, blocked: 29)
                                                  VERDICT VERIFIED
node tools/registry-provenance.js --audit       → exit 0, HEAD-BIND VALID (lineage)
                                                  WITNESS 16 paths; 0 changed since 523b6d36
                                                  VERDICT PROVENANCE VALID
```

And the property that was previously impossible, proven on this very repository: a README-only
commit placed on top of the landed commit left the gate at **709/0, VERDICT VERIFIED** (the
same commit would previously have produced 65 fails). The commit was then reset away; the
branch head is unchanged.

### 2.2 V-15 and V-16 were jointly unsatisfiable

V-15 capped the headline at the weakest item (29 honest legacy records ⇒ `UNKNOWN`), while
V-16 refused a green verdict when nothing verified. Both fire on an honest registry, so *no*
registry of this repository could ever pass — a permanent red that rewards fabrication.

**Repair.** Closure is measured against an explicit `closure_scope`, with
`blocked_items` declared:

| Check | Property |
|---|---|
| V-19a | `closure_scope` present, duplicate-free, subset of `expected_ids` |
| V-19b | every in-scope item is verifying **and** carries an Arena PASS **and** is not blocked |
| V-19c | no item outside the scope claims a verifying status |
| V-19d | no blocked item is inside the scope |
| V-19e | `blocked_items` equals the real count |
| V-15 | headline ≤ weakest **in-scope** item; empty scope is legal but forces `UNKNOWN` |
| V-15b | a registry with blocked items can never be `CERTIFIED` |
| V-16 | refuses the green verdict when the scope verifies nothing |

The 29 legacy `A-01..A-29` records stay `UNKNOWN`/blocked and are counted; the three M15-01
items are `RUNTIME_VERIFIED` **only inside the declared scope and only as a self-review**
(see §7).

### 2.3 The intermittent `serious: color-contrast` was motion, not colour

axe-core derives contrast from the **computed** colour at sample time. The harness scanned
while CSS animations/transitions were in flight:

* `reducedMotion: 'reduce'` was set, but the only `@media (prefers-reduced-motion:reduce)`
  rule in the stylesheet killed 3 `.hgt-*` animations out of **12 keyframes and 38
  transitions**;
* the login scan had **no** settle wait at all, and every other view used
  `waitForTimeout(150)` — shorter than `pop .18s`, `fslide .16s` and `sh 1.3s`, and dependent
  on machine speed; the app's own timers (`attTimerPaint` every 1 s, `bellLiveTick`,
  `syncConflictsTick`) can start a fresh transition just before sampling.

Mid-transition colours (`toast` fading in from `opacity:0`, `nav-item` between `--muted` and
`--green-text`) straddle 4.5:1 — so the finding appeared or disappeared depending on the
millisecond. No suppression, no severity change, no rule disabled.

**Repair.** The reduced-motion block now neutralises **all** motion
(`*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;…}`)
— a real WCAG 2.3.3 improvement — and `tests/helpers/a11y-quiescence.js` settles the page
before **every** `AxeBuilder.analyze()` (`finish()` for finite animations, `cancel()` for
infinite ones, two frames, then a bounded re-check). If anything fails to settle the scan does
not happen and the run **fails**; a browser without `getAnimations` fails closed too.

Regression test `tests/a11y-motion-determinism.js`: **46 checks, 0 failures**, browser-free —
14 source/artifact guards, 10 behavioural checks of the barrier against a stubbed DOM,
4 fail-closed checks of `quiesce()`, and **12 in-process mutations** (restore the narrow
rule, drop `iteration-count`/`transition-duration`/the whole block/`!important`, remove the
barrier from `scan`, put `waitForTimeout(150)` back, drop the require, drop
`reducedMotion`) each of which reddens the matching guard while the untouched source stays
green.

**Honest limit:** the *browser* run (`tests/a11y-runtime.js`) is **NOT RUN** — playwright and
`@axe-core/playwright` are not dependencies of this repository, so the harness exits 3
(environment prerequisite) everywhere, including CI. The deterministic suite above is the
guard; "zero serious findings in real Chromium on this SHA" is not claimed.

### 2.4 `main` was unbuildable (this is why *every* workflow was red)

`npm ci` has failed on `main` since `fff1beae` (the Dependabot bump of
`@opentelemetry/resources` 2.12.0 → 3.0.0). Reproduced locally:

```
$ npm ci --dry-run
npm error ERESOLVE could not resolve @opentelemetry/resources@3.0.0
npm error peer @opentelemetry/api ">=1.10.0 <1.11.0" from @opentelemetry/resources@3.0.0
npm error Found: @opentelemetry/api@1.9.1
# after bumping api to ^1.10.0, a second conflict appears:
npm error peer @opentelemetry/api ">=1.0.0 <1.10.0" from @opentelemetry/context-async-hooks@2.12.0
npm error peer @opentelemetry/api ">=1.0.0 <1.10.0" from @opentelemetry/sdk-trace-node@2.12.0
```

The 3.0.0 line needs a simultaneous major upgrade of the whole OTel family, so the smallest
honest repair is to restore the last resolvable line (`resources` 2.12.0, matching the 2.12.0
peers already pinned). `npm install --package-lock-only` removes exactly the six nested
duplicate `resources` trees the conflict created, adds nothing, and moves nothing else;
`npm ci` now resolves 194 packages, `server/tracing.js` loads, `npm test` is 547/547.

CI consequence, measured: on the same commit before the repair, `Payesh Strict Verification
Gate` failed at *Install dependencies* with every subsequent step skipped; `Runtime
Reliability`, `Security Program (SAST · SCA · SBOM · DAST · Secret)` and
`observability-regression` were red. After the repair those three are green and the strict
gate passes (§3). Finishing the OTel major upgrade is a separate migration and is **NOT** part
of this change.

---

## 3. Current-SHA check results

GitHub Actions, commit `06ba3da3`, PR lane (`pull_request` → `main`), read via the jobs API.

| Check | Result | Evidence |
|---|---|---|
| STRICT — 3-AI Evidence Gate | **PASS** (1m32s) | run `40521544265` job `122249680378` |
| A-30 V-01..V-12 negative fixtures (step) | **PASS** | same job, step 5 |
| A-30 contract suite (step) | **PASS** | same job, step 6 |
| M15-01 acceptance properties + mutation matrix (step) | **PASS** | same job, step 7 |
| Strict verification contract (step) | **PASS** | same job, step 8 |
| Core tests / `npm test` (step) | **PASS** | same job, step 9 |
| Production truth gate (step) | **NOT RUN** — `if: always() && env.DATABASE_URL != ''`; no `DATABASE_URL` secret | same job, step 10 |
| Security Program (SAST · SCA · SBOM · DAST · Secret) | **PASS** | run `40521544283` |
| Runtime Reliability | **PASS** | run for this commit |
| observability-regression | **PASS** | run for this commit |
| Codacy / CodeQL / SecurityCodeScan / WAF & nginx / outbox-lease / static-and-promtool | **PASS** | PR #498 check list |
| Node.js CI `build (22.x)` | **NOT RUN (in progress at snapshot)** | run `40521544408` — not yet concluded when this snapshot was taken |
| Current-head PITR + HA failover + Redis Sentinel failover (single-runner E3/DR, **not** E4) | **PASS** | run `40521544368`, job "Current-head PostgreSQL PITR and HA failover plus Redis Sentinel failover" |
| Isolated E3 runtime run a/b + independent artifact ZIP checksum/content audit (single-runner **E3**, not E4) | **PASS** | run `40521544368` — all three jobs success on `06ba3da3` |
| Fortify AST Scan | **FAIL — BLOCKED (owner credential)** | see §5 |
| APIsec | **FAIL — BLOCKED (owner credential)** | see §5 |
| Jscrambler Code Integrity | **FAIL — BLOCKED (owner credential)** | see §5 |
| Payesh Watch (Notion write) | **FAIL** | job `122249681846`, step "Watch — classify live GitHub state and record verdict to Notion" (the *other* Notion path, `notion-sync.yml`, succeeds — see §7) |
| Payesh Strict Verification Gate (push-triggered twin, `arena/**`) | **FAIL — expected, owner decision OD-2** | only failure is V-06 (HEAD ⊆ origin/main), which cannot hold for an unmerged branch head; the PR-lane twin of the same commit is PASS |

Local, same commit (`npm ci` clean, `node_modules` resolved):

| Command | Result |
|---|---|
| `node tools/strict-verification-gate.js` | **709 pass / 0 fail**, exit 0 |
| `node tools/registry-provenance.js --audit` | **VALID (lineage)**, 0 changed witnessed paths, exit 0 |
| `npm test` | **547/547**, exit 0 |
| `node tests/verification-binding-contract.test.js` | **24 checks / 0 fail** |
| `node tests/a11y-motion-determinism.js` | **46 checks / 0 fail** |
| `node tests/strict-verification-gate.negative.test.js` | **55 pass / 0 fail** |
| `node tests/strict-verification-gate-a30.test.js` | **21 pass / 0 fail** |
| `node tests/m15-01-registry-strict-verification.test.js` | **32 checks / 0 fail** (8 mutation cells, each proven non-vacuous) |
| `node tests/false-green-defense.test.js` | **29/29** |
| `node tools/verification-legacy-inventory.js` | **15 checks / 0 fail** |
| `node tests/a11y-regressions.js` / `a11y-audit.js` | 54/0 and 43/43 |
| `node tests/secret-scan.js` | **13/13** (see §6) |
| `node build.js --check` | byte-identical `index.html`, guide in sync, authz in sync |
| `node tools/m15-01-e4-verify.js` | **BLOCKED, exit 2, 7/7 criteria blocked**, `report_sha256=562832b2c3b3dba3332e1eb1fe4db3e61c053748777a1a5c1a8a62c18c4de98b` |

### 3.1 Raw logs are still not obtainable from this environment — stated, not hidden

For every run in this session, `gh run view --log-failed` and
`gh api …/actions/jobs/<id>/logs` both fail with `EOF` against
`results-receiver.actions.githubusercontent.com` / `productionresultssa17.blob.core.windows.net`.
What *is* readable is the jobs/steps API (name + conclusion per step) and, when a workflow
uploads them, artifacts. So §3 rows are **step-level**, and the suite-level numbers quoted are
the ones produced on the same commit **locally** and committed as
`docs/verification/evidence/*.log` (hashed into the registry witness). The specific run named
in the directive (`40491800409`, head `46e3a448`) has **zero artifacts** and its logs remain
unreachable; it is also 4 commits behind `main`, so it is not evidence for any current SHA.

---

## 4. E4-01 … E4-07, individually

Machine-codified in `tools/m15-01-e4-verify.js` (`CLOSURE_CHECKLIST_SPEC`); fresh run on
`06ba3da3` → `overall_status: BLOCKED`, `counts {total:7, pass:0, fail:0, blocked:7}`,
`exit 2`.

| # | Criterion | Status | What is missing (owner-exclusive) |
|---|---|---|---|
| E4-01 | Multi-node PG 16+ Primary + streaming Standby on distinct hosts | **BLOCKED** | two staging hosts + `E4_PG_PRIMARY_DSN`/`E4_PG_STANDBY_DSN`/`E4_CONFIRM_ISOLATED_STAGING` |
| E4-02 | Off-site cross-region `pgBackRest` repo + WAL continuity | **BLOCKED** | backup host, cross-region bucket, `E4_BACKUP_REPO_REGION`, `E4_PGBACKREST_STANZA` |
| E4-03 | Isolated recovery host PITR to target, 26 migration checksums | **BLOCKED** | recovery VM + `E4_PITR_RESTORED_DSN`, `E4_PITR_TARGET_UTC` |
| E4-04 | Multi-host `PgBouncer` transaction pooling + measured reroute RTO | **BLOCKED** | PgBouncer host + admin DSN + drill evidence JSON |
| E4-05 | `>= 3` cross-host Redis Sentinel quorum, promoted-master persistence | **BLOCKED** | three Sentinel hosts + `E4_REDIS_SENTINEL_ENDPOINTS` |
| E4-06 | Observability failure domain disjoint from the data plane | **BLOCKED** | monitoring host + `E4_PROMETHEUS_URL`/`E4_ALERTMANAGER_URL` + real receiver |
| E4-07 | Live on-call `MTTA`/`MTTR` acknowledgement trail | **BLOCKED** | a human on-call roster and a real alert→ack trail |

Single-runner E3 evidence (the isolated runtime/DR workflows) is **not** E4 and is never
presented as E4 in this report. At snapshot time the E3 workflows on this SHA were still
running; they are recorded as NOT RUN, not as passing.

---

## 5. Vendor scans — cause per tool, never presented as E3/E4

| Tool | Run/job | Failing step | Root cause | Category |
|---|---|---|---|---|
| Jscrambler Code Integrity | `40521544564` / `122249682114` | "Fail closed when Jscrambler credentials or configuration are missing" | repository secrets `JSCRAMBLER_APPLICATION_ID`, `JSCRAMBLER_SECRET_KEY`, `JSCRAMBLER_ACCESS_KEY` (and a tracked `jscrambler.json`) are absent — the step's own `if:` evaluates the presence expression | **BLOCKED — owner credential** |
| Fortify AST Scan | `40521544400` / `122249681422` | "Fail closed when Fortify credentials are unavailable" | `FOD_CLIENT_ID`/`FOD_USER` (and `SSC_TOKEN`, `SC_CLIENT_AUTH_TOKEN`, `DEBRICKED_TOKEN`) are absent | **BLOCKED — owner credential** |
| APIsec | `40521545892` / `122249687266` | "Fail closed when APIsec credentials are missing" | `apisec_username` / `apisec_password` are absent | **BLOCKED — owner credential** |

These are fail-closed *by design*: the workflow refuses to pretend a scan happened. The
smallest owner action is to add the named repository secrets; no code change can substitute.

---

## 6. SI-013

`node tests/secret-scan.js` on `06ba3da3`: **13/13 green, exit 0**.

The one exception the scanner carries is narrow and mutation-tested: only `"checksum"` keys
inside `docs/arena-evidence/**/*.json` are skipped, and its negative fixtures prove that
`api_key` or `token` in that same path still fails, and that a value in `tools/ft/*.js` is
still caught. So the **active-tree** scan is genuinely green under Owner Option A.

What is *not* closed is the historical question SI-013 actually asks — whether any of the ~81
long-hex candidates that once appeared in `docs/arena-evidence/**` and `tools/ft/**` were real
credentials requiring rotation and/or history purge/notification. That is an owner/security
decision (no history rewrite was performed and none is attempted here).

---

## 7. Status of the remaining closure inputs

| Input | Status | Note |
|---|---|---|
| Final SHA + tree + ancestry recorded | **PASS** | §1 |
| Full canonical suite with accessible suite-level output | **PARTIAL / NOT RUN** | local suites green (§3); CI step conclusions readable, raw logs unreachable (§3.1); Node.js CI still running at snapshot |
| Strict gate expected exit code supporting closure | **PASS** | exit 0, 709/0, locally and in CI (PR lane) |
| Real registry certification | **PASS (scope-limited)** | `RUNTIME_VERIFIED` for `M15-01-A/B/C`; 29 legacy items remain blocked; `CERTIFIED 0` |
| Gate + audit agreement | **PASS** | both exit 0, same rule, same verdict |
| a11y flake fixed + regression-tested | **PASS (mechanism)** / **NOT RUN (browser)** | §2.3 |
| All required current-SHA checks passing | **FAIL** | vendor credentials (§5), Payesh Watch Notion write, Node.js CI pending |
| All seven E4 criteria evidenced | **BLOCKED** | 0/7, §4 |
| Vendor scans genuinely passing | **BLOCKED** | §5 |
| SI-013 resolved | **PARTIAL** | active tree green; history/rotation decision open |
| OD-2 (gate on `push: arena/**` vs V-06 push-mode ancestry) | **OPEN — owner decision** | measured: on a branch push the *only* gate failure is V-06, which by definition cannot hold for an unmerged head; the PR lane passes (§3). Untouched deliberately. |
| OD-3 (single-parent landing of the registry commit) | **OPEN — owner decision** | this branch is landed as a single-parent metadata commit, so OD-3's constraint is satisfied *here*, but the repo-wide landing strategy is still the owner's |
| OD-4 (official item count 29 / 32 / 39) | **OPEN — owner decision** | closure no longer depends on it (V-19 measures the scope), but the contract count is unratified |
| PR #484 | **OPEN / UNSTABLE** at `b31e2bdb` | different branch; not modified, not merged, not closed by this work. Its own red checks are listed on the PR. |
| Independent review on this exact SHA | **NOT DONE** | `reviews_recorded.arena` is self-review by the same session; the repo has one reviewer slot, so `INDEPENDENTLY_VERIFIED`/`CERTIFIED` are unreachable (V-18) |
| Docs + Notion synchronized and read back | **PASS (automated status sync) / PARTIAL (narrative)** | docs updated in this branch. Notion: `notion-sync.yml` ran on this head, step "Reconcile current GitHub state into Notion" **PASS**, and the workflow PATCHes then re-GETs the block it wrote (built-in read-back). The narrative report itself was **not** pushed to Notion: the interactive Notion connector returned `auth_error` ("connection is no longer valid") and per its own instruction was not retried, and `Payesh Watch` (the other Notion writer) fails on its step. Reconnecting Notion is an owner action. |

---

## 8. Decision

Every item that could be closed by engineering work on this branch has been closed and has a
measured result attached. The items that remain are exactly those that require either
repository secrets / infrastructure the sandbox cannot provision (E4-01..E4-07, Fortify,
APIsec, Jscrambler, Production truth gate `DATABASE_URL`, the Notion write token) or an owner
ruling (OD-2, OD-3, OD-4, the official item count, SI-013 history disposition) or a second
reviewer (independent review / `CERTIFIED`).

### The single owner action that would unblock the largest number of rows

Nothing below is a request for the owner to *do engineering work*; each item is an action only
the owner can perform, with the smallest form of it:

1. Add the four sets of repository secrets: `JSCRAMBLER_*` (3), `FOD_*`/`SSC_TOKEN`/
   `SC_CLIENT_AUTH_TOKEN`/`DEBRICKED_TOKEN`, `apisec_username`/`apisec_password`,
   and `DATABASE_URL` (which alone enables the currently-skipped Production truth gate).
   Effect: three vendor rows move from BLOCKED to a real verdict, and the truth gate runs.
2. Provision the seven E4 targets in §4 (or rule them out of scope). Effect: E4-01..E4-07 can
   move from BLOCKED to measured.
3. Rule on OD-2 (gate trigger vs V-06), OD-3 (landing strategy) and OD-4 (official item
   count). Effect: removes the only red step of the strict-verification workflow on branch
   pushes and ratifies the contract count.
4. Decide the SI-013 history disposition (rotate/purge/notify, or accept with expiry).
5. Provide a second reviewer slot if `INDEPENDENTLY_VERIFIED`/`CERTIFIED` is ever to be
   reachable (V-18 caps it at one slot), and reconnect the Notion connector if the narrative
   report is to be mirrored there.

**M15-01 BLOCKED — OWNER/INFRASTRUCTURE ACTION PROVEN NECESSARY**


---

# MISSION 2 — evidence recovery, gate reconciliation, closure attempt (2026-10-27, later the same day)

## 9.1 Truth as re-read at the start of this mission

| Field | Value | How it was read |
|---|---|---|
| `origin/main` | `fff1beae09ff45d69e554f8c000a9d15b75d968c` (`2026-10-27T17:34:47+03:30`) | `git fetch` + `git log -1 origin/main` |
| `fff1beae^{tree}` | `07979cd4ee3f0fef4418503f6e3529419e401070` | `git rev-parse` |
| PR #497 | **MERGED** — "docs: make owner intervention exceptional and require autonomous team execution" (`docs/owner-action-minimization-policy`) | `gh pr view 497` |
| PR #495 | **CLOSED, not merged** — "rebind step 2/2 … CONTRACT PASS 698/0" | `gh pr view 495` |
| PR #484 | **OPEN / UNSTABLE**, head moved during this session (`34c654d1` → `5741249d`) | `gh pr view 484`, `gh run list` |
| PR #498 (this work) | **OPEN / MERGEABLE / UNSTABLE** | `gh pr view 498` |
| Candidate `78b65ce23e682541dbba6fa39979edd9e5928667` | **DOES NOT EXIST** — `gh api .../commits/78b65ce2…` → HTTP 422 "No commit found"; no local object, no branch contains it | `gh api`, `git cat-file` |
| Commit `75cee848` (the `head_bound` inside #484's registry) | **real**, but only on PR #484's own line (`origin/arena/0008c4f4-p2`, `…/27be9eff-p2`, `…/731193ec-p2`); **not an ancestor of `main`** | `git branch -a --contains` |

So the previous report's facts still held at the start of this mission; what changed is that PR
#495's "698/0 CONTRACT PASS" turned out to describe a *simulated landed state*, not CI — measured
in §9.3.

## 9.2 The requested raw log (run `40491800409`) is genuinely unrecoverable — attempts recorded

| Attempt | Command | Result |
|---|---|---|
| artifact list | `gh api repos/…/actions/runs/40491800409/artifacts` | `{"total_count":0,"artifacts":[]}` |
| run-level log | `gh run view 40491800409 --log` | `EOF` from `results-receiver.actions.githubusercontent.com` |
| job-level log | `gh api repos/…/actions/jobs/122147293891/logs` | `EOF` from `productionresultssa15.blob.core.windows.net` |
| step-level | `gh api repos/…/actions/jobs/122147293891` | **readable**: 77 steps, all `success` |

Conclusion: the run is green at step level, but no raw log or artifact exists that this
environment can read, and the run is 4 commits behind `main`. It is therefore **not** evidence
for any current SHA, and a fresh canonical run on the final candidate is required — which is
what §9.7 records.

## 9.3 Why the gate printed "698 pass / 0 fail" and still exited 1, while the audit exited 2

This is now explained to the line, from the pre-recovery gate itself:

```
fff1beae:tools/strict-verification-gate.js:654
  const nothingVerified = fail === 0 && (verifiedItems.length === 0 || registryRank < VERIFYING_MIN_RANK);
:661  console.log('VERDICT ' + (fail || nothingVerified ? 'NOT VERIFIED' : 'VERIFIED'));
:664  process.exit(fail || nothingVerified ? 1 : 0);
```

The honest registry had `fail === 0` and three items in the verifying band, but its **headline**
was `UNKNOWN` — because the old V-15 capped the headline at the weakest of all items and 29
legacy records are honestly UNKNOWN. `registryRank` was therefore below the band, `nothingVerified`
became `true`, and the gate refused the verdict with exit 1 while printing zero failures. Worse, the
blocker text it printed ("configures nothing … no item in the verifying band") **misdescribed**
the state, because three items *were* in the band.

The `exit 2` came from the audit, which was still matching evidence through its own
`DEPENDENCY_SETS` + `provenance.dependency_hash` — a field the builder never wrote — so it saw 29
unbound items in the same file. Two tools, two contracts, and a refusal message that named the
wrong cause.

What was already repaired in mission 1 (and is now pinned further): one implementation
(`tools/lib/verification-witness.js`), two explicit binding modes, closure measured against
`closure_scope` (V-19a…V-19e), and the audit's header rewritten so it can no longer describe the
retired design as if it were the contract.

**The legal metadata-commit path, now measured instead of argued** (`L1..L4`, real git, in
`tests/verification-binding-contract.test.js`):

| Case | Topology | Result |
|---|---|---|
| L1 | `--no-ff` merge commit (2 parents) carrying the registry | **accepted**, exit 0 — the heritage of OD-3 no longer applies |
| L2 | squash landing | **rejected**, "not an ancestor of the checkout" — the source commit stops existing on the line, so re-run + re-emit |
| L3 | registry + non-witnessed files in one commit | **accepted** |
| L4 | same shape, but the extra file is witnessed | **rejected**, `stale evidence for):` names the witnessed fixture (a temp-dir path created by the test, not a repository file) |

And the contract proved itself against my own work twice in this mission: after editing
`tests/verification-binding-contract.test.js`, the gate refused the old registry with
`witness content changed after the evidence commit (stale evidence for): tests/verification-binding-contract.test.js`,
and after the dependency repair it refused with the same message for `package.json`. Re-running the
suite and re-emitting was the only way back — which is the behaviour the mission asked for.

## 9.4 Accessibility: root cause, fix, and where the browser proof lives

Root cause and the deterministic regression are in §2.3. Two additions from this mission:

* The canonical runner now reports `GREEN a11y-motion-determinism` inside the real suite
  aggregation (measured locally in §9.7), i.e. the guard is wired into the same gate that would
  have to pass for closure, not a side script.
* The browser run is executed **in CI, not here**: `.github/workflows/node.js.yml` installs
  `playwright` + `@axe-core/playwright` into `/var/tmp/pw-tools`, runs
  `playwright install --with-deps chromium`, exports `NODE_PATH` and `CHROMIUM_PATH`, and then
  `scripts/run-all-tests.sh` runs `tests/a11y-runtime.js` as an exclusive suite. In this sandbox
  there is no chromium and no playwright (`which` empty, `require.resolve` fails), so the local
  result is the documented `exit 3` prerequisite code — **NOT RUN**, never a pass. The CI step
  conclusion for the a11y suites on the final head is recorded in §9.7.

## 9.5 E4-01 … E4-07: the seven drills, individually, with what each needs

Fresh probe on this head: `node tools/m15-01-e4-verify.js` → `overall_status: BLOCKED`,
`counts {total:7, pass:0, fail:0, blocked:7}`, `exit 2`, `report_sha256` recorded in §9.7.

| # | Drill (real, not simulated) | Precondition that does not exist here | Inputs | Command | Expected evidence | Result |
|---|---|---|---|---|---|---|
| E4-01 | PG 16+ Primary + streaming Standby on two hosts, measured lag | two staging hosts, distinct non-loopback IPs | `E4_PG_PRIMARY_DSN`, `E4_PG_STANDBY_DSN`, `E4_CONFIRM_ISOLATED_STAGING=1` | `E4_CONFIRM_ISOLATED_STAGING=1 node tools/m15-01-e4-verify.js --require-pass` | primary `recovery=false`, standby `recovery=true`, `streaming_standbys ≥ 1`, `max_lag_bytes ≤ 16 MiB` | **BLOCKED** |
| E4-02 | cross-region `pgBackRest` repo + continuous WAL archive | backup host + second-region bucket | `E4_BACKUP_REPO_REGION`, `E4_PGBACKREST_STANZA` | same probe | regions differ, `status.code == 0`, a full backup younger than 24 h, WAL min/max continuous | **BLOCKED** |
| E4-03 | PITR onto an isolated recovery host, 26 migration checksums | dedicated recovery VM | `E4_PITR_RESTORED_DSN`, `E4_PITR_TARGET_UTC` | `bash tools/pitr-restore.sh --target … && bash tools/pitr-verify.sh …` then the probe | host disjoint from primary/standby, 26 checksums match, `post_target_audit_rows == 0` | **BLOCKED** |
| E4-04 | `PgBouncer` transaction pooling + measured reroute RTO | PgBouncer host/service | `E4_PGBOUNCER_DSN`, `E4_PGBOUNCER_ADMIN_DSN`, `E4_PGBOUNCER_EVIDENCE_JSON` | `bash tools/failover-postgres.sh --live` then the probe | `pool_mode == transaction`, writable primary after promotion, `0 < rto_ms ≤ 30000` | **BLOCKED** |
| E4-05 | `≥ 3`-host Redis Sentinel quorum + promoted master persistence | three Sentinel hosts | `E4_REDIS_SENTINEL_ENDPOINTS`, `E4_REDIS_MASTER_NAME` | `bash tools/failover-redis.sh` then the probe | three distinct host IPs, `ckquorum` OK everywhere, unanimous master with AOF/RDB | **BLOCKED** |
| E4-06 | observability failure domain disjoint from the data plane | separate monitoring host + real receiver | `E4_PROMETHEUS_URL`, `E4_ALERTMANAGER_URL` | the probe | monitoring IPs disjoint from DB/Redis, `200` on `/api/v1/rules` with `RedisDown`+`SyncQueueDepth`, `0` `example.invalid` receivers | **BLOCKED** |
| E4-07 | live on-call `MTTA`/`MTTR` acknowledgement trail | a human roster and a real ack chain | roster + alert delivery trail | the probe | alert → on-call → acknowledgement → recovery, with timestamps | **BLOCKED** |

E3 is **not** substituted anywhere in this table. The single-runner isolated runtime and
PITR/HA/Sentinel CI jobs (run `40521544368`, all four jobs success on `06ba3da3`) are E3/DR
**subset** evidence and are labelled that way in §3.

## 9.6 Vendor scans: cause per tool, from the workflow's own guard

All three workflows implement the same pattern: a "Fail closed when … credentials are missing"
step gated on an env expression, and the real scan step gated on the inverse. The failing step
*is* the guard:

| Tool | Guard step (source) | Condition that fired | Real scan step | Classification |
|---|---|---|---|---|
| Jscrambler | `jscrambler-code-integrity.yml:33-34` | `JSCRAMBLER_APPLICATION_ID`/`SECRET_KEY`/`ACCESS_KEY` empty, or no `jscrambler.json` | step 49, skipped | **credential, not code/configuration** |
| Fortify | `fortify.yml:92-93` | `FOD_CLIENT_ID` and `FOD_USER` both empty (also `SSC_TOKEN`, `SC_CLIENT_AUTH_TOKEN`, `DEBRICKED_TOKEN`) | step 114, skipped | **credential** |
| APIsec | `apisec-scan.yml:59-60` | `apisec_username`/`apisec_password` empty | step 71, skipped | **credential** |

Cross-checks performed before calling this owner-exclusive: (1) no vendor credential exists in
this environment (`env | grep -iE 'fortify|fod_|apisec|jscrambler|ssc_|debricked'` is empty, and
no credential files are present); (2) the token cannot even enumerate secrets
(`gh api …/actions/secrets` → **403 Resource not accessible by integration**); (3) the YAML is
valid and the guard logic is intact, so this is not a malformed-workflow defect (the earlier
`if: secrets.*` invalidity was already fixed and is documented in `fortify.yml:40-48`).

## 9.7 Fresh canonical run on this candidate

Command (the *whole* suite, not `npm test`):

```
bash scripts/run-all-tests.sh          # writes /tmp/all-tests.log, one line per suite
```

Result of the run started `2026-10-27T15:54Z` and finished after `ellapsed: 5896s`:

| Figure | Value |
|---|---|
| suites GREEN | **565** |
| suites RED | **62** |
| runner verdict | its own log lines are the verdict: it prints `=== RED: <suite>` for each and ends `DONE`; the shell exit status was masked by piping to `tail`, so this document does **not** claim an exit code for this invocation |
| log | `/tmp/all-tests.log` (23 636 bytes, per-suite output at `/tmp/at-<suite>.log`) |

Every one of the 62 reds was then classified by reading its own log, not by assuming:

| Class (a suite can belong to more than one) | Count | Example signature |
|---|---|---|
| PostgreSQL absent from this sandbox | 37 | `connect ECONNREFUSED 127.0.0.1:5432`, `PostgreSQL unreachable`, `spawn psql ENOENT`, `PG binaries or pg module not available` |
| Redis absent from this sandbox | 15 | `connect ECONNREFUSED 127.0.0.1:6379`, `Redis unreachable` |
| browser / playwright absent | 3 | `a11y-*: exit 3 (prerequisite)` |
| container runtime absent | 1 | `docker`/`compose` not installed (this suite is also in the Redis row) |
| reports itself honestly as NOT-RUN because a prerequisite is absent | 22 | `0/0 (NOT-RUN)؛ PASS only when runtime prerequisites are present`, `اجرا نشد` |
| **real defect, found and fixed in this mission** | **1** | `supply-chain` — `SC-01`/`SC-05` |

The arithmetic, so it can be checked rather than trusted: 37 PostgreSQL + 15 Redis − 2 suites in
both = 50; + 3 browser = 53; + 6 suites whose only signature is an honest NOT-RUN = 59; + the 3
that matched no signature on the first pass and were then read by hand (`supply-chain` = the real
defect; `migration-009-live-mutations` = "PG binaries or the `pg` module are unavailable, missing
dependency is a hard FAIL"; `wave23-reports-mutations` = "every mutation must redden the
live-PG gate", and with no PG no mutant can be killed, which it reports as `0 killed, 11 alive`
rather than as a pass) = **62**. The 22 NOT-RUN rows are a subset of the rows above, not extra
suites.

The one real red was mine: the dependency repair changed `package-lock.json`, and the
supply-chain gate hashes that lockfile into the SPDX SBOM, the license inventory and the drift
baseline. `SC-01` and `SC-05` failed exactly for that reason, the artifacts were regenerated with
the module that owns them (`tools/supply-chain-audit.js --write`), and `tests/supply-chain.js` is
now **7/7** including `SC-07` (the simulated-drift detector still fires). No red was dismissed
without reading its log — the same rule that caught the C6 defect below.

**Why this is not yet the closure-grade canonical evidence.** The suites that prove the operational
claims need PostgreSQL, Redis and Chromium, and this sandbox has none of them (no `psql` binary, no
server on 6379, no `chromium`, no Docker). A local run therefore cannot exceed 626/627
here, no matter how correct the code is. The canonical run that *can* reach 627/627 is the CI job
`Node.js CI / build (22.x)`, which provisions all three (`.github/workflows/node.js.yml:85-115`
installs PostgreSQL 17, mounts the tmpfs the chaos drills need, installs playwright + chromium and
exports `NODE_PATH`/`CHROMIUM_PATH`). Its step-level result on the final head is quoted in §9.8 —
and its raw log is subject to the same unreachability documented in §9.2, which is stated there
rather than glossed over.

### 9.7.1 Re-collect, re-emit, gate — on this head

The two traps documented in the previous mission fired again, both times as designed: the witness
went stale once when the binding suite gained `L1..L4`, and once when `package.json` changed. Both
were resolved the legal way — re-collect, commit, re-emit onto the source commit — never by
touching the contract. The sequence on this head, with real exit codes (captured by redirecting to
a file, not by piping through `tail`, which is what hid them earlier):

```
node tools/m15-01-build-registry.js --collect
  → COLLECT OK (5 runs, all exit 0 with zero failing checks)
     focused 32, negative 55, contract 21, binding 28, legacy 15 checks
     (binding went 24 → 28 because L1..L4 were added to the suite it runs)
commit 5e987ed6  test(verification): re-collect the five evidence logs on this tree
node tools/m15-01-build-registry.js --emit --head 5e987ed6
  → EMITTED … head_bound=5e987ed6 mode=lineage items=32 witness=16 paths
     STATUS RUNTIME_VERIFIED | verified_items=3/32
commit 6ccef06f  chore(verification): re-emit the registry bound to 5e987ed6

node tools/strict-verification-gate.js                        → exit 1, RESULT 708 pass / 1 fail
   BLOCKER V-06: HEAD contained in origin/main — head=6ccef06f origin/main=fff1beae
   (this is the only failure; V-02 is clear again: "WITNESS 16 path(s); 0 changed since 5e987ed6")
GITHUB_EVENT_NAME=pull_request node tools/strict-verification-gate.js → exit 0, 709 pass / 0 fail
   CONTRACT PASS, VERIFIED_ITEMS 3/32 (in closure scope 3/3), VERDICT VERIFIED
node tools/registry-provenance.js --audit                     → exit 0, HEAD-BIND VALID (lineage)
   WITNESS 16 paths, 0 changed; IN-SCOPE 3, BLOCKED 29; VERDICT PROVENANCE VALID
```

That pair of results *is* OD-2, measured on the same commit twice with no code difference: the
push lane fails only because this branch is not yet in `origin/main`, and the PR lane is clean. It
is also the reason this document does not claim "709/0 green" without saying on which lane.

### 9.8 CI on the head I pushed (22e928d4)

Two things must be said before the table: the **raw job log is unreachable from this sandbox**, and
this time the reason is provable rather than mysterious. `gh run view --log` resolves to
`results-receiver.actions.githubusercontent.com`, which is outside the allowlist the environment
gives me (`curl` to that host: `000`, exit 35). The run-level and job-level log endpoints return
`EOF` for exactly that reason — the same mechanism as the run `40491800409` that the mission asked me
to recover (§9.2). So this section is built from data that *is* reachable (`api.github.com`: run
metadata, per-step conclusions, check-run annotations) **plus a local reproduction of the failing
step on the exact pushed tree**, and it says which is which.

| Workflow / run | Step-level outcome | Evidence source |
|---|---|---|
| Payesh Strict Verification Gate — run [40551955449](https://github.com/rezaa2544/p2/actions/runs/40551955449) | **success**: `A-30 V-01..V-12 negative gate fixtures` ✓, `A-30 contract suite (Arena-only model)` ✓, `M15-01 registry & strict-verification acceptance properties` ✓, **`Strict verification contract` ✓**, `Core tests` ✓; `Production truth gate` skipped | `gh run watch`: exited 0, all steps green |
| Node.js CI — run [40551955854](https://github.com/rezaa2544/p2/actions/runs/40551955854), job `build (22.x)` | **failure**, single failing step `Comprehensive canonical regression runner`, annotation "Process completed with exit code 6." | `gh run view --json jobs`; annotations via `api.github.com` |
| Fortify / APIsec / Jscrambler | fail in their own credential guards (unchanged, §9.6) | `gh run list` conclusions per workflow |

**What exit 6 means, and the defect it exposed.** `scripts/run-all-tests.sh:128` exits 6 for
`!! STALE DOC REFERENCE` — a document pointing at a file that does not exist. It is the *pre-flight*,
i.e. it fired before a single test ran. Reproduced on the exact pushed tree in a detached worktree:

```
git worktree add /tmp/wt-ci 22e928d4
node tools/docs-refs-check.js --check    → exit 1
  «ارجاعِ کهنه به فایلِ ناموجود: 256 … خطِ پایه (بدهیِ تاریخی): 255   تازه (باید رفع شود): 1»
  → docs/M15-01_RECOVERY_REPORT_2026-10-27.md → the fixture filename quoted in §9.3
```

The one stale reference was **mine**: in §9.3 I quoted a gate rejection message verbatim, and the
fixture filename inside that message is a path the test creates in a *temporary directory* — it has
never existed in this repository. Quoting the message therefore *created* a reference to a
non-existent file. That filename is deliberately **not** reproduced here (nor anywhere else in this
document): reproducing it is precisely what created the stale reference, and a second copy would
re-create it. The quote is preserved (it is the evidence), the phrasing no
longer looks like a repository path, and `docs-refs-check` reports zero fresh references again
(it prints the count in Persian digits; this document deliberately does not repeat that sentence
verbatim, because `tests/docs-refs-check.js` scans documents for a stale baseline count and a
quoted "zero" reads as exactly that claim — the gate catching a *quotation* is still the gate
working, and the baseline itself is the ۲۵۵ موردِ تاریخی recorded in
`tools/docs-refs-baseline.json`),

**The second-order finding, and the honest fix.** Every local check I had been running — `npm test`,
the docs-stats freeze check, the registry, the gate — passed on that tree. `tools/docs-refs-check.js`
had *fixture* tests (`tests/docs-refs-check.js` proves the tool catches a stale ref and tolerates
baseline debt) but **nothing ran it against the live tree** outside CI. That is the same shape of
hole as the earlier `nothingVerified` bug: the instrument was correct and unplugged. It is now wired
into `tests/run.js`, which is inside `npm test`, so `tests/run.js` is **40/40** (was 39). Verified
with a positive control rather than by asserting success — a deliberately bogus reference (a
`tests/` path to a file that does not exist, named here only by that description) was appended to
this document, `npm test` went **red and named both the document and the bogus path**
(the output was `• docs/M15-01_RECOVERY_REPORT_2026-10-27.md → …`), then the tree was restored
and it went green again. Without that control the new test would be an
untested claim, which is exactly what this cycle is supposed to stop producing.

**On the CI row I cannot claim.** The canonical job did not reach the suites on this head: it stopped
at pre-flight. So this section does **not** say "the CI canonical suite is green — the local
565/62 substitutes for it"; it says the CI job was killed by a defect in my own document, which is
now fixed, and the re-run on the next head is the evidence (the run id is recorded below once it
finishes). One genuine positive result does stand on this head: **`Strict verification contract`
passed in CI** for the first time in this cycle — the registry is bound, the witness is fresh, the
PR lane is clean (V-06 does not apply to `pull_request`), so the mission-C contradiction is resolved
on the very lane that matters.

### 9.8.1 A third catch, of the same family, on the next head (ffd25a5)

The docs-refs fix made the pre-flight pass, the canonical runner then ran, and CI came back with a
red suite named `docs-refs-check` whose failing check was:

```
❌ همهٔ شمارهای نوشتهشده با فایلِ خطِ پایه میخوانند
   — docs/M15-01_RECOVERY_REPORT_2026-10-27.md=0 (درست: 255)
```

Again mine, again a *quotation*: I had pasted the tool's success line, and that line begins with the
number zero in Persian digits followed by «ارجاعِ کهنه». The suite scans documents for a stale
baseline count, so a quoted "zero" reads as a claim that the baseline is zero. The wording now says
"reports zero fresh references" in words, and the document states the true baseline as
«۲۵۵ موردِ تاریخی» instead. `tests/docs-refs-check.js` is **29/29**.

Worth saying plainly, because it is the third time in this cycle: the gate that catches *quotations*
of a tool's own output is still the gate working, and a report that can quote a number without the
number being checked is how the earlier "698/0" confusion started. The discomfort is the feature.

### 9.9 What CI said on the corrected head (f93111e8), line by line


The same two workflows were re-read after the docs-refs fix was pushed:

| Workflow (pull_request) | Result |
|---|---|
| `Payesh Strict Verification Gate` — run 40554919515 | **success**, every step green, including `Strict verification contract` |
| `Node.js CI` — run 40551919596, job `build (22.x)` | **failure**, and only one check inside the canonical runner was red: `FAIL live repository secret-scan passes with exit 0` (annotation on the job; `Process completed with exit code 1`) |
| every live-PostgreSQL, live-Redis, chaos, a11y and migration step above it | **success** — `Live-PG suites (fail without a database — P1-GAP-01)`, `Live-Redis suite (otp-redis)`, `Migration chain … 001 → latest`, `Rollback chain`, the five `Critical orphan — B-PG …` batteries, `Phase 6.5 Runtime Truth`, `Production Truth Gate`, `Phase 7 verifier T1–T7`, `npm test`, `Lint (N-23)` |

**What that single red proves, in both directions.** It is not a product red — it is *my own
manifest*: I wrote three bare 64-hex digests into `m15-01-canonical-run-MANIFEST.md`, and a bare long
hex is a credential candidate by design. The fix was to label them (`sha256:<hex>`) — the honest
description, and the form the rule already accepts; nothing was added to any allowlist. And the
inverse is the important half: because every live-PG, live-Redis, chaos and a11y step **passed on
this head**, the 62 local reds of §9.7 are now *confirmed environmental* by CI rather than asserted
by me. That is the cross-check the local run could never give.

### 9.10 SI-013-B — the secret scanner's own blind spot, found while fixing that

Chasing the manifest hit exposed something worse than the manifest. `tests/secret-scan.js`
exempted a long hex whenever the line merely *contained* one of
`0x|digest|sha256|example|dummy|test|fixture|deadbeef`, anywhere on the line. Measured, not
theorised — a fresh random 64-hex value appended to a document as

```
const testApiKey = "<64 random hex>"
```

left the scan at `13/13 سبز ✅`. A planted key named after "test" was invisible. That is a
false-green *in the control that is supposed to catch false greens*, so it is a defect of the same
class as everything else this cycle has been about.

Repaired by narrowing the exemption from "the line mentions a word" to "a digest label sits next
to the value, or the value is a `0x`/`deadbeef` sentinel", deleting the ambiguous words, and making
the existing FT-METRIC-01 ledger exception name the artifacts it hashes (`mutation-test.sh`,
`metric-v2-partial-report.json`) instead of leaning on the word "test" inside those filenames.
One narrow, documented exception remains and is stated as such in the code: the ARENA6 audit
report quotes the `PAYESH_JWT_SECRET=` value it found at `.env.example:38` as the evidence of its
own finding — that file is historical evidence and is not rewritten here, and whether that value
is still live is the SI-013 rotation question, i.e. the owner's.

Proof, in both directions:

| Check | Before | After |
|---|---|---|
| plant `const testApiKey = "<fresh 64 hex>"` in a doc | 13/13 green (**hole**) | **12 green / 1 red, 1 hit** |
| remove the planted value | 13/13 | **13/13** |
| `HEXCASES` negative controls | 22 cases | **27 cases** (5 added: `testApiKey`, `fixtureToken`, a fixture-dir module, plus two positives that must stay allowed: `sha256:` and `"lockfile_sha256": "`) |
| `node tests/si013-secret-scan.js` (the suite that asserts the live scan exits 0) | 18/18 | **18/18** |
| `npm test` | 40/40 + 31/31 + smoke 547/547 | **40/40 + 31/31 + smoke 547/547, exit 0** |

### 9.11 One environment event worth recording

Mid-mission the sandbox's git metadata was reset to the base clone (`git reflog` shows only
`clone` + `checkout`, HEAD back at `fff1beae`) while the working tree kept its files. Nothing was
lost, because every step had already been pushed: recovery was `git fetch origin
arena/f75d9f00-p2` + `git reset --hard origin/arena/f75d9f00-p2`, after which `git log` showed the
mission's commits intact and the tree differed from the pushed head only by the edit in progress.
This is recorded because it is exactly why the mission insists on pushing evidence commits as they
are produced instead of at the end.

### 9.13 The canonical suite is GREEN in CI — on the lane that gates the merge (995f871)

This is the evidence the local sandbox could never produce — the full suite on a runner that has
PostgreSQL, Redis, Chromium and the container runtime:

| Lane | Workflow | Run | Result |
|---|---|---|---|
| `pull_request` | **Node.js CI** (`build (22.x)`, the canonical `npm run test:all`) | [40587219437](https://github.com/rezaa2544/p2/actions/runs/40587219437) | **success** — every step, including all live-PG / live-Redis / chaos / migration / a11y / `npm test` / lint steps |
| `pull_request` | Payesh Strict Verification Gate | [40587219500](https://github.com/rezaa2544/p2/actions/runs/40587219500) | **success** (`Strict verification contract` green) |
| `pull_request` | Security Program (SAST · SCA · SBOM · DAST · Secret) | [40587219554](https://github.com/rezaa2544/p2/actions/runs/40587219554) | **success** — including `Secret scan`, i.e. the SI-013-B repair verified in CI |
| `pull_request` | M15-01 E3 Runtime Evidence, Runtime Reliability, observability-regression, Codacy, SecurityCodeScan, Defender | 40587219571, 40587219565, 40587219616, 40587219547, 40587219577, 40587219429 | success |
| `pull_request` | APIsec / Fortify AST / Jscrambler | 40587219440, 40587219626, 40587219449 | failure — credential guards (§9.6), unchanged |
| `pull_request` | Payesh Watch — Autonomous Monitoring | 40587219658 | failure — its single step is the Notion write; the connector is `auth_error` |
| `push` | Node.js CI | [40587212154](https://github.com/rezaa2544/p2/actions/runs/40587212154) | **failure** — two suites: `strict-verification-gate-a30` (its V-06 assertion, i.e. the OD-2 footprint of an unmerged branch) and `offline-e2e` |
| `push` | Payesh Strict Verification Gate | 40587212150 | failure — V-06 only, same reason |

**The `offline-e2e` red deserves its own paragraph, because it is the honest open item.** Same tree,
same commit, and it is green in the `pull_request` lane and green locally (23 checks, 0 failures,
exit 0). Its annotation is truncated by Actions at the point where the failing check would be named,
and the log is unreachable (§9.2), so I will not guess which check it was. What can be said
without guessing: it is not a product regression introduced by this mission's changes (the same
tree passes the stricter lane and passes locally), and it is either a flake or an order/landscape
difference between the two lanes — exactly the class the mission asked to root-cause. It is
recorded as **OPEN** with one concrete next action rather than closed by a re-run.

### 9.14 The reason logs keep being unreachable — and the mechanism that fixes it

Three separate times in this mission a claim had to be argued from step conclusions instead of from
a log, and the cause was the same each time: the transcript of the canonical runner existed only on
the runner's disk and disappeared with it. That is a *structural* evidence gap, not bad luck, so it
is now repaired at the mechanism level: `.github/workflows/node.js.yml` publishes
`/tmp/all-tests.log` and every `/tmp/at-<suite>.log` as an artifact named
`canonical-runner-log-<event>-<sha>-<attempt>` on **every** outcome (`if: always()`), readable
through `api.github.com` — which *is* reachable from this environment, unlike
`results-receiver.actions.githubusercontent.com`. The verdict is untouched: the runner step still
fails the job exactly as before, and `if-no-files-found: warn` so a missing file can never be
mistaken for a pass.

The very first run after this change is expected to make the `offline-e2e` question answerable
without a guess; the run id is recorded in §9.15 when it lands, and until then this section claims
nothing about it.

### 9.15 The artifact mechanism works — and the next red it exposed

The first run after §9.14 is [40598616783](https://github.com/rezaa2544/p2/actions/runs/40598616783)
(`pull_request`, head `16d1fc3`). Two facts, in the order they matter:

1. **The upload step succeeded** and an artifact exists: id `12781811796`, name
   `canonical-runner-log-pull_request-32064b64…-1`, `size_in_bytes` 507 067 — i.e. the transcript of
   this run is now a downloadable object attached to the run, for anyone who can reach GitHub.
2. **It is still not readable from *this* environment**, and now the reason is precise: the
   authorized download URL redirects to `productionresultssa30.blob.core.windows.net`, which (like
   `results-receiver.actions.githubusercontent.com`) is outside the allowlist this sandbox runs
   under; `curl -L` returns `302`/0 bytes. So the mechanism is proven, the access path from here
   is not. That is stated rather than papered over — and it means the fix in §9.14 helps the
   reviewer and any environment with normal network access, not this one.

**And that run went red on a different suite, which is the useful part.** The Actions *annotation*
(names the suite, quoted verbatim) says:

```
RED suite server1 (exit 1)
  سرور (مرحلهٔ اول): 31/31 موفق  —  بدون خطا ✅  FATAL Error: ENOTEMPTY: directory not empty, rmdir '/tmp/payesh-srv-...
```

Read it literally: **every one of the 31 checks passed**, the summary line was printed, and then the
suite died on its own temp-directory cleanup and exited 1. A suite can therefore be RED for a reason
that has nothing to do with the product — the mirror image of a false-green, and precisely the
"environment/order/data" instability the mission asked to root-cause rather than re-run away from.

Root cause, in `tests/server1.js`: `server.close()` was called **without its callback**, so it
returned before the server's handlers finished, and then `fs.rmSync(TMP, {recursive:true, force:true})`
ran with no retry while audit-log appends could still be landing in that directory. `force` does not
retry; `maxRetries`/`retryDelay` are Node's documented remedy for `ENOTEMPTY`/`EBUSY` during a
recursive delete. Both halves are fixed:

| Change | Why |
|---|---|
| `await new Promise((r) => server.close(r))` | the actual root fix: no handler can still be writing when the delete starts |
| `maxRetries: 10, retryDelay: 100` on all four `rmSync` sites in the file | the belt: a delete that still races retries instead of crashing the suite |
| the cleanup is wrapped so a failure prints `(cleanup of … skipped: <code>)` instead of `FATAL` | cleanup is not an assertion; it must not be able to decide the verdict |

**What I will not claim:** that I reproduced `ENOTEMPTY` locally. Two probe scripts (a writer process
racing a parent `rmSync`, 40 iterations, with and without retries) never produced it on this kernel
— `rm -r` won every time. The evidence for the *defect* is the CI annotation above; the evidence
for the *fix* is that it removes the race by construction (awaited close) and adds the documented
retry, and that `node tests/server1.js` is still **31/31, exit 0** after the change. Re-running the
same suite until it passes would have been the wrong response and is explicitly not what happened.

`offline-e2e` (§9.13) stays **OPEN**: it is green locally and green in the `pull_request` lane on
`995f871`, red once in the `push` lane, and with the artifact now attached the next occurrence will
be diagnosable — by someone who can download it, which this environment still cannot.

### 9.12 Re-run on the corrected head after the SI-013-B fix

Head `c859d31`. `node tools/strict-verification-gate.js` → **exit 1, 708 pass / 1 fail** — the single
failure is V-06 (`HEAD contained in origin/main`, `origin/main=fff1beae`), i.e. the unmerged-branch
condition of OD-2 and nothing else. CI rows for this head are recorded in the table below once the
runs complete; the run ids are cited, and no row is written from intent.

### SI-013 — active-tree classification, measured rather than asserted

`node tests/secret-scan.js` → **13/13, exit 0**. To answer the *question* SI-013 asks (are any of
those long-hex strings credentials?), an independent classification pass over the same file set
the scanner walks (3 796 files) found **14 660** long-hex occurrences and **0 unclassified**: every
one sits in an integrity/checksum context (`checksum`, `sha256`, `digest`, `integrity`, SPDX
`checksumValue`, or a freeze-manifest hash). The dominant sources are
`docs/arena-evidence/2026-09-25/publication/ARTIFACT_MANIFEST.json` (2 071),
`docs/DOCS_FREEZE_v1.0.0-rc*.md` (484 + 347 + 328 + 327 + 325 + 323 + 321 + …) and
`docs/SBOM.spdx.json`. The scanner's two exemptions are mutation-tested and narrow (§6);
`api_key`/`token` in the same path still fail.

So: the **active tree** is clean under Owner Option A, and the remaining SI-013 question is the
historical one — whether anything that was *ever* published needed rotation or notification, and
whether history should be purged. That is an owner/security decision; no rewrite was attempted.

### Owner decisions, with the evidence attached

| ID | State after this mission | Evidence | What is left |
|---|---|---|---|
| OD-1 | **DECIDED** (owner, 2026-10-27) | V-10 retired; pinned by controls | nothing |
| OD-2 | **OPEN — owner** (measured, both remedies specified, neither applied) | on this head the push-triggered gate fails with exactly **1** failure out of 709 (V-06); the `pull_request` run of the same commit is **709/0**. Re-measured in §9.7 | pick (a) narrow the trigger to `pull_request` + `push: main`, or (b) scope V-06 push mode to `refs/heads/main`. (b) alters a security contract |
| OD-3 | **RESOLVED BY PROTOCOL** | L1–L4 (§9.3) | nothing gate-side; ordinary branch policy remains |
| OD-4 | **OPEN — ratification only** | the gate no longer reads the count: 709/0 with scope 3/3 either way. Ratifying 29 means deleting A/B/C from `expected_ids` **and** `closure_scope` together (V-19a rejects a scope naming an undeclared id); 32 is a no-op; 39 needs seven new evidenced items | ratify **32** (recommended: it is the only option that describes what ran) |

### Production truth gate — why it is skipped

`strict-verification.yml:64-70` runs it as `if: always() && env.DATABASE_URL != ''` with
`DATABASE_URL: ${{ secrets.DATABASE_URL }}`. With that secret absent the step is skipped, and the
step list of every strict-verification run shows `Production truth gate → skipped` while its
siblings ran. It is not silently green: `GATE_REQUIRE_CLEAN: "1"` would make it fail if it ran
against a dirty database. Locally `DATABASE_URL` is unset and no PostgreSQL exists, so the gate
cannot be exercised here either — **NOT RUN**, cause: one missing repository secret.

### PR #484 — re-measured, and deliberately not modified

The branch moved **during this mission** (`34c654d1` → `5741249d`, updated 17:20Z), so another
channel is actively working on it. At the current head:

| Check | Result | Cause |
|---|---|---|
| Fortify-AST-Scan | fail | `Fail closed when Fortify credentials are unavailable` (same guard as §9.6) |
| Trigger_APIsec_scan | fail | `Fail closed when APIsec credentials are missing` (same guard) |
| `build` (Jscrambler workflow) | fail | `Fail closed when Jscrambler credentials or configuration are missing` |
| STRICT — 3-AI Evidence Gate | fail | step *Strict verification contract* — the pre-recovery gate on an unmerged branch (three failure classes: V-06 containment, and the head's registry is still pre-recovery `status: UNKNOWN`) |
| everything else at read time | 11 pass, 14 pending, 2 skipping | still running |

I did not push to that branch, rebase it, or duplicate its fixes: it is not this session's branch,
and its remaining reds are the same credential/owner items as everywhere else plus a pre-recovery
gate that this PR supersedes.

### Independent review

No independent reviewer is available to this session: the repository's reviewer model declares a
single `arena` slot (`required_reviewers: ['arena']`, `independence.model = arena-only`), which is
why V-18 caps any item at `ADVERSARIAL_VERIFIED` and why `CERTIFIED` is unreachable (§7). The
recorded entry in `reviews_recorded.arena` is explicitly self-review. Creating a second reviewer
or a new channel is out of scope by the mission's own red line, so this stays **NOT DONE** and is
listed as a closure blocker rather than papered over with a bot's comment.

### Notion

`notion-sync.yml` reconciled the GitHub state into Notion on the previous head with a
PATCH-then-GET read-back (§3). The interactive Notion connector returned
`auth_error — "the connection to this app is no longer valid"`; per its own contract it was not
retried. Reconnecting the connector is an owner action in the Arena UI.
