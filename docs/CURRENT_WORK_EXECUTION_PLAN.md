> ## CURRENT SYNCHRONIZATION — 2026-09-24
> This plan remains the canonical execution-order document. The original baseline SHA below is intentionally preserved as the planning baseline.
> Latest synchronized project-intelligence document: `docs/CURRENT_PROJECT_INTELLIGENCE.md`.
> Latest documentation synchronization checkpoint: `d5034211400a79c00aa0ac82428c34b3f0f5a2df`.
> Recent confirmed code changes include Intelligence PR #401 (`e264932419335ce42da53f2700e362bce31670b9`) and Phase 7 verifier fixes reconciled through PRs #382/#383/#386/#390/#391/#392.
> Intelligence remediation status: 21/21 runtime-wired, 0 orphan, F-EI-01 closed at remediation level; final certification remains evidence-gated.

---

# PAYESH — برنامه اجرایی یکپارچه پایش، رفع عیب و اعتبارسنجی نهایی

**وضعیت:** ACTIVE / CANONICAL EXECUTION PLAN  
**تاریخ:** 2026-09-24  
**مخزن:** `rezaa2544/p2`  
**شاخه مرجع:** `main`  
**HEAD مبنا در زمان ثبت:** `ac7150e5414efc81d029839524bca8dce3023f57`

## 1. هدف این سند

این سند ترتیب اجرایی فعلی پروژه را تثبیت می‌کند و بر برنامه‌های قدیمی‌تر که فقط بخشی از مسیر را پوشش می‌دهند اولویت اجرایی دارد. اسناد معماری، الزامات و شواهد تاریخی حذف نمی‌شوند؛ این سند فقط ترتیب اجرای کار از این نقطه را مشخص می‌کند.

اصل حاکم:

> ابتدا خطرناک‌ترین عیب‌ها، سپس عیب‌های متوسط، سپس عیب‌های کوچک؛ بعد از آن یک کمپین مستقل و سراسری برای اثبات صحت قابلیت‌ها، نقش‌ها، امنیت، داده، کارایی و رفتار کل سامانه.

هیچ موردی فقط با تغییر کد «رفع‌شده» محسوب نمی‌شود. Definition of Done برای عیب‌ها:

`Finding → Reproduce → Root Cause → Fix → Regression Test → Execute → Evidence → Review`

---

## 2. فازهای اجرایی جدید

### Phase A — Atria Critical / High Zero-Trust Sweep
**مالک اصلی: Atria**

Atria باید کل `main` فعلی را به‌عنوان baseline بررسی کند و ابتدا موارد **Critical / P0** و **High / P1** را پیدا، بازتولید و اصلاح کند.

دامنه حداقلی:

- Authentication / Session / Credential lifecycle
- Authorization / RBAC / ABAC
- Tenant isolation / IDOR / object ownership
- data leakage و cross-role access
- transaction atomicity / OCC / race conditions
- PostgreSQL / Redis / queue / worker failure modes
- migrations / ledger / recovery safety
- API و routeهای حساس
- WAF / rate limiting / public endpoints
- sync / offline / conflict handling
- intelligence / analytics / educational engines
- data integrity / corruption / duplicate processing
- caching و stale authority
- resource exhaustion
- observability و failure detection
- production boot / shutdown / recovery
- CI/test integrity و fake-green paths

**قاعده:** finding باید روی HEAD جاری reproduce شود یا صریحاً به‌عنوان historical/unverified ثبت شود.

### Phase A Carry-over — Unresolved Items From First Atria Sweep
پس از اتمام P0/P1، گزارش Phase B تعداد **۲۲ مورد Medium/Low** را به‌عنوان «شناسایی‌شده و اصلاح‌نشده» ثبت کرد. این موارد از بین نرفته‌اند و نباید به‌عنوان resolved/safe تلقی شوند.

مرجع اجرایی کامل و غیرقابل‌حذف این queue:
`docs/audit/ATRIA_PHASE_A_CARRYOVER.md`

ترتیب closure:

1. ابتدا موارد امنیت/یکپارچگی داده و ownership:
   `A-18`, `A-19`, `A-20`, `A-21`, `A-22`
2. سپس false-green و test/CI integrity:
   `A-07` تا `A-17`
3. سپس operational/performance:
   `A-01` تا `A-06`
4. سپس metric ثابت/مشکوک `average_difficulty_p_value` در intelligence، با reproduction مستقل.
5. برای هر مورد یکی از این dispositionها الزامی است:
   `FIXED + evidence` / `VERIFIED NOT A DEFECT` / `ACCEPTED RISK` / `BLOCKED` / `HISTORICAL` / `DEFERRED`
6. هیچ موردی صرفاً به دلیل «deferred» یا «خارج از scope قبلی» resolved محسوب نمی‌شود.

### Phase B — Atria Medium Sweep
پس از بسته‌شدن Critical/High و **پس از تعیین تکلیف Phase A Carry-over**:

- منطق ناقص و edge caseها
- validation و error handling
- ناسازگاری backend/frontend
- integration defects
- maintainabilityهایی که روی رفتار اثر دارند
- test gaps مربوط به قابلیت‌های موجود
- operational defects غیرحیاتی
- technical debt با اثر عملکردی/رفتاری

### Phase C — Atria Low Sweep
پس از بسته‌شدن Medium:

- cleanup و dead code
- inconsistencies
- UX/error-message defects
- refactorهای کم‌ریسک
- مستندسازی عقب‌افتاده
- technical debt کم‌خطر

در Phase C تغییر معماری عمده بدون Architecture Review ممنوع است.

---

## 3. Gate بین Atria Sweep و Validation Campaign

شروع Phase D فقط وقتی مجاز است که برای هر یافته مهم یکی از این وضعیت‌ها ثبت شده باشد:

- FIXED + regression evidence
- VERIFIED NOT A DEFECT
- ACCEPTED RISK با مالک و دلیل
- BLOCKED با dependency مشخص
- HISTORICAL / REPRODUCTION REQUIRED

گزارش Atria به‌تنهایی certification نیست.

---

## 4. Phase D — Full Multi-AI Validation Campaign

پس از پایان Sweep آتریا، تمام گروه وارد می‌شود:

### ChatGPT × 5
- معماری، roadmap و ground truth
- Security / Zero-Trust
- Backend / Database / Infrastructure
- Frontend / Intelligence / UX
- QA / Release / Evidence

### Arena × 11
هر عامل یک workstream مستقل و non-overlapping می‌گیرد؛ اجرای موازی فقط در صورتی مجاز است که دو عامل هم‌زمان یک ناحیه کد را تغییر ندهند.

### Atria
از fixer به **adversarial reviewer** تبدیل می‌شود و اصلاحات قبلی خودش را نیز دوباره به چالش می‌کشد.

---

## 5. Phase E — Capability Matrix

تمام قابلیت‌های موجود پروژه باید inventory شوند و برای هر قابلیت این زنجیره بررسی شود:

`Requirement → Backend → DB → Auth/AuthZ → API → Frontend → Role → Tenant → Audit → Error/Failure → Recovery`

هیچ قابلیت مهمی صرفاً با unit test تأییدشده تلقی نمی‌شود.

---

## 6. Phase F — Role Matrix

تمام Roleهای واقعی تعریف‌شده در پروژه از source of truth پروژه استخراج و برای هر قابلیت آزمون می‌شوند.

برای هر ترکیب:

- مجاز → باید موفق شود.
- غیرمجاز → باید رد شود.
- tenant اشتباه → باید رد شود.
- object متعلق به کاربر/tenant دیگر → باید رد شود.
- رابطه parent/student یا سایر ownershipها → باید صحیح enforce شود.
- session منقضی → باید رد شود.
- credential/token revoked → باید طبق قرارداد fail-closed عمل کند.

این ماتریس نباید roleهای فرضی ایجاد کند؛ فقط roleهای واقعی repository ملاک هستند.

---

## 7. Phase G — End-to-End Business Flows

مسیرهای واقعی و زنجیره‌ای بررسی شوند، نه فقط endpointهای منفرد.

نمونه:

`School → Student → Teacher → Assessment → Attendance → Intervention → Intelligence → Dashboard → Parent → Report`

تمام جریان‌های اصلی مشابه نیز باید از ابتدا تا انتها اجرا شوند و state، permission، tenant boundary و داده در طول زنجیره بررسی شود.

---

## 8. Phase H — Failure / Recovery Campaign

حداقل این failureها:

- PostgreSQL unavailable
- Redis unavailable / restart
- worker crash
- queue backlog / duplicate event / retry / DLQ
- transaction rollback
- migration failure
- network timeout/latency
- session expiration/revocation
- cold cache
- service restart
- concurrent writes
- resource exhaustion
- deployment failure

برای هر failure:

`Detect → Alert → Contain → Recover → Verify Data Integrity`

---

## 9. Phase I — Performance / Scale Validation

پس از functional correctness:

- load
- stress
- spike
- soak
- concurrency
- memory / CPU / event loop
- DB / Redis / queue capacity
- API latency
- p50 / p95 / p99
- throughput
- resource exhaustion

تمام اعداد باید measured باشند؛ extrapolation یا مقدار صرفاً مستنداتی به‌عنوان capacity evidence پذیرفته نیست.

---



### Phase I.1 — Database Sharding Readiness / Decision Gate
**وضعیت: PLANNED / CONDITIONAL**

این کار عمداً بعد از Performance / Scale Validation قرار می‌گیرد. هدف، تبدیل weighted partitioning و read-replica routing فعلی به **true sharding فقط در صورت اثبات نیاز** است؛ نه اجرای premature architecture.

**Decision Gate:**
- measured database/tenant bottleneck روی Current HEAD
- evidence واقعی capacity و saturation
- shard key + tenant placement contract
- topology و failover model
- بررسی کافی‌بودن partitioning + read replicas
- Architecture Review با تصمیم ADOPT / DEFER / REJECT

**در صورت ADOPT:**
1. Shard Router / Placement contract
2. connection/pool isolation per shard
3. tenant-safe routing
4. primary-write / read-consistency contract
5. shard-local migrations
6. provisioning + failover
7. rebalancing / tenant migration
8. cross-shard query policy
9. per-shard observability
10. per-shard backup/restore/DR
11. tenant/authz/OCC regression
12. E3 + E4 multi-shard evidence

**Definition of Done:**
Design → Decision Gate → Bounded Implementation → 5-Pass Regression → E3 Runtime Evidence → E4 Multi-Shard Evidence → Independent Review

**قید:** PAYESH_SHARDS یا weighted routing به‌تنهایی اثبات Sharding Production نیست. تا اثبات واقعی توزیع داده و lifecycle چند shard مستقل، این آیتم PLANNED / NOT VERIFIED باقی می‌ماند.

## 10. Phase J — Final Certification / Ground Truth

در پایان یک ماتریس واحد صادر می‌شود:

| حوزه | وضعیت | Evidence |
|---|---|---|
| Security | PASS / FAIL / UNVERIFIED | command + SHA + run |
| Tenant Isolation | PASS / FAIL / UNVERIFIED | evidence |
| Authentication | PASS / FAIL / UNVERIFIED | evidence |
| Authorization | PASS / FAIL / UNVERIFIED | evidence |
| Backend | PASS / FAIL / UNVERIFIED | evidence |
| Database | PASS / FAIL / UNVERIFIED | evidence |
| Redis / Queue | PASS / FAIL / UNVERIFIED | evidence |
| Frontend | PASS / FAIL / UNVERIFIED | evidence |
| Intelligence | PASS / FAIL / UNVERIFIED | evidence |
| All Roles | PASS / FAIL / UNVERIFIED | matrix |
| Core Capabilities | PASS / FAIL / UNVERIFIED | matrix |
| E2E | PASS / FAIL / UNVERIFIED | scenarios |
| Failure / Recovery | PASS / FAIL / UNVERIFIED | drill |
| Performance | PASS / FAIL / UNVERIFIED | measured results |
| Observability | PASS / FAIL / UNVERIFIED | evidence |
| Production Readiness | PASS / FAIL / UNVERIFIED | gate |

هیچ «GO» یا «Production Ready» بدون evidence معتبر صادر نمی‌شود.

---

## 11. مدیریت هم‌زمانی عامل‌ها

تا پایان Phase C:

- Arenaها روی همان ناحیه‌ای که Atria در حال اصلاح آن است وارد کدنویسی نشوند.
- duplicate fixing ممنوع.
- force push، history rewrite و حذف تغییرات نامرتبط ممنوع.
- `git add -A` و تغییرات خارج از scope ممنوع.
- هر تغییر باید commit و evidence مستقل داشته باشد.

از Phase D به بعد، workstreamها با مالکیت صریح تقسیم می‌شوند.

---

## 12. قرارداد گزارش هر عامل

هر تحویل:

```
TASK:
SCOPE:
FINDINGS:
SEVERITY:
REPRODUCTION:
ROOT CAUSE:
FILES CHANGED:
FIX:
REGRESSION TEST:
TEST RESULTS:
SECURITY IMPACT:
DATA IMPACT:
PERFORMANCE IMPACT:
KNOWN LIMITATIONS:
UNVERIFIED ITEMS:
COMMIT:
CI / RUNTIME EVIDENCE:
```

---

## 13. اصل Ground Truth

در تعارض بین برنامه و واقعیت:

1. اجرای واقعی E3/E4 و GitHub Actions
2. کد و تست HEAD فعلی
3. گزارش ممیزی دارای SHA و evidence
4. برنامه و ادعاهای تاریخی

بنابراین اسناد قدیمی حذف نمی‌شوند؛ status آنها باید با HEAD فعلی خوانده شود.

---

## 14. وضعیت آغاز این برنامه

این برنامه از `main` در SHA `ac7150e5414efc81d029839524bca8dce3023f57` آغاز می‌شود.

**ترتیب قطعی فعلی:**

`Atria Critical/High → Atria Medium → Atria Low → Full Multi-AI Validation → Capability Matrix → Role Matrix → E2E → Failure/Recovery → Performance → Final Certification`

این ترتیب تا Architecture Review صریح تغییر نمی‌کند.



## Architecture Track — M15 Observability & Operations

### M15-OBSERVABILITY-ARCHITECTURE — PLANNED
**هدف:** طراحی و سپس پیاده‌سازی یک معماری observability مستقل برای پایش production در مقیاس 10M+.

#### M15-MONITORING
- Monitoring server/cluster مستقل از application servers
- Metrics collection, health checks, SLO/SLA, alerting
- مستقل‌بودن failure domain مانیتورینگ از Payesh
- CPU/RAM/disk/network/process/event-loop/DB/Redis/queue/cache/application metrics
- alert escalation و retention
- monitoring-of-monitoring

#### M15-LOGGING
- Structured logs
- Central log aggregation
- correlation/request/trace IDs
- security/audit separation
- retention و access policy
- remote shipping با تحمل قطعی مقصد

#### M15-LOG-ROTATION
- size/time based rotation
- compression
- retention policy
- bounded local disk usage
- safe handling during rotation
- protection against disk exhaustion
- remote archival/aggregation
- recovery after log sink outage

#### Architecture target
```
Payesh Servers
   ├── metrics ───────────────► Independent Monitoring Cluster
   ├── structured logs ───────► Log Collector / Aggregator
   └── traces ────────────────► Observability Backend
                                      │
                                      ▼
                              Alert / SLO Engine
                                      │
                                      ▼
                               Operator / On-call
```

**اصل:** اگر application server سقوط کند، monitoring باید همچنان قادر به تشخیص و گزارش آن باشد.

**ترتیب:** Discovery → Architecture Design → Hermes Review → ChatGPT Approval → Implementation → Failure/Recovery Tests → Load/Soak → Independent Verification.

**قید:** وجود health endpoint یا چند metric در application به‌تنهایی «Monitoring Architecture» محسوب نمی‌شود. Log rotation نیز فقط وجود logger یا حذف فایل قدیمی نیست؛ باید retention، compression، disk protection و recovery اثبات شود.

**Definition of Done:** معماری مستقل، failure-domain isolation، metrics/log/tracing contracts، retention policy، alert matrix، disk-protection، recovery evidence و current-HEAD independent verification.

### M15-CACHE-ARCHITECTURE — PLANNED
مرجع canonical: `docs/PAYESH_ADAPTIVE_CACHE_ARCHITECTURE.md`


## Architecture Evolution Track — execution policy

Canonical detail: docs/ARCHITECTURE_EVOLUTION_ROADMAP.md

P0: Modular Monolith/Vertical Slices; Event-Driven + Transactional Outbox; OpenTelemetry; Policy-as-Code.
P1: Selective CQRS; Workflow/Saga.
Conditional/research: Event Sourcing; Microservices; Kubernetes; Service Mesh.
Cross-cutting: Zero-Trust Service Boundaries.

These are not implementation claims. They are controlled architecture work items. P0 may be evaluated during the current program only when it reduces current risk or unblocks validation. P1/research remains behind the current defect and validation gates unless Architecture Review explicitly changes the sequence.


## MANDATORY STRICT VERIFICATION GATE — 2026-09-24

Canonical policy: `docs/STRICT_VERIFICATION_GATE.md`

از این نقطه هیچ بخش/آیتمی بدون عبور از Strict Verification Gate حق دریافت PASS/VERIFIED ندارد. هر آیتم باید برای همان HEAD توسط سه بررسی مستقل ChatGPT + Arena + Atria ارزیابی شود و evidence مستقل داشته باشد. Gate به‌صورت fail-closed در `tools/strict-verification-gate.js` و GitHub Actions workflow ثبت شده است. Registry رسمی: `docs/verification/VERIFICATION_REGISTRY.json`. موارد A-01..A-23 نیز مشمول این قانون هستند.

قانون اجرایی: **NO EVIDENCE CHAIN → NO GREEN CHECK**. تست سبز، CI سبز، review یا گزارش تاریخی به‌تنهایی certification نیست.


## 2026-09-24 — Multi-AI Report Reconciliation / Current Main 3b98fc1

Current GitHub `main` resolves to `3b98fc19ec49bbbc7362fea578b196c1d4c0f2e9`. The report corpus was reconciled against this SHA. Historical report PASS/VERIFIED labels are not promoted automatically.

### Newly confirmed work queue from report reconciliation
1. **SYNC-OFFLINE / OCC:** the dedicated Sync/Offline remediation branch is not merged into current main. A-18/A-20 therefore remain open in the canonical queue. The branch evidence also leaves legacy/LWW compatibility, device/browser crash durability, reconnect/production topology and multi-host behavior unverified. Reconcile the branch onto current main, reproduce A-18/A-20, run adversarial stale-write/concurrent/version tests, then regression-test the merged SHA.
2. **Authorization:** Arena-2 found and fixed five defects on its branch: cross-collection ID collision, tenant-province fallback/parent-office lockout, guard/driver read over-permission, NULL school anchor, and phone canonicalization. Current main already contains the ID-generation remediation path and upstream tenant fixes; these must be independently revalidated on current main rather than duplicated. The Arena-2 branch is not a certification source.
3. **Security/CI:** Arena-6 reported repo-owned security/false-green gaps requiring explicit reconciliation: F-S04 security workflow/orphan-suite gating; F-S01 scanner extension coverage; F-S02 published example JWT secret rejection; F-S05 supply-chain suite drift; F-S09 OTP mutation oracle; F-S10 configuration-variable drift; F-S07 sync denial envelope contract; F-S06 outbox/tombstone model coverage; F-S11 malformed JSON contract; F-S13 skip-to-incomplete semantics; F-S16 Node-engine guard; F-S12/F-S14 hardening. F-S03 PAT rotation and E4 penetration testing remain external owner blockers.
4. **Outbox/Worker:** prior Arena evidence identified F-1a processing-claim recovery, F-1b no-handler processing state, F-2 worker timeout/recovery, F-3 processing-depth observability, F-4 missing CI registration, and F-5 terminal dead-letter label consistency. These are not to be re-counted as new defects if already fixed by later commits; current-head revalidation is mandatory before closure.
5. **DR/HA:** Arena-8 and the DR reports leave E3 as historical/local evidence and E4 unverified. Required work remains current-SHA DR-01 refresh, real PG/Redis restore/failover evidence, independent failure domains, off-site/S3 evidence, RPO/RTO acceptance thresholds, and alert→receiver→on-call→ack→runbook→recovery evidence.
6. **Architecture/scale:** remaining validation includes RAM-authoritative control-plane remnants, explicit authority mode/fail-closed behavior outside server boot, fragmented tenant enforcement on legacy routes, national-scale load/soak evidence, and measured performance rather than documented targets.
7. **Release/roadmap integrity:** the master schedule audit identified documentation/execution drift items (Redis target-version mismatch, Node engine-pin mismatch, unsupported critical-path duration claim, and Phase 9.0 dependency wording). These are documentation/plan reconciliation tasks, not runtime defect claims.
8. **Strict Verification Gate:** the registry is intentionally still empty and therefore BLOCKED. The previous broken `monitoring/alert-rules.yml` finding is no longer reproduced on current main: the path is readable and is a documented compatibility marker pointing to the canonical rules file. The gate itself still requires a real registry and three independent reviews before any certification claim.

### Mandatory execution consequence
No item above is marked green by this reconciliation. New/remaining work must enter the appropriate workstream, receive exact current-HEAD evidence, and pass the three-AI gate. Historical reports remain evidence records only.


## 2026-09-25 — Current-HEAD Reconciliation Addendum (A-30..A-39)

صف جدید پس از مقایسه گزارش‌ها با `main@4938631633c9c578db2679905fd46c4daaedd80a`:

- **A-30:** Strict Verification Gate hardening؛ V-01..V-12.
- **A-31:** Intelligence semantic/certification integrity؛ I-02..I-09.
- **A-32:** SMS PG mirror schema/idempotency؛ `queue_id/provider_msg` + restart duplicate proof.
- **A-33:** PG delegation flags parity؛ `asset_staff/lib_staff/is_head`.
- **A-34:** Sync twin-gate authorization؛ reconcile `6018dd76`.
- **A-35:** Mission-5 authz reappearance؛ A-AUTHZ-03/04/05.
- **A-36:** PG migration/test infrastructure؛ F-PG-05/06/07.
- **A-37:** ZERO-CHECK/ORPHAN/MOCK/swallowed-catch triage، با اولویت certification path.
- **A-38:** Registry rebind از `e4584806` به current HEAD فقط با evidence جدید.
- **A-39:** نگه‌داشتن F-1a..F-5 و DR drills به‌عنوان acceptance criteria در A-25/A-27.

### Updated execution sequence
`Atria Critical/High → A-30 Gate Hardening → A-31..A-36 Critical/High Closure → A-37 Test Integrity Closure → A-38 Current-Head Registry Rebind → A-25/A-27 Reliability/DR Evidence → Atria Medium → Atria Low → Full Multi-AI Validation → Capability Matrix → Role Matrix → E2E → Failure/Recovery → Performance → Final Certification`

**No historical PASS is promoted to current HEAD.**


## CURRENT-HEAD EXECUTION SYNCHRONIZATION — 2026-09-25

**Current main at synchronization:** 774e7ab16a33ab880c883923fc00564c1b93f9e9.

The earlier 2026-09-24 sequence is superseded by the following hardening order. This is an execution update, not a certification claim.

### Current gate
**NOT VERIFIED — Hardening/Reconciliation.** The verification registry remains bound to e4584806 and therefore cannot certify main.

### Current workstreams and root-cause plan

#### A-30 — Strict Verification Gate
**Root cause:** the gate historically validated pieces of the evidence graph without making every dependency mandatory (non-empty registry, exact SHA, independent reviewers, complete evidence schema, blocked-state handling, negative tests).
**Plan:** close V-01..V-12; add negative tests for empty registry, stale SHA, missing reviewer, injected certification input, blocked-until, incomplete evidence, and scanner gaps; require exact command/exit/artifact hash/runtime/limitation fields; then run the gate against a frozen hardening SHA.
**Exit evidence:** gate exit, negative-test logs, registry schema validation, exact SHA binding.

#### A-31 — Intelligence semantic/certification integrity
**Root cause:** default/fallback semantics can convert no-data or empty observations into apparently healthy/compliant values, and some release checks are self-attested rather than causally tied to runtime evidence.
**Plan:** replace ambiguous defaults with explicit NO_DATA/NOT_VERIFIED; trace every metric to observed engine output; add empty/no-data/malformed/real-route negative tests; make release certification consume independent evidence only.
**Exit evidence:** current-SHA runtime matrix and non-circular certification artifact.

#### A-32 — SMS / PostgreSQL mirror / restart
**Root cause:** provider side effects, queue state, PG mirror and wallet debit do not yet have a demonstrated single idempotent transaction boundary; a restart can therefore separate sent from durable mirror state and repeat a send/debit.
**Plan:** first reproduce with live PG and a controlled provider stub; map queue_id/provider_msg schema; define durable idempotency key; persist intent before external side effect; make replay/restart converge; reconcile queue, sms_log, wallet and audit rows.
**Exit evidence:** pre-fix reproduction, fixed run, restart/replay run, row-count/wallet/audit proof.

#### A-33 — PG authorization delegation flags
**Root cause:** authz flags are consumed from policy but their persistence parity through PG hydration is not proven.
**Plan:** seed users with asset_staff/lib_staff/is_head, persist to PG, authenticate, hydrate session, execute positive delegated actions and negative cross-scope actions; repair schema/model/migration parity if any flag is lost.
**Exit evidence:** seed→PG→login→policy trace and adversarial authorization matrix.

#### A-34 — Sync authorization parity
**Root cause:** REST and sync paths historically applied different ownership checks, allowing foreign references or global conflict operations to escape the school boundary.
**Plan:** reconcile the existing fix to the final mainline, then test REST create/update, offline sync, conflict resolve and negative foreign-school references against the same tenant/role matrix.
**Exit evidence:** exact-SHA regression + adversarial tenant matrix + DB readback.

#### A-35 — Mission-5 authorization
**Root cause:** incomplete school anchoring for parent/driver/guard paths and non-canonical phone identity can create cross-tenant read/rate-limit divergence.
**Plan:** re-run the merged remediation on current HEAD; verify parent_links school equality before fallback; verify foreign teacher/class references; canonicalize phone identity; execute 15/15 regression and adversarial variants.
**Exit evidence:** 15/15 plus cross-tenant negative matrix and current-SHA SHA-bound artifact.

#### A-36 — PostgreSQL infrastructure
**Root cause:** migration 012 transaction semantics, seed-ledger continuity and raw table-identifier construction were not jointly protected by the live-PG gate.
**Plan:** reproduce migration 012 on clean PG17; replay the entire ledger; fix transaction boundaries and seed ordering; replace raw identifiers with a strict allowlist; run migration + rollback + injection regression.
**Exit evidence:** clean-cluster replay log, ledger continuity, rollback evidence, identifier negative tests.

#### A-37 — Test integrity inventory
**Root cause:** the repository contains a large amount of test-like code that is not connected to certification gates, making coverage numbers and orphan budgets unreliable.
**Plan:** classify 513 ZERO-CHECK / 311 ORPHAN / 54 MOCK / ~40 swallowed catches into product tests, harnesses, fixtures, intentionally non-executable artifacts and defects; connect certification-critical suites to gates; make unavailable prerequisites explicit NOT-RUN.
**Exit evidence:** inventory ledger, owner/status per bucket, gate wiring diff, no hidden red suite.

#### A-38 — Registry rebind
**Root cause:** evidence registry is tied to an audit SHA and does not automatically follow main.
**Plan:** freeze the final hardening SHA; regenerate evidence for every mandatory item; record ChatGPT, Arena and Atria independent reviews; only then change registry binding/statuses.
**Exit evidence:** registry SHA equals final main, three review sets, reproducible artifacts, strict gate PASS.

#### A-39 — Reliability / DR
**Root cause:** E4 failure-domain and recovery evidence is not continuously available in the current environment.
**Plan:** prepare in parallel, then execute PG restore, Redis restore/failover, worker crash, queue saturation, notification growth, graceful shutdown, alert→on-call→runbook→recovery drills. Measure RPO/RTO/MTTA/MTTR rather than copying targets.
**Exit evidence:** independent failure-domain logs, restored DB identity/checksum, measured RPO/RTO/MTTA/MTTR and alert acknowledgement trail.

### Execution options
1. **Default / safest:** A-30 → A-31..A-36 → A-37 → A-38 → A-39 → three-AI validation → broad certification.
2. **Parallel infrastructure:** prepare A-39 E4 infrastructure while A-30..A-37 are being fixed; no status promotion until dependencies close.
3. **Blocked-path investigation:** for an item requiring unavailable credentials/infrastructure, reproduce what is possible, document the exact root cause and unblocker, and mark BLOCKED; never convert NOT-RUN into PASS.

### Sync/OCC current-head rule
The merged Arena publication contains real evidence for A-18/A-20/A-24 on a later test SHA but explicitly leaves the global invariant NOT VERIFIED because legacy-mode cases still fail and production topology boundaries remain unverified. Therefore strict/production is the required deployment contract; legacy compatibility remains a declared limitation until separately dispositioned.

### Phase transition rule
Do not enter the broad Capability/Role/E2E/Performance certification campaign until A-30..A-39 have either been fixed and evidence-backed, or explicitly dispositioned as BLOCKED/ACCEPTED RISK with owner, rationale and review point.


## FINAL SYNCHRONIZATION RECEIPT — 2026-09-25
**Exact main HEAD after this synchronization series:** `7c1a4ce3c29810910bfee72e17358d81032c33ea`.
This SHA includes the synchronization updates themselves. The verification registry remains intentionally bound to `e4584806c1af2a1e5db648c8452580a8fa8cbcec` until the hardening SHA is frozen and evidence is regenerated; therefore this receipt is a project-state update, not a certification.


## P0 — ROOT-CAUSE REAPPEARANCE ELIMINATION

A new cross-report analysis is now a prerequisite to A-30..A-39 closure.

### Why this is first priority
Repeated reports show that a local fix can pass its own regression while a later audit finds the same invariant broken in another route, configuration, state transition, or newer HEAD. The project must therefore prove invariant preservation, not only patch correctness.

### Required controls
1. Invariant Registry: map each high-risk invariant to all entrypoints, states, configs, failures and reviewers.
2. Reappearance Suite: permanently preserve every historical recurrence as a regression/negative/adversarial test.
3. Evidence invalidation: material merge invalidates affected evidence until current-head re-execution.
4. Complete inventories: REST/sync/worker/client mutations; role/tenant/ownership authorization; PG/Redis/provider/env/legacy/strict/restart failure modes.
5. Authoritative policies: eliminate semantic drift between twin authorization/OCC implementations.
6. Root-cause closure: future status reports must include why the previous fix failed to prevent recurrence.

### Priority cases
A-20 = incomplete mutation inventory.
A-22 = incomplete configuration/failure matrix.
A-18/A-24 = multi-path state ownership plus SHA/evidence drift.
A-34/A-35 = twin authorization gates plus current-head boundary.
A-31/A-37 = fallback semantics plus certification/test-integrity weakness.

### Gate
No recurring item can be promoted directly from FIXED to CERTIFIED. It must pass the new root-cause closure contract first.


## P0 — DELIVERY / PUSH ENFORCEMENT

Before any future A-30..A-39 or later execution task is delegated, attach a Delivery Contract:
1. exact target branch;
2. exact required commit/change scope;
3. push requirement;
4. PR requirement;
5. merge-to-main requirement when applicable;
6. tests/evidence;
7. final GitHub verification.

No agent may be marked DONE from prose alone. Unpushed or unmerged work remains INCOMPLETE according to the required target.

This control is now part of the execution plan, not a suggestion.



## 2026-09-25 — MASTER DEFECT PRIORITY / TWO-ATRIA REMEDIATION OVERRIDE

Canonical register: `docs/audit/MASTER_DEFECT_PRIORITY_2026-09-25.md`.

### Immediate P0/P1 queue
1. **F1 — P0:** bootstrap→PG seed corruption / sequence drift / unsafe ID upsert. Root-cause closure required.
2. **A-30 — P0:** Strict Verification Gate fail-closed integrity.
3. **A-37 — P0:** certification-path test inventory and false-green closure.
4. **F4 — P1:** analytics region authorization boundary.
5. **F2 — P1:** legacy parent PG schema drift.
6. **A-31..A-36:** semantic, SMS/PG, authz persistence, sync parity, Mission-5 authz, PG infrastructure.
7. **A-18/A-20/A-24:** current-head sync/OCC/conflict root-cause closure.
8. **A-38:** registry rebind only after the hardening SHA is frozen.
9. **A-39:** E4 reliability/DR acceptance.
10. Remaining A-01..A-17/A-23 actionable carry-over.

### Two-Atria ownership
- **Atria-1:** F1/F2/F4 and product/runtime security/data root causes through A-36.
- **Atria-2:** A-30/A-37/A-39 preparation and test-integrity/CI/operational carry-over, plus A-38 preparation.
- Same invariant/file may not be concurrently fixed by both Atria agents.

### Fresh-finding disposition
F3 and F5 are not added as duplicate open fixes: current main contains mitigations. They remain **REVALIDATION_REQUIRED** and must be regression-tested on the final hardening SHA.

### Definition of Done
**Finding → current-head reproduction → root cause → invariant/all-path audit → fix → permanent regression → execute → SHA-bound evidence → independent review → final registry rebind.**


## 2026-09-25 — DIRECT SUPERVISING-ENGINEER REMEDIATION

The Supervising Engineer fixed the safely actionable portions of F1/F2/F4 before Atria execution. They remain **FIXED-SCOPED / TEST PENDING** until current-HEAD CI/runtime/adversarial evidence exists.

### Updated executor pool
- Atria-1 — Product/Security/Data root causes
- Atria-2 — Gate/Test-integrity/Reliability
- **Atria-3 — new independent executor/reviewer slot; exact non-overlapping ownership must be assigned before code changes**

No Atria agent may duplicate the already-applied F1/F2/F4 changes without first reproducing a residual defect.


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
\n\n## 2026-09-25 — Defect intake freeze pending Atria-1\n\nThe previously consolidated 37-item working register is retained. A final repository-memory audit also confirms unresolved carry-over obligations A-01..A-29 and hardening items A-30..A-39. These may overlap the 37 and must be deduplicated only after the Atria-1 report is reconciled with current main.\n\nCanonical record: \`docs/audit/CANONICAL_DEFECT_INTAKE_FREEZE_2026-09-25.md\`.\n\n**Next gate:** receive Atria-1 report → reconcile all findings → freeze one root-cause queue → start fixes.\n

## 2026-09-28 — Atria capability-development priority override

تا زمانی که ارزیابی شواهدی نشان ندهد Atria در مهارت‌های مهندسی موردنیاز به سطح حرفه‌ای پایدار رسیده است، تمرکز عملیاتی فعلی روی **مشاهده، re-audit، کشف ضعف مهارتی، آموزش هدفمند و اثبات توانایی Atria** است؛ این وضعیت به معنی شروع Phase D یا certification نیست.

### Evidence from Atria's latest completed sweep
- 36 defect items from the 2026-09-25 independent audit + 1 hidden UTC/local defect were reported fixed.
- Multiple security/harness hardening waves were delivered and pushed to main.
- Atria then began reassessing previous work under the newly added engineering laws/skills and surfaced additional evidence-chain and verification gaps.

### Open engineering/verification queue carried forward
A-13, A-40, A-41, A-27/E4, strict-gate residual, registry rebind, OTP 0000 disposition, PG/live-runtime evidence, G7/false-green inventory, unlisted authz writer actions, performance/scale evidence, and independent multi-AI review.

**Important:** historical PASS/fixed claims remain evidence-bound to their tested SHA/environment. No certification is inferred from the Atria report alone.


## 2026-09-28 — Copilot finding intake: bootstrap grade/grade_level path

A repository finding supplied from GitHub Copilot against historical commit `fda5e38` identified a cluster around `server/index.js::seedPgFromBootstrap()`, specifically the `classes.grade` / `classes.grade_level` compatibility shim.

**Important status:** this is an **INTAKE / REVALIDATION_REQUIRED** item, not an accepted list of seven independent defects. The historical commit is not by itself current-head evidence.

### Current-head code review
The current `server/index.js` still contains the same structural pattern:
- `grade` is copied only when present in PostgreSQL columns;
- Persian ordinal strings are mapped only by trimmed exact lookup;
- the classes compatibility block unconditionally executes `fieldSet.add('grade_level')`;
- `fieldSet.delete('grade')` is controlled by chunk-level `anyNumericGrade`.

Repository search also confirms that `classes.grade_level` is an established VARCHAR field in the project schema/documentation.

### Triage of Copilot's seven claims
- **C1 / C6 — VALID STRUCTURAL RISK, consolidate as one root cause:** `fieldSet.add('grade_level')` is unconditional even though the initial source-column allowlist is based on `cols`. If a deployed schema lacks `classes.grade_level`, the generated INSERT can reference a non-existent column. Reproduce against a schema without that column before marking confirmed.
- **C2 — PARTIALLY VALID:** mapping uses `String(val).trim()`, so ordinary leading/trailing whitespace is already handled. Prefixes/variants such as `پایه دهم`, Arabic/Persian presentation variants, or other non-exact forms are not mapped. Whether this is a defect depends on the bootstrap contract; do not assume a type-mismatch failure because the compatibility block can move non-numeric values to `grade_level`.
- **C3 — DERIVED FROM C1:** deleting `row.grade` can become data-loss/insert-risk when `grade_level` is unavailable. Do not track as an independent defect.
- **C4 — NOT CONFIRMED / likely false as stated:** recognized Persian values are converted to numbers before the compatibility block, making `anyNumericGrade=true`. The unconditional deletion therefore does not occur for an all-recognized Persian chunk. A separate mixed/unknown-value test is still required.
- **C5 — NOT CONFIRMED as stated:** the second-stage numeric check is intentionally evaluating the post-normalization value. Unknown strings are moved to `grade_level`; the key remaining question is whether mixed rows cause unintended NULL/missing numeric grade semantics.
- **C7 — VALID TEST SCENARIO / POTENTIAL DATA-INTEGRITY ISSUE:** mixed chunks containing numeric/recognized grades plus an unknown textual grade need explicit verification. Because INSERT columns are chunk-level while row values can differ, the unknown row may omit `grade` while `grade` remains in `fieldSet`. This must be reproduced against real PostgreSQL and checked for resulting NULL/data loss.

### Required verification
1. Inspect current migration/schema truth for `classes.grade` and `classes.grade_level`.
2. Build a real PostgreSQL reproduction for:
   - schema with and without `grade_level`;
   - numeric-only grades;
   - recognized Persian grades;
   - unknown Persian/text variants;
   - mixed numeric + recognized + unknown values in one chunk;
   - missing/null values.
3. Verify generated INSERT columns/values and resulting persisted rows.
4. Add regression tests for every confirmed invariant.
5. Re-run the complete bootstrap/PG seed path and bind evidence to the current SHA/environment.
6. Only after reproduction, convert confirmed root causes into the canonical defect register and implementation mission.

**Do not implement the Copilot's proposed patch verbatim before this verification.** The proposed patch itself can still lose/omit semantics for unknown values and does not by itself establish the correct bootstrap contract.



## 2026-09-30 — CONTINUOUS MONITORING OPERATING MODEL

**Current main:** 7c147d3e58687059b248417d348f63cdbf0155d5
**Status:** ACTIVE / MONITORING + REMEDIATION / NOT CERTIFIED

The execution plan is now operated as a continuous evidence loop rather than a sequence of disconnected prompts. The following rules are authoritative for the active period.

### 14.1 Control-plane responsibilities
- ChatGPT: project control plane and independent senior auditor. Reconciles repository, reports, evidence, open PRs and mission state; decides the next bounded mission; updates canonical documents; does not accept a claim merely because an agent reports success.
- Atria: primary executor for the active defect/monitoring lane. It discovers, reproduces, root-causes, fixes and regression-tests within explicit scope.
- Hermes: independent verifier. It does not duplicate every Atria prompt; it verifies material checkpoints and high-risk invariants independently and may reject Atria's conclusion.
- 11 Arena + 5 ChatGPT views: targeted independent discovery/validation network. Activate only for independent/non-overlapping scopes or formal checkpoints. No parallel duplicate fixing of the same invariant.

### 14.2 Mission loop
PLAN → EXECUTE → REPORT → INDEPENDENT VERIFY → RECONCILE → FIX/RETEST → DOCUMENT → NEXT

The mission report is an input, not the final truth. The repository and reproducible evidence decide status.

### 14.3 Agent-performance improvement loop
Atria and Hermes are themselves monitored:
1. record concrete weakness or false assumption;
2. identify root cause in the agent's process/reasoning behavior;
3. convert the lesson into a reusable project rule/checklist;
4. apply it to the next applicable mission;
5. verify whether the weakness recurs.

No separate upgrade prompt is required for every weakness; real-mission evidence is preferred.

### 14.4 Repository/document hygiene
- Update canonical documents in place whenever the information is already represented there.
- Do not create a new report for routine status changes.
- Do not delete historical evidence blindly.
- Before deleting/consolidating documentation, verify references, freeze manifests, scripts and CI gates.
- Keep historical evidence searchable but prevent it from becoming a competing current source of truth.
- The current intelligence snapshot and current execution plan are the primary operational entry points.

### 14.5 Current-head binding
Any report whose SHA differs from 7c147d3e58687059b248417d348f63cdbf0155d5 is historical until revalidated. This includes older Atria/Hermes M10/M11 material and older phase reports.

### 14.6 Certification gate
No broad Capability/Role/E2E/Performance certification starts as a formality. It begins only after the active hardening queue is closed or explicitly dispositioned and the verification registry is rebuilt against the final hardening SHA with independent evidence.

## FINAL OPERATING MODEL — 2026-09-30

The following control loop is mandatory for ongoing execution:

1. ChatGPT establishes current ground truth and assigns one prioritized, bounded mission to Atria.
2. Atria executes, fixes, tests, and returns reproducible evidence with exact SHA and explicit unresolved items.
3. Hermes independently audits the mission and Atria report against the canonical project context and repository reality.
4. Hermes identifies: confirmed completion, incomplete work, suspicious assumptions/options, regression risk, missing evidence, and scopes requiring the 16-view network.
5. ChatGPT reconciles Hermes with current GitHub HEAD, roadmap, open findings and evidence registry.
6. ChatGPT makes the final decision: close/reopen/defer/escalate and selects the next mission.
7. Canonical documents are updated; historical evidence is preserved; no duplicate report files are created merely for routine status.

### Non-negotiable separation of duties
Atria executes. Hermes verifies. ChatGPT decides. The 16-view network discovers/challenges when activated. No single report can self-certify its own work.

### Final gate discipline
For P0/P1 and critical invariants, independent verification is mandatory. A green test, commit, or report is not sufficient when the invariant is not proven across alternate paths/configurations or when current-head binding is missing.

## ARENA-INSPIRED ADVERSARIAL REVIEW PROTOCOL — 2026-10-01

The execution plan now incorporates the portable parts of the external arena-skill method. This is a review protocol, not a new execution phase and not a requirement to spawn 100 agents.

### When to activate
Hermes or ChatGPT may activate this protocol when a mission has a disputed result, hidden-risk potential, security/data-integrity implications, architectural uncertainty, repeated defect recurrence, or a meaningful evidence gap. Routine remediation remains Atria → Hermes.

### Challenge packet
Every activated challenge must freeze one byte-identical task/context envelope for all challengers containing:
1. mission/question and exact scope;
2. current HEAD/SHA and repository state;
3. explicit evidence boundary and known limitations;
4. success/invariant criteria;
5. relevant baseline report/fix, if any;
6. instruction not to modify the repository unless the mission explicitly grants execution authority.
Only the reasoning strategy varies between challengers. It must not change the factual task.

### Strategy diversification
Select a small orthogonal set appropriate to the risk. Candidate strategy families include:
- first-principles / decomposition;
- inversion / adversarial / contrarian;
- constraint-first / evidence-first;
- systems-thinking / working-backwards;
- test-first / build-then-break;
- requirements-checklist / options-matrix.
The objective is to expose blind spots, not to manufacture disagreement.

### Attack → defend → judge
1. Challenger attacks the proposed finding, fix or closure claim.
2. Owner/reviewer defends only with reproducible evidence, source inspection or explicit limitation.
3. Independent judge/reconciler classifies each objection as substantiated, disproved, unresolved or out-of-scope.
4. A verified fatal invariant failure blocks closure regardless of how many non-fatal observations favor the proposal.
5. ChatGPT reconciles the challenge with current repository state before changing project status.

### Baseline discipline
When a prior fix/report exists, use blind comparison where practical. Do not disclose a preferred winner to challengers. A challenge winner is never itself a certification; the decisive artifact is the current-HEAD evidence chain.

### Cost control
Use the smallest effective challenge set. Default targeted review is preferred over large tournaments. Expansion is justified only by criticality, unresolved disagreement, recurrence or evidence value. The external arena-skill's 100-agent/595-call pattern is not adopted as a default.

### Required challenge record
Activated reviews should preserve: task envelope, strategy used, attack, defense/evidence, judge disposition, fatal-flaw check, unresolved objections, current SHA, and next verification action. This makes the challenge resumable and auditable after chat/context changes.

### Interaction with the final operating model
Atria EXECUTE → Hermes VERIFY → targeted Arena/16-view CHALLENGE → Hermes RE-VERIFY when material → ChatGPT RECONCILE/DECIDE → DOCUMENT → NEXT MISSION.


## CAPABILITY-DERIVED EXECUTION RULES — 2026-10-01

از capability harvesting، این موارد مستقیماً وارد چرخهٔ Mission شده‌اند:

### A. قبل از Mission
- current SHA و working state را freeze/record کن.
- Environment Doctor / readiness checks را برای missionهای حساس اجرا کن.
- success invariant، evidence boundary و timeout contract را قبل از اجرا مشخص کن.
- اگر claim قبلی وجود دارد، baseline را blind نگه دار تا reviewer تحت تأثیر نتیجهٔ قبلی قرار نگیرد.

### B. هنگام اجرا
- Atria فقط scope صادرشده را تغییر می‌دهد.
- suite/request/worker بدون deadline مجاز نیست.
- no-data/stale/fallback باید semantic state مستقل داشته باشند.
- cache TTL/invalidation/outage behavior باید observable و testable باشند.
- browser automation فقط در sandbox/credential-isolated context و read-only-by-default اجرا شود.
- security/scientific skills به‌عنوان روش اجرا استفاده می‌شوند، نه به‌عنوان evidence مستقل.

### C. هنگام Verification
Hermes علاوه بر correctness، این 10 سؤال را بررسی می‌کند:
1. آیا invariant واقعاً اثبات شده یا فقط code path دیده شده؟
2. آیا proof روی current HEAD است؟
3. آیا alternate path/configuration می‌تواند همان bug را برگرداند؟
4. آیا failure mode واقعاً fail-closed است؟
5. آیا timeout/no-hang ثابت شده؟
6. آیا stale/fallback با healthy اشتباه نشده؟
7. آیا cache invalidation/ownership اثبات شده؟
8. آیا test می‌تواند false-green شود؟
9. آیا evidence provenance کامل است؟
10. آیا lesson جدید باید به checklist/skill/memory تبدیل شود؟

### D. Challenge escalation
اگر یکی از این موارد وجود داشت، Hermes یا ChatGPT یک Arena/16-view challenge هدفمند فعال می‌کند:
- disputed closure
- P0/P1/security/data-integrity
- architectural uncertainty
- repeated defect recurrence
- suspicious green/allowlist
- evidence gap
- hidden alternate path
- high-cost or irreversible change

### E. Mission completion
Definition of Done اکنون علاوه بر fix/test/evidence شامل:
scope closed + current-head bound + failure behavior checked + false-green checked + provenance recorded + reusable lesson extracted when warranted.

### F. Capability-specific future workstreams
- Browser Use: فقط در صورت نیاز به UI black-box/E2E یا external workflow.
- Uptime Kuma: پس از رسیدن به operational monitoring maturity؛ به‌عنوان external probe.
- OpenViking/Agent-Memory: فقط به‌عنوان agent-context/memory layer، با عدم تعارض با canonical docs.
- Paperclip: فقط الگوهای governance/agent registry/budget/heartbeat؛ نصب control plane دوم ممنوع.
- Diagram Design: برای architecture/evidence diagrams با semantic templates.
- Scientific Skills: برای analytics/research/evidence-heavy intelligence missions.
- Cybersecurity Skills: برای security review، threat-informed verification و defensive playbooks.
- Harness catalog: برای periodic capability discovery و ارتقای harness، نه برای ایجاد dependency.


## NEXT DISCOVERY QUEUE — REPLIT BLIND AUDIT — 2026-10-01

A read-only external blind audit produced four non-duplicate candidate areas. They are a **future controlled remediation/verification queue**, not closed defects.

### Mission R-A — reproduce before repair
**Owner:** Atria executor; **Verifier:** Hermes; **Final authority:** ChatGPT.

1. **R-A1 Class roster privacy/projection** — trace student/parent authorization, school/class ownership, response projection and intended privacy contract; reproduce with the real role matrix before changing behavior.
2. **R-A2 Redis Cluster recovery** — reproduce retry exhaustion, client state, application error handling and recovery/recreation after Redis becomes healthy; prefer isolated live cluster evidence.
3. **R-A3 HA-only Redis classification/fallback** — build a matrix for URL, cluster-node and sentinel modes; verify boot gating, production classification, Redis initialization failure and memory fallback on positive/negative paths.
4. **R-A4 test cleanup safety** — verify ownership of `/tmp/payesh-*`; make cleanup run-owned and add a regression proving unrelated scratch data survives.

### Required mission contract
- Freeze/report actual current HEAD before execution.
- Reproduce/classify each item as `CONFIRMED / FALSE POSITIVE / CONDITIONAL / REVALIDATION_REQUIRED` before editing.
- Fix only confirmed defects or explicitly approved hardening.
- Add regression coverage for every accepted fix.
- Exercise alternate paths/configurations, not only the reported path.
- Preserve timeout/no-hang and false-green defenses.
- Separate source, runtime, environment and limitation evidence.
- No broad certification follows from this mission alone.
- Hermes independently verifies material remediation on the same current HEAD.

### Existing-known-finding rule
Office scope, conditional OTP bypass and CI timeout are already registered; update existing records/evidence instead of creating duplicates.

### Queue ordering
R-A1/R-A2/R-A3 are security/privacy/reliability-sensitive and form the first controlled batch. R-A4 may run separately if collision boundaries are clear. Do not overlap Atria remediation with Arena/16-view implementation on the same invariant.


## 18-VIEW DISCOVERY / CHALLENGE MODEL — 2026-10-01

مدل عملیاتی نهایی برای مواردی که نیاز به پوشش گسترده دارند:

**ChatGPT Control Plane → Mission Envelope → Discovery Panel → Evidence Matrix → Atria Reproduce/Remediate → Hermes Independent Verify → ChatGPT Reconcile/Decide → Canonical Docs**

### Composition
- 11 Arena views: specialist/adversarial reasoning.
- 5 ChatGPT views: architecture, security, backend/infra, frontend/intelligence/UX, QA/release/evidence.
- Replit: blind repository-wide discovery.
- Bolt: cross-layer architecture/contract challenge.

### Common Task Envelope
همهٔ اعضای فعال یک mission باید دقیقاً این موارد را مشترک دریافت کنند:
1. question/mission؛
2. exact current HEAD/SHA؛
3. scope/non-scope؛
4. evidence boundary؛
5. invariants/acceptance criteria؛
6. known limitations؛
7. output contract.
تنها reasoning strategy و زاویهٔ بررسی متفاوت است.

### Evidence Matrix
برای هر mission گسترده، یافته‌ها در چهار وضعیت تحلیلی جمع می‌شوند:
- consensus signals؛
- disagreement/contradiction؛
- blind-spot candidates؛
- evidence-backed findings.
هیچ‌کدام از سه مورد اول بدون reproduction و evidence current-head به certification تبدیل نمی‌شود.

### Cost / activation rule
18-view panel پیش‌فرض هر mission نیست. فقط برای security/data-integrity/privacy، P0/P1، معماری مبهم، recurrence، evidence gap یا اختلاف معنادار فعال می‌شود. کوچک‌ترین subset مؤثر اولویت دارد و فقط در صورت نیاز به 18-view کامل گسترش می‌یابد.

### Hard separation
Replit و Bolt discovery-only هستند؛ Atria executor/remediator؛ Hermes verifier؛ ChatGPT final reconciler/decision-maker. هیچ رأی‌گیری، score یا تعداد agent جای evidence را نمی‌گیرد.

## AUTOMATIC VALUE CAPTURE / REPOSITORY SYNC — 2026-10-01

این یک control-plane rule دائمی است: ارزش ماندگار نباید فقط در conversation باقی بماند.

### Mandatory behavior
در پایان هر تحلیل، mission، report reconciliation یا تصمیم مهم، ChatGPT باید ارزش جدید را شناسایی و **خودکار** به محل canonical مربوطه در repository منتقل کند؛ کاربر لازم نیست برای هر مورد جداگانه دستور «در مخزن ثبت کن» بدهد.

### Capture triggers
ثبت خودکار لازم است وقتی مورد جدید یکی از این‌ها باشد:
1. invariant / reusable engineering rule؛
2. root cause / recurring defect pattern / lesson؛
3. mission result یا evidence boundary که بر تصمیم بعدی اثر می‌گذارد؛
4. phase, gate, priority, ownership یا execution-order change؛
5. capability/skill/tool integration decision؛
6. Atria/Hermes/16-view operating rule یا verifier lesson؛
7. current-head synchronization fact؛
8. هر تصمیم یا واقعیتی که حذف شدنش باعث تکرار کار یا خطای تصمیم‌گیری شود.

### Placement and minimality
اولویت با **ویرایش سند canonical موجود** است. گزارش جدید فقط وقتی ساخته شود که نوع محتوا واقعاً سند مستقل بخواهد. هر سند جدید باید در `DOCS_INDEX.md` ثبت و به حداقل یک سند canonical دیگر متصل شود.

### Delivery rule
ثبت باید شامل حداقل context لازم، تاریخ، وضعیت و در صورت مرتبط بودن exact SHA / evidence boundary باشد. «ثبت شد» فقط وقتی مجاز است که تغییر واقعاً در remote repository نوشته شده باشد.

### Control-plane check
قبل از پایان هر mission این checklist اجرا شود:
- [ ] ارزش ماندگار استخراج شد.
- [ ] محل canonical درست انتخاب شد.
- [ ] duplicate / contradiction با اسناد موجود بررسی شد.
- [ ] status و evidence boundary روشن است.
- [ ] remote repository synchronization انجام شد یا blocker صریح ثبت شد.



## HERMES FOLLOW-UP / CURRENT LEARNING SIGNAL — 2026-10-02

Hermes' latest infrastructure session produced a new controlled follow-up queue:
1. Verify migration-012 execution contract and the reported psql exit-code/option-order defect on current main.
2. Verify the reported migration-012 crisis-recovery failure and its remediation path.
3. Verify the day-of-week-sensitive smoke tests and replace calendar dependence with deterministic time fixtures if confirmed.
4. Re-run affected infrastructure suites under a clean environment and record platform-specific limitations separately.
5. Treat Hermes' local `tools/migrate-ledger.js` and `scripts/run-all-tests.sh` edits as unmerged until a repository commit proves otherwise.

No remediation is considered current until it is present on the repository current HEAD and passes the normal Atria → Hermes → ChatGPT evidence chain.


## 2026-10-02 — External blind-audit reproduction gate

Before broad certification advances, the external Replit/Bolt discovery queue must be reconciled through controlled reproduction. Canonical detail: `docs/audit/EXTERNAL_AUDIT_RECONCILIATION_2026-10-02.md`.

### First controlled batch
1. B-01 P1 — Redis outage during write / cache invalidation / recovery.
2. B-02 P1 — direct PG role/school mutation / bootstrap cache.
3. R-A2 P1 — Redis Cluster retry exhaustion / recovery.

Then, subject to results and collision boundaries:
- B-04, B-05, B-06, B-03, R-A1, R-A3, R-A4, B-07.

External findings are candidates, not verified defects. Atria owns remediation only after controlled reproduction confirms the invariant failure; Hermes independently verifies material fixes; ChatGPT performs final reconciliation.


## HERMES MATURITY GATE + MANDATORY HANDOFF LOOP — 2026-10-02

The M12 B-PG verification established the current operating maturity of Hermes sufficiently for normal Payesh work to proceed, while preserving independent verification and continuous self-audit.

### Mandatory chain
**ChatGPT (Control Plane) → Atria (Execute/Remediate/Discover) → Hermes (Independent Verify) → ChatGPT (Reconcile/Decide) → Next Mission**.

Atria must state the Hermes handoff in every final report. Hermes must return its verification result to ChatGPT. ChatGPT is the final reconciler/decision-maker. This handoff is mandatory and must not be skipped for convenience.

### Hermes verification lessons now treated as reusable gates
1. Never verify from a stale local HEAD; bind all material claims to the correct current repository SHA.
2. Verify implementation and regression protection separately.
3. For critical probes, test both fixed behavior and a broken/legacy arm where false-green is plausible.
4. Distinguish live runtime, static source, synthetic, historical and environment evidence.
5. Use discriminating experiments when two execution paths or hypotheses could explain the same symptom.
6. Record environment-specific defects separately from product defects, but do not discard reproducible path failures.
7. A successful implementation without regression coverage remains a coverage gap, not a complete safety property.

### Immediate M12 follow-up candidates
- ~~Add regression protection for F-3 canary TTL/backoff invalid values and wire it into CI.~~ **DONE (Atria, mission M13-F3)** — `tests/b-pg-canary-sot-bounds.js`: 40/40 FIXED-arm checks, 5 invalid shapes (unset/empty/zero/negative/non-numeric), gate-level observability through the `AUTHORITY_UNAVAILABLE` branch, LEGACY arm verified RED, mutation-tested (15 fails on the pre-fix `parseInt` tree), wired as a critical-orphan CI step plus a dedicated negative test, registered in `CRITICAL_ORPHANS`. Awaiting Hermes independent verification.
- ~~Assess/migrate tools/delta-load-test.js to boundedMs.~~ **DONE (Atria, mission M13-F3)** — the last `Number(X || N)` PG-ms parse site now routes through `boundedMs('PG_TIMEOUT_MS', 5000)`. Awaiting Hermes independent verification.
- Reproduce and remediate the non-psql migration-012 execution-path defect on supported platforms. ← **next candidate** (H-M12-02, P2)
- Consider a configurable B-PG probe port for local portability without weakening CI. (H-M12-03, P3)

These are follow-up engineering items; they do not alter the already verified F-1/F-2 verdicts.

### Permanent process-analyzer rule
Every mission must end with an explicit check for Atria/Hermes/reviewer weaknesses: wrong SHA, unsupported claim, insufficient evidence, false-green exposure, missed alternate path, incomplete regression, scope error, ambiguous reporting, or repeated failure to apply an existing lesson. New recurring weaknesses must be converted into reusable project methodology and measured on subsequent missions.
