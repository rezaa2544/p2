# M15-01 mission 2 — coordination matrix (Chat1 / Coordinator)

**Date:** 2026-10-28 · **Role:** Chat1 — Coordinator (existing role; no new channel, no new role created)
**Branch under this session:** `arena/f75d9f00-p2` (PR **#498**). M15-02 / Issue #468 **not started**.
**Verdict carried forward:** `M15-01 BLOCKED — OWNER/INFRASTRUCTURE ACTION PROVEN NECESSARY`.

This document exists to stop three PRs from reporting the same tree in three different ways. It
separates *which commit was actually measured*, records the three canonical reds from
`check-run 122443948372` with their exact-candidate reproduction, and lists what remains.

---

## 1. Truth re-read at the start of this coordination pass

| Field | Value | How it was read |
|---|---|---|
| `origin/main` | `fff1beae09ff45d69e554f8c000a9d15b75d968c`, tree `07979cd4ee3f0fef4418503f6e3529419e401070` | `git fetch` + `git rev-parse origin/main^{tree}` |
| **PR #484 head** | `344a9dbf82fe9dafc0b8bf9fa5ed2b5334998272` (branch `arena/0008c4f4-p2`), `MERGEABLE`, **no review decision** | `gh pr view 484` |
| **PR #484 merge candidate** | `3222709cfd96abf94bd5902b31d489b169e6d860` — 2 parents `fff1beae` + `344a9dbf`, created `2026-10-27T20:15:31Z` | `gh api repos/…/commits/3222709c` |
| PR #495 | **CLOSED, not merged** (head `17a1521e`) | `gh pr view 495` |
| PR #497 | **MERGED** `2026-10-27T14:04:22Z` | `gh pr view 497` |
| Issue #468 | **OPEN** | `gh issue view 468` |
| PR #499 (Channel 4) | OPEN, head `6d0aa735ce0c606fb2d8c3786a314b255869893e` | `gh pr view 499` |
| PR #498 (this session) | OPEN, head `9c1617c` before this document | `gh pr view 498` |
| `gh` token on `actions/secrets` | **403 `Resource not accessible by integration`** | `gh api repos/…/actions/secrets` |
| Repository permissions reported for the token | `admin: true`, `push: true`, `maintain: true` — yet secrets are still 403 | `gh api repos/rezaa2544/p2` |

The permissions row is the interesting one and it is not a contradiction: the integration presents
itself as an admin **of repository content**, while `actions/secrets` needs the separate `Secrets`
permission that GitHub only grants to a user token or an app with that scope. It is recorded here
because it is the *proof* used in §6, not a curiosity.

---

## 2. Lane separation — the rule this matrix is built on

A result is only meaningful with the lane attached to it. Four different things are called "the
build" in this repository right now:

| Lane | What it measures | Why it must not be mixed with the others |
|---|---|---|
| `push` on a branch | branch tip, unmerged | fails **V-06** by construction (`HEAD ⊄ origin/main`) — 708/1 vs 709/0 on the same bytes |
| `pull_request` on a branch | branch tip + PR context | the lane that gates the merge; the only lane where V-06 does not fire |
| **merge candidate** `3222709c` | the *result* of merging #484 into `fff1beae` | a GitHub synthetic commit: no CI runs on it directly; only reproducible locally (this document does that) |
| full CI job on a runner with PG/Redis/Chromium | the only place live suites can pass | a local sandbox without those services cannot exceed 626/627 (§3.4) |

**Measured example of the trap:** PR #484's committed evidence manifest cites HEAD
`46c45041cd2aef2ee69860aca2f04ba667ce4e0d`, tree `cebaa0e6…` — which is **neither** the current head
`344a9dbf` **nor** the merge candidate `3222709c`. Its `gate.log` row records `exit 1` with the note
"expected on a branch head". Both facts are legitimate for what they measured; neither is a
statement about the merge candidate.

---

## 3. Unified matrix

Legend: **PASS** = measured green with the evidence attached · **FAIL** = measured red · **BLOCKED** =
cannot be executed in the available environment (with the reason proven) · **NOT RUN** = no execution
attempted, stated as such.

### 3.1 Canonical suite — three exclusive rows

| # | Acceptance criterion | SHA measured | Command | Result (full output) | Exit | Runtime | Artifact (name / size / digest) | Runner | Limitation |
|---|---|---|---|---|---|---|---|---|---|
| C-1 | Canonical suite green on the PR lane | `fe2edfd` → run [40609644397](https://github.com/rezaa2544/p2/actions/runs/40609644397) | `npm run test:all` (workflow step) | **PASS**, all steps success | 0 | 5 296 s | `canonical-runner-log-pull_request-da77e564…-1`, 506 720 B, **digest unavailable here** (download blocked, §3.5) | GitHub runner, PG 17 + Redis + Chromium | transcript not fetchable from this sandbox |
| C-2 | Canonical suite green on the PR lane, final head | `60a78ba` → run [40618844814](https://github.com/rezaa2544/p2/actions/runs/40618844814) | same | **PASS** | 0 | 5 776 s | `canonical-runner-log-pull_request-b3b78a51…-1`, 506 793 B, digest unavailable | same | same |
| C-3 | Canonical suite green on **PR #484's merge candidate** | `3222709c` | `npm run test:all` on a merge of `fff1beae`+`344a9dbf` | **FAIL** — `check-run 122443948372`, three suites (§4) | 1 | 5 915 s (20:15:34→22:47:00Z) | `canonical-evidence-3222709c…`, 537 955 B, digest unavailable | GitHub runner, PG+Redis+Chromium | artifact named after the merge candidate but **was produced on head `344a9dbf`** (run meta `head_sha=344a9dbf`) — see §4.4 |

Row C-3 is the reason this document exists: the artifact's *name* references `3222709c`, the run's
`head_sha` is `344a9dbf`. The two are the same tree only if the merge is a fast-forward, which it is
not (it is a real 2-parent merge commit). Treat that artifact as **head-only evidence**.

### 3.2 The three canonical reds — status per criterion

| # | Suite / criterion | Merge candidate `3222709c` | Fix exists and is verified? | Owner of the fix | Lane of the proof |
|---|---|---|---|---|---|
| R-1 | `a11y-runtime` — zero `serious` violations (`color-contrast`, `div.tab.active`, theme-3/student/record) | **FAIL** (axe: `#1668f0` on `#e4edfe` = **4.18:1** < 4.5) | **yes** — root fix + deterministic guard on `arena/f75d9f00-p2` (`c9b9fc1`); same CSS fix already present on **PR #499** | Chat1 (guard) + Chat4 (#499 CSS, Chromium-verified) | local token math + `tests/a11y-contrast-tokens.js` 32/32; CI Chromium on the landing branch |
| R-2 | `supply-chain` — SC-01/SC-05 (SBOM fingerprint, approved drift) | **FAIL** (SC-01 stale SBOM, SC-05 drift `@opentelemetry/resources`) | **yes**, mechanical and proven on the candidate itself | either PR, whoever lands | `node tools/supply-chain-audit.js --write` → `tests/supply-chain.js` **7/7** on `3222709c` |
| R-3 | `docs-refs-check` — no fresh stale reference / counts match the baseline | **FAIL** — but it is a **false positive** (§4.3) | **yes** — narrowed count rule + 5-case control on `arena/f75d9f00-p2` (`c9b9fc1`) | Chat1 | patched suite on the candidate's own tree: **30/30** |

### 3.3 PR #484's other reds (same run)

| Check | Result | Classification |
|---|---|---|
| `STRICT — 3-AI Evidence Gate` (`632/66`) | **FAIL** | stale single-phase registry binding — **already superseded** by the lineage witness on #498 (OD-3 closed by protocol, L1–L4) |
| `Production truth gate` step | **skipped** | `if: env.DATABASE_URL != ""` with no service containers on that branch — Channel 4's own finding |
| `Trigger_APIsec_scan`, `Fortify-AST-Scan`, `Jscrambler` | **FAIL** | credential guards (§6) |

### 3.4 Local sandbox — what it can and cannot say

| # | Criterion | Command | Result | Exit | Runtime |
|---|---|---|---|---|---|
| L-1 | Product test chains | `npm test` | **PASS** 40/40 + 31/31 + smoke 547/547 | 0 | 71 s |
| L-2 | Canonical suite locally | `bash scripts/run-all-tests.sh` | **565 GREEN / 62 RED** (every red classified: PG/Redis/Chromium/Docker absent; 1 real defect, fixed) | runner prints `DONE` | 5 896 s |
| L-3 | Strict gate, push lane | `node tools/strict-verification-gate.js` | **708 pass / 1 fail** — only V-06 | 1 | 2 s |
| L-4 | Strict gate, PR lane | `GITHUB_EVENT_NAME=pull_request node tools/strict-verification-gate.js` | **709 pass / 0 fail, VERIFIED** | 0 | 2 s |
| L-5 | Provenance audit | `node tools/registry-provenance.js --audit` | **PROVENANCE VALID**, 16 witness paths, 0 changed | 0 | 1 s |
| L-6 | Token contrast guard | `node tests/a11y-contrast-tokens.js` | **32/32** | 0 | 0.2 s |
| L-7 | docs-refs suite | `node tests/docs-refs-check.js` | **30/30** | 0 | 1.3 s |
| L-8 | Live-PG / live-Redis / Chromium suites | — | **BLOCKED** — no server on 5432/6379, no `chromium`, no `psql` binary | — | — |

L-2 is why L-1 alone is not evidence of the product: `npm test` is a subset of the repository.

### 3.5 Artifact digests — stated honestly

Every CI artifact row above has a **name** and a **size** read from `api.github.com`, and **no
digest**: authorizing a download redirects to `productionresultssa0.blob.core.windows.net`, which is
outside this sandbox's allowlist (`gh run download` → `EOF`, `curl -L` → `302` with 0 bytes). The
digests that *are* recorded in this repository are the ones for the logs committed under
`docs/verification/evidence/`, listed in `m15-01-canonical-run-MANIFEST.md`.

---

## 4. The three canonical reds, one at a time

### 4.1 R-1 — `a11y-runtime`: `div.tab.active`, theme-3, 4.18:1

Verbatim from `check-run 122443948372`:

```
A11Y-EVIDENCE {"totals":{"critical":0,"serious":1,…},"first_failures":[{"theme":"theme-3",
 "role":"student","route":"record","rule":"color-contrast","impact":"serious",
 "node":{"target":"div[data-t=\"grades\"]","html":"<div class=\"tab active\" …>📝 کارنامه</div>",
 "contrast":[{"fg":"#1668f0","bg":"#e4edfe","ratio":4…}]}}]}
```

**Root cause (measured, not argued).** The element's colour is `var(--primary)` and theme-3 defines
`--primary: #1668f0`. Against that theme's surfaces:

| token pair (theme-3) | ratio | AA (4.5) |
|---|---|---|
| `--primary` on `--primary-soft` `#e3edff` | **4.17** | ✗ |
| `--primary` on `--surface-2` `#e8f0fe` | **4.29** | ✗ |
| `--primary` on `--bg` `#f0f4fc` | **4.46** | ✗ |
| `--primary-dark` `#0f4dc0` on all of the above | **6.27 – 7.39** | ✓ |

So `--primary` is a **fill** token (white on it is 4.92 ✓) that must not be used as a *text* colour on
tinted surfaces. That is also the answer to "why was it intermittent for months": the old scan ran
against whichever theme happened to be active, mid-transition, so the same node was only sampled
sometimes — the defect was constant, the sampling was not.

**Fix and its proof.**
* CSS: every place where `--primary` was a *text* colour now uses `--primary-dark`
  (`.tab.active`, `.back-btn`, `.sync-chip.busy`), rebuilt into `index.html`.
* Guard: `tests/a11y-contrast-tokens.js` (new, deterministic, no browser) computes WCAG 2.1 ratios
  from the theme tokens, asserts text tokens ≥ 4.5 on **every** surface of **every** theme, and
  enforces the rule "`--primary` is a fill, not text" across all stylesheets. It carries its own
  controls (black/white = 21; the historical failing pair must classify as failing; the replacement
  must pass; a planted `color:var(--primary)` must be caught). **32/32.**
* It was red on the pre-fix tree with exactly the three offenders Chat 2 had already fixed two of —
  an independent confirmation of the diagnosis, not a coincidence.

**Deduplication, stated plainly:** PR **#499** already carries the same three rule changes and has
Chromium-verified them (its own report cites 4.17 → 6.09–6.62 across three themes). This branch's CSS
change is therefore **duplicate work by design** and its final commit aligns the tab border token with
#499 so that whichever lands second brings nothing new to those lines. The **guard** is not
duplicated: #499 adds fixture-style guards (`a11y-regressions.js`), this branch adds token-level math
that needs no browser.

### 4.2 R-2 — `supply-chain`: SC-01 + SC-05

Verbatim: `❌ SC-01 … SBOM lockfile fingerprint is stale` and
`❌ SC-05 … package-lock.json SHA-256 drift detected; direct dependency drift: @opentelemetry/resources`.

**Root cause.** `main` received a Dependabot bump (`@opentelemetry/resources` → `^3.0.0`) that changed
`package-lock.json` (current lockfile sha256 `b7b13ed2…f701`), but the three tracked artifacts that
record that fingerprint — `docs/SBOM.spdx.json`, `docs/THIRD_PARTY_LICENSES.md`,
`docs/DEPENDENCY_DRIFT_BASELINE.json` — were not regenerated. Nothing is wrong with the gate; it is
doing exactly what it was written for.

**Fix proven on the exact candidate** (this is the strongest evidence in this document):

```
# inside a checkout of 3222709c (the merge candidate), unmodified
node tools/supply-chain-audit.js --write   → Wrote SPDX SBOM, license inventory, and drift baseline for 194 packages.
node tests/supply-chain.js                 → supply-chain: 7/7 checks ✅
```
including `SC-07 simulated lockfile drift is detected` — i.e. the gate still bites. No assertion was
touched, no dependency was changed by this repair.

**One decision this repair cannot make for the team.** Regenerating the baseline *approves* the
lockfile present in the tree. This branch (#498) resolves the drift by keeping
`@opentelemetry/resources` at `^2.12.0`; `main`/`#484` carry `^3.0.0`. Whichever tree lands last must
regenerate the three artifacts **on that tree**. If #484 lands first with a baseline approving 3.0.0
and #498 then merges, #498 must re-run the regeneration — otherwise SC-05 fires again. This is a merge
ordering constraint, not a defect in either branch.

### 4.3 R-3 — `docs-refs-check`: the count false positive

Verbatim (the offending path is written without its directory, because that file exists only on
PR #484's branch; a cross-branch path in *this* tree is a genuine stale reference, and the pre-flight
caught exactly that when this document was first drafted):
`❌ همهٔ شمارهای نوشتهشده با فایلِ خطِ پایه میخوانند — …/evidence/M15-01_EXECUTION_MISSION2_2026-10-27.md = 0 (درست: 255)`.

That the gate refused this document's own first draft is worth recording: a coordinator writing about
a sibling branch is the most likely author of a cross-branch reference, and the check did its job.

The document's only offence is a table row that quotes the tool:

```
| `tools/docs-refs-check.js` | 0 | ۰ ارجاعِ کهنهٔ تازه |
```

The phrase «ارجاعِ کهنه» occurs in **two different numbers the tool prints** — the baseline debt
(255) and the fresh-reference count (0). The suite's regex `([۰-۹0-9]+)\s*(?:ارجاعِ کهنه|موردِ تاریخی)`
matched the second and read it as "the baseline is 0". **Any** chat that quotes the tool's success
line went red; it hit this document and twice hit my own report before it.

**Repair:** the count is still checked; the phrase must now be a *baseline* claim
(`(?!ٔ?\s*تازه)`), with a five-case positive/negative control inside the suite.

**Measured on the candidate's own tree**, with no edit to #484's files:

| Suite version on `3222709c` | Result |
|---|---|
| the candidate's own `tests/docs-refs-check.js` | **28/29**, failing exactly on that row |
| this branch's patched suite | **30/30** |
| patched suite + a planted *wrong* baseline claim (the historical number `۱۱۸`, the one from the original bug this group exists for) | **red, naming the document** (control intact) |

### 4.4 What the candidate artifact does and does not prove

`canonical-evidence-3222709cfd96abf94bd5902b31d489b169e6d860` (537 955 B) is attached to run
`40576420090`, whose `head_sha` is `344a9dbf` — **the head, not the merge**. It proves the three reds
on the head. It does **not** prove anything about the merged tree, which is why §4.1–4.3 were
re-measured locally on `3222709c`. A run whose `head_sha` is the merge commit is not possible from a
PR branch; the equivalent is a local battery on `3222709c`, which is what this document did.

---

## 5. Duplicate and conflicting work across the three PRs

| File / area | #484 (Chat2) | #499 (Chat4) | #498 (Chat1, this session) | Risk |
|---|---|---|---|---|
| `src/styles/base.css` contrast rules | fixes 2 of 3 (`back-btn`, `sync-chip.busy`) | fixes all 3 + toast/motion + more | fixes all 3, aligned byte-for-byte with #499 | **conflict on 3 lines** — resolved by alignment; merge order irrelevant for those lines |
| `index.html` (built bundle) | rebuilt | rebuilt | rebuilt | **guaranteed conflict** if two land without rebase; the bundle is generated, so the rule is "rebase, then `node build.js`, then commit" |
| `tests/a11y-runtime.js` | 3-theme loop + full node diagnostics | 3-theme loop + settle/fonts + extra CI iterations | untouched | two competing harness rewrites — **pick one**; #499's is Chromium-verified more times |
| registry binding / gate | single-phase `head_bound` (stale → `632/66`) | "two-phase provenance" | lineage witness (`tools/lib/verification-witness.js`), OD-3 closed by protocol L1–L4 | **three designs for one contract** — must be settled before any of them merges, or the gate has two truths |
| `supply-chain` artifacts | stale | lockfile recovered | regenerated + `SC-07` control | merge-order constraint (§4.2) |
| canonical evidence upload | artifact named after merge candidate | — | artifact on every outcome | duplicate mechanism; harmless |

**Recommendation (coordination, not a decision I can make alone):** land in the order #499 → #484 →
#498, because #499 carries the most Chromium-verified a11y surface, #484 carries the harness expansion
and the API layer, and #498's gate design is the one that makes the second landing *not* invalidate the
first's evidence (a landing that keeps `head_bound` as an ancestor stays valid; the other two designs
do not have that property). Every landing must be followed by: regenerate `supply-chain` artifacts on
the merged tree, `node build.js`, re-emit the registry, and re-run both gate lanes.

---

## 6. Fortify / APIsec / Jscrambler, and SI-013 — who can actually do it

No secret is requested, printed, or stored anywhere in this document. What follows is the
**authorization** question, answered from what the workflows themselves declare.

| Capability | What the workflow needs | Where it is wired | Who can supply it (proven, not assumed) |
|---|---|---|---|
| Fortify AST / SSC / Debricked | `FOD_TENANT`, `FOD_USER`, `FOD_PAT` (or `FOD_CLIENT_ID`/`FOD_CLIENT_SECRET`), `SSC_TOKEN`, `SC_CLIENT_AUTH_TOKEN`, `DEBRICKED_TOKEN` | `.github/workflows/fortify.yml:132-168` | **repo owner / an app with the `Secrets` permission.** Proof: this integration returns `403 Resource not accessible by integration` on `actions/secrets` even though it reports `admin: true` on the repo — the secrets API is a separate grant |
| APIsec | `apisec_username`, `apisec_password` | `.github/workflows/apisec-scan.yml:76-78` | same |
| Jscrambler | `JSCRAMBLER_APPLICATION_ID`, `JSCRAMBLER_SECRET_KEY`, `JSCRAMBLER_ACCESS_KEY` (+ a `jscrambler.json` with the protected-domain list) | `.github/workflows/jscrambler-code-integrity.yml:54…` | same |
| SI-013 rotation | knowledge of whether the value quoted in the 2026 audit report is **live in production** | the value is quoted in `docs/audit/ARENA6_SECURITY_AUDIT_REPORT_ecc8b40b.md` as that report's own evidence | **the holder of the production secret** — a repository cannot answer "is this the value my production process uses"; only the environment that runs with it can |

Three cross-checks were done before calling these owner-exclusive: the guard step inside each workflow
is *itself* the failing check (so the workflow is behaving correctly); the secrets endpoint is
unavailable to this integration (403); and no `FOD_*` / `apisec_*` / `JSCRAMBLER_*` / `SSC_*` variable
exists in the execution environment. Nothing else is blocked by the same gate.

---

## 7. Notion — two different things that share a name

| Thing | What it writes | Evidence it worked | Status |
|---|---|---|---|
| `notion-sync.yml` (general) | status blocks/headings on a configured page, with **PATCH-then-GET read-back** built into the workflow (`…:145`) | the workflow run is green (`40554919750`, `40618844869`-adjacent runs) | **PASS as a mechanism** |
| M15-01 **detailed report** mirror | the narrative of `docs/M15-01_RECOVERY_REPORT_2026-10-27.md` | — | **NOT RUN** — there is no M15-01-specific sync step, and the interactive connector answers `auth_error` ("connection is no longer valid") |
| `Payesh Watch — Autonomous Monitoring` | its verdict into Notion | its single step is the write; it fails | **FAIL** — same `auth_error` root |

So "Notion is synced" is true only for the general status block. **The detailed report is not mirrored,
and a read-back is required before any claim that it is.** A read-back that satisfies the owner's own
standard needs the connector (currently unauthenticated) or a workflow that writes *and then reads
back the same block*, which is the pattern `notion-sync.yml` already implements — reusing it is the
smallest honest path.

---

## 8. Independent verification — current state

| Subject | Reviewer | Decision | Independence |
|---|---|---|---|
| PR #484 `344a9dbf` | Channel 4 (`PR #499` implementer) — comment `2026-10-27T15:03:05Z` | **FAIL (NOT READY)** — stale registry binding `632/66`, skipped production truth gate | cross-channel: reviewer did not write #484's code. **Counts as independent for #484** |
| PR #499 `6d0aa73` | none recorded | — | its author also reviewed #484 — reviewing back would not be independent |
| PR #498 (this branch) | **none** | — | no second reviewer exists in the model (`required_reviewers: ['arena']`, single slot); a bot comment is not a reviewer |
| `CERTIFIED` status anywhere | — | unreachable | V-18 caps at one slot by design |

Requesting "Hermes" or any new reviewer is **not** something this role can create (no new roles, no new
channels), and the repository's reviewer model declares exactly one slot. Therefore:

* the strongest independence available today is **cross-channel** (Chat4 reviewing Chat2's #484), which
  already happened and produced a decision;
* the equivalent for this branch would be the same cross-channel pattern, and it is **NOT DONE**;
* the honest status of §8 in every report is **NOT DONE — one reviewer slot**, never "independently
  verified".

---

## 9. Remaining blockers

| # | Blocker | Class | Owner | Smallest next action | Proof it is exclusive |
|---|---|---|---|---|---|
| B-1 | E4-01…E4-07 (0/7) | infrastructure | owner | provision the seven targets listed in the report's §9.5, or rule them out of scope | probe exists and returns `BLOCKED` with the exact missing variable per drill |
| B-2 | Fortify / APIsec / Jscrambler | credentials | owner | add the secret sets in §6 | guard step is the failing check; secrets API 403; no env vars |
| B-3 | SI-013 rotation | decision | owner | decide rotate / purge / accept-with-expiry | "is it live in prod" is unanswerable from the repository |
| B-4 | OD-2 (`push` trigger vs V-06) | decision | owner | narrow the trigger to `pull_request` + `push: main`, **or** scope V-06 to `refs/heads/main` | both measured on identical bytes: 708/1 vs 709/0 |
| B-5 | OD-4 (official item count 29/32/39) | ratification | owner | ratify **32** | gate no longer reads the count; it is a description question |
| B-6 | `offline-e2e` once red on the `push` lane | engineering | team | wait for the next artifact-bearing run and read the transcript | green on PR lane and locally 23/23; annotation truncated; log host unreachable |
| B-7 | Independent review / `CERTIFIED` | policy | owner | provide a second reviewer slot | single `arena` slot (V-18) |
| B-8 | Notion detailed-report mirror | connector | owner | reconnect the connector, or approve reusing `notion-sync.yml`'s write-then-read-back pattern for the M15-01 page | connector `auth_error` |
| B-9 | Three competing gate designs (#484 single-phase, #499 two-phase, #498 lineage) | coordination | team | pick one before merging any of them | all three change the same contract; two of them can report different truths for the same tree |

**اقدام مالک (owner actions):** B-1, B-2, B-3, B-4, B-5, B-7, B-8 — each with the proof column above.
Nothing here asks the owner to run a command, read a log, analyse output, or coordinate.

---

## 10. Verification of this document's own claims

| Claim | How to re-run it |
|---|---|
| `3222709c` is a 2-parent merge of `fff1beae` + `344a9dbf` | `gh api repos/rezaa2544/p2/commits/3222709c --jq '.parents[].sha'` |
| the run's artifact was produced on the head, not the merge | `gh api repos/rezaa2544/p2/actions/runs/40576420090 --jq .head_sha` |
| SC-01/SC-05 repair works on the candidate | `cd <candidate tree> && node tools/supply-chain-audit.js --write && node tests/supply-chain.js` → `7/7` |
| docs-refs red is a false positive | `cd <candidate tree> && node tests/docs-refs-check.js` → `28/29`; with this branch's suite → `30/30` |
| tab contrast is 4.18:1 and the fix is ≥6.2:1 | `node tests/a11y-contrast-tokens.js` (it prints both numbers as controls) |
| the secrets endpoint is closed to this integration | `gh api repos/rezaa2544/p2/actions/secrets` → 403 |
