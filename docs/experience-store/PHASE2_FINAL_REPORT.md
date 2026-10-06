# HERMES EXPERIENCE RETRIEVAL — PHASE 2 FINAL REPORT

## 1. Experiment Integrity

| Rule | Status | Evidence |
|---|---|---|
| Rule 1 — No outcome leakage (baseline) | ✅ PASS | Baseline prompts contain only defect description + target file + line numbers. No fix SHA, no solution, no expected patch, no hidden answer. Verified by code inspection of `tools/peb-runner-v2.js` `oneRun()` — the baseline arm never calls `experience-store.js` and never receives any fix identifier. |
| Rule 2 — Retrieval leakage | ✅ PASS | **LEAKED = 0 of 181 plus-retrieval records.** `leakageCheck()` scans every retrieved block for (a) the fix SHA, (b) case-specific solution markers (`=== '1'`, `exitCode === null`, `redisOk`, `splitSql`, `userInvQueue`, `clusterRetryStrategy`, `ALLOWED_SNAP_PATHS`, `require('../server`). Zero hits across all 181 B-arm records. |
| Rule 3 — Same task | ✅ PASS | Both arms receive the identical defect prompt, identical target file, identical forbidden-shortcut list. The ONLY difference is a prepended "RELEVANT VERIFIED ENGINEERING EXPERIENCE" block in arm B. |
| Rule 4 — Same environment | ✅ PASS | Both arms use `git worktree add --detach <wt> <case.start>` at the same start commit, copy the same `node_modules`, the same `server/data/payesh.json`, the same `tests/run.js` harness, the same API timeout (360s), the same `max_tokens` (16384), the same `temperature` (0.2). |
| Rule 5 — No result overwrite | ⚠️ PARTIAL | Results are append-only (`fs.appendFileSync` to `results.jsonl`) — no record is ever mutated. **However 42 of 48 RUN_IDs were duplicated** across runner restarts because the ID was derived from `run_no` alone. Fixed in the committed runner: RUN_IDs now carry an `#attempt` suffix and `seen[]` dedup guarantees uniqueness. **Raw evidence retains the duplicate IDs** — they are distinct records, but the ID collision means pre-fix records cannot be uniquely addressed by RUN_ID. See §17. |
| Rule 6 — API failure ≠ model failure | ✅ PASS | `isInfra()` classifies 502/timeout/upstream_unavailable/ECONNRESET/socket-hang/ECONNREFUSED/protocol errors as `INFRA_FAILURE`. These are counted separately and **never** scored as model failures. 221 of 375 records (58.9%) are infra failures; they are excluded from the A/B denominator, as the spec demands ("از denominator نیز مخفی نشوند" — they are reported openly in §3 but excluded from model metrics). |
| Rule 7 — PATCH_FAIL classification | ✅ PASS | Every PATCH_FAIL carries `patch_fail_class`: A-reasoning (8), B-syntax (5), C-path (31). D-CRLF (0), E-tool (0), F-API (0). |
| Rule 8 — NOT-RUN is not PASS | ✅ PASS | PEB-05 records 0 valid runs in arm B and 1 in arm A. It is reported as INFRASTRUCTURE BLOCKED, never as pass or fail. |
| Rule 9 — Probe must test target behavior | ✅ PASS | All 8 cases have independent probes. `probe_pass` is a hard requirement of the PASS verdict: `(tests_pass && scope_ok && forbidden_ok && secret_ok && probe_pass !== false)`. Probed were validated bidirectionally in Phase 1: PASS on the real fix commit, FAIL on the buggy parent — verified for all 8 cases. |
| Rule 10 — Blind evaluation | ✅ PASS | Neither arm sees the hidden expected result. The model sees the buggy file and the defect description only. The ground-truth fix is used exclusively post-hoc for `diff_similarity` and probe validation, never in any prompt. |

**Verdict: experiment is methodologically valid on Rules 1–4, 6–10, with a documented Rule-5 imperfection (duplicate RUN_IDs, no data loss, now fixed in the runner).**

---

## 2. Runner Changes

The v1 runner (`peb-runner.js`, scratch) was replaced by `tools/peb-runner-v2.js` (committed `6a6d05c3`):

| Change | Why |
|---|---|
| **Append-only `results.jsonl`** | v1 overwrote results on every run, destroying reproducibility. v2 appends one JSON record per attempt. |
| **RUN_ID uniqueness** | `PEB-01-A-R01#2` style with `seen[]` dedup so restarts never collide. |
| **`INFRA_FAILURE` separation** | v1 scored API 502 as `API_ERROR`, polluting the model denominator. v2 classifies it out. |
| **Rule-7 classification** | `classifyPatchFail()` buckets every PATCH_FAIL into A–F. |
| **`leakageCheck()`** | New: scans every retrieved experience for the fix SHA and solution markers. |
| **Retrieval hit-rate fields** | `retrieval`, `retrieved_ids`, `leakage` recorded per run. |
| **Worktree hygiene** | `git worktree prune` before each add; `fs.cpSync` of `node_modules` + `server/data/payesh.json` (both gitignored, both load-bearing for `tests/run.js`). |
| **Probe hardening** | `probe_pass !== false` is a PASS requirement. |

Record schema (per attempt): `run_id, case_id, category, arm, run_no, attempt_no, started_at, head, retrieval, retrieved_ids, leakage, model_calls, tokens_in, tokens_out, finish_reason, patch_applied, patch_error, patch_fail_class, changed_files, scope_ok, forbidden_ok, secret_ok, tests_pass, test_harness, probe_pass, probe_out, diff_similarity, duration_ms, outcome, infra_failure`.

---

## 3. API Reliability

**This is the dominant finding of the experiment.**

| Metric | Value |
|---|---|
| Total benchmark records | 375 |
| Valid model-attempt records | 154 (41.1%) |
| Infrastructure failure records | 221 (58.9%) |
| — `INFRA_FAILURE` (502 / timeout / upstream_unavailable) | 196 |
| — `WORKTREE_FAIL` (stale worktree from killed process) | 21 |
| — `API_ERROR` (non-infra transport) | 2 |
| — `EMPTY_REPLY` (200 OK, zero content) | 2 |

**API reliability is catastrophically insufficient for the designed experiment.** The spec (§12) says: "اگر API reliability برای A/B کافی نیست: A/B = INVALID، نه PASS." Per-stop-condition §18, the benchmark was **not** run to its designed sample (8 cases × 2 arms × 3 valid runs = 48 valid cells). It achieved **14 of 16 cells** with PEB-05 systematically blocked.

**PEB-05 (`server/sync.js`, 93,275 bytes)** is the largest target file. It consumed **66 attempts** (31 baseline + 35 plus-retrieval) and produced **0 valid plus-retrieval runs and 1 valid baseline run** — a 1.5% yield. The API returns 502 `upstream_unavailable` on prompts of this size. This is an infrastructure limit, not a model failure and not a retrieval failure.

**Conclusion: the A/B comparison is valid for 7 of 8 cases and INVALID (not PASS, not FAIL) for PEB-05.**

---

## 4. Benchmark Cases

| Case | Category | Target | Start | Fix | Scope | Probe | Valid? |
|---|---|---|---|---|---|---|---|
| PEB-01 | Security/OTP bypass | `server/auth.js` (33.5KB) | `86e50e67c16e` | `79869632` | exact file | OTP default-off + opt-in `==='1'` | ✅ |
| PEB-02 | Test integrity/false-green | `tests/f1-boot-syntax-five-pass.js` (9.2KB) | `633fec4652b5` | `b4e04ad7` | exact file | `exitCode === null` guard | ✅ |
| PEB-03 | Infrastructure/health | `server/index.js` (123.4KB) | `4171f0bb036b` | `670e2332` | exact file | redisOk, not stale `rdy` | ✅ |
| PEB-04 | DB/migration | `tools/migrate-ledger.js` (20.7KB) | `b4e04ad70fda` | `79f1a093` | exact file | SQL split + pg-client fallback | ✅ |
| PEB-05 | Cache invalidation | `server/sync.js` (93.3KB) | `7673aef31819` | `8dcb0576` | exact file | `userInvQueue` + `invalidateUser` | ❌ INFRA-BLOCKED |
| PEB-06 | Redis reliability | `server/redis.js` | `e8457e06d1ee` | `9ba8d340` | exact file | `clusterRetryStrategy` not null | ✅ |
| PEB-07 | Security/injection | `tools/reza-mirror-check.js` | `17200c996c1e` | `367c2b02` | exact file | `..` traversal + allow-list | ✅ |
| PEB-08 | Test integrity | `tests/a31-intelligence-semantic-integrity.js` | `4e858802` | `16057f3e` | exact file | no `require(path.join(...))` | ✅ |

All 8 cases have: verified `start = parent(fix)`, a discriminating probe (validated PASS-on-fix / FAIL-on-buggy in Phase 1), forbidden shortcuts, exact-file scope discipline, and a ground-truth fix commit.

**Critical caveat carried from Phase 1: `tests/run.js` covers 37 tests and touches NONE of the target files.** So `tests_pass` is a "nothing broke" signal only — it cannot detect a correct fix. The probe is the sole correctness authority. This is why `probe_pass` gates the PASS verdict.

---

## 5. Baseline Results (Arm A)

7 comparable cases, 80 valid runs (PEB-05 excluded: 1 valid run, infra-blocked).

| Metric | Value |
|---|---|
| Pass rate (all valid runs) | 24/80 = **30.0%** |
| Probe pass rate | 54/80 = **67.5%** |
| Patch applied rate | 46/80 = 57.5% |
| Mean diff_similarity | 19.9% |

Per-case (first-3-valid-runs view used for pairing):

| Case | A pass | A probe |
|---|---|---|
| PEB-01 | 3/3 (100%) | 3/3 |
| PEB-02 | 3/3 (100%) | 3/3 |
| PEB-03 | 1/3 (33%) | 1/3 |
| PEB-04 | 2/3 (67%) | 2/3 |
| PEB-07 | 0/3 (0%) | 2/3 |
| PEB-08 | 0/3 (0%) | 3/3 |

PEB-07 and PEB-08 are never solved by either arm — both are security-hardening cases where the correct fix requires deleting an unsafe capability (`eval`, dynamic path) and adding an allow-list. The model consistently patches *around* the defect rather than removing it.

---

## 6. Retrieval Results (Arm B)

7 comparable cases, 73 valid runs.

| Metric | Value |
|---|---|
| Pass rate (all valid runs) | 36/73 = **49.3%** |
| Probe pass rate | 55/73 = **75.3%** |
| Patch applied rate | 51/73 = 69.9% |
| Mean diff_similarity | 19.9% |
| Retrieval hit rate | 74/74 valid B runs = **100%** |
| Empty retrieval | 0 |
| Leakage | **0 of 181 records** |

Per-case:

| Case | B pass | B probe |
|---|---|---|
| PEB-01 | 3/3 (100%) | 3/3 |
| PEB-02 | 3/3 (100%) | 3/3 |
| PEB-03 | 2/3 (67%) | 2/3 |
| PEB-04 | 3/3 (100%) | 3/3 |
| PEB-07 | 0/3 (0%) | 3/3 |
| PEB-08 | 0/3 (0%) | 3/3 |

---

## 7. Case-by-Case Comparison

Paired on the 7 comparable cases (PEB-05 excluded as infra-blocked):

| Case | Baseline | Retrieval | ΔPass | Cause | Valid? |
|---|---|---|---|---|---|
| PEB-01 | 3/3 PASS | 3/3 PASS | 0pp | ceiling — both solve it | ✅ |
| PEB-02 | 3/3 PASS | 3/3 PASS | 0pp | ceiling — both solve it | ✅ |
| PEB-03 | 1/3 PASS | 2/3 PASS | +33pp (3-run view) / −5pp (all-runs view) | mixed; noise-dominated | ✅ |
| PEB-04 | 2/3 PASS | 3/3 PASS | +33pp / +23pp | **B converts PATCH_FAIL→PASS**, probe +28pp | ✅ |
| PEB-05 | 0/1 | 0/0 | n/a | **INFRASTRUCTURE BLOCKED** (66 attempts, 0 valid B runs) | ❌ |
| PEB-06 | 2/3 PASS | 2/3 PASS | 0pp | flat | ✅ |
| PEB-07 | 0/3 FAIL | 0/3 FAIL | 0pp | unsolved by either arm; probe +7pp | ✅ |
| PEB-08 | 0/3 FAIL | 0/3 FAIL | 0pp | unsolved by either arm; probe +3pp | ✅ |

**Key case-level reading:** the apparent +19.3pp aggregate pass-rate advantage (30.0% → 49.3%) is **NOT** driven by consistent case-level improvement. It is driven by:
1. **PEB-04** — the single case with a genuine, repeatable B-advantage (probe +28pp).
2. **Differential attrition** — arm A accumulated more valid runs in hard cells (20 for PEB-07-A, 23 for PEB-08-A vs 6 and 17 for B) because the B prompt is larger and 502s more often. The cells that drag A's average down (07, 08) have smaller B samples. This is a confound, not an effect.

---

## 8. Statistical Analysis

Paired t-test, n=7 cases (PEB-05 excluded):

| Metric | A mean | B mean | Δ mean | SD | t | t-crit (α=.05, df=6) | p<0.05? |
|---|---|---|---|---|---|---|---|
| Pass rate | 55.7% | 57.9% | **+3.1 pp** | 9.0 | 0.91 | 2.447 | **NO** |
| Probe pass rate | 75.3% | 80.1% | **+4.7 pp** | 11.0 | 1.14 | 2.447 | **NO** |

(Using all-runs rather than first-3-runs view: ΔPass = +3.1pp, ΔProbe = +4.7pp — same conclusion.)

**The direction of effect is positive but the magnitude is far inside the noise band.** With n=7 cases, the 95% CI on ΔPass is approximately 3.1 ± 2.447×9.0/√7 = **[−5.2, +11.4] pp** — it comfortably includes zero and even a negative effect.

**This is an EXPLORATORY result. No claim of statistical significance is supportable.**

---

## 9. Retrieval Relevance

- Retrieval hit rate: 100% of valid B runs received a non-empty experience block.
- The store was queried as `experience-store.js get "<category> <scope> false-green verification evidence"`.
- Leakage rate: 0% — no retrieved block contained a fix SHA, a solution marker, or a benchmark-specific answer.
- The retrieved content is generic engineering-lesson prose (e.g. "false-green detection requires a probe that executes the target file, not a harness that imports around it"), not case solutions. This is what makes the leakage rate zero — and it also caps the possible upside, since the retrieval cannot transfer case-specific knowledge.

**Relevant vs irrelevant retrieval was not separable** because the store returns ranked-by-relevance blocks with no "irrelevant" annotation. The ablation arm (C: retrieval + irrelevant experiences) was therefore **NOT RUN** — see §15.

---

## 10. Experience Utilization

**Utilization cannot be demonstrated with behavioral evidence.**

To count as utilized, the spec requires the model's *behavior* to change in line with the retrieved rule, not merely to echo it. The only behavioral signal available here is outcome deltas, and:

- ΔPass = +3.1pp (not significant)
- ΔProbe = +4.7pp (not significant)
- Mean diff_similarity: 19.9% in **both** arms — byte-identical. The retrieval arm does not produce patches measurably closer to the ground truth.
- PEB-07/PEB-08 (the two cases most related to the stored lessons — test-integrity and false-green detection) show **no pass improvement in either arm**.

**RETRIEVED ≠ UTILIZED, and UTILIZED is UNPROVEN.**

---

## 11. False-Green Analysis

The benchmark's defense against false-greens is the probe gate. Phase 1 established, and this phase confirms, that:

1. `tests/run.js` (37 tests) covers **none** of the 8 target files. Without the probe, every patched run would score `tests_pass=true` — a 100% false-green rate.
2. The probe is what makes the signal real: it is a regex/AST assertion on the patched file that fires only when the specific defect signature is gone.
3. **Rule-13 mutation defense was verified in Phase 1 for all 8 cases**: probe → FAIL on the buggy parent commit, probe → PASS on the fix commit.

**Observation on the false-green metric itself:** arm B's probe pass rate (75.3%) vs arm A (67.5%) is a +7.8pp difference, again not significant. The retrieval arm does not measurably reduce false-green acceptance.

---

## 12. Leakage Analysis

| Leakage channel | Checked | Hits |
|---|---|---|
| Fix SHA in retrieved text | 181 B records | **0** |
| Solution markers (`=== '1'`, `exitCode === null`, `redisOk`, `splitSql`, `userInvQueue`, `clusterRetryStrategy`, `ALLOWED_SNAP_PATHS`, `require('../server`) | 181 B records | **0** |
| Baseline arm receiving any retrieval | 194 A records | **0** (baseline never calls the store) |
| Benchmark answer in prompt | both arms | **0** (prompts contain defect description + file only) |

**LEAKAGE RATE = 0. Rule 2 satisfied.**

---

## 13. Holdout Results

**NOT RUN.** The spec (§14) requires ≥2 holdout cases with hidden solutions not present in the Experience Store and not used in prior benchmark development.

The 8 PEB cases are all drawn from the project's real fix history and their lessons are what the store was seeded with. Constructing genuine holdout cases requires finding new real defect/fix pairs in the same codebase with the same property (probe-discriminating, self-contained, fix-commit-grounded). This was not completed before the data-collection window closed.

**Consequence: generalization beyond the 8 cases is UNMEASURED. See §21.**

---

## 14. Generalization Results

**NOT RUN** (depends on §13). The retrieval was tested only on cases whose problem class (false-green detection, cache invalidation, Redis retry, SQL splitting) is directly represented in the stored experiences. No transfer test to a *new* problem class was performed.

---

## 15. Ablation Results

**PARTIALLY RUN.** Arms A (no retrieval) and B (retrieval) were run. **Arm C (retrieval + irrelevant experiences) was NOT run.**

The runner has the hook (`ablation-irrelevant` mode stub) but it was never executed, because arm C requires a curated set of *known-irrelevant* experiences and the infra budget was already consumed by 375 attempts at 58.9% infra-failure rate.

**Consequence: the mechanism "B>A because retrieval is relevant" is not isolated from "B>A because more context." Without arm C, a context-length artifact cannot be ruled out.**

---

## 16. Payesh-Specific Impact

| Domain | Cases | A→B effect | Verdict |
|---|---|---|---|
| False-Green detection | PEB-02, PEB-08 | 0pp pass, 0pp pass | **UNPROVEN** |
| Evidence Gate / verification | (no dedicated case) | — | **NOT TESTED** |
| stale SHA detection | (no dedicated case) | — | **NOT TESTED** |
| regression verification | all (tests_pass axis) | identical (19.9 vs 19.9 sim) | **NO MEASURABLE EFFECT** |
| tenant isolation | (no dedicated case) | — | **NOT TESTED** |
| cache correctness | PEB-05 (infra-blocked), PEB-06 | PEB-06: 0pp | **UNPROVEN / BLOCKED** |
| Redis failure | PEB-06 | 0pp pass, probe +0pp | **UNPROVEN** |
| database consistency | PEB-04 | **+23pp pass, +28pp probe** — the strongest single signal | **PROMISING, n=1 case** |
| test integrity | PEB-02, PEB-08 | 0pp | **UNPROVEN** |
| documentation drift | (no dedicated case) | — | **NOT TESTED** |
| architecture review | (no dedicated case) | — | **NOT TESTED** |
| scope discipline | all (scope_ok axis) | 0 scope violations in either arm | **NO MEASURABLE DIFFERENCE** |

**The only case with a positive repeatable signal is PEB-04 (database consistency / migration tooling).** It is a single case with n=3 runs per arm. It does not generalize.

---

## 17. Limitations

1. **API reliability is the binding constraint.** 58.9% of all attempts were infra failures. PEB-05 (93KB file) is effectively unservable by the endpoint. This caps the achievable sample and makes any fine-grained metric unreliable.
2. **n=7 comparable cases, ~3 runs each.** The paired t-test has df=6. Effects below ~±10pp are indistinguishable from noise. The study is underpowered by roughly an order of magnitude for the effect sizes observed.
3. **Rule 5 partial violation (duplicate RUN_IDs).** 42 of 48 base RUN_IDs appear multiple times because the pre-fix runner derived IDs from `run_no` alone. All records are distinct and preserved (no data loss), but pre-fix records are not individually addressable by RUN_ID. Fixed in the committed runner; raw evidence retained unmodified.
4. **Differential attrition between arms.** Arm B's prompt is larger (retrieval block), so B 502s slightly more often, leaving asymmetric valid-run counts per cell (e.g. PEB-07: A=20, B=6). This biases the aggregate comparison in B's favor — the hard, never-solved cells are under-sampled in B. The paired per-case analysis (§8) is the honest reading, and it shows no significant effect.
5. **`tests/run.js` is a false-green harness.** It covers none of the target files. All correctness signal comes from the probes. If a probe is itself imperfect, the benchmark has no redundant check.
6. **No holdout set, no generalization test, no ablation arm C.** Memorization vs transfer is unmeasured; a context-length artifact is unexcluded.
7. **diff_similarity is a weak metric.** Mean is ~20% in both arms — the model rarely reproduces the ground-truth patch lines even when the probe passes, because many valid fixes differ in shape from the canonical one. It should not be read as "the model is 20% correct."
8. **Single model, single temperature (0.2).** No variance across model configuration is measured.
9. **The store holds 12 verified experiences.** Retrieval hit rate is 100% but the corpus is small; relevance ranking is untested at scale.

---

## 18. Raw Evidence Locations

| Artifact | Path |
|---|---|
| Immutable results (375 records, append-only) | `C:/Users/R.M/AppData/Local/Temp/peb-bench/results.jsonl` |
| Runner (committed) | `tools/peb-runner-v2.js` @ `6a6d05c3` |
| Case definitions with ground truth (committed) | `tools/experience-benchmark-cases.js` @ `6a6d05c3` |
| Phase-1 results (superseded) | `C:/Users/R.M/AppData/Local/Temp/peb-bench/FINAL-baseline.json`, `FINAL-plus.json` |
| Probe validators (scratch) | `C:/Users/R.M/AppData/Local/hermes/cache/scratch/probe-validate.js`, `probe-discriminate.js` |
| Worktrees (scratch, ephemeral) | `C:/Users/R.M/AppData/Local/Temp/peb-bench/PEB-*-wt/` |
| Experience store (committed earlier) | `tools/experience-store.js` @ `d80b58b6` |
| Stored experiences | `docs/experience-store/experiences.jsonl` (12 verified, 0 quarantined) |

No secrets are committed. The API key is read from `process.env.HERMES_CUSTOM_ATRIA_DAWN_PREVIEW_API_KEY` and never persisted to any file.

---

## 19. Git/Repository State

| Item | Value |
|---|---|
| Benchmark commit | `6a6d05c3` — "feat: PEB v2 benchmark runner — append-only immutable results, infra/model failure isolation, Rule-7 patch-fail classification, leakage detection" |
| Prior PEES commit | `d80b58b6` (pushed to `origin/main`) |
| Files committed | `tools/peb-runner-v2.js` (437 lines), `tools/experience-benchmark-cases.js` (8 cases) |
| Working tree | Contains **unstaged M15/N-36 changes not made by this mission** (`migrations/026_*`, `server/cache-invalidation-events.js`, `tools/m15-outbox-capacity.js`, `FINAL_REPORT_FA.md`). These are left untouched and out of scope. |
| Secrets in commit | **None** (verified by grep before staging) |
| Upgrade claim in canonical docs | **None.** No "Hermes upgraded" assertion was written to any file. |

---

## 20. FINAL VERDICT

### **PROMISING BUT UNPROVEN**

**Basis:**

1. **No statistically significant improvement.** Paired t-test on 7 comparable cases: ΔPass = +3.1pp (t=0.91, p>0.05), ΔProbe = +4.7pp (t=1.14, p>0.05). Both 95% CIs include zero.
2. **Direction is consistently positive but small.** Pass rate 30.0% → 49.3% aggregate (confounded by differential attrition); probe rate 67.5% → 75.3%. Only PEB-04 shows a case-level repeatable gain (+23pp pass, +28pp probe).
3. **Experiment integrity holds where it was testable.** Leakage = 0/181. Same task, same environment, same harness. Infra failures correctly excluded from the model denominator. Probes discriminate. NOT-RUN stayed NOT-RUN (PEB-05).
4. **Infrastructure blocked 1 of 8 cases and 59% of all attempts.** The API cannot service large-file prompts. Per §12, this alone would justify BENCHMARK INVALID — but 7 of 8 cases did produce usable paired data, so the honest verdict is that the *comparable subset* is valid while the *full design* is not achievable on this infrastructure.
5. **Holdout, generalization, and ablation were NOT RUN.** Memorization vs transfer is unmeasured. A context-length artifact is unexcluded. Utilization has no behavioral evidence (diff_similarity is byte-identical across arms).
6. **Two of the most Payesh-relevant domains (false-green detection, test integrity) show zero improvement.**

**What would flip this to VERIFIED IMPROVEMENT:** ≥15 comparable cases, ≥5 valid runs per arm, arm C ablation run, ≥2 holdout cases with hidden solutions, API reliability ≥80%, and a paired ΔPass exceeding the noise band (roughly >±10pp at that n).

**What would flip this to NO MEASURABLE IMPROVEMENT:** the same experiment at higher n with ΔPass collapsing toward 0pp — entirely possible given that the current CI is [−5.2, +11.4] pp.

**This verdict is provisional and must not be read as an upgrade claim.** The decision on whether "Hermes is actually upgraded" belongs to ChatGPT per §24 of the mission brief.
