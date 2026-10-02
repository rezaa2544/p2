# PAYESH — هوش پروژه / Project Intelligence Snapshot

**Status:** CANONICAL / ACTIVE  
**Date:** 2026-09-24  
**Repository:** `rezaa2544/p2`  
**Branch:** `main`  
**Documentation baseline before this synchronization:** `f74ec223874cd8bbd44dcfbf7365a98100ecb549`

## 1. Ground truth فعلی
این سند خلاصهٔ واحدِ وضعیت جاری پروژه است و برای هم‌راستاسازی ChatGPT، Arena و Atria ایجاد شده است. در تعارض، اجرای واقعی/E3-E4 و GitHub Actions بر کد و گزارش‌ها مقدم‌اند.

### تغییرات قطعی تا این لحظه
- PR #401 با merge commit `e264932419335ce42da53f2700e362bce31670b9` لایهٔ هوشمندی آموزشی را اصلاح کرد.
- هفت defect هوشمندی D1–D7 ثبت و remediation شدند.
- پوشش اتصال موتورهای هوشمندی به **21/21** رسید و orphan runtime engine برابر **0** شد.
- F-EI-01 بسته شد: هشت موتور یتیم به مسیرهای HTTP زنده متصل شدند.
- گیت‌های no-data-masking، timestamp/fingerprint، wiring E2E، non-circular certification و client rendering اضافه و در branch کار مربوطه سبز ثبت شدند.
- `generate-write-perms --check` یک failure پیش‌موجود است؛ بازسازی آن نباید commit شود چون فایل مجوزهای موجود را از 199 writer-action به 0 کاهش می‌دهد. `tools/check-authz.js` گیت واقعی مجوزهاست.
- اصلاحات Phase 7 verifier تا PRهای #382/#383/#386 و اصلاحات محیط Redis/Auth در #390/#391/#392 در main reconcile شده‌اند.
- اسناد اجرایی جدید در main ثبت شده‌اند: `docs/CURRENT_WORK_EXECUTION_PLAN.md` و alignmentهای roadmap/P0/production-readiness.

## 2. ترتیب اجرایی حاکم
`Atria Critical/High → Phase A Carry-over Closure → Atria Medium → Atria Low → Full Multi-AI Validation → Capability Matrix → Role Matrix → E2E → Failure/Recovery → Performance → Final Certification`

### Phase A carry-over (mandatory)
گزارش نخست Atria، ۲۲ مورد Medium/Low را شناسایی و عمداً خارج از P0/P1 remediation گذاشت. این موارد اکنون به‌صورت queue رسمی در `docs/audit/ATRIA_PHASE_A_CARRYOVER.md` ثبت شده‌اند و قبل از عبور از sweep Medium باید تعیین‌تکلیف شوند. «Deferred» یا «خارج از scope قبلی» به معنی حل‌شده نیست.
تا پایان sweep آتریا، Arenaها نباید هم‌زمان روی همان ناحیه‌ای که Atria در حال remediation آن است تغییر کدنویسی دهند. بعد از آن، workstreamها مستقل و non-overlapping می‌شوند.

## 3. قرارداد رفع عیب
`Finding → Reproduce → Root Cause → Fix → Regression Test → Execute → Evidence → Review`
هیچ موردی فقط به دلیل وجود کد، تست محلی، گزارش یا عنوان «fixed» certified نیست.

## 4. Intelligence layer — وضعیت جاری
- کل موتورهای شناخته‌شده: **21**
- موتورهای runtime-wired: **21**
- orphan engines: **0**
- orphan API paths اضافه‌شده: **8**
- client intelligence dashboard: **فعال برای 3 نقش**
- F-EI-01: **closed at code/remediation level**
- certification: باید در current-head validation campaign دوباره مستقل verify شود.

## 5. Evidence boundary
- GitHub documentation commits ≠ runtime certification.
- historical PASS/VERIFIED ≠ current-head PASS مگر exact-SHA evidence موجود باشد.
- current production readiness هنوز باید با Capability/Role/E2E/Failure-Recovery/Performance evidence تکمیل شود.
- هیچ national-scale capacity number بدون اندازه‌گیری واقعی معتبر نیست.

## 6. نقش عامل‌ها
### Atria
Adversarial defect hunter/fixer: ابتدا Critical/High، سپس Medium، سپس Low. پس از sweep به reviewer مستقل تبدیل می‌شود.
### ChatGPT × 5
1. Architecture / roadmap / ground truth
2. Security / zero-trust
3. Backend / DB / infra
4. Frontend / intelligence / UX
5. QA / release / evidence
### Arena × 11
Workstreamهای مستقل و non-overlapping؛ هر تحویل باید scope، reproduction، root cause، fix، regression، test result، evidence و SHA داشته باشد.

## 7. Gate نهایی
برای هر حوزه فقط این وضعیت‌ها معتبرند: `PASS / FAIL / UNVERIFIED`
گواهی نهایی باید شامل Security، Tenant Isolation، Authentication، Authorization، Backend، Database، Redis/Queue، Frontend، Intelligence، Roles، Capabilities، E2E، Failure/Recovery، Performance، Observability و Production Readiness باشد.

## 8. قوانین مدیریت تغییر
- force-push/history rewrite ممنوع.
- `git add -A` بدون بررسی ممنوع.
- secret/token داخل repository یا prompt ممنوع.
- duplicate fixing ممنوع.
- هر claim باید با evidence قابل بازتولید همراه باشد.
- گزارش تاریخی باید از current HEAD جدا نگه داشته شود.

**مرجع اصلی اجرا:** `docs/CURRENT_WORK_EXECUTION_PLAN.md`  
**مرجع roadmap:** `docs/ROADMAP.md` و `docs/ROADMAP_MASTER_EXECUTION_SCHEDULE.md`  
**مرجع current truth:** `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md`

## Architecture Evolution Ground Truth — 2026-09-24

Canonical detail: docs/ARCHITECTURE_EVOLUTION_ROADMAP.md

The 12 architecture patterns are now part of project intelligence as a prioritized evolution backlog:
- P0: Modular Monolith/Vertical Slices; Event-Driven; Transactional Outbox; OpenTelemetry; Policy-as-Code.
- P1: Selective CQRS; Workflow/Saga.
- Conditional research: Event Sourcing; Microservices; Kubernetes; Service Mesh.
- Cross-cutting: Zero-Trust Service Boundaries.

This registration is not a claim of implementation. Existing architecture remains the baseline until evidence-backed Architecture Review decisions are made.


## CURRENT-HEAD SYNCHRONIZATION — 2026-09-25 / 38ecab9

**Current main HEAD:** `38ecab9599168f8d53b0dcd89d77009dd7596f94` (merge PR #416). The previous intelligence baseline was stale at 2026-09-24 and is superseded by this section.

### What changed since the previous intelligence snapshot
- PR #414 merged the seven-layer external project memory foundation.
- PR #415 merged Arena2 A-31 verification artifacts: the intelligence workstream is now represented in main with current verification artifacts, but this does **not** equal three-AI certification.
- PR #416 merged a large Arena8 workspace/publication bundle containing current-head Sync/OCC/offline evidence and reconciliation artifacts. The published report explicitly remains **NOT VERIFIED**; it does not certify the product.
- A-35 product remediation is present in main (commit `e05d0210883f1eece03714877ae5e19c385e07fd`) with the accompanying A-35 regression/evidence bundle. Its live re-verification on the exact new main HEAD is still required before treating it as independently closed.
- The current verification registry is intentionally still bound to `e4584806c1af2a1e5db648c8452580a8fa8cbcec`, not to current main. Therefore no historical registry result has been promoted.

### Current phase — precise position
**Phase:** Hardening / reconciliation before independent three-AI validation.
**Gate:** NOT VERIFIED.
**Why:** the code/evidence head moved after the registry baseline; several high findings have current evidence but not merged fixes or three-reviewer evidence; and the registry must be rebuilt against the final hardening SHA.

### Current problem map — root cause → required response
1. **A-30 / Strict Gate:** certification can be bypassed when registry/evidence/reviewer/HEAD binding is incomplete. Root cause is gate validation relying on incomplete structural contracts rather than proving the evidence graph itself. Response: make registry non-empty, SHA-bound, reviewer-complete, schema-complete and fail-closed; add negative tests for empty/injected/blocked/stale registries.
2. **A-31 / Intelligence:** semantic defaults can turn absence/empty data into healthy/compliant-looking output, while some platform metrics are not causally tied to engine output. Root cause is fallback/default semantics and self-attested certification paths. Response: no-data/empty/malformed/real-route negative tests; derive metrics only from observed source data; certification must consume independent evidence.
3. **A-32 / SMS/PG:** application-level "sent/200" can diverge from PostgreSQL mirror state, with restart potentially repeating send/debit. Root cause is non-atomic provider-send, queue/mirror persistence and idempotency boundaries. Response: live PG schema contract, transaction/outbox/idempotency proof, restart replay test, wallet/queue/audit reconciliation.
4. **A-33 / PG auth flags:** delegated authorization flags may be lost during PG hydration. Root cause is schema/model/persistence parity not proven across seed→DB→session→policy. Response: end-to-end persistence parity test for `asset_staff/lib_staff/is_head`, positive and negative authorization controls.
5. **A-34 / Sync auth:** foreign teacher/class references and global conflict resolution can bypass school scope. Root cause is REST/sync twin gates not sharing one authoritative ownership policy. Response: reconcile the fix to current main, then run REST + sync + conflict adversarial tests on the same SHA.
6. **A-35 / Mission-5 authz:** cross-tenant reads/links and phone identity variants can bypass intended scope/rate controls. Root cause is incomplete school anchoring and non-canonical phone identity. Response: re-run the merged fix on current HEAD and preserve 15/15 regression evidence plus adversarial tenant matrix.
7. **A-36 / PG infrastructure:** migration transaction/seed-ledger assumptions and raw identifier construction create infrastructure-level failure/security risk. Root cause is migration-chain drift and insufficient identifier validation. Response: live PG replay of migrations, ledger continuity proof, safe identifier allowlist, regression.
8. **A-37 / Test integrity:** 513 ZERO-CHECK, 311 ORPHAN, 54 MOCK and ~40 swallowed catches are inventory signals, not individual defects. Root cause is incomplete executable test inventory and weak ownership of the certification path. Response: classify each bucket, connect required suites to gates, explicitly retire non-product tests, and make missing prerequisites NOT-RUN rather than green.
9. **A-38 / Registry:** registry is stale relative to main. Root cause is verification evidence being tied to an audit SHA rather than automatically rebased/rebuilt after material merges. Response: freeze the hardening branch, run final gate suites, generate a new registry for the exact final SHA, then obtain ChatGPT/Arena/Atria independent reviews.
10. **A-39 / Reliability/DR:** restore/failover and failure-domain evidence remains incomplete. Root cause is lack of a persistent E4 environment and acceptance contract. Response: provision independent PG/Redis failure domains, execute restore/failover/worker/queue/notification/shutdown drills, measure RPO/RTO/MTTA/MTTR, preserve artifacts.

### Important new Sync/OCC evidence
The published Arena current-head audit reports A-18/A-20/A-24 scoped fixes with real PostgreSQL/browser evidence on a later test SHA, but also records **30 intentional legacy-mode failures** and keeps the global invariant **NOT VERIFIED**. Therefore:
- strict/production OCC is the required production contract;
- legacy missing-base/LWW behavior remains an explicit limitation, not a PASS;
- A-24 is only PARTIALLY VERIFIED until the relevant fixes are merged/reconciled and re-tested on the final main SHA;
- device-power-loss, real Service Worker/IndexedDB durability, multi-host and E4 evidence remain unverified.

### Execution lock
Do **not** start Capability Matrix / Role Matrix / final E2E / Performance certification as if the hardening gate were closed. First: A-30 → A-31..A-36 → A-37 → A-38 → A-39. Only after the same final SHA is independently reviewed by ChatGPT + Arena + Atria does the project advance to the broad certification campaign.

### Agent ownership invariant
ChatGPT 7 is not an executor for this workstream. The transferred work belongs to Arena 10 and must remain separately attributed in all future reports.


## FINAL SYNCHRONIZATION RECEIPT — 2026-09-25
**Exact main HEAD after this synchronization series:** `7c1a4ce3c29810910bfee72e17358d81032c33ea`.
This SHA includes the synchronization updates themselves. The verification registry remains intentionally bound to `e4584806c1af2a1e5db648c8452580a8fa8cbcec` until the hardening SHA is frozen and evidence is regenerated; therefore this receipt is a project-state update, not a certification.


## DEFECT RECURRENCE / ROOT-CAUSE PRIORITY — 2026-09-25

A cross-report review found a recurring system pattern: several findings were previously marked FIXED/NOT A DEFECT/ACCEPTED RISK, then a later audit reproduced the same invariant failure or an omitted path. This is now a first-class project problem.

### Evidence-backed recurrence patterns
- A-20: earlier scope treated OCC as effectively covered in grades; later adversarial inventory found stale-write/asymmetry across all five PATCH entities. Root cause: fix scope did not equal invariant scope; mutation inventory was incomplete.
- A-22: later re-audit found a REDIS_URL-only boot/fail-open hole despite earlier Redis hardening. Root cause: configuration/failure matrix was incomplete.
- A-18/A-24: strong scoped conflict/sync fixes were produced on dedicated SHAs, while current-main/global invariant remained unverified. Root cause: multiple state/persistence paths plus evidence bound to changing SHAs.
- A-34/A-35: authorization fixes can be strong on one path/base while REST, sync, conflict, role hydration or current-head variants remain separately unverified. Root cause: twin policy gates and evidence lifecycle separation.
- A-31/A-37: false-positive semantic defaults and test-like artifacts can reintroduce confidence without proving the real invariant. Root cause: fallback semantics and incomplete certification wiring.

### Higher-level root cause
The recurring problem is not simply "bugs survive". The project has been optimized to fix observed defects, while the controls that must preserve an invariant across every path, configuration, merge and restart are still being hardened.

The four root-cause classes are:
1. Scope weakness: point fix instead of invariant-wide enforcement.
2. Path-completeness weakness: incomplete route/config/worker/client inventory.
3. Change-boundary weakness: evidence can outlive the SHA it proved.
4. Certification weakness: false-green/test-integrity gaps can hide regressions.

### New P0 program
The authoritative program is docs/audit/ROOT_CAUSE_REAPPEARANCE_PROGRAM_2026-09-25.md.

Immediate root-cause controls:
- Invariant Registry for security/data-integrity claims.
- Automatic evidence invalidation/revalidation after material merge.
- Mutation/Auth/Failure-configuration inventories.
- Permanent Reappearance Regression Suite for previously recurring findings.
- Single-source authoritative policy for OCC, ownership, tenant scope, revocation and conflict.
- ROOT-CAUSE-CLOSED requires source fix, alternate-path audit, adversarial regression, current-final-SHA evidence and three independent reviews.

### New report rule
Future reports must explain not only what was fixed, but why the previous fix did not prevent recurrence. FIXED without root-cause closure is FIXED-SCOPED only.


## SUPERVISING ENGINEER / DELIVERY ENFORCEMENT — 2026-09-25

A new mandatory control document exists: docs/external-memory/SUPERVISING_ENGINEER.md.

### Root cause of prior push non-compliance
The previous push requirement was prompt-level but lacked an explicit delivery contract and repository-state gate at handoff. Agents could finish analysis or create commits/branches while reporting completion without satisfying the actual target delivery.

### Permanent fix
Future execution prompts must define:
target branch, required commit, required push, required PR/merge, tests, evidence and exact delivery identifiers.

Status rules:
- no remote commit = WORK_INCOMPLETE;
- remote commit but required PR absent = WORK_INCOMPLETE;
- PR open when merge-to-main was required = WORK_INCOMPLETE;
- only repository evidence can promote completion.

The Supervising Engineer checklist is now mandatory at session start and delivery.



## FRESH REPOSITORY DEFECT AUDIT — 2026-09-25

Canonical register: `docs/audit/MASTER_DEFECT_PRIORITY_2026-09-25.md`.

### Newly confirmed current-main defects
- **F1 P0 OPEN:** first-boot bootstrap seeding is fail-silent, does not synchronize identity sequences, and can combine with ID upsert semantics to overwrite seeded identity rows. This is the highest-priority recurrence/root-cause item.
- **F2 P1 OPEN:** PG parent scope contains a legacy `users.parent_id` query although the relationship is represented by `parent_links`.
- **F4 P1 OPEN:** quality-governance/longitudinal region branches allow a manager without proving region ownership.
- **F3/F5:** current main contains targeted mitigations; they are **FIXED-SCOPED / REVALIDATION_REQUIRED**, not certified.

### Execution ownership
**Atria-1:** F1/F2/F4 + A-31..A-36 + product/runtime security/data root causes.  
**Atria-2:** A-30/A-37/A-39 preparation + test-integrity/CI/operational carry-over A-01..A-17/A-23 + A-38 preparation.

No overlapping edits to the same invariant are permitted.

### Current phase remains
**HARDENING / RECONCILIATION — NOT VERIFIED.** The next allowed work is defect remediation only. Broad multi-AI testing/certification remains blocked until the open defect queue is closed or explicitly dispositioned with evidence.


## Supervising Engineer direct remediation — 2026-09-25

Before handing the queue to Atria, the Supervising Engineer directly fixed the code-level portions that were safely actionable:
- F1 bootstrap seed: legacy numeric-grade mismatch handling, identity-sequence advancement, fail-closed seed failures, and no silent successful fallback.
- F2 PostgreSQL parent scope: removed the obsolete `users.parent_id` query; `parent_links` remains authoritative.
- F4 analytics: school managers are explicitly denied regional (`region_id`) scopes in quality-governance and longitudinal guards.

These are **FIXED-SCOPED**, not VERIFIED. Current CI status is pending.

**Team correction:** Atria count is now **3**. Atria-3 must be assigned a non-overlapping scope before execution.


## 2026-09-25 — Canonical Integration Receipt
- Canonical main HEAD after integration: eafca3809bb0a89bff68b1375e0292426ff35098
- Integration PR: #418
- Legacy PRs reconciled/closed as superseded: #402, #403, #407, #410, #411, #412, #413, #417.
- Integration method: reconcile each candidate against current main, preserve applicable intent, integrate one logical unit, then verify the resulting remote HEAD.
- Important: closure of a legacy PR does not mean its original branch was merged verbatim; duplicate/stale/conflicting portions were intentionally superseded when current main already contained the fix or when preserving them verbatim would risk regression.
- Verification status: NOT VERIFIED. Broad certification remains blocked until current-HEAD evidence is regenerated.


## 2026-09-25 — Multi-report independent-audit reconciliation

A new consolidated audit comparison has been added:
`docs/audit/MULTI_REPORT_DEFECT_RECONCILIATION_2026-09-25.md`

### Canonical newly surfaced queue

| ID | Severity | Status / action |
|---|---|---|
| NCR-01 | CRITICAL/P0 | `server/index.js` syntax corruption; **OPEN — immediate blocker** |
| NCR-02 | HIGH/P1 | manager cross-school `parent_links` scope gap; **OPEN** |
| NCR-03 | HIGH/P1 | bootstrap/session JWT exposure; **OPEN** |
| NCR-04 | HIGH/P1 | security-health synthetic HEALTHY; **OPEN** |
| NCR-05 | HIGH/P1 | certification `externallyVerified === true` boolean trap; **OPEN** |
| NCR-06 | HIGH/P1 | teacher access to Parent-360 without object-level class ownership; **OPEN** |
| NCR-07 | HIGH/P1 | intervention aggregate uses unfiltered school-wide counselling cases; **OPEN** |
| NCR-08 | HIGH/P1 | REST attendance lacks Sync virtual-day invariant; **REVALIDATION / FIX** |
| NCR-09 | HIGH/P1 | conflict resolution atomicity; **adversarial revalidation required** |
| NCR-10 | HIGH/P1 | migration 022 structural/rollback contract gap; **OPEN** |
| NCR-11 | HIGH/P1 | SMS PG schema/mirror/idempotency drift; **OPEN under A-32** |
| NCR-12 | HIGH/P1 | comprehensive test runner can execute zero suites; **OPEN** |
| NCR-13 | HIGH/P1 | backend syntax outside `tests/run.js` coverage; **OPEN** |
| NCR-14 | HIGH/P1 | region-bearing alternate-path authorization recurrence; **fold into F4** |
| NCR-15 | MEDIUM/P2 | `office_id`/region identity confusion; **fold into F5** |
| NCR-16 | MEDIUM/P2 | LWW/base_version contract regression; **OPEN** |
| NCR-17 | MEDIUM/P2 | conflict 400/403 contract drift; **OPEN** |
| NCR-18 | MEDIUM/P2 | strict-gate test/implementation mismatch; **OPEN** |
| NCR-19 | MEDIUM/P2 | hardcoded machine-local A-35 test dependency; **OPEN** |
| NCR-20 | MEDIUM/P2 | missing manager→foreign-region regression; **fold into F4** |
| NCR-21 | MEDIUM/P2 | Parent-360 NULL attendance coerced to CRITICAL; **OPEN** |
| NCR-22 | MEDIUM/P2 | A-18..A-22 regex/test false-failure risk; **OPEN** |
| NCR-23 | MEDIUM/P2 | frontend single-file build drift; **OPEN** |
| NCR-24 | LOW/P3 | wave3 empty-store crash; **OPEN** |
| NCR-25 | LOW/P3 | stale navigation expectation; **OPEN** |
| NCR-26 | INFO/P3 | k6 performance suites not wired to ordinary CI inventory; **GAP** |
| NCR-27 | INFO/P3 | ESLint configured but not executed as a gate; **GAP** |

### Deduplication rule
Report-1 HIDDEN-01/HIDDEN-02/HIDDEN-03/HIDDEN-04 are **not blindly added as active defects** where later current-head evidence shows mitigation; they remain regression/revalidation items. HIDDEN-05 remains active under F5. HIDDEN-06 is consolidated into A-32/NCR-11.

### Execution override
Before broad validation:
**NCR-01 → NCR-02/NCR-03/NCR-05 → NCR-04/NCR-06/NCR-07 → NCR-08..NCR-15 → NCR-16..NCR-23 → NCR-24..NCR-27 → current-head revalidation → final hardening SHA.**

Canonical status remains **HARDENING / RECONCILIATION — NOT VERIFIED**.


## 2026-09-25 — Final multi-report synchronization receipt

- Synchronization batch baseline: `7bb19fccba07843008ee410e10f4c405135dca91`.
- Canonical consolidated audit: `docs/audit/MULTI_REPORT_DEFECT_RECONCILIATION_2026-09-25.md`.
- NCR-01..NCR-27 are now recorded with severity, disposition and execution order.
- Stale/duplicate findings are explicitly retained only as REVALIDATION_REQUIRED where current-head evidence shows mitigation.
- Project state remains **HARDENING / RECONCILIATION — NOT VERIFIED**; broad certification remains blocked.


## CURRENT OPERATING SYNCHRONIZATION — 2026-09-30

**Current GitHub main HEAD:** 7c147d3e58687059b248417d348f63cdbf0155d5.

This section supersedes stale snapshot dates above for operational decisions. The repository HEAD is authoritative; earlier sections remain historical evidence and are not deleted.

### Current execution mode
**Mode:** CONTINUOUS PROJECT MONITORING + EVIDENCE-DRIVEN REMEDIATION.

The project has moved from preparation into active monitoring. The current operating model is:

DISCOVER/EXECUTE → REPORT → INDEPENDENT VERIFY → RECONCILE → REMEDIATE → REGRESSION → UPDATE PROJECT INTELLIGENCE → NEXT MISSION

Atria is the primary executor for the active sweep/mission. Hermes is the independent supervisory verifier. The 11 Arena views and 5 ChatGPT views are a 16-view discovery/validation network and are activated by checkpoint or non-overlapping scope, not by indiscriminate parallel editing.

### Agent capability operating policy
- Atria: executor, adversarial defect hunter/fixer, then re-auditor. Atria's own completion report is never sole certification evidence.
- Hermes: independent verifier/supervisor. It checks Atria's claims, false-green paths, evidence completeness, current-HEAD binding and reappearance of previously fixed invariants. Hermes should be activated at material checkpoints, high-risk findings, disputed evidence, and before certification—not mechanically after every prompt.
- 16-view network: discovery and independent review. No view may invent scope, duplicate an active invariant fix, or promote historical evidence to current PASS.
- ChatGPT: project control plane: reconcile reports with repository truth, set priorities, assign next missions, maintain central intelligence, and retain National GO/NO-GO authority.

### Current Atria/Hermes status
- Atria is in the active monitoring/execution lane; its latest work must be evaluated against the current main HEAD rather than older report SHAs.
- Hermes has demonstrated independent runtime verification capability, including convergence with delegated static analysis and detection of incomplete fixes. This is capability evidence, not certification of the project.
- Agent maturity is now evaluated continuously from real mission performance. New weaknesses discovered in Atria/Hermes become explicit reusable operating rules and are re-tested in later missions.

### Current repository state and immediate reality
- Current main advanced to 7c147d3e58687059b248417d348f63cdbf0155d5 with a fresh Redis health-verdict fix: health status now derives from a fresh redis.ping() measurement rather than the stale redis.ready() flag; the fix includes a real runtime blackhole probe.
- Recent migration hardening also fixed the Node/pg-client path for migration 012 and recovery/ledger handling, with real PostgreSQL evidence recorded in Git history.
- The latest known Hermes M10 report bound to 4171f0bb is historical relative to current main; any M10/M11 status must therefore be re-bound to 7c147d3e58687059b248417d348f63cdbf0155d5 before certification claims.
- The repository currently has an unrelated open PR #429 for Vercel Web Analytics. It is not part of the Payesh validation program and must not be treated as certification evidence or allowed to silently alter the monitoring queue.

### Non-negotiable verification rules
1. No PASS/VERIFIED from a report alone.
2. Historical SHA evidence never certifies a newer HEAD.
3. A fix is not closed until its invariant is checked across alternate paths/configurations and regression evidence exists.
4. For critical invariants, use independent executor + verifier evidence; where feasible, prove both broken and fixed behavior.
5. NOT-RUN, UNKNOWN, BLOCKED, HISTORICAL, and REVALIDATION_REQUIRED remain first-class states; never convert them to green for convenience.
6. Every material merge invalidates evidence that depended on an older SHA unless explicitly shown equivalent.
7. Documentation changes must update the existing central source of truth and required generated/freeze metadata; do not create a new report file merely to record a routine status change.
8. Repository cleanliness is a quality requirement: prefer updating canonical documents, removing obsolete duplication only when dependency/reference impact is known, and avoid uncontrolled report proliferation.

### Monitoring checkpoints
Hermes review is required when any of the following occurs:
- Critical/P0 or High/P1 finding;
- false-green or test-integrity finding;
- security/tenant/data-integrity invariant;
- recovery/boot/DB/Redis failure behavior;
- a disputed or incomplete fix;
- a material change to a canonical gate;
- pre-certification gate closure.

Routine low-risk execution can proceed without a Hermes turn when scope and evidence are clear.

### Current sequence
Active Atria monitoring/remediation → Hermes checkpoint verification → reconcile current HEAD → close/reopen findings → 16-view targeted discovery → Capability Matrix → Role Matrix → E2E → Failure/Recovery → Performance → Final Certification

Broad certification remains blocked until the hardening findings and verification registry are re-bound to the final current HEAD with independent evidence.

## FINAL OPERATING MODEL — 2026-09-30 — GOVERNING CONTROL PLANE

This section supersedes any earlier agent-coordination wording where the two conflict. It defines the final operational model for Payesh.

### Roles
- **ChatGPT — Control Plane / Final Decision:** owns priority, mission definition, reconciliation of reports with repository reality, roadmap state, gate decisions, and selection of the next mission.
- **Atria — Executor / Remediator:** executes the assigned mission, investigates and fixes defects, runs required tests, records exact evidence/SHA, and reports both completed work and unresolved uncertainty.
- **Hermes — Independent Verifier / Supervisor:** receives the project context and Atria report, independently checks claims against code/evidence/architecture, identifies omissions, suspicious options, incomplete fixes and items requiring the 16-view network, and returns a concise verification/next-work recommendation. Hermes is not the final decision-maker.
- **16-view network — Targeted Discovery/Adversarial Review:** activated by Hermes/ChatGPT when a scope needs independent specialist examination; it is not required to run on every routine mission.

### Mandatory mission loop
`PLAN → ATRIA EXECUTE → ATRIA REPORT → HERMES INDEPENDENT VERIFY → RECONCILE WITH CURRENT REPOSITORY → CHATGPT FINAL DECISION → DOCUMENT → NEXT MISSION`

### Evidence hierarchy
Exact current-HEAD evidence > reproducible runtime/test evidence > current source inspection > SHA-bound audit evidence > historical reports. A report alone never certifies a result.

### Final decision rule
Hermes may verify, challenge, classify and recommend. **ChatGPT makes the final stage/mission decision only after comparing Hermes' findings with the actual repository state and the roadmap.**

### Revalidation rule
Any material merge/change can invalidate evidence bound to an older SHA. Findings marked FIXED without current-head proof remain FIXED-SCOPED / REVALIDATION_REQUIRED, not certified.

### Security and integrity rule
For P0/P1, security, tenant/data isolation, authorization, boot/recovery, test-integrity, certification-gate and disputed findings, Hermes must independently verify before the work is promoted. Routine low-risk work may proceed without an immediate Hermes checkpoint when no gate/invariant is affected.

### Context continuity rule
Hermes must be given enough canonical project context to understand: architecture, roadmap, completed work, current phase, open findings, evidence boundaries, agent roles, current HEAD, and remaining work. Its report must explicitly separate VERIFIED, FIXED-SCOPED, NOT VERIFIED, UNKNOWN, BLOCKED and REVALIDATION_REQUIRED.

### Agent-learning loop
Recurring Atria/Hermes weaknesses are converted into reusable rules/checklists in the existing canonical operating documents and then tested in later missions. The objective is to improve the process, not merely to fix individual findings.

**Operational decision:** this is now the primary and final Payesh operating model unless a later Architecture/Management decision explicitly supersedes it.

## ARENA METHOD ADAPTATION — 2026-10-01

The project has adopted the reusable, implementation-agnostic parts of the external arena-skill methodology as an optional adversarial-review protocol. The Claude Code implementation itself is not a project dependency and is not treated as a certification mechanism.

### Adopted mechanisms
- Strategy-card diversity: targeted reviews may deliberately vary reasoning mode, workflow and optimization posture instead of asking every reviewer to reason identically. Useful modes include first-principles, inversion, adversarial, constraint-first, systems-thinking, decomposition, working-backwards and evidence-first; workflows include test-first, research-then-synthesise, build-then-break, requirements-checklist and options-matrix.
- Identical task envelope: reviewers in one challenge receive the same scope, constraints, current-HEAD/SHA, evidence boundary and success criteria. Strategy variation must not silently change the task.
- Attack → defend → judge: a candidate finding/fix/report is challenged by an independent reviewer, the owner responds with evidence, and a judge/reconciler compares the claims against the rubric and repository evidence.
- Blind baseline comparison: when a previous report/fix exists, the challenge may compare the new proposal against the prior baseline without telling the challenger which one is preferred. This is for defect discovery, not automatic selection.
- Fatal-flaw rule: a verified fatal flaw in security, tenant isolation, data integrity, boot/recovery, certification integrity or another declared critical invariant prevents a candidate from being treated as closed until the flaw is resolved or explicitly dispositioned.
- Persistent/resumable challenge state: long adversarial reviews should preserve inputs, round results, evidence references and unresolved objections so a context reset cannot silently erase challenge history.

### Integration boundary
These mechanisms strengthen the existing chain rather than replace it:
Atria EXECUTE → Hermes VERIFY → targeted 16-view/arena challenge → ChatGPT RECONCILE/DECIDE.
Arena output remains evidence input. It never becomes certification by tournament victory, vote count or score alone.

### Activation policy
- Routine low-risk work: no Arena tournament by default.
- Material/disputed/security/data-integrity/architecture/evidence-gap work: targeted challenge, normally a small orthogonal reviewer set.
- Critical unresolved invariant: expand the challenge only when the expected information gain justifies the cost; then require Hermes re-verification on the same current HEAD.
- Do not use multiple reviewers to duplicate an active Atria remediation lane.

### Quality rubric for adversarial reviews
Unless a mission defines a stricter domain rubric, challenge results should examine: Correctness, Completeness, Robustness, Specificity, Clarity, with correctness and fatal-invariant preservation taking precedence over presentation quality. Numeric scores are internal comparison aids only and must not replace evidence/status.

### Non-adoption / guardrails
The project does not adopt the external tool's Claude-specific orchestration, default agent counts, package/runtime assumptions, or its tournament winner as a correctness oracle. Cost and latency are controlled by selecting the smallest reviewer set that can meaningfully challenge the invariant.


## CAPABILITY HARVEST — ENGINEERING KNOWLEDGE INTEGRATION — 2026-10-01

این بخش کتابخانهٔ تجربهٔ قابل‌استفاده است: از capability/repositoryهای بررسی‌شده فقط الگوهایی وارد مدل کاری پایش شده‌اند که کیفیت، کشف عیب، قابلیت اثبات یا بهره‌وری را بالا می‌برند. هیچ ابزار بیرونی صرفاً به‌خاطر محبوبیت یا نام، Source of Truth یا dependency اجرایی پایش محسوب نمی‌شود.

### 1) معماری مرجع لایه‌های دانش و ابزار

GitHub/Code = Source of Truth
→ Canonical Docs = Project Operating Memory
→ Evidence/Artifacts = Proof
→ Atria = Execute/Remediate
→ Hermes = Independent Verify
→ Arena/16-view = Targeted Challenge
→ ChatGPT = Reconcile/Decide

لایه‌های کمکی:
- Agent Memory / OpenViking concepts: حافظهٔ بلندمدت، lessons، retrieval و context؛ هرگز جایگزین GitHub/Canonical Docs نیستند.
- Browser automation: adapter برای black-box E2E و عملیات کنترل‌شده؛ هرگز مجوز ضمنی برای mutation تولید نیست.
- Diagram Design: لایهٔ ارائهٔ معماری/شواهد؛ نمودار باید semantic و قابل‌ردیابی باشد.
- Security Skills: playbook knowledge برای دفاع، audit و verification؛ اجرای offensive فقط در scope مجاز.
- Scientific Skills: روش تحقیق، provenance، آمار، reproducibility و evidence-traceability برای intelligence/analytics.
- External monitoring: black-box probe مکمل observability داخلی، نه جایگزین آن.
- Harness Engineering: اصول محیط، محدودیت، feedback loop، eval، guardrail و context engineering.

### 2) Capability → چیزی که واقعاً جذب شد

| منبع | سطح استفاده در Payesh | الگوی جذب‌شده | قید |
|---|---|---|---|
| OpenViking | ADOPT METHOD / OPTIONAL MEMORY LAYER | Resource/Memory/Skill separation، hierarchical context، retrieval trace، session→memory، skill discovery | second source of truth ممنوع |
| Agent-Memory | ADOPT PATTERNS | working→episodic→semantic→procedural memory، provenance، contradiction/supersession، TTL/decay، privacy filtering، shared/private namespaces، Git snapshots | حافظهٔ عامل نباید truth repository را override کند |
| Arena Skill | ADOPT | identical task envelope، strategy diversity، attack→defend→judge، fatal-flaw rule، blind baseline، resumable challenge، cost control | tournament بزرگ پیش‌فرض نیست؛ certification نمی‌کند |
| Diagram Design | ADOPT SKILL PATTERN | semantic pattern + layout separation، static-first، accessible/traceable diagrams، deployment/dependency/data/policy/trust-boundary views | dependency runtime نیست |
| Scientific Agent Skills | ADOPT METHOD | evidence-traceable research، deterministic data lookup، provenance، pagination/count reconciliation، hypothesis/test discipline، statistical validation | فقط skillهای مرتبط با دامنه؛ خروجی علمی/تحلیلی باید source-bound باشد |
| Awesome Harness Engineering | ADOPT AS CATALOG/META-RULE | context/tool design، evals، benchmarking، observability، memory، security/fuzzing، feedback loops | catalog است، نه dependency اجرایی |
| Cybersecurity Skills | ADOPT SECURITY PLAYBOOK PATTERN | skill frontmatter برای discovery، prerequisite→workflow→verification، MITRE/NIST mapping، structured security procedures | فقط defensive/authorized scope؛ هر skill باید با Payesh threat model تطبیق داده شود |
| Browser Use | ADOPT AS CONTROLLED ADAPTER | browser-based black-box E2E، UI regression، evidence capture، structured result extraction | sandbox، credential isolation، approval gate برای write/destructive actions |
| God's Eye View | ADOPT ENGINEERING PATTERNS | freshness/stale/unavailable semantics، executable boundaries، environment doctor، targeted failure/recovery QA، deadline/bounded response، cache ownership، provenance، measured performance baselines | هیچ UI/geospatial dependency وارد Payesh نمی‌شود |
| Uptime Kuma | ADOPT LATER / OPTIONAL | external black-box HTTP/TCP/Ping/DNS/Push probes، cert/availability monitoring، incident notification | مکمل Prometheus/Grafana/Alertmanager؛ نه جایگزین |
| Paperclip | ADOPT CONCEPTS ONLY | agent registry، org/role، task hierarchy، goals، budget/cost، heartbeat، governance، audit trail | second control plane ممنوع |

### 3) الگوهای مهندسی که از امروز قانون پروژه هستند

1. Freshness semantics: NO DATA ≠ HEALTHY؛ STALE ≠ FRESH؛ FALLBACK ≠ PRIMARY؛ REQUEST SUCCEEDED ≠ SEMANTIC RESULT VALID.
2. Executable architecture: مرزهای package/module/import باید با gate/test قابل‌اجرا enforce شوند، نه فقط در سند.
3. Environment Doctor: پیش از drillهای حساس، readiness محیط، runtime، dependency، DB/Redis، migration، credential، tooling و current SHA باید machine-checkable باشد.
4. Bounded execution: هر suite/request/worker باید timeout و recovery contract داشته باشد؛ hang در CI وضعیت قابل‌قبول نیست.
5. False-green defense: zero suites، swallowed errors، permissive || true، unconditional assertions و allowlistهای بدون justification/file scope باید کشف و fail-closed شوند.
6. Evidence provenance: هر claim باید به SHA، command/test، environment، output و scope/limitation متصل باشد.
7. Provider/source isolation: acquisition، validation، freshness، semantic interpretation، engine و API از هم قابل‌تفکیک و قابل‌آزمون باشند.
8. Cache ownership: TTL باید واقعاً read/write شود؛ invalidation و outage backoff باید explicit و testable باشند.
9. Failure/recovery QA: هر critical path حداقل failure injection + recovery + no-hang proof داشته باشد.
10. Performance truth: baseline باید با environment، dataset، repetitions، cache state و metric definition ثبت شود؛ extrapolation عدد measured نیست.
11. Research discipline: lookupهای داده‌ای باید source، endpoint/query، pagination/count reconciliation و provenance داشته باشند.
12. Security playbook discipline: security mission از prerequisite→workflow→verification عبور کند و finding بدون reproduction/evidence current-head promoted نشود.
13. Diagram-as-evidence: نمودارهای معماری/flow فقط وقتی ارزش دارند که scope، ownership، trust boundary و evidence relation را روشن کنند؛ نمودار جای proof نیست.
14. Memory lifecycle: lesson فقط وقتی به حافظهٔ عامل منتقل شود که source، confidence، lifecycle و supersession مشخص باشد؛ contradictory memory باید حل/بازنشسته شود.
15. Controlled browser actions: browser automation باید read-only by default باشد و mutation/destructive actions explicit approval داشته باشند.

### 4) یادگیری از عامل به‌صورت چرخهٔ دائمی

Agent mistake / false assumption
→ Root cause of reasoning/process
→ Reusable rule / checklist / skill
→ Apply on next matching mission
→ Measure recurrence
→ Keep / refine / retire

این چرخه برای Atria، Hermes و 16-view یکسان است. تکرار یک خطا بدون تبدیل آن به guard/checklist یک نقص در خود سیستم کاری محسوب می‌شود.

### 5) اصل عدم‌انباشت ابزار

ابزار جدید فقط وقتی وارد عملیات واقعی می‌شود که:
Capability → Concrete Payesh use-case → Integration point → Security/operational risk → Overlap check → Measured value → Owner

اگر این زنجیره کامل نشود، capability فقط در knowledge catalog می‌ماند و به dependency یا control-plane دوم تبدیل نمی‌شود.


## EXTERNAL BLIND DISCOVERY INTEGRATION — REPLIT — 2026-10-01

A read-only external blind audit was reviewed against pinned SHA `6152a48add2ba8197c7c122133d9e2859e90711f`. It is **discovery evidence only**, not certification. The audit had no live PostgreSQL/Redis environment; source/synthetic findings therefore require current-head reproduction before runtime promotion.

### New candidate queue
- **R-A1 — Class roster privacy/projection:** `GET /api/v1/classes/:id` may expose enrolled-student names and masked national-ID data to student/parent callers. **REVALIDATION_REQUIRED** pending route authorization, intended product contract, projection policy and live role-matrix verification.
- **R-A2 — Redis Cluster recovery after retry exhaustion:** bounded cluster retries may leave the client unusable without recreation/recovery. **REVALIDATION_REQUIRED / STRONGLY_SUPPORTED**; requires isolated live cluster outage→recovery evidence.
- **R-A3 — HA-only Redis configuration classification:** `REDIS_CLUSTER_NODES` / `REDIS_SENTINELS` classification differs between application production/shared-backend detection and Redis-module production detection, potentially enabling an unintended memory-fallback path. **REVALIDATION_REQUIRED**; requires configuration matrix and runtime boot/failure evidence.
- **R-A4 — destructive test cleanup ownership:** broad `/tmp/payesh-*` cleanup in `scripts/run-all-tests.sh` can remove unrelated scratch directories. **SOURCE-CONFIRMED SAFETY DEFECT / remediation candidate**; narrow ownership/namespace and add a regression safety check.

### Known repeats intentionally not duplicated
Replit also flagged the existing office-scope weakness, conditional OTP-bypass configuration risk and CI/test-timeout gaps. These remain in existing defect/root-cause programs.

### Required next controlled work
Reproduce/classify R-A1..R-A4 first; fix only confirmed defects; add regression tests; preserve exact-SHA evidence. Because the queue includes privacy/security/Redis-recovery/test-integrity concerns, Hermes checkpoint verification is mandatory after material Atria remediation.

### External-audit evidence rule
External blind auditors are discovery layers, not certifiers. External severity labels or "confirmed" wording do not override the project's evidence hierarchy when live runtime evidence is absent.


## 18-VIEW DISCOVERY PANEL — REPLIT + BOLT — 2026-10-01

برای افزایش استقلال کشف نقص، دو auditor بیرونی به شبکهٔ کشف اضافه شدند. این دو «عامل رأی‌دهنده» یا certifier نیستند؛ هر دو discovery-only هستند.

### نقش‌های رسمی
- **Replit — BLIND-DISCOVERY-AUDITOR:** ممیزی مستقلِ repository بدون اتکا به گزارش‌های قبلی در مرحلهٔ blind؛ تمرکز بر کشف نقص‌های پنهان، مسیرهای جایگزین، configuration contradictions، security/privacy، reliability/recovery، false-green و cross-layer gaps.
- **Bolt — CROSS-LAYER-ARCHITECTURE-CHALLENGER:** چالش مستقلِ قرارداد بین لایه‌ها؛ تمرکز بر Route → Middleware → Policy → Service → DB/Redis → Worker/Queue → Cache → Observability → CI/Test و کشف شکاف‌هایی که در یک لایه منفرد دیده نمی‌شوند.

### شبکهٔ 18-view
وقتی یک موضوع مهم به بررسی گسترده نیاز دارد، 11 Arena + 5 ChatGPT views + Replit + Bolt می‌توانند یک **18-view Discovery Panel** تشکیل دهند. همهٔ reviewers یک Task Envelope یکسان دریافت می‌کنند؛ فقط زاویهٔ reasoning متفاوت است.

18-view به معنی «18 رأی» نیست. نتیجه از Evidence Matrix، reproduction، current-HEAD validation و independent verification به‌دست می‌آید. consensus صرفاً signal است و جای evidence را نمی‌گیرد.

### Activation modes
- **Normal:** ChatGPT → Atria → Hermes.
- **Deep Investigation:** Atria/Hermes + Replit/Bolt + subset هدفمند از 16-view.
- **Critical / Disputed:** هر 18 view با همان task envelope؛ سپس deduplication، reproduction، Atria remediation و Hermes verification.

### Separation of duties
Replit/Bolt در blind discovery حق certify، close defect یا تغییر repository را ندارند. Finding آن‌ها باید به:
DISCOVER → NORMALIZE → DEDUPLICATE → REPRODUCE → ROOT-CAUSE → FIX → REGRESSION → HERMES VERIFY
برود.

### Disagreement handling
High agreement می‌تواند اولویت reproduction را بالا ببرد؛ high disagreement باید به بررسی عمیق‌تر و evidence بیشتر منجر شود؛ هیچ‌کدام به‌تنهایی حکم نهایی نیست.

## AUTOMATIC REPOSITORY VALUE-CAPTURE CONTRACT — 2026-10-01

هر بار که در جریان تحلیل، مأموریت، گزارش عامل‌ها، تحقیق، یا تصمیم‌گیری پروژه یک مورد **باارزش و ماندگار** شناسایی شود، باید آن را بدون انتظار برای دستور جداگانه، در مناسب‌ترین محل canonical مخزن ثبت و همگام کرد.

### What counts as valuable
- قانون/Invariant یا قاعده‌ای که در مأموریت‌های بعدی reusable است.
- تصمیم معماری/اجرایی یا تغییر مهم در مدل عملیاتی.
- finding، root cause، lesson، regression pattern یا anti-pattern که احتمال تکرار دارد.
- evidence/provenance مهم، همراه با SHA و محدودیت اعتبار آن.
- تغییر phase/gate/priority/ownership یا ترتیب مأموریت‌ها.
- capability/skill/tooling که واقعاً برای Payesh ارزش عملیاتی پیدا کرده است.
- اصلاح مهم در نقش عامل‌ها، قرارداد Atria/Hermes/16-view یا روش verification.
- هر واقعیت جدیدی که برای جلوگیری از سردرگمی، دوباره‌کاری یا تصمیم اشتباه در آینده لازم است.

### Placement rule
محتوا باید **در جای مربوط به خودش** ثبت شود، نه در یک گزارش عمومی انباشته:
- current truth / operating model → همین سند.
- mission sequencing / next work → `CURRENT_WORK_EXECUTION_PLAN.md`.
- execution prerequisites / reusable rules → `PREQUISITES.md`.
- agent/view ownership → `ARENA_REGISTRY.md`.
- roadmap/phase/gate changes → roadmap canonical.
- defect/finding evidence → canonical audit/defect register موجود.
- lessons/skills → existing lessons/skill canonical document.
- فقط اگر هیچ محل canonical مناسب وجود ندارد، سند جدید ساخته شود و در `DOCS_INDEX.md` ثبت و حداقل یک ارجاع متقابل دریافت کند.

### Automatic synchronization rule
ChatGPT به‌عنوان Control Plane باید در هر پاسخ/mission این سؤال را internally بررسی کند: **«آیا چیزی هست که اگر فردا این گفتگو از دسترس خارج شود، برای ادامه صحیح پروژه لازم باشد؟»** اگر پاسخ مثبت است، آن knowledge باید همان زمان در repository canonical ثبت شود؛ در صورت امکان با SHA/evidence/reference.

ثبت repository به معنی certification نیست. هر claim همچنان تابع evidence hierarchy و current-HEAD rules است.



## HERMES ENGINEERING UPGRADE — INFRASTRUCTURE / LEARNING EVIDENCE — 2026-10-02

Latest Hermes report is recorded as **agent-reported evidence**, not repository certification. Hermes reported a successful Windows/Docker infrastructure bootstrap with 118 packages, 547/547 smoke tests, 35/35 build tests, 4/4 mutation tests, PostgreSQL migrations/tables brought up, and multiple infrastructure suites executed. These claims remain bounded to Hermes' reported environment/session until independently reproduced or otherwise evidenced on the current repository HEAD.

### Durable engineering lessons
- PostgreSQL migration 012 contains an internal COMMIT pattern that is incompatible with wrapping the migration in the Node pg client transaction model; the migration path therefore needs an explicit execution-contract distinction between transaction-wrapped migrations and psql/native execution.
- A psql invocation that places the database/connection string as a positional argument before option flags can cause later tokens to be treated as extra arguments rather than options. PostgreSQL documents that a non-option argument is interpreted as the database name, while `-d` explicitly supplies the database/connection string; `ON_ERROR_STOP` is what makes script errors terminate with a non-zero status. citeturn0search0turn0search2
- Migration/recovery tooling must test both **stderr/error visibility** and **process exit status**; printed SQL errors are not sufficient evidence that the automation layer observed failure.
- Environment contamination between sessions can change test results. Clean-environment execution is therefore a reusable prerequisite for infrastructure/test claims.
- Platform-specific filesystem/signal behavior must be separated from product defects and covered by explicit portability checks.
- Date/day-dependent tests are a test-design defect candidate: tests should control/freeze time or explicitly encode the intended temporal fixture rather than depend on the host calendar.

### Current unmerged Hermes work / findings
Hermes reported local changes to `tools/migrate-ledger.js` and `scripts/run-all-tests.sh`, but explicitly stated that no change was pushed to main. Therefore these changes are **NOT current repository truth** and must not be treated as merged remediation.

Reported migration fix: invoke psql with options before an explicit `-d <connection-string>`, so `ON_ERROR_STOP=1` is actually parsed. This is consistent with PostgreSQL's documented CLI semantics. citeturn0search2turn0search6

Reported additional finding: two smoke tests are sensitive to the host day-of-week. This is recorded as a candidate test-integrity defect pending source/current-head verification.

### Hermes learning/behavior signal
Compared with earlier Hermes checkpoints, this report shows stronger evidence discipline: it explicitly distinguished environment/setup problems from project defects, identified a concrete root cause instead of stopping at a symptom, used controlled variants to isolate the psql argument-order behavior, reran regression suites after the local change, and disclosed that its fixes were not pushed. It also converted operational observations (environment leakage, migration execution contract, platform differences) into reusable lessons. This is a positive process change, but it is an **observed behavioral improvement from the report**, not a certification that Hermes is fully upgraded.

The reported `168 broken references`, `98 skills`, and other inventory counts remain self-reported until independently checked against the actual workspace/repository.


## EXTERNAL AUDIT RECONCILIATION — 2026-10-02

Current main HEAD: `a8e5772767d2bd4166864aa86033252fc…` (exact: `a8e5772767d2bd4166864aa86033252adccdfb27`). Replit and Bolt audited earlier ancestor SHAs; current-main comparison shows only documentation changes since the Bolt snapshot, and Replit likewise found no source/test/workflow changes since its pinned audit. Their source-level findings therefore remain relevant unless separately dispositioned.

Canonical detailed reconciliation: `docs/audit/EXTERNAL_AUDIT_RECONCILIATION_2026-10-02.md`.

### External queue status
- Replit: R-A1 class projection, R-A2 Redis Cluster recovery, R-A3 HA-only Redis configuration, R-A4 run-owned temp cleanup — discovery/revalidation only.
- New Bolt B-01/B-02/B-03/B-04/B-05/B-06/B-07 are registered in the Master Defect Priority queue as revalidation candidates; none is VERIFIED.
- Bolt F-05/F-08 are deduplicated into existing tenant/office and OTP families; Bolt F-10 remains a low-priority observation.

### Current control-plane order
**External discovery → deduplicate → controlled reproduction → Atria remediation → Hermes independent verification → ChatGPT reconcile/decide.**
No external auditor can close a finding.


## HERMES MATURITY / M12 INDEPENDENT VERIFICATION — 2026-10-02

Hermes completed the independent verification of Atria's B-PG M12 rework on repository `origin/main` at `5712020b5cd3b35e584082b11cd9ad530e5116a0`. The key process result is that Hermes detected a stale local HEAD (505 commits behind origin/main), rejected it as an invalid verification basis, created a clean working copy from origin/main, and bound its evidence to the correct repository state.

### Verification result
- F-1 PG timeout bounding: **VERIFIED** — live PostgreSQL 17, 30/30 fixed checks; legacy broken behavior reproduced for zero/negative/non-numeric inputs; production escape hatch behavior checked.
- F-2 B-PG CI wiring / false-green defense: **VERIFIED** — explicit critical-orphan CI steps, greppable verdict contract, NOT-RUN/ERROR semantics, negative legacy arm, and 11/11 + 9/9 + 30/30 live probe results.
- F-3 canary TTL/backoff handling: **VERIFIED as implementation**, but **coverage gap remains** — no dedicated regression test and no dedicated CI step currently protects TTL/backoff invalid-value behavior.

### Additional discoveries from the verification
- `tools/delta-load-test.js` still parses `PG_TIMEOUT_MS` directly; it is a non-production test harness but should converge on `boundedMs` for invariant consistency.
- `tools/migrate-ledger.js` has a Windows/macOS/no-psql execution-path incompatibility for migration 012 because the non-psql path wraps a procedure containing an internal COMMIT in an explicit transaction. This is a reproducible environment/path defect candidate and needs controlled remediation.
- B-PG probes hard-code port 5432, reducing local portability; CI is unaffected. An environment override should be considered.

### Hermes process-learning signal
This verification is strong evidence of mature verification behavior: source/current-HEAD binding, independent reproduction, controlled discriminating experiments, false-green defense, explicit evidence boundaries, discovery of out-of-scope risks, and refusal to treat a working implementation as regression-protected when coverage is absent. This is a **maturity signal, not a certification that Hermes can never fail**.

### Permanent handoff contract
The operational chain is mandatory and must remain unbroken:
**ChatGPT → Atria → Hermes → ChatGPT**.
Atria's final report must explicitly instruct that it is handed to Hermes; Hermes must return its independent verification report to ChatGPT; ChatGPT performs final repository reconciliation and decides the next mission. No agent report alone closes a mission.

### Permanent agent analyzer
During every mission, the control plane and agents must analyze not only Payesh defects but also their own process weaknesses. Any recurring reasoning/evidence/workflow weakness must become a reusable rule/checklist/skill, be applied on the next matching mission, and be checked for recurrence. Agent weakness records must distinguish new, recurring, corrected, and unresolved process defects.
