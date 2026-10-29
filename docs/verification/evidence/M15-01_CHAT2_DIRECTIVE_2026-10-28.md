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

## 4. Canonical run (full, on the exact candidate)

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
not environmental. It is an open repository defect that predates this branch; fixing it is
outside this directive and was not attempted, so it is recorded as OPEN rather than
explained away.

**`strict-verification-gate-a30.test`**: passes standalone **1×** and **4× concurrently**
(`CHECKS 21 FAIL 0` every time), and fails only inside the runner's *copy-mode* lane, where
`.git` is a symlink to the real repository and the fixture's `git init` runs one directory
away. The failing assertions are `honestly blocked registry conforms to the contract` and
`… is never reported VERIFIED`, with the gate reporting `parent_count=0` for the fixture's
root commit. **Root cause not yet established**; the next step is to instrument the lane's
copy preparation (the `.git` symlink at `scripts/run-all-tests.sh:400`) and re-run with the
fixture's commit graph dumped. It is recorded as OPEN — it is *not* labelled flake, and it
was not "fixed" by retrying.

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

Recorded at the time of writing in `EXITCODES.txt`; the canonical step (#7) is the one that
carries `tests/a11y-runtime.js` with `CHROMIUM_PATH` set by the workflow's own provisioning
step. **No PASS is claimed here** — the run's own conclusion is the only thing that can
establish it, and it must be read from the API, not assumed.

---

## 6. Limitations of this report (explicit)

1. **The real axe scan did not run in this sandbox.** Chromium download is blocked; the
   suite exits 3/2 accordingly. Only CI can produce that evidence, and CI's verdict is not
   yet in hand.
2. **No live PostgreSQL/Redis/Docker.** 55 + 4 of the 66 canonical reds are that absence;
   none of them is a product verdict.
3. **CI logs and artifacts are unreachable from here** (blob host blocked). A reviewer with
   network access can fetch artifact `12770162844`/later ones and verify the embedded
   `SHA256SUMS`.
4. **`pull-bootstrap` and `strict-verification-gate-a30.test`** are open, as detailed in
   §4.2; the first is inherited from `main`, the second is not yet root-caused.
5. **Notion is not connected** in this session; no sync was performed and none is claimed.

---

## 7. Verdict for this directive

The three asked-for fixes are **complete, measured and mutation-verified**, and the full
canonical run is recorded with its real exit code and runtime. What is *not* established is
the runtime axe result on this SHA (blocked by the sandbox's network policy) and the root
cause of one lane-only red. Both stay OPEN.

`M15-01: OPEN — ACTIONABLE DEFECTS REMAIN` (`pull-bootstrap` on main; a30 lane red;
CI verification of the axe scan pending).
