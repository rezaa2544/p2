> ## CURRENT SYNCHRONIZATION — 2026-09-24
> This plan remains the canonical execution-order document. The original baseline SHA below is intentionally preserved as the planning baseline.
> Latest synchronized project-intelligence document: `docs/CURRENT_PROJECT_INTELLIGENCE.md`.
> Latest documentation synchronization checkpoint: `d5034211400a79c00aa0ac82428c34b3f0f5a2df`.
> Recent confirmed code changes include Intelligence PR #401 (`e264932419335ce42da53f2700e362bce31670b9`) and Phase 7 verifier fixes reconciled through PRs #382/#383/#386/#390/#391/#392.
> Intelligence remediation status: 21/21 runtime-wired, 0 orphan, F-EI-01 closed at remediation level; final certification remains evidence-gated.

---



# MODEL SELECTION — PAYESH QUALITY-FIRST OPERATIONAL POLICY

> **اولویت مطلق پروژه:** دقت، کیفیت، عمق تحلیل و اطمینان از صحت کار. **سرعت هیچ اولویتی ندارد.** مدل سریع‌تر فقط وقتی انتخاب می‌شود که کیفیت آن برای همان مأموریت اثباتاً کافی باشد.
>
> این جدول باید در ابتدای هر بررسی Queue/Work Plan به‌عنوان راهنمای انتخاب مدل خوانده شود. رتبه‌ها «امتیاز عملیاتی Payesh» هستند و نه Benchmark رسمی واحد؛ برای تصمیم‌های مهم، evidence واقعی همان mission و بررسی مستقل Hermes ملاک نهایی است.

| رتبه | مدل | امتیاز عملیاتی Payesh | بهترین کاربرد | انتخاب عملیاتی |
|---:|---|---:|---|---|
| 🥇 1 | **Atria-Dawn-Preview** | **96/100** | مهندسی Repo-scale، تحلیل معماری، Agentic Coding، تحقیق عمیق، کار چندمرحله‌ای | **مدل اصلی اجرایی Payesh** |
| 🥈 2 | **Muse Spark 1.3** | **95/100** | Coding سنگین، تغییرات بزرگ Repo، Context طولانی، Agentic Engineering | اجرای سنگین / جایگزین Atria |
| 🥉 3 | **MiMo-V2.6-Flash** | **94/100** | Bug Hunting، Security، Refactor، Coding و بررسی فنی مستقل | شکار باگ / نظر دوم |
| 4 | **Ling 3.1 Flash** | **91/100** | Security Adversarial، Bug Hunting، تحلیل و کدنویسی | بررسی خصمانه / مکمل MiMo |
| 5 | **Nemotron 3.5 Lightning** | **86/100** | Reasoning، تحلیل مستقل، Second Opinion، مسائل پیچیده | تحلیل و نقد مستقل |
| 6 | **Ling 3.0 Flash** | **83/100** | کارهای سریع و کم‌ریسک، Exploration و تست اولیه | فقط وقتی کیفیت mission کافی باشد |
| 7 | **LongCat 2.5 Preview** | **78/100*** | Long-context و آزمایش Agentic/Architecture | Experimental |
| — | **Fledge Alpha** | **NR** | A/B تا وجود evidence معتبرتر | Production انتخاب پیش‌فرض نیست |
| — | **Space Bunny** | **NR** | A/B تا وجود evidence معتبرتر | Production انتخاب پیش‌فرض نیست |

### قواعد اجباری انتخاب مدل
1. **Quality > Accuracy > Reliability > Evidence > Speed.** سرعت هرگز دلیل کافی برای پایین‌آوردن سطح مدل نیست.
2. برای **P0/P1، امنیت، tenant isolation، data integrity، معماری، migration، queue/worker، recovery، certification و تغییرات پرریسک**: پیش‌فرض **Atria-Dawn-Preview**؛ در صورت نیاز به نظر مستقل، **MiMo-V2.6-Flash** یا **Ling 3.1 Flash** نیز استفاده شود و سپس Hermes مستقل بررسی کند.
3. برای مأموریت‌هایی که **Atria و مدل دوم** هر دو ارزش افزوده واقعی دارند، diversity مدل عمداً استفاده شود؛ توافق مدل‌ها جایگزین Hermes نیست.
4. برای کارهای عادی/کم‌ریسک، مدل پایین‌تر فقط در صورتی انتخاب شود که **کیفیت موردنیاز mission را تأمین کند**؛ صرفاً به‌خاطر سرعت انتخاب نشود.
5. هر Prompt اجرایی OpenCode/Atria باید در ابتدای خود **مدل پیشنهادی + دلیل انتخاب** را مشخص کند.
6. اگر شواهد جدید نشان دهد رتبه یا قابلیت یک مدل تغییر کرده، **همین بخش باید قبل از mission بعدی به‌روزرسانی شود**؛ جدول stale نباید مبنای انتخاب باشد.
7. **Hermes = Verification Engine مستقل** و در این جدول به‌عنوان «مدل اجرایی» رتبه‌بندی نمی‌شود؛ نقش آن اعتبارسنجی مستقل و challenge کردن نتیجه است.

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

# M15 — SYSTEM READINESS / ARCHITECTURE UPDATE — 2026-10-05

**فرض تصمیم معماری:** از این نقطه برای طراحی، فرض می‌کنیم معماری فعلی به سقف عملی خود رسیده است. بنابراین M15 فقط hardening جزئی نیست؛ **نسخه ارتقایافته معماری برای peak-load، 10M+ scale، کمترین tail latency و کمترین فشار cascading** است.

**Canonical audit:** `docs/audit/PAYESH_SYSTEM_SCALE_RELIABILITY_GAP_AUDIT_2026-10-05.md`  
**Execution issue:** GitHub Issue #434  
**Audit registration commit:** `e9e9feadaddba95aaaf4a5d5a4a5fbf1bee08e18`

## M15 target architecture
```
Users
  ↓
Edge / Load Balancer / Rate & Admission Control
  ↓
Payesh API instances
  ├─ AuthZ / Tenant Policy
  ├─ Bounded request budgets
  └─ PACMA
       ├─ L1 bounded cache
       ├─ L2 Redis / hot-key protection
       ├─ single-flight / SWR where safe
       └─ durable invalidation / outbox
  ↓
PostgreSQL authoritative SoT
  ├─ global connection budget
  ├─ query/index/transaction budgets
  └─ read/write capacity policy
  ↓
Bounded Queues / Workers
  ├─ per-tenant fairness
  ├─ retry + exponential backoff + jitter
  ├─ DLQ / retention
  └─ overload backpressure
  ↓
Independent Observability Plane
  ├─ metrics
  ├─ traces
  ├─ structured logs
  ├─ rotation / compression / retention
  └─ monitoring-of-monitoring
```

## M15 execution queue (V1, 12 items) — SUPERSEDED 2026-10-06 by the M15 V2 queue below (mapping table in V2 §6; Issue #434 references remain valid via that mapping)
1. **M15-01 READINESS DISCOVERY / CURRENT-HEAD INVENTORY — P0:** hot paths, DB pools, expensive queries, cache policy, sync/pull, queues/workers, logging, client storage, dependency boundaries; measured baseline/resource budgets.
2. **M15-02 GLOBAL CAPACITY MODEL — P0:** workload classes, peak concurrency, throughput, p50/p95/p99, CPU/RAM/heap/GC/event-loop, DB/Redis/queue budgets, tenant fairness and saturation thresholds.
3. **M15-03 DATABASE SCALE ARCHITECTURE — P0:** global connection budget, query/index remediation, transaction budgets, pool-wait telemetry, read capacity, explicit PgBouncer/read-replica/partition/sharding decision gate.
4. **M15-04 SYNC/PULL SCALE & BACKPRESSURE — P0:** batch/cost/concurrency limits, tenant budgets, idempotency/conflict cost, response bounds, overload protection.
5. **M15-05 PACMA v2 — P0:** durable cross-instance invalidation/outbox, admission, hot-key protection, bounded L1, Redis capacity policy, safe single-flight/SWR, tenant-aware budgets, replay/idempotency/backlog controls. **→ وضعیت (۲۰۲۶-۱۰-۰۴): بخشِ «durable cross-instance invalidation/outbox + replay/idempotency/backlog controls» پیاده و رویِ PG/Redis زنده verify شد (۶۰/۶۰ تست، produce ۵۱۱/s، consume ۷۳۱/s، latency ۵ms). بقیهٔ این آیتم (admission، hot-key، bounded L1، single-flight، tenant budgets) هنوز باز است.**
6. **M15-06 QUEUE / WORKER RESOURCE ARCHITECTURE — P1:** depth/age/concurrency/retry/DLQ/retention/fairness bounds, backpressure, jittered retry.
7. **M15-07 OBSERVABILITY PRODUCTION ARCHITECTURE — P1:** independent monitoring failure domain, metrics/logs/traces, monitoring-of-monitoring, bounded cardinality, async structured logging, rotation/compression/retention, disk protection, sink-outage behavior.
8. **M15-08 EVENT-LOOP / HEAVY-WORK ISOLATION — P1:** eliminate/bound synchronous hot-path work, validate worker fallbacks, isolate exports/reports/backups.
9. **M15-09 TENANT / RESOURCE FAIRNESS — P1:** global + tenant + endpoint admission for requests/queues/workers/DB/cache; noisy-neighbor proof.
10. **M15-10 CONFIGURATION SAFETY — P1:** one bounded config schema/parser, startup validation, fail-closed unsafe production values.
11. **M15-11 LOAD / SPIKE / SOAK / CHAOS / RECOVERY — P0 GATE:** peak, burst, soak, dependency outage/recovery, queue backlog, worker loss, disk/log pressure, cold cache and multi-instance invalidation.
12. **M15-12 INDEPENDENT CERTIFICATION — FINAL GATE:** Hermes exact-current-HEAD verification; targeted 16-view for disputed/critical cross-layer findings; ChatGPT final reconciliation.

## Architecture decision policy
- **Assume current architecture has reached its limit for planning purposes.**
- Prefer evolution of the existing modular architecture where measured bottlenecks can be solved without a new distributed boundary.
- If evidence requires new scale/failure boundaries, the design may introduce read replicas, PgBouncer, Redis Cluster/hot-key strategy, dedicated worker pools, CDN/object storage, partitioning/sharding, or selective service extraction.
- Microservices/Kubernetes/service mesh are **not automatic answers**; they require measured bottleneck + explicit operational/failure-domain justification.
- PostgreSQL remains authoritative SoT.
- No 10M+ readiness claim without measured current-HEAD evidence.

## Cross-session synchronization contract
Every new ChatGPT/Hermes session MUST read:
1. `docs/CURRENT_PROJECT_INTELLIGENCE.md`
2. `docs/CURRENT_WORK_EXECUTION_PLAN.md`
3. `docs/PREQUISITES.md`
4. `docs/audit/PAYESH_SYSTEM_SCALE_RELIABILITY_GAP_AUDIT_2026-10-05.md`
5. GitHub current `main` SHA
6. Issue #434

Then reconcile the queue against current HEAD before proposing work. Historical reports never override current-head truth.

**M15 status:** OPEN / ARCHITECTURE UPGRADE IN QUEUE / NOT IMPLEMENTED / NOT CERTIFIED.
**M15-05 (durable invalidation sub-item) status:** IMPLEMENTED + VERIFIED ON LIVE INFRA (2026-10-04). هیچ ادعای scale برای کلِ سیستم صادر نشده — ظرفیتِ اندازه‌گیری‌شده فقط مسیرِ invalidation را پوشش می‌دهد.



---

# M15 V2 — PAYESH ARCHITECTURE V2 / 10M+ CELL-READY — 2026-10-06

**Bound HEAD:** static inspection performed at `1b19449f49a2952d2fbda99053f9af42f2cf4c6c`; branch rebased onto `origin/main` = `bb0b5fa4…` (2026-10-06 10:17 +0330) because upstream moved during the mission. Every item touched by upstream commit `0538383` (M15-05 durable cache invalidation) was re-verified against bb0b5fa.
**Architecture status:** `ARCHITECTURE UPGRADED — DESIGN INTEGRATED` (documents only). **Nothing in V2 is implemented or certified by this update.** No PRODUCTION-READY / 10M+ claim.
**Source:** independent adversarial critique (verdict **D**: structural upgrade, NOT a rewrite, NOT premature microservices), reconciled against the actual repository in `docs/audit/PAYESH_SYSTEM_SCALE_RELIABILITY_GAP_AUDIT_2026-10-05.md` → "V2 Reconciliation". Principle: **MEASURE → PROVE → SCALE** (not GUESS → REWRITE → HOPE).

## 1. Version record
| | |
|---|---|
| **Previous (V1)** | Modular monolith (`server/`), PostgreSQL SoT + in-process memory mirror, one shared Redis (cache+rate-limit+OTP+revocation+pub/sub+locks+idempotency), PG-table outbox polled in-process, nginx single upstream. |
| **New (V2)** | V1 + tenant-aware admission/fairness, shard-/cell-ready data model, PACMA-lite, role-separated Redis, bounded/fair queues, retry/deadline standard, sync-storm defence, independent observability plane, measured backup/DR, progressive deployment, central config safety, evidence gates. |
| **Changed assumptions** | (a) "Architecture reached practical limit" stays a *planning assumption*, not proof. (b) Critique capacity figures are ILLUSTRATIVE; `docs/CAPACITY_MODEL.md` (2.5M concurrent / ~20k RPS peak) stays official until M15-02 reconciles. (c) Tenant key is `school_id`, not `tenant_id`; IDs are per-table integers. (d) Auth has no passwords. (e) "N-36" names two things: API/Test-CI parity (original) and, in upstream reports, the durable-invalidation mission (see §7). |
| **Implemented** | Pre-existing V1 capabilities (Gap Audit register "Impl" column) **plus** the durable cache-invalidation path landed upstream in `0538383` (V1 queue item M15-05 sub-item): E3 single-box evidence from the implementing agent only; independent verification and Strict-Gate registry entry NOT found. V2 documentation adds no implementation. |
| **Planned** | M15-01..M15-25 below. |
| **Conditional** | Read replicas, broker, Redis Cluster, Kubernetes, CQRS, selective services, dedicated cell, sharding. |
| **Evidence required** | Primary write ceiling, replica need, shard threshold, restore time, RPO/RTO, real peak mix, queue throughput. |

## 2. Canonical target architecture (V2)
```
Users / Clients  (offline-first; backoff + FULL JITTER; idempotency keys; version header)
  ↓
DNS / Anycast / CDN / WAF / DDoS                      [CONDITIONAL — infra evidence required]
  ↓
HA Edge LB  (outlier detection, slow-start, draining; nginx today = single upstream)
  ↓
Tenant-aware Rate Limit   (school/user/device/endpoint; NAT-safe; per-endpoint fail mode)
  ↓
Priority-based Admission  (P0 critical · P1 core · P2 reports · P3 export/batch; fast, bounded, NO DB I/O, adaptive on event-loop lag)
  ↓
Global Tenant Directory / Router   (school → cell; read-mostly, locally cached, versioned, failure-aware)  [architecture boundary only]
  ↓
┌───────────────────────────── CELL (CELL-READY, one-cell today) ─────────────────────────────┐
│ Stateless API pool: Auth · AuthZ (single policy contract) · Tenant isolation · Admission    │
│                     Event-loop protection (monitorEventLoopDelay SLI) · payload/row caps    │
│ PACMA-lite: bounded L1 (bytes) · short TTL+jitter · versioned-key L2 · tenant-aware keys    │
│             controlled single-flight · negative cache · stale-if-error only where safe      │
│             NO generic SWR · NO write-behind for authoritative data                          │
│ Redis roles separated: CACHE | RATE-LIMIT | SESSION/REVOCATION/OTP | LOCK/IDEMPOTENCY      │
│ PgBouncer (transaction mode; no session state) → PostgreSQL Primary (SoT)                   │
│     ├ Read replicas [CONDITIONAL]  ├ Partitioned large tables  ├ WAL/PITR  └ shard-ready    │
│ Bounded queue (PG outbox today; broker CONDITIONAL) → Fair worker pools P0 / P1 / P3        │
│ Transactional Outbox → poller (SKIP LOCKED) / CDC [CONDITIONAL] → idempotent consumers      │
└───────────────────────────────────────────────────────────────────────────────────────────┘
          ↓ async · lossy · bounded · non-blocking (OBSERVABILITY MUST NEVER BECOME AN APP FAILURE)
Independent Observability Plane  (metrics · logs · traces · black-box probes · dead-man · cardinality budget)
          ↓
Backup / WAL / PITR / DR Plane  (immutable + off-site; warm standby; restore drill; measured RPO/RTO)
```

## 3. Architecture invariants (binding)
1. **One tenant/workload failure must not consume the whole system** (cell = blast-radius boundary; quotas in every layer: edge, API, DB, cache, queue, worker, export, sync).
2. **Client load is part of system load** — sync storm = **P0 risk**.
3. **Retry amplification must be prevented**: single designated retry layer, retry budget, exponential backoff + full jitter, deadline propagation, idempotency key, no retry on permanent errors.
4. **Queue-collapse loop is an invariant to prevent** (Traffic↑→Queue↑→Worker overload→Timeout→Retry↑→Queue↑↑→Memory↑→GC↑→Latency↑→Timeout↑): bounded depth AND age, age-shedding, retry budget, adaptive worker concurrency, pull-based memory guard.
5. **Simpler cache > smarter cache.** Order: bounded L1 → short TTL → versioned-key L2 → tenant-aware keys → distributed single-flight only where justified → negative cache → admission → stale-if-error only where safe. Write-behind for authoritative data **FORBIDDEN**. Generic SWR forbidden by default.
6. **PostgreSQL is the only authoritative store;** memory is bounded cache/materialization with an explicit degraded-mode contract.
7. **Observability is bounded, async, lossy, non-blocking.**
8. **Backup without restore drill = UNVERIFIED.**
9. **Configuration is schema-validated, bounded, fail-fast, versioned, auditable** (hard bounds on pool, timeout, concurrency, queue size, memory, retry).
10. **Scale-out (replica/broker/Redis Cluster/shard/cell expansion) is evidence-driven.** DO NOT SHARD NOW WITHOUT CAPACITY EVIDENCE. DO NOT INTRODUCE A BROKER BECAUSE IT LOOKS MORE SCALABLE.
11. Targets are targets, not facts: e.g. event-loop p99 < 50–100 ms is a **TARGET**; Load Test sets the real value.
12. Every scenario is `DESIGNED / NOT VERIFIED` until executed.

## 4. Technology decisions
| Item | Decision | Condition |
|---|---|---|
| Modular Monolith + Workers | **KEEP** | — |
| Selective services (heavy reporting/export, sync gateway, notification, telemetry ingestion) | **CONDITIONAL** | measured resource profile + failure-domain need |
| Full microservices · Service Mesh · Event Sourcing | **NOT NOW** | — |
| Kubernetes · CQRS · Broker · Read replicas · Sharding · Cell expansion | **CONDITIONAL / FUTURE** | evidence per M15-21/22/23/24 |
| Password-hash offload | **NOT_APPLICABLE** | no passwords in this system |
| Per-tenant unit | `school_id` (office/province hierarchy exists → candidate cell key, EVIDENCE_REQUIRED) | M15-06/22 |

## 5. M15 V2 execution queue (25 items)
Every item carries all nine fields: **ID · Priority · Objective · Dependencies · Current status · Acceptance criteria · Evidence required · Blocking condition · Next actor.** Roles unchanged: ChatGPT = Control Plane / final decision; Hermes = Architecture Lead + independent verification (may NOT certify alone); Atria = executor. Each executable mission also carries a Rule 15/16 five-task contract. "Current status" = state at bb0b5fa + this documentation update.

**M15-01 — Current-head architecture reconciliation · P0**
- **Objective:** Compare architecture documents with the actual repository; keep the finding register current on every new HEAD.
- **Dependencies:** none
- **Current status:** STATIC PART DONE (Gap Audit "V2 Reconciliation", bound 1b19449, rebased onto bb0b5fa). Runtime inventory (hot paths by RPS, query plans) PENDING; observability/DR sweep PARTIAL.
- **Acceptance criteria:** Register covers every layer with file:line; re-run and re-bind on each new HEAD; upstream commits since the last run are listed.
- **Evidence required:** file:line citations + exact SHA; re-verification output.
- **Blocking condition:** None (read-only).
- **Next actor:** Atria (runtime inventory) → Hermes verify

**M15-02 — Capacity baseline & model · P0**
- **Objective:** Measured single-box baseline (RPS/latency/CPU/RAM/DB/Redis/queue/event-loop) and a V2 capacity model for NORMAL / PEAK / EXTREME at 10M registered users; reconcile with `docs/CAPACITY_MODEL.md` (2.5M concurrent / ~20k RPS) and with `nationalCapacityGate` ceilings (20k RPS, 2.5k write TPS). Critique figures stay ILLUSTRATIVE.
- **Dependencies:** M15-01
- **Current status:** NOT STARTED (`CAPACITY_WORKLOAD_MODEL.md` = NOT-RUN). Only one partial measurement exists: durable-invalidation path 511 produce/s, 731 consume/s on one box (0538383 report) — not a system capacity.
- **Acceptance criteria:** Model lists all dimensions (users, DAU, concurrency, RPS, R/W ratio, payload, DB QPS, Redis QPS, queue rate, worker concurrency, CPU, RAM, GC, loop lag, network, disk, WAL, replication lag, cache hit rate, tenant skew, sync burst), each labelled MEASURED or ASSUMED.
- **Evidence required:** E3 runs bound to SHA with command, environment, input, output, run count (Rule 11).
- **Blocking condition:** Staging multi-node environment (needed only for E4 claims).
- **Next actor:** Atria

**M15-03 — Tenant isolation & fairness · P0**
- **Objective:** Single authz contract (close the separate `pull.js` filter), school-aware cache keys, per-tenant/device quotas, noisy-neighbor protection; tiers STANDARD / LARGE / DEDICATED.
- **Dependencies:** M15-02
- **Current status:** PARTIAL: `policy.js` shared by REST/sync/SQL; quotas modeled (`resource-governance.js`) not enforced; sync limit is per user; no RLS.
- **Acceptance criteria:** Adversarial tenant matrix on current HEAD passes for REST/sync/pull/cache/worker; in a load test one school at 100× does not degrade others beyond SLO.
- **Evidence required:** IDOR/negative tests + load-test result with SHA.
- **Blocking condition:** Needs admission signals from M15-04/13 for the load proof.
- **Next actor:** Atria → Hermes

**M15-04 — Admission & load shedding · P0**
- **Objective:** P0–P3 priority classes; fast, bounded, no DB I/O, adaptive (event-loop lag, in-flight); shed from P3 upward; per-endpoint rate-limit fail mode (OTP/login stay fail-closed; sync/pull evaluate fail-to-local); NAT-safe limits; fix XFF trust (V2-F10).
- **Dependencies:** M15-02, M15-13
- **Current status:** NOT FOUND (only the static national gate; lag observed, never used to shed).
- **Acceptance criteria:** Under CPU saturation P3/P2 are shed first and P0 latency SLO holds; 429/503 carry Retry-After; admission adds < 1 ms and performs no I/O.
- **Evidence required:** Spike-test results with SHA; unit tests for class mapping and fail modes.
- **Blocking condition:** Needs the event-loop SLI from M15-13.
- **Next actor:** Atria

**M15-05 — DB scale hardening · P0**
- **Objective:** Global connection budget (`instances × pool` vs `max_connections`); PgBouncer app-compatibility (remove session advisory locks, V2-F01); server-side `statement_timeout` / `idle_in_transaction_session_timeout` / `lock_timeout`; query/transaction budget; pool-wait histogram; bound `readCollection` and boot hydration (V2-F14); tenant-prefixed index review; partition outbox/log tables; vacuum/bloat monitoring.
- **Dependencies:** M15-02, M15-17
- **Current status:** PARTIAL: pool, keyset pagination, partitioning (mig 012), replica read, pgbackrest config exist; budget, server-side timeouts, histogram absent.
- **Acceptance criteria:** Budget calculator + boot check; EXPLAIN ANALYZE of top endpoints at national cardinalities; no unbounded hot-path SELECT; migrations have rollback (Rule 23).
- **Evidence required:** Query plans, boot-check output, load-test pool-wait distribution, with SHA.
- **Blocking condition:** None for design; E4 needs multi-node staging.
- **Next actor:** Atria

**M15-06 — Shard/cell-ready data model · P0/P1**
- **Objective:** Audit and close: `school_id` on all tenant-owned tables (22 lack it), composite `(school_id,id)` references or a documented alternative, ID strategy decision, no cross-tenant tx/FK assumptions, tenant-addressable queries, effect of the global `payesh_chg_seq` (V2-F19). Design only; no sharding.
- **Dependencies:** M15-05
- **Current status:** NOT READY (see Gap Audit D1, V2-F13).
- **Acceptance criteria:** Written cross-tenant dependency audit + migration plan with rollback; every tenant-owned table has a defined tenant path.
- **Evidence required:** Schema scan script output + review record, with SHA.
- **Blocking condition:** OWNER DECISION: global-ID vs composite-key strategy.
- **Next actor:** Hermes (design) → ChatGPT decision

**M15-07 — PACMA-lite / cache simplification · P0**
- **Objective:** Cut PACMA design to PACMA-lite: byte-bounded L1, TTL jitter, max object size, per-tenant budget, tenant-in-key, negative cache, distributed single-flight only for proven hot keys, stale-if-error only for allowlisted classes. Only the bootstrap payload is cached today — add a class only if it earns its cost.
- **Dependencies:** M15-03, M15-05
- **Current status:** PARTIAL: count-bounded L1 (2048), fixed 60 s TTL, epoch inside value incl. user-epoch since 0538383, per-process single-flight used once. Jitter, size cap, tenant budget, negative cache, hot-key detection NOT FOUND.
- **Acceptance criteria:** Policy per class; stampede / hot-key / Redis-down tests; no authz-sensitive stale reads.
- **Evidence required:** Test output + measured DB-load delta, with SHA.
- **Blocking condition:** None.
- **Next actor:** Atria

**M15-08 — Redis role separation · P1**
- **Objective:** Separate failure domain and policy for CACHE (volatile, eviction) vs RATE-LIMIT vs SESSION/REVOCATION/OTP (noeviction) vs LOCK/IDEMPOTENCY; unify key prefixes; resolve `noeviction` vs `allkeys-lru` contradiction (V2-F07); hot-key and cluster hash-tag policy.
- **Dependencies:** M15-02, M15-07
- **Current status:** NOT FOUND (single client/keyspace/policy). Decision recorded; implementation only after repo + capacity evidence.
- **Acceptance criteria:** Per-role configuration; outage drill per role shows only that role degrades.
- **Evidence required:** Drill logs, config diff, with SHA.
- **Blocking condition:** Capacity evidence from M15-02/18.
- **Next actor:** Atria

**M15-09 — Invalidation reconciliation (NF-1; durable path already built) · P1**
- **Objective:** Reconcile the already-implemented durable path (`server_outbox` cache.* events, per-instance watermark, replicate-to-all consumer, user-epoch) with the versioned-key idea. Decide whether key-level versioning is still needed; do NOT add a third mechanism. Independently verify the implemented path and its limits (PG-only, `server_outbox` not partitioned, retention under long soak).
- **Dependencies:** M15-07
- **Current status:** IMPLEMENTED at bb0b5fa (commit 0538383): `worker.js:138` tickReplicate, `outbox.js:490` fetchReplicateBatch, migration 026 watermark table, `cache.js:31,249,286-287` user epoch, retention `outbox.js:539-561`. Evidence = Atria self-report, E3 single box (60 tests, 3 runs, 2 instances on one host); NO independent Hermes verification or Strict-Gate registry entry found; NF-1 closure not independently verified.
- **Acceptance criteria:** Hermes independent verification on exact HEAD (multi-instance, Redis outage/restart, rollback of producing transaction, replay, watermark-floor retention); written decision on versioned keys; backlog/oldest-age alerts defined.
- **Evidence required:** Independent re-run logs + registry entry (ATRIA_PASS → needs ChatGPT + Arena agreement for CERTIFIED).
- **Blocking condition:** Live PG + Redis required for the proof.
- **Next actor:** Hermes → ChatGPT

**M15-10 — Queue / worker anti-collapse · P0**
- **Objective:** Retention/cleanup/partition for DLQ, `sms_log`, `notify_queue`, `server_processed_uids`, tombstones (processed `server_outbox` rows already reaped since 0538383); fix unhandled-event re-pend loop (V2-F04); true depth/oldest-age/DLQ gauges for all queues (V2-F05); configurable batch; per-tenant fairness + priority lanes; lease heartbeat; await in-flight tick on shutdown; DLQ replay tool (V2-F16); permanent vs transient error classification.
- **Dependencies:** M15-05, M15-12
- **Current status:** PARTIAL: SKIP LOCKED + lease + fencing + atomic DLQ + max attempts; processed-row retention and cache backlog/oldest-age gauges added in 0538383. Everything else above NOT FOUND.
- **Acceptance criteria:** Queue-collapse loop test shows bounded depth, age and RAM; age-shedding works; DLQ replay tested; no unbounded table remains.
- **Evidence required:** Collapse-loop test output, table-size growth under soak, with SHA.
- **Blocking condition:** None.
- **Next actor:** Atria

**M15-11 — Sync storm defence · P0**
- **Objective:** Client full-jitter backoff, randomized resync, no immediate retry on `online`, coordinated page/SW retry counters (V2-F06), per-school/device limits on push and pull, pull rate limit, client version-skew handling, `storage.persist()` + eviction detection, client-DLQ loss policy (V2-F12), tombstone retention policy. Keep the existing cursor / idempotency / OCC design.
- **Dependencies:** M15-02, M15-12
- **Current status:** Protocol strong in code (server-signed cursor, 500-op batch, 3-layer idempotency, OCC, Retry-After); herd controls NOT FOUND.
- **Acceptance criteria:** Result-release and reconnect-storm scenarios keep the server inside its budget; retry multiplication ≤ designed bound.
- **Evidence required:** Storm test with N simulated clients, SHA, parameters.
- **Blocking condition:** None.
- **Next actor:** Atria

**M15-12 — Retry / timeout / deadline standard · P0**
- **Objective:** One standard + shared helper: designated retry layer, retry budget, exponential backoff + full jitter, deadline propagation header, no retry on permanent errors, circuit breakers for PG/Redis/SMS.
- **Dependencies:** M15-01
- **Current status:** NOT FOUND (no jitter, budget or deadline anywhere).
- **Acceptance criteria:** Amplification test: ≤ 1.1× extra load when a dependency fails 100%.
- **Evidence required:** Test output with SHA.
- **Blocking condition:** None.
- **Next actor:** Hermes (standard) → Atria

**M15-13 — Event-loop / payload safety · P0**
- **Objective:** `monitorEventLoopDelay` as SLI and admission input; payload/row caps everywhere; stream large responses; no large `JSON.stringify` on the critical path; async audit/logging by default (V2-F18); bound worker fallbacks; `UV_THREADPOOL_SIZE` decision; memory/GC guard.
- **Dependencies:** M15-01
- **Current status:** PARTIAL (timer-drift gauge, body caps, pull caps, worker thread with in-process fallback).
- **Acceptance criteria:** Loop-delay p99 recorded under load. TARGET p99 < 50–100 ms is a target, not a fact.
- **Evidence required:** Load-test metrics with SHA.
- **Blocking condition:** None.
- **Next actor:** Atria

**M15-14 — Observability plane · P1**
- **Objective:** Prove independent failure domain, dead-man's switch, black-box probes, monitoring-of-monitoring, cardinality budget on custom metrics, bounded lossy log shipping, rotation/compression/retention, audit-log durability class.
- **Dependencies:** M15-13
- **Current status:** CONFIG PRESENT (`infra/observability`, `infra/tracing`, 11 alerts); DEPLOYMENT UNPROVEN; dead-man NOT FOUND. Cache backlog metrics added in 0538383.
- **Acceptance criteria:** Kill monitoring → app SLO unchanged; kill app → external alert fires; label flood stays within series budget.
- **Evidence required:** Drill logs with timestamps and SHA.
- **Blocking condition:** Separate host/network for the plane (owner).
- **Next actor:** Atria → Hermes

**M15-15 — Backup / DR design & automation · P0**
- **Objective:** WAL archive + PITR + immutable and off-site copy + warm-standby decision; RPO/RTO documented as TARGET/TBD until measured.
- **Dependencies:** M15-05
- **Current status:** Tools/config present (pgbackrest, `pitr-restore.sh`, `pitr-verify.sh`); NOT VERIFIED.
- **Acceptance criteria:** Runbook + automation exist. Backup without restore drill = UNVERIFIED.
- **Evidence required:** Restore-drill output (feeds M15-20).
- **Blocking condition:** OWNER DECISION: off-site/immutable target.
- **Next actor:** Atria

**M15-16 — Progressive deployment · P1**
- **Objective:** Canary, progressive rollout, connection draining, cache warm-up, expand→migrate→contract, feature flags/kill switch, auto-rollback on SLO breach, scheduled pre-scale for predictable school peaks.
- **Dependencies:** M15-14
- **Current status:** PARTIAL (graceful drain and readiness exist; canary engine for routing).
- **Acceptance criteria:** A failed canary rolls back automatically within a defined window; migrations proven backward-compatible.
- **Evidence required:** Deployment drill log with SHA.
- **Blocking condition:** Staging environment.
- **Next actor:** Atria

**M15-17 — Configuration safety · P1 (execute early)**
- **Objective:** One bounded config schema/parser, boot validation, hard bounds, secret safety, drift detection; close the ~12 unbounded sites (V2-F08).
- **Dependencies:** M15-01
- **Current status:** PARTIAL (`boundedMs`: 6 call sites).
- **Acceptance criteria:** NaN / 0 / negative for any listed variable fails boot or clamps with an audit event; regression tests (Rule 12).
- **Evidence required:** Test output with SHA.
- **Blocking condition:** None.
- **Next actor:** Atria

**M15-18 — Load / spike / soak · P0**
- **Objective:** 10M-modelled workloads incl. result-release peak, cold cache, sync storm.
- **Dependencies:** M15-02, 03, 04, 05, 07, 10, 11, 13, 17
- **Current status:** NOT RUN at national scale.
- **Acceptance criteria:** E3 minimum; E4 where a claim is made; results bound to SHA, environment, command.
- **Evidence required:** Reports + raw data, with SHA.
- **Blocking condition:** Multi-node staging (E4).
- **Next actor:** Atria → Hermes

**M15-19 — Chaos / game days · P0**
- **Objective:** Execute the failure matrix: PG slow/down, Redis down/partition, cache flush and warm-up storm, queue backlog, worker crash, retry storm, disk/CPU/RAM pressure, loop starvation, network partition, deployment failure, replica lag, invalidation backlog, hot key, tenant overload, sync storm. Each Detect→Contain→Degrade→Recover→Verify.
- **Dependencies:** M15-18
- **Current status:** DESIGNED / NOT VERIFIED.
- **Acceptance criteria:** Each scenario executed with recorded outcome; until executed it stays DESIGNED / NOT VERIFIED.
- **Evidence required:** Per-scenario logs with SHA.
- **Blocking condition:** Staging for E4.
- **Next actor:** Atria → Hermes

**M15-20 — Restore / failover drill · P0**
- **Objective:** Real PG + Redis restore and failover with measured RPO/RTO/MTTA/MTTR (closes Ground Truth RT2-03).
- **Dependencies:** M15-15
- **Current status:** NOT RUN (RT2-03 OPEN).
- **Acceptance criteria:** Restored database identity/checksum verified; times measured, not copied from targets.
- **Evidence required:** Timed logs, checksums, alert acknowledgement trail.
- **Blocking condition:** EXTERNAL BLOCKER / OWNER DECISION (infrastructure).
- **Next actor:** Owner + Atria

**M15-21 — Broker decision · P1 (CONDITIONAL)**
- **Objective:** Evidence-driven choice: current PG outbox vs NATS JetStream / RabbitMQ Quorum / Kafka (throughput, rate, retention, replay, durability, ordering, tenant fairness, operational capability). Default: stay on the PG outbox.
- **Dependencies:** M15-10, M15-18
- **Current status:** NOT STARTED; no broker present.
- **Acceptance criteria:** Decision memo with measured inputs and rollback plan.
- **Evidence required:** Measured queue throughput and fairness results.
- **Blocking condition:** Needs M15-18 data.
- **Next actor:** Hermes → ChatGPT

**M15-22 — Cell architecture readiness · P1**
- **Objective:** Tenant Directory boundary, cell capacity and blast radius, `school → cell` routing contract; candidate cell key (office/province) evaluated. Output = CELL-READY prerequisites.
- **Dependencies:** M15-03, M15-06
- **Current status:** NOT FOUND.
- **Acceptance criteria:** Design document section with prerequisites and failure semantics (directory down, stale directory).
- **Evidence required:** Review record.
- **Blocking condition:** Needs M15-06 decisions.
- **Next actor:** Hermes (design)

**M15-23 — Read-replica & CQRS decision · P1 (CONDITIONAL)**
- **Objective:** Decide only if read pressure is evidenced; define read-your-writes policy for `queryRead()`.
- **Dependencies:** M15-18
- **Current status:** PARTIAL (`queryRead` with fallback; async replication).
- **Acceptance criteria:** Decision memo with measured read share and lag tolerance.
- **Evidence required:** Load-test read/write split; replica lag measurements.
- **Blocking condition:** Needs M15-18 data.
- **Next actor:** Hermes

**M15-24 — Shard / cell decision · P0 (gate)**
- **Objective:** Decide only after measured write ceiling and restore time. Default: DO NOT SHARD.
- **Dependencies:** M15-18, M15-20, M15-06
- **Current status:** NOT STARTED.
- **Acceptance criteria:** Decision memo citing measured primary write ceiling, WAL volume, restore time.
- **Evidence required:** Measurements from M15-18/20 with SHA.
- **Blocking condition:** Needs M15-18/20.
- **Next actor:** ChatGPT

**M15-25 — Final 10M+ certification · P0 (final gate)**
- **Objective:** Certify only with current-HEAD evidence for load, spike, soak, chaos, restore, security, tenant isolation, fairness, observability, plus the Strict Verification Gate (ChatGPT + Arena + Atria) and Hermes independent verification. Hermes may not certify alone.
- **Dependencies:** all
- **Current status:** NOT STARTED.
- **Acceptance criteria:** All gates above pass on the same HEAD.
- **Evidence required:** Evidence ledger (Rule 21) + registry entries.
- **Blocking condition:** All items.
- **Next actor:** ChatGPT

## 6. Mapping from V1 queue (Issue #434) to V2
V1-01→V2-01 · V1-02→V2-02 · V1-03→V2-05 (+06,15) · V1-04→V2-11 · V1-05→V2-07 (+09) · V1-06→V2-10 · V1-07→V2-14 · V1-08→V2-13 · V1-09→V2-03 (+04) · V1-10→V2-17 · V1-11→V2-18 (+19,20) · V1-12→V2-25. New in V2: 08, 12, 16, 21, 22, 23, 24.

## 7. N-36 reconciliation
- **Two meanings exist (documented upstream, not invented here).** (1) *Original N-36* = API/Test-CI parity contract (API-suite count: 30 hard-coded vs 31 flat + 1 nested in `tests/api/phase5-pilot/index.test.js`), chosen as the next mission after M13-F3 (`docs/control-plane/ATRIA_MISSION_M13_F3_FINAL_REPORT.md:76,102,158`). (2) The durable-cache-invalidation mission implemented in `0538383` was *also* called N-36; its own report (`m15-cache-durable-invalidation/FINAL_REPORT.md`, header) states the collision and says the original N-36 "is still open". Canonical id for (2): **M15-CACHE-PACMA / M15-05** (V1) → **M15-09** (V2).
- **Status of original N-36 at bb0b5fa: EVIDENCE_REQUIRED.** Upstream commit `bb0b5fa` is titled "(N-36 completion)" but changes only one hash in `docs/DOCS_FREEZE_v1.0.0-rc44.md`; it does not show that the API-suite parity contract was closed. Not verified here.
- **Interaction rule:** M15 items that add API suites or CI gates (M15-18/19) must keep the original N-36 parity contract green. No other overlap found.

## 8. Dependency graph (adjusted by repository evidence)
```
M15-01 ─► M15-02 ─┬─► M15-03 ──────────────┐
   │              ├─► M15-04 ◄── M15-13     │
   │              └─► M15-05 ◄── M15-17     │
   ├─► M15-12 ─► M15-11                     │
   ├─► M15-13 ─► M15-14 ─► M15-16           │
   └─► M15-17                               │
M15-05 ─► M15-06 ─► M15-22                  │
M15-03 + M15-05 ─► M15-07 ─┬─► M15-08       │
                           └─► M15-09       │
M15-05 + M15-12 ─► M15-10                   │
M15-05 ─► M15-15 ─► M15-20                  │
{02,03,04,05,07,10,11,13,17} ─► M15-18 ─► M15-19
M15-10 + M15-18 ─► M15-21 · M15-18 ─► M15-23
M15-18 + M15-20 + M15-06 ─► M15-24
ALL ─► M15-25
```
Adjustments vs the requested order: **M15-13 (loop-delay signal) precedes adaptive M15-04**; **M15-17 (bounded config) precedes M15-05** (NaN/0 pool size, `db.js:78,79`); **M15-12/M15-11 (jitter/retry) are cheap, P0 and independent of DB** and may run in parallel with M15-03/05 once M15-01/02 exist; M15-09 is now a *verification + decision* item (the durable path already exists), so it no longer gates M15-07; it still follows M15-07 for the versioned-key decision.

## 9. First executable missions
1. **M15-02 Capacity baseline** (E3, single box) — everything depends on it. The 511/731 events/s figures from `0538383` are one component measurement only.
2. In parallel (independent scopes, Rule 26 sync required): **M15-17 Configuration safety** (smallest, unblocks M15-05), **M15-12 Retry/deadline standard** (design + helper), and **M15-09 independent verification** of the upstream-built invalidation path (Hermes).

## 10. Open blockers
- **EXTERNAL BLOCKER (Rule 8):** this documentation update could not be pushed from the authoring session (Claude GitHub App not installed on `rezaa2544/p2`); it exists as a local commit/patch on branch `docs/m15-architecture-v2`, rebased onto bb0b5fa. GitHub Issue #434 could not be updated for the same reason. Another agent pushes to `main` concurrently: re-fetch and re-reconcile (Rule 26/31) before applying the patch.
- **Verification gap:** the implemented durable-invalidation path (`0538383`) has no independent Hermes verification or Strict-Gate registry entry (`docs/verification/VERIFICATION_REGISTRY.json` has no M15 entry; `head_bound` = e4584806).
- **Docs-debt:** root-level directory `m15-cache-durable-invalidation/` (DESIGN.md, FINAL_REPORT.md) sits outside `docs/` contrary to `docs/REPOSITORY_MAP.md` §2; relocation needs a reference check.
- OWNER DECISION: global-ID vs composite `(school_id,id)` strategy (M15-06); staging multi-node environment (M15-18/20); off-site/immutable backup target (M15-15).

## 11. Cross-session handoff (read this first in a new session)
Current architecture = V1 code at bb0b5fa incl. the durable cache-invalidation path from `0538383` (+ docs). Target = V2 above. Implemented = V1 + durable invalidation (E3, implementer-reported, not independently verified). Planned = M15-01..25. Conditional = replica/broker/Cluster/k8s/CQRS/shard/cell. Evidence-required = write ceiling, shard threshold, restore time, RPO/RTO, true peak mix. Current mission = M15-01 (static reconciliation complete, runtime pending). Next missions = M15-02 (+ M15-17/M15-12 in parallel) and M15-09 independent verification of the already-built invalidation path. Blocker = push access, owner decisions above. Status line: **M15 = OPEN / V2 DESIGN INTEGRATED / NOT IMPLEMENTED / NOT CERTIFIED.**

## 12. M15 QUEUE HARDENING ADDENDUM — 2026-10-07 (targeted expert pass)
**Scope:** Queue/Worker/Outbox only (`server/outbox.js`, `server/worker.js`, `server/index.js` wiring, `server/metrics.js` gauges). Static inspection + one executed PoC on real `worker.js` with a fake outbox. **No PG/Redis runtime, no load evidence.** Bound HEAD: main `71f707f` (+ this branch). Nothing here is certified; statuses use the mission vocabulary.
Items already planned are **not** duplicated: M15-10 (anti-collapse), M15-12 (retry/deadline), M15-03 (fairness), M15-14 (observability), M15-09 (invalidation reconciliation) stay authoritative; the entries below attach new evidence to them.

| ID | Finding | Sev | Status | Maps to |
|---|---|---|---|---|
| **QUEUE-CLAIM-1** | `tick()` and `tickReplicate()` shared one `running` flag. `start()` calls `tick()` then `tickReplicate()` back-to-back; `tick()` sets `running=true` synchronously before its first `await`, so `tickReplicate()` always returned `skippedBusy`. In the real timer path the durable cache-invalidation (replicate-to-all) loop **never ran** (PoC: 0 of 19 calls). Existing tests called `tickReplicate()` directly and could not see it. | HIGH | **FIXED-SCOPED** (separate `replRunning` flag, `server/worker.js`). Regression `tests/worker-timer-replicate.js` (added to CI); mutation proof: with the fix reverted the test fails (`repl=0`). | M15-09 |
| **QUEUE-RETRY-1** | No backoff or jitter between attempts: a failed event returns to `pending` and is re-claimed on the next tick (`PAYESH_WORKER_INTERVAL_MS`, default 1 s); `maxRetries` 5 ⇒ a ~5 s transient downstream outage can push a healthy event to the DLQ, and many failing events retry in lock-step. No `next_attempt_at` column exists. | MED | NOT FIXED — needs migration + claim-SQL change + live PG test. | M15-12 / M15-10 |
| **QUEUE-CAPACITY-1** | Retention floor pinned by dead instances: `reapProcessed()` deletes only `id <= MIN(last_id)` over **all** `server_outbox_watermark` rows, but `INSTANCE_ID` defaults to `hostname:pid`, so every restart/redeploy adds a row and old rows never leave. Migration 026 calls a stale row "inert"; the reaper query contradicts that. Result (static): the floor freezes at the oldest dead row, `processed` rows stop being reaped, and a fresh process starts at watermark 0 and replays every retained `cache.*` event. `dead_letter`/`failed` rows and `server_outbox_dlq` have no retention at all. | MED | REVALIDATION_REQUIRED (static only; reproduce on live PG with two restarts). Fix needs a design: heartbeat/TTL on watermark rows or explicit instance deregistration, plus DLQ retention policy. | M15-10 / M15-05 |
| **QUEUE-OBSERVABILITY-1** | `payesh_outbox_depth` is fed from `outbox.depth()`, i.e. the in-RAM mirror (cap 1000, empty after restart, per instance), not from PG. In PG-live it under-reports and has no oldest-age for the main (non-`cache.*`) queue; only the cache backlog has `oldest_age`. | MED | NOT FIXED — design (PG-derived depth/age, bounded cardinality). | M15-14 |
| **QUEUE-CLAIM-2** | If `fetchPendingBatch()` throws, `tick()` falls back to the RAM mirror (`worker.js` fallback `events = store.outbox`) and processes rows with **no lease token**; another instance may hold the PG claim ⇒ possible duplicate processing (handlers are idempotent today). | LOW | NOT FIXED — fallback behaviour change needs a test of intended PG-down semantics. | M15-10 |
| **QUEUE-FAIRNESS-1** | Claim order is `ORDER BY id` with no tenant dimension; handler-less events are claimed and released every tick (write amplification) and could head-of-line-block when ≥ batch size accumulate. Latent: today only `*.deleted` and `cache.*` types are appended. | LOW (latent) | NOT FIXED — fold into M15-03/M15-10 design. | M15-03 |

**Checked, no new finding:** durability/atomicity in PG-live (event appended inside the mutation transaction; `delete-service.js` memory path only outside it); atomic claim (`FOR UPDATE SKIP LOCKED` single statement); lease fencing on `mark()`/`moveToDlq()`; DLQ transfer atomic; sync batch bound (`MAX_BATCH`, 413). Graceful shutdown: `worker.stop()` clears the timer without awaiting in-flight handlers — recovered by lease expiry (60 s), LOW, covered by M15-10.

**Hermes / independent verification still required:** (1) QUEUE-CLAIM-1 on live Redis+PG with two instances — upstream's "VERIFIED ON LIVE INFRA" for M15-05 durable invalidation must be re-checked through the real `start()` timer path (NOT VERIFIED how that run invoked the loop); (2) reproduce QUEUE-CAPACITY-1 on live PG; (3) review QUEUE-RETRY-1 migration design.

**Next 3 priorities:** ① live revalidation of the timer path (M15-09); ② backoff/jitter + `next_attempt_at` design (M15-12); ③ watermark liveness + DLQ retention design (M15-10).


# MASTER CLOSURE RECONCILIATION — 2026-10-07
**هدف:** این بخش «صف جامع بستن پروژه» است و بر تمام queueهای قبلی، defect registerها، auditها، phaseها، معماری‌ها، یافته‌های خارجی، موارد مشکوک و شکاف‌های evidence سوار می‌شود. این بخش duplicate fix ایجاد نمی‌کند؛ هر مورد تاریخی یا به یک workstream موجود نگاشت می‌شود یا به‌عنوان REVALIDATION/EVIDENCE/DECISION مستقل باقی می‌ماند.

**Current main:** `7a9e19f153ec122a7dca6fb54bef68c59c7c6368` (merge PR #440)
**حکم فعلی:** **HARDENING / ARCHITECTURE UPGRADE / RECONCILIATION — NOT VERIFIED / NOT CERTIFIED**

## A. قاعده پوشش کامل
هیچ finding تاریخی با عنوان FIXED/VERIFIED صرفاً از روی گزارش بسته نمی‌شود. برای current HEAD یکی از این dispositionها لازم است:
`VERIFIED` · `FIXED-SCOPED` · `REVALIDATION_REQUIRED` · `NOT VERIFIED` · `BLOCKED` · `ACCEPTED RISK` · `HISTORICAL / NO CURRENT REPRO`.
مواردی که در یک workstream جذب شده‌اند دوباره به‌صورت defect مستقل اجرا نمی‌شوند، اما ID تاریخی و evidence boundary آنها حفظ می‌شود.

## B. صف صفر — Certification / Evidence debt (قبل از سبز کردن هر چیزی)
1. **Verification Registry:** `head_bound=e4584806` و برای current main به‌روز نیست → **REVALIDATION_REQUIRED**؛ registry باید روی hardening SHA نهایی بازسازی شود.
2. **Three-AI agreement:** ChatGPT + Arena + Atria برای current final SHA کامل نشده → **NOT VERIFIED**.
3. **Strict Verification Gate:** fail-closed policy موجود است، اما certification registry/evidence graph هنوز current-head certified نیست → **BLOCKED**.
4. **False-green / test integrity:** orphan/zero-check/mock/swallowed-catch inventory باید به gateهای واقعی متصل و NOT-RUN صریح شود.
5. **Current-head evidence invalidation:** هر merge مادی، evidence وابسته را دوباره معتبرسازی می‌کند.
6. **Final evidence ledger:** هر claim باید command + exit + SHA + artifact/runtime + limitation داشته باشد.

## C. صف میراثی Defect — بدون از دست دادن یافته‌های قبل
### C1 — Atria Phase-A Carry-over / A-01..A-29
این register تاریخی حذف نمی‌شود؛ وضعیت فعلی آن به شکل زیر مدیریت می‌شود:
- **A-01/A-02/A-03:** performance/analytics/readCollection → **M15-01/M15-05**, با A-02 همچنان **REVALIDATION/EVIDENCE_REQUIRED**.
- **A-04:** ID race → single-instance fix موجود؛ multi-instance JSON residual → **REVALIDATION_REQUIRED**.
- **A-05/A-06:** backup/SMS growth → current behavior must be revalidated; SMS/queue retention جذب **M15-10/M15-15**.
- **A-07/A-08/A-12/A-13:** test orchestration, zero-check, runner/parity → **A-37 + original N-36 evidence debt**.
- **A-09/A-10/A-11:** security scanners → CodeQL/Fortify are still **NOT VERIFIED / external-tool dependent**.
- **A-14..A-17:** historical false-green fixes → retain as regression invariants; current-head gate must prove them.
- **A-18/A-20/A-24:** Sync/OCC → **REVALIDATION_REQUIRED** for legacy/LWW, crash durability, reconnect, multi-host and final current-head invariant.
- **A-19/A-21:** ownership → absorbed into tenant/authz matrix **M15-03 + Capability/Role validation**.
- **A-22:** Redis revocation → current fix has residual cross-instance fail-open risk; **M15-03/M15-08 + failure drill**.
- **A-23:** intelligence metric semantics → retain under intelligence certification / A-31.
- **A-25/A-27/A-28/A-29:** reliability/DR/national scale/documentation evidence → **M15-15/M15-18/M15-19/M15-20 + docs reconciliation**.
- **A-26:** CI/security-gate coverage → **A-37 / Strict Gate**.

### C2 — NCR-01..NCR-27
Historical NCR list is fully retained; no duplicate fixes are created. Mapping:
- NCR-01..07 → current authz/boot/security hardening and **M15-03/M15-05 + current-head revalidation**.
- NCR-08..09 → **M15-11 + adversarial OCC verification**.
- NCR-10..13 → **A-36/A-37 + M15-05**.
- NCR-14..15/20 → **M15-03 tenant/region authorization**.
- NCR-16..17 → **M15-11 Sync/OCC contract**.
- NCR-18..19/22/26/27 → **A-37 / Strict Gate / CI inventory**.
- NCR-21 → Parent-360 data semantics → **Capability/Role/E2E + current-head regression**.
- NCR-23 → frontend build drift → **release/test-integrity gate**.
- NCR-24..25 → low-priority behavioral cleanup, retained until reproduced/dispositioned.

### C3 — Fresh root-cause / recurrence program A-30..A-39
**Mandatory closure chain:**
A-30 Strict Gate → A-31 Intelligence semantic integrity → A-32 SMS/PG/restart idempotency → A-33 PG auth delegation parity → A-34 Sync authorization parity → A-35 Mission-5 authz → A-36 PG migration/test infrastructure → A-37 complete test inventory → A-38 registry rebind → A-39 DR/reliability evidence.

هیچ مورد recurring از FIXED مستقیماً CERTIFIED نمی‌شود.

### C4 — External blind audits
- **Replit R-A1..R-A4:** class projection / Redis Cluster recovery / HA-only config / temp cleanup → controlled reproduction + disposition; no external report closes them.
- **Bolt B-01:** Redis outage stale-cache → **M15-09/M15-07**, current durable path still requires independent timer-path verification.
- **B-02:** direct PG role/school mutation stale bootstrap cache → **M15-07/M15-03**; operational support contract must be decided.
- **B-03:** PG→memory fallback stale/source signaling → **M15-05**; production authority must remain PG.
- **B-04:** cross-instance durable revocation journal → **A-39/M15-08**, deployment storage contract.
- **B-05:** health-index memory mirror → **M15-05/M15-14**.
- **B-06:** PG pool min/max NaN parsing → **M15-17**.
- **B-07:** shutdown worker ordering → **M15-10/M15-20**.
- **Copilot bootstrap grade finding:** mixed numeric/recognized/unknown grade chunks → **REPRODUCTION_REQUIRED on live PG**; do not apply historical patch blindly.

## D. صف معماری و مقیاس — M15 V2 (25 آیتم، canonical)
1. **M15-01** current-head architecture reconciliation + runtime hot-path inventory.
2. **M15-02** measured capacity baseline/model.
3. **M15-03** tenant isolation + resource fairness/noisy-neighbor.
4. **M15-04** admission/load shedding.
5. **M15-05** DB scale hardening: connection/query/transaction budgets, PgBouncer-safe locks, server timeouts, bounded reads.
6. **M15-06** shard/cell-ready data model; 22 tenant-table gaps + global sequence strategy decision.
7. **M15-07** PACMA-lite: byte-bounded L1, jitter, size/tenant budget, negative cache/hot-key only where evidence warrants.
8. **M15-08** Redis role separation/failure domains/key policy.
9. **M15-09** durable invalidation reconciliation + Hermes live verification. **QUEUE-CLAIM-1 is FIXED-SCOPED, not yet independently verified.**
10. **M15-10** queue/worker anti-collapse: retention, age/depth/DLQ, fairness, handler loops, heartbeat, replay, shutdown.
11. **M15-11** sync-storm defence, jitter, tenant/device limits, client persistence/eviction.
12. **M15-12** retry/deadline standard: exponential backoff + full jitter + retry budget + deadline + circuit breakers.
13. **M15-13** event-loop/payload safety and heavy-work isolation.
14. **M15-14** independent observability plane, dead-man, black-box probes, bounded telemetry/rotation.
15. **M15-15** backup/DR automation + immutable/off-site decision.
16. **M15-16** progressive deployment/canary/rollback.
17. **M15-17** bounded central configuration and fail-fast validation.
18. **M15-18** load/spike/soak at modeled scale.
19. **M15-19** chaos/game days.
20. **M15-20** real restore/failover with measured RPO/RTO/MTTA/MTTR.
21. **M15-21** broker decision — conditional; default remains PG outbox.
22. **M15-22** cell architecture readiness.
23. **M15-23** read-replica/CQRS decision — evidence-driven.
24. **M15-24** shard/cell decision gate — do not shard without measured write ceiling/restore evidence.
25. **M15-25** final 10M+ certification on one exact HEAD.

### D1 — Queue hardening findings now attached to M15
- **QUEUE-CLAIM-1:** FIXED-SCOPED; real timer replication bug fixed and regression test wired to CI; Hermes live two-instance PG/Redis proof required.
- **QUEUE-RETRY-1:** NOT FIXED; add `next_attempt_at`, exponential backoff/full jitter, retry budget and live outage test.
- **QUEUE-CAPACITY-1:** REVALIDATION_REQUIRED; watermark floor can be pinned by dead `hostname:pid` rows; DLQ/failed retention absent.
- **QUEUE-OBSERVABILITY-1:** NOT FIXED; generic depth is RAM mirror; add PG-derived depth + oldest-age.
- **QUEUE-CLAIM-2:** NOT FIXED; PG fetch failure must not fall back to unleased RAM rows without an explicit safe degraded-mode contract.
- **QUEUE-FAIRNESS-1:** NOT FIXED; claim is ID-ordered/no tenant fairness and handler-less events can churn.

### D2 — V2 static findings that must not disappear
V2-F01 advisory-lock/PgBouncer contract; F02 server DB timeouts; F03 unbounded tables; F04 no-handler re-pend; F05 queue telemetry; F06 retry jitter/sync storm; F07 Redis role/policy contradiction; F08 unbounded env parsing; F09 docs/config drift; F10 nginx NAT/XFF/timeouts; F11 static capacity gate; F12 client DLQ loss; F13 22 tables without school_id; F14 memory mirror/readCollection; F15 sessionFrom I/O; F16 worker heartbeat/replay/shutdown/batch; F17 monitorEventLoopDelay/admission; F18 independent observability/logging; F19 global change sequence; F20 onboarding test red; F21 durable invalidation evidence gap; F22 repository-map docs debt. Each remains mapped to M15 or evidence/decision work and is not considered fixed by architecture documentation.

## E. Previous architecture/phases — retained, not lost
### E1 — Phase 1–7 / foundation and historical architecture
Historical architecture, migrations, authz, Redis, offline-first, DB scale, intelligence and release work are retained as evidence records. They are **not reimplemented blindly**. Their current closure condition is current-head invariant revalidation through Capability/Role/E2E and the final evidence gate.

### E2 — Phase 8 / 8.1 / 8.2
Phase 8.1 has substantial historical verification. Phase 8.2 still has evidence gaps that cannot be silently promoted:
- alert → on-call → acknowledgement → runbook → recovery chain;
- real PG + Redis restore with restored DB identity/checksum;
- measured MTTA/MTTR;
- cold-cache revoke behavior;
- canonical alert configuration actually loaded by the monitoring stack.
Until these are reconciled on current HEAD, **Phase 8.2 = PARTIAL / EVIDENCE GAP**.

### E3 — Phase 8.3 / 8.4 / 8.5 / 9.0
- **8.3:** national load, p95/p99, 20k RPS / 2.5k write TPS, multi-instance soak, control-plane divergence, cold boot and outbox/event processing → now absorbed by **M15-02/18/19/20**.
- **8.4:** central tenant enforcement + legacy-route coverage → **M15-03 + Capability/Role Matrix**.
- **8.5:** WAF enforce + zero-trust certification → **M15-03 + Strict Gate + Final Certification**.
- **9.0:** 8 educational/intelligence engines wiring → implementation was materially advanced (21/21 runtime-wired in prior intelligence audit), but **final current-head capability/evidence certification remains open**.
- **Phase 3 intelligence P0-EI-01..21 and Phase 4 scalability/production work:** retained; closure means current-head evidence, not replaying already-landed code.

### E4 — Capability / Role / E2E / Failure-Recovery campaigns
These are not optional after defect hardening:
`Requirement → Backend → DB → Auth/AuthZ → API → Frontend → Role → Tenant → Audit → Error/Failure → Recovery`.
They remain final validation tracks and are blocked until critical hardening/evidence dependencies close.

## F. Hermes / PEES upgrade queue
1. **Experience Retrieval Phase 3:** current verdict **PROMISING BUT UNPROVEN**.
2. Holdout needs ≥3 valid runs/arm; current n=1+1 is insufficient.
3. Generalization = NOT RUN.
4. Ablation arm C = NOT RUN.
5. PEB-05 = infrastructure-blocked on large `server/sync.js` prompt.
6. Phase-3 commits `bcb522bd…518dc9b3` exist in Hermes report but are **not promoted to current main by that report**; reconcile before treating them as repository truth.
7. Freeze manifest regeneration is needed whenever test inventory changes; current freeze must remain synchronized.
8. Experience store remains context only; it never overrides current repository truth.

## G. Architecture evolution beyond M15 — conditional queue
- OpenTelemetry / end-to-end tracing.
- Policy-as-Code hardening into one authoritative contract.
- Selective CQRS for proven read pressure.
- Workflow/Saga for long-running multi-step operations.
- Selective service extraction only where measured failure/load boundary exists.
- Kubernetes/service mesh/event sourcing are **research/conditional**, not automatic work.
- Read replicas, Redis Cluster, broker, sharding and cell expansion remain evidence-gated.

## H. Final closure order
```
MASTER EVIDENCE/REGISTRY
  ↓
A-30..A-39 + remaining critical defect families
  ↓
M15-01 → M15-02
  ↓
parallel: M15-17 + M15-12 + M15-09
  ↓
M15-03/04/05/06/07/08/10/11/13/14/15/16
  ↓
M15-18 → M15-19 + M15-20
  ↓
M15-21/22/23/24 decisions
  ↓
Capability Matrix → Role Matrix → E2E
  ↓
Failure/Recovery → Performance/Scale
  ↓
Atria + Arena + ChatGPT current-head agreement
  ↓
Hermes independent verification
  ↓
M15-25 FINAL 10M+ CERTIFICATION
```

**Hard stop:** no item is closed merely because an old phase report says VERIFIED; no NOT-RUN becomes PASS; no architecture document counts as implementation; no capacity target counts as measurement.
