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
