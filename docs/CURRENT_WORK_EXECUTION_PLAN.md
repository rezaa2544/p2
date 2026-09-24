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
