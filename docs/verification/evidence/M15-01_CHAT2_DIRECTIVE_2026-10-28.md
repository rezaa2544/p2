# M15-01 — Chat2 directive: a11y node, docs-refs matcher, supply-chain drift, canonical run (2026-10-28)

**Branch:** `arena/0008c4f4-p2` · **PR:** #484
**Candidate at start of this directive:** `344a9dbf82fe9dafc0b8bf9fa5ed2b5334998272` (tree `d4fcbb81`)
**HEAD after this directive:** `5cae68dc85b1a13ee5152afcae86c615dccd0682` (tree `d3e35ffa`, parent `138f1a41`)
**Base:** `origin/main` = `fff1beae09ff45d69e554f8c000a9d15b75d968c` (unchanged by me)
**Environment:** Node `v22.22.3` · npm registry reachable · `api.github.com` reachable ·
`cdn.playwright.dev` and `playwright.download.prss.microsoft.com` **blocked**
(`curl` → `000`, SSL_ERROR_SYSCALL) · no `psql`/PostgreSQL/Redis/Docker/Chromium · no apt package named `chromium`

Nothing was merged and no registry status was raised. `M15-02 (#468)` was not started.

---

## 0. What was asked, and what was actually done

| Directive | Result |
|---|---|
| Fix the a11y-runtime cause (theme-3 / student / record / `div[data-t="grades"]`, `#1668f0` on `#e4edfe` = 4.176:1) | **Fixed at the root** — `.tab.active` used `--primary` as a text colour; now `--primary-dark`, measured 6.446:1 in theme-3. Mutation re-turns the suite red. |
| Remove nothing (no assertion/coverage/theme/route) | No assertion deleted or loosened. Two guards **added** (class-wide invariant + point assertion), plus a new 21-combination state matrix. Suite 83 → 90 checks. |
| Keep source and generated HTML in sync via the official build | `node build.js` → `index.html` delta is exactly the one CSS rule; `USER_GUIDE.html` delta is only the build seal; `node build.js --check` exit 0. |
| Run runtime a11y on the exact candidate, all three themes, routes/states incl. active tab + transient | **Cannot run here:** Chromium cannot be downloaded (blocked hosts) and none is installed. `tests/a11y-runtime.js` exits 3 (module missing) or 2 (browser launch) — recorded. The real axe run is delegated to CI, which *does* provision Chromium (`node.js.yml` installs it and exports `CHROMIUM_PATH`); run `40778400346` on this SHA is recorded below with its true status. A deterministic **static** state matrix (21 combinations) was added and is labelled as *not* a substitute for axe. |
| Mutation/negative proving the revert turns the suite red | **Done 3×**: a11y-regressions (4 assertions red), a11y-state-matrix (theme-3 4.289 FAIL), plus matcher and supply-chain mutations. All restored and re-verified green. |
| `docs-refs-check`: fresh-zero compared against baseline 255 | **Root-caused and fixed:** the matcher lived in the test, not the tool, and matched `۰ ارجاعِ کهنهٔ تازه` as a baseline claim. Moved into the tool (`countClaims`) and scoped; regression tests cover both directions. |
| `supply-chain` SC-01/SC-05 | **Proved legitimate, regenerated only with the official tool.** Diff is exactly one entry. `--check` exit 0, test 7/7. |
| Full canonical runner on the exact candidate, with stdout/exit/runtime/hashes | **Done:** exit 1, **5829 s**, 561 green / 66 red, full stdout retained. All 66 reds attributed (table in §4). |
| Report with SHA and limitations; no merge, no registry promotion | This document. |

---

## 1. The a11y defect

### 1.1 The node

`src/styles/base.css:143` — `.tab.active{color:var(--primary);border-color:var(--primary)}`.
The tabs are rendered by `src/js/17-student-record.js:151` as
`<div class="tab active" data-act="tab" data-t="grades">`, inside a `.card-head`
whose background is `--surface-2`.

| theme | `--primary` | `--primary-dark` | background | before | after |
|---|---|---|---:|---:|---:|
| theme-3 (reported) | `#1668f0` | `#0f4dc0` | `#e8f0fe` (`--surface-2`) | **4.289:1** | **6.446:1** |
| theme-3, report's composited value | | | `#e4edfe` | **4.1764:1** | 6.2763:1 |
| theme-1 | `#1668f0` | `#0f4fc4` | `#f6f9ff` | 4.2846:1 | 6.783:1 |
| theme-2 | `#2563eb` | `#1d4ed8` | `#f1f5f9` | 4.745:1 | 6.117:1 |

`#e4edfe` exists nowhere in the repository — it is the colour axe reports after
compositing. My own computation of the reported pair reproduces the reported figure
exactly (4.1764), which is why the fix was applied to the rule rather than to a colour
picked to satisfy the tool.

### 1.2 Why the guard is an invariant, not four pinned pairs

`--primary` is not a text token in this design system. Measured on `--primary-soft`:
4.28 (theme-1), 4.75 (theme-2), 4.17 (theme-3) — no safe margin in any theme, and only
4.92 on pure white. The new guard therefore asserts:

> no declaration whose property is exactly **`color`** may take `var(--primary)` or `var(--purple)`.

`border-color`, `background`, `accent-color` and `box-shadow` are unaffected — those are
the tokens' correct uses. Two alternative scopes were measured and rejected:

* every rule against every surface → false-flags the dark sidebar (`.brand b`, `.nav-group`, `.user-chip` sit on `#0b1329`–`#14225a`);
* the token value itself against every surface → false-flags `--primary`, which is a legitimate background/border colour.

The guard also carries its own justification assertion (that `--primary` on
`--primary-soft` really is below AA in ≥2 themes), so it cannot drift into
"stricter than the evidence" unnoticed.

### 1.3 State matrix (static, explicitly not axe)

`tests/a11y-state-matrix.js` — 3 themes × 7 colour-sensitive nodes = **21 combinations**,
values resolved from the real `base.css` with per-theme tokens: `tab.active`,
`tab (inactive)`, `sync-chip.busy`, `sync-chip.off`, `back-btn`, `avatar`, `sec-title`.
Output states `substitute_for_axe: false` in its JSON form and prints the same sentence in
human output. Result on this HEAD: **0 violations / 21 combinations**.

### 1.4 Mutation evidence

| Mutation | Effect |
|---|---|
| `.tab.active` back to `color:var(--primary)` | `a11y-regressions` exit 1 — 4 assertions red: the invariant, the point assertion (4.289), `--primary-soft` (4.172), `--bg` (4.459) |
| same | `a11y-state-matrix` exit 1 — `theme-3 tab.active 4.289 FAIL` |
| restored | both exit 0 |

---

## 2. `docs-refs-check` — the false red

**Symptom:** `tests/docs-refs-check.js` 28/29, failing
`همهٔ شمارهای نوشتهشده با فایلِ خطِ پایه میخوانند — docs/verification/evidence/M15-01_EXECUTION_MISSION2_2026-10-27.md=0 (درست: 255)`.

**Cause:** `COUNT_RE = /([۰-۹0-9]+)\s*(?:ارجاعِ کهنه|موردِ تاریخی)/g` matched the sentence
`۰ ارجاعِ کهنهٔ تازه` — which reports the **fresh** count — and compared it to the
baseline count 255. The matcher lived in the **test**, not the tool, so nothing guarded it.

**Fix (two parts):**
1. The matcher moved into `tools/docs-refs-check.js` as `countClaims()` and is exported —
   one source of truth, directly unit-testable.
2. Scope: the «تازه» qualifier — with or without the hamza `U+0654`, with or without
   markdown emphasis — marks a *fresh* claim and is excluded. Baseline claims stay in
   scope, including wrong ones.

**Regression tests (both directions, as requested):**

> The literal probe strings live in `tests/docs-refs-check.js`; they are quoted here
> only by their distinguishing feature, because a document that repeats a
> baseline-shaped number in prose is itself a claim this gate polices (the gate
> caught an earlier draft of this very section — correctly).

| Case (described) | Expectation |
|---|---|
| a sentence stating the baseline number ۲۵۵ | 1 claim, n=255 — the correct baseline passes |
| a sentence stating the number ۱۱۸ as the baseline | 1 claim, n=118 — a **wrong** baseline is still caught |
| the zero-fresh sentence («۰ … تازه») | 0 claims — this is the actual regression |
| a fresh count of ۴۱ followed by «تازه» | 0 claims |
| a fresh count with markdown emphasis around «تازه» | 0 claims |
| a historical-item count («… موردِ تاریخی») | 1 claim — still in scope |
| one line carrying both a baseline number and a fresh number | 1 claim — only the baseline one |

Suite: **37/37, exit 0**. Mutations: matcher widened → exit 1 (5 failures); matcher gutted
→ exit 1 (the negative controls fire). Both restored.

The evidence text was **not** softened — `۰ ارجاعِ کهنهٔ تازه` remains in the report because
it is the true measured value; the tool learned to read it correctly.

---

## 3. `supply-chain` SC-01 / SC-05

**Symptom:** `SC-01 SBOM lockfile fingerprint is stale`, `SC-05 package-lock.json SHA-256
drift detected; direct dependency drift: @opentelemetry/resources` (5/7).

**Is the dependency change legitimate?** Measured in `/tmp/dep-proof` (copy of the manifest
and lockfile):

| Attempt | Result |
|---|---|
| `@opentelemetry/resources: ^3.0.0` | `ERESOLVE` — `resources@3.0.0` peers `api >=1.10.0 <1.11.0`; tree has `api@1.9.1` |
| … and `@opentelemetry/api: ^1.10.0` too | `ERESOLVE unable to resolve dependency tree` — `context-async-hooks@2.12.0` and `sdk-trace-node@2.12.0` peer `api >=1.0.0 <1.10.0` |
| `@opentelemetry/sdk-trace-node@>=3` | `404` — there is no 3.x; latest is `2.12.0` |

⇒ **No resolvable tree exists with `resources@3.0.0`.** Holding `resources` at `^2.12.0`
is the only installable configuration, not a convenience edit. `npm ci` exit 0
(194 packages, 195 audited, 4 s).

**Audit / licences:** `npm audit --omit=dev` → **0 vulnerabilities** (exit 0).
`npm audit` (all) → 1 moderate, `moment` (dev-only chain), pre-existing and unchanged by
this work — not suppressed and not hidden.

**Regeneration:** only through `node tools/supply-chain-audit.js --write`. The diff:

```
lockfile_sha256 : 1d98b3ff… → b7b13ed2…
package_count   : 194 → 194
direct_dependencies: @opentelemetry/resources  ^2.11.0 → ^2.12.0   (resolved 2.12.0 both)
SBOM packages   : 195 → 195
```

`--check` exit 0 · `tests/supply-chain.js` **7/7**.
Mutation: declaring `^9.9.9` in the baseline → exit 1, SC-05 names the dependency.

The baseline was **not** hand-edited and nothing was grandfathered.

---

## 4. Canonical run #1 (full, on `5cae68d`)

```
command : bash scripts/run-all-tests.sh
cwd     : /home/user/p2
HEAD    : 5cae68dc85b1a13ee5152afcae86c615dccd0682   tree d3e35ffa
started : 2026-10-28T22:12Z   finished: 2026-10-28T23:39Z
exit    : 1
runtime : 5829 s (97.2 min)
suites  : 561 GREEN / 66 RED (627)
stdout  : docs/verification/evidence/m15-01-chat2-2026-10-28/canonical-full.log
          (2156 lines, 131,284 bytes, sha256 b7ad7bb5…)
```

**A first attempt aborted in 6 s with exit 5** — the runner's own pre-flight
(`DOCS STATS STALE`) because adding `tests/a11y-state-matrix.js` changed the test count
660 → 661. Fixed with the repository's tool (`node tools/docs-stats-sync.js --freeze`),
not by bypassing the pre-flight; `docs-stats-sync --check` exit 0, `docs-freeze-marker` 14/14.

**Suites this directive touched — all GREEN in that same run:**
`a11y-regressions`, `a11y-state-matrix`, `docs-refs-check`, `supply-chain`.

### 4.1 All 66 reds, attributed

| Cause | Count |
|---|---:|
| live PostgreSQL / `psql` absent in this sandbox | 55 |
| Chromium absent (`a11y-interactive`, `a11y-keyboard`, `a11y-runtime`, `reports-export`, `reports-pdf-e2e`) | 5 |
| live Redis absent | 4 |
| clone had no git tags — **proven green** after `git fetch --tags` | 1 |
| **PRE-EXISTING ON `main`** — `pull-bootstrap` test 6 | 1 |
| **OPEN** — `strict-verification-gate-a30.test`, copy-mode lane only | 1 |

Per-suite attribution with the evidence marker for each is in
`.../m15-01-chat2-2026-10-28/EXITCODES.txt`.

### 4.2 The two reds that are not environmental — stated precisely

**`pull-bootstrap` test 6** (`دلتای تغییرات با پارامتر since فیلتر میشود`): fails
**standalone**, fails identically on `46c45041` (this branch's start) and on
`origin/main@fff1beae`. It is therefore **pre-existing on main**, not introduced here and
not environmental. It has since been **root-caused and fixed** -- see §4.3.

**`strict-verification-gate-a30.test`** — **root-caused and fixed** (was the last open
repository-controlled red).

*Symptom.* Two assertions fail, always the same pair:
`honestly blocked registry conforms to the contract` and `… is never reported VERIFIED`.
The captured gate stdout stops mid-`G6c` allowlist loop and contains no
`CONTRACT PASS` / `VERDICT NOT VERIFIED`; stderr is empty. Intermittent:
passes solo and at low concurrency, fails under load (in canonical run #2 and in CI
`40778400346`, passed in run #3 and both CI runs on `3970f4c8`).

*Investigation.* Ruled out in order: the verdict logic (the gate has exactly **one**
`process.exit`, after the verdict), a thrown error (stderr would carry the stack; it is
empty), file-descriptor exhaustion (`ulimit -n 64` reproduced it once but is not
deterministic at 128/256) and process-table pressure (`ulimit -u` 400/200/120 all green).
Reproduced deterministically instead at **10-way concurrency: 10 failures in 40 runs**, and
the truncation point is always the **same**: allowlist entry 158, exactly **10,903 bytes**.

*Root cause.* `process.exit()` plus **asynchronous pipe stdout**. With stdout on a pipe,
Node queues `console.log` writes in libuv; `process.exit()` terminates immediately and
discards whatever is still queued. Instrumenting the gate with an unbuffered
`fs.writeSync(2, …)` immediately before its final line proved the gate **does reach the
verdict and print it** (`TRACE reached-final-exit fail=…`) even in the runs whose captured
stdout is truncated. So the gate was right and its *output* was being lost: the test asserts
on text that never arrived. Not a registry verdict, not a real fail-open.

*Fix* (`tools/strict-verification-gate.js`, commit after `3970f4c8`): the gate's own output
is now written with an unbuffered `fs.writeSync(1, …)` (`say()`), so the verdict is on the
pipe before the process exits. The exit line itself is left **exactly as it was**
(`process.exit(fail || nothingVerified ? 1 : 0);`) because
`tests/m15-01-registry-strict-verification.test.js` mutates that literal to prove the
nothing-verified path is load-bearing — the first attempt at this fix swapped it for
`process.exitCode = …`, which broke that mutation target (`occurrences=0`) and turned CI red
on `7c3e240`; that attempt was reverted rather than papering over the assertion. No
assertion, check, fail-closed path or mutation target was changed.

*Evidence.*

| measurement | before | after |
|---|---|---|
| 10-way concurrency, 40 runs | **10 red / 30 green** | **0 red / 40 green** (repeated after the rewrite) |
| solo | green | green (`CHECKS 21 FAIL 0`) |
| direct gate run at HEAD, output size | could truncate (pipe) | **80,788 B, complete** |
| forced-green gate `process.exit(0)` | — | **exit 1** — a30 17 FAIL, mutation suite 14 FAIL |
| corrupt registry (items removed) | — | **exit 1**, still fails closed |

The truncation was also visible on the *real* gate (80 KB of verdict text), so the fix
hardens the gate's own evidence output, not just the test lane.

---

## 5. CI on this HEAD

Pushed `5cae68d`; because the earlier queue drained, CI actually ran:

| workflow | conclusion |
|---|---|
| Codacy Security Scan | success |
| M15-01 E3 Runtime Evidence | success |
| Microsoft Defender for DevOps | success |
| Fortify AST Scan | failure — fails **closed** before scanning (credentials absent) |
| APIsec | failure — same |
| Jscrambler Code Integrity | failure — same |
| Node.js CI | see §5.1 |

`gh run view --log` still returns `EOF` (blob host blocked) and the artifact zip for a run
redirects to `productionresultssa16.blob.core.windows.net`, which is also blocked — so CI
conclusions here come from the check-run API, and no CI log text is quoted as evidence.

### 5.1 Node.js CI `40778400346`

The run finished **after** the earlier revision of this report was written. Read from the
check-run API (not assumed, not inferred):

| fact | value |
|---|---|
| conclusion | **failure** |
| steps | 78 success · **1 failure = step #7, "Comprehensive canonical regression runner"** |
| steps #8 (collect) / #9 (upload evidence) | success |
| artifact | `12859663805` — `canonical-evidence-5cae68dc…`, 538,310 B |

The failure annotations name exactly one suite:

> `pull-bootstrap` — "Process completed with exit code 1." (its `29-pull.js` client tests
> are marked ✅ inside the same block)

**This is the load-bearing result for the a11y requirement.** Step #7 is the step that runs
`tests/a11y-runtime.js` with `CHROMIUM_PATH` exported by the workflow's own provisioning
step. Had the real axe scan failed, `a11y-runtime` would appear in the annotations next to
`pull-bootstrap`. It does not, and the step is all-or-nothing, so **`a11y-runtime` passed
under real CI Chromium on `5cae68d`** — the first independent, non-sandbox confirmation of
the fix.

Two honest caveats:

* This is **absence-of-failure corroboration**, not a quoted axe log. The annotation JSON
  (`ci-annotations-40778400346.json`) enumerates the failing suites; no per-suite axe
  summary is reachable because the blob host is blocked. A reviewer with network access
  should open artifact `12859663805` and read `SHA256SUMS` plus the per-gate logs.
* CI's overall conclusion is **failure**, and is reported as such. It failed on
  `pull-bootstrap` — see §4.3, which root-caused and fixed it.

### 5.2 Node.js CI on the fixed commit `3970f4c8` — **success**, both events

The failure in §5.1 was on the pre-fix commit. On `3970f4c8` the same workflow ran twice
(`push` and `pull_request`) and **both concluded `success`**:

| run | event | conclusion | step #7 (canonical regression runner) | artifact |
|---|---|---|---|---|
| `40791847578` | push | **success** | **success** | `12866136212` — `canonical-evidence-3970f4c8…`, 538,332 B |
| `40791855596` | pull_request | **success** | **success** | `12865447815` — `canonical-evidence-75e62de1…`, 538,258 B |

80 steps each; steps #8 (collect logs + a11y JSON + sha256) and #9 (upload) succeeded, and
the only annotations on the job are lint/deprecation **warnings** — no error annotations at
all.

This is the strongest evidence in the report, and it is discriminating rather than generic:
the *same* step #7 failed on `5cae68d` and `03190d9c` with `pull-bootstrap` as the sole red
suite, and passed on `3970f4c8` after the fix. A step that flips with the change, in the
environment that has PostgreSQL, Redis and Chromium provisioned, is exactly what
"M15-01 gate green" means. Consequences:

- **`a11y-runtime` passed under real Chromium** on the exact candidate, inside a job whose
  other 79 steps also passed — the runtime a11y proof the directive demanded.
- **`pull-bootstrap` passed in CI**, independently confirming §4.3.
- The full canonical runner passed in CI *including* the suites this sandbox cannot run
  (live PostgreSQL, Redis, browser), so the 63 local reds in §5b are proven to be sandbox
  absence, not repository defects.
- **`strict-verification-gate-a30.test` passed in CI too**, on both events — consistent with
  §4.2: the defect is intermittent and load-correlated, not deterministic.

### 5.3 Node.js CI on the final commit `a8057c2` — **success**, both events

| run | event | conclusion | step #7 | artifact |
|---|---|---|---|---|
| `40839674051` | push | **success** | **success** | `12886525695` — `canonical-evidence-a8057c20…`, 538,280 B |
| `40839682250` | pull_request | **success** | **success** | `12886397330` — `canonical-evidence-13ac8bb5…`, 538,407 B |

80 steps each, no failed step of any kind, steps #8/#9 (collect + upload evidence) green.
This is the run that confirms the gate-output fix, and it is discriminating: the **same**
step #7 failed on `7c3e240` with `FAIL M V-16 nothing-verified exit mutation target is
unique in the gate — occurrences=0`, and passed here after the exit line was restored and the
output made synchronous.

Timeline of the three CI verdicts on this work, so the sequence is not lost:

| commit | what it contained | step #7 |
|---|---|---|
| `5cae68d` | pre-fix: `pull-bootstrap` broken | failure (sole red: `pull-bootstrap`) |
| `7c3e240` | gate fix that deleted a mutation literal | failure (`occurrences=0`) |
| `a8057c2` | gate fix done correctly | **success** ×2 events |

All three are recorded; nothing is described as green that was not green.

---

## 5b. Second canonical run, on the fixed HEAD (`3970f4c8`)

The first run described the candidate *before* the `pull-bootstrap` fix, so it no longer
described the code being certified. A second complete run was executed on the exact commit,
from a clean tree, with the same command:

| field | value |
|---|---|
| commit | `3970f4c88c094449b25de4c2607c13d8a1c96974` |
| tree | `df58bb2973287b105ab7bf81301ee12d618f55c4` |
| command | `bash scripts/run-all-tests.sh` |
| started (UTC) | 2026-10-29T00:06:30Z |
| exit code | **1** |
| runtime | **5983 s** (99.7 min) |
| suites | **564 GREEN / 63 RED** of 627 |
| stdout | 2079 lines, 124,958 B, sha256 `913b038a…dad2` |

Raw evidence: `m15-01-chat2-2026-10-29/canonical-full.log` (whole stdout, unedited),
`…/EXITCODES.txt` (commit, tree, command, exit, runtime, per-suite attribution and the
sha256 of all 71 committed logs), and the per-suite logs for the 63 reds plus the seven
suites this directive touches.

Reds by missing runtime dependency — **none is a product verdict**:

| bucket | count |
|---|---:|
| live PostgreSQL / `psql` / `pg` module absent | 44 |
| live Redis absent | 14 |
| Chromium absent | 5 |
| **repository-controlled failures** | **0** |

Versus run #2 (561/66 on `5cae68d`): **+3 green, −3 red**. The three recovered are
`pull-bootstrap` (fixed in §4.3), `release-version-contract` (needed `git fetch --tags`, now
done) and `strict-verification-gate-a30.test` (intermittent — see §4.2; it passed here, which
is confirmation that its red is not deterministic and not a verdict about this commit).

Directive-relevant suites, all as required: `a11y-regressions` GREEN, `a11y-state-matrix`
GREEN, `docs-refs-check` GREEN, `supply-chain` GREEN, `pull-bootstrap` GREEN.

### 5c. Third local run, on the final commit `a8057c2`

Because the gate fix landed after run #3, the runner was executed once more on the exact
final tree: exit **1**, **564 GREEN / 63 RED** of 627 — the same distribution as run #3,
confirming the gate-output change moved nothing in the suite matrix. Its log is
`m15-01-chat2-2026-10-29/canonical-full.log`'s sibling run held on the operator's disk; the
committed `canonical-full.log` is the run whose SHA is printed in `EXITCODES.txt` (run #3 on
`3970f4c8`), and CI's own canonical runner on `a8057c2` is the authoritative full-run
evidence for the final commit (§5.3) — it passed with PostgreSQL, Redis and Chromium
available, i.e. **627/627 able to run**.

---

## 6. Limitations of this report (explicit)

1. **The real axe scan cannot run in this sandbox** — Chromium's download CDN is blocked and
   no apt package exists, so `tests/a11y-runtime.js` exits 3/2 by contract. The runtime proof
   therefore comes from CI, where step #7 of two runs on `3970f4c8` concluded **success**
   (§5.2). That is step-level evidence from an all-or-nothing job, not a quoted axe log; a
   reviewer with network access should read artifact `12866136212` / `12865447815`.
2. **No live PostgreSQL, Redis or Docker here.** 44 + 14 of run #3's 63 reds are that
   absence; the other 5 are Chromium. None is a product verdict — and CI, which *has* those
   services, ran the same runner green (§5.2).
3. **CI logs and artifacts are unreachable from here** (blob host blocked). Every CI claim in
   this report comes from the check-run/job/annotation API, which is why the job and step
   identifiers are quoted rather than log text.
4. **`strict-verification-gate-a30.test` is fixed, but the fix's own CI confirmation is
   pending** — it was green 40/40 under 10-way load locally and green in both CI runs on
   `3970f4c8` (before the fix), and the fix removes the mechanism (truncated pipe stdout)
   rather than retrying. The next CI run on the fix commit is what must confirm it.
5. **`node tools/strict-verification-gate.js` exits 1 on this branch, by design of scope.**
   Its 68 failing checks are the registry binding evidence to *older* commit SHAs while HEAD
   has moved (`head_sha mismatch` lines citing the current HEAD). Re-binding the registry is
   **promotion**, which this directive explicitly forbids, so the gate is left failing rather
   than made green by rewriting it. The a30 fix was proven behaviour-neutral here: the gate's
   output and exit code are **byte-identical** before and after it (`81451 B, 68 FAIL`, diff
   empty) — only the flush behaviour changed.
5. **Notion is not connected**; no sync was performed and none is claimed.

---

## 7. Verdict for this directive

| requirement | state | evidence |
|---|---|---|
| a11y root fix (theme-3 / student / record / `div[data-t="grades"]`) | **done** | `#1668f0`→`--primary-dark` `#0f4dc0`; 4.1764 → 6.446 (6.2763 on page bg); §1.1 |
| no assertion/coverage/theme/route removed; source+built HTML in sync | **done** | §1.2, §1.3, 90/0 + 21/0 |
| runtime a11y proof on the exact candidate | **done via CI** | step #7 green twice on `a8057c2` with the workflow's Chromium; §5.3 |
| mutation: restoring the colour turns the suite red | **done** | revert → 4.289 FAIL, exit 1; §1.4 |
| `docs-refs-check` fresh-zero vs baseline 255 | **done** | matcher tightened in-tool, 37/37; §2 |
| `supply-chain` SC-01/SC-05 | **done** | SBOM regenerated, dependency change proven, `--check` exit 0; §3 |
| full canonical run on the exact candidate | **done 3× locally + 2× in CI** | runs #2 (561/66), #3 (564/63), final (564/63); CI runner green twice on `a8057c2`; §4, §5b, §5c, §5.3 |
| report with SHA and limitations | **done** | this file |
| no merge, no registry promotion | **respected** | nothing merged; registry untouched (which is why the gate still exits 1, §6.5) |

Two repository-controlled defects were found and **fixed at their cause**: `pull-bootstrap`
(a dated fixture that was scheduled to fail — §4.3) and the gate's own output truncation
(async pipe stdout discarded by `process.exit` — §4.2). Both were mutation-verified, and both
fixes were confirmed by CI on the commit that carries them.

What is still open, and honestly why:

1. **SI-013 key rotation** — owner-exclusive; no owner action was discharged here and none is
   claimed.
2. **Fortify / APIsec / Jscrambler** — fail closed at credential steps in CI; they never scan,
   so there is no scan result to report.
3. **Registry re-binding** — deliberate: the gate's 67-68 failing checks are evidence bound to
   earlier SHAs; re-binding it is promotion, explicitly out of scope for this directive.

`M15-01: OPEN — ACTIONABLE DEFECTS REMAIN`

The remaining items are one owner-exclusive security action, three credential-gated scanners,
and a promotion step this directive forbids. Nothing in the repository's own test surface now
fails on its own merits: on `a8057c2`, the full canonical runner is green in CI (with
PostgreSQL, Redis and Chromium present) and 564/627 locally with all 63 reds attributable to
that absent infrastructure.
