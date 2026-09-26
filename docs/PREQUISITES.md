# پایش — پیشنیاز / PREQUISITES
## سند مادر اجرای پروژه، حافظه اجرایی، کنترل تغییر و جلوگیری از دوباره‌کاری

**Status:** CANONICAL / ACTIVE / MANDATORY  
**Repository:** rezaa2544/p2  
**Default branch:** main  
**Created:** 2026-09-26  
**Purpose:** Single Source of Truth اجرایی برای اینکه هر نشست، agent و توسعه‌دهنده بداند پروژه کجاست، چه قوانینی حاکم است، چه کاری مجاز است، چه چیزی قبلاً انجام شده، چه چیزی باقی مانده و تحویل واقعی چگونه اثبات می‌شود.

---

# 0. قانون حاکم این سند

از این تاریخ، وقتی کاربر می‌گوید:

> **«پیشنیاز را آپدیت کن»**

منظور این است که وضعیت این سند باید با **تمام تغییرات مادی و مرتبط پروژه** همگام شود و در صورت نیاز، اسناد تخصصی وابسته نیز به‌روزرسانی شوند.

«پیشنیاز» فقط یک فایل یادداشت نیست؛ **لایه کنترل مادر پروژه** است.

اما برای جلوگیری از دو منبع حقیقت متناقض:

- این سند = **مرجع مادر برای وضعیت، قوانین، ترتیب کار، وابستگی‌ها، حافظه اجرایی و synchronization**
- اسناد تخصصی = **مرجع جزئیات تخصصی همان حوزه**
- GitHub current main HEAD = **مرجع نهایی وضعیت واقعی کد و repository**
- Runtime / CI / reproducible evidence = **مرجع نهایی ادعاهای اجرایی و certification**

هیچ خلاصه‌ای در این سند نباید جای evidence واقعی را بگیرد.

---

# 1. اصل بنیادین

## 1.1 Repository is Truth

ترتیب اعتبار:

1. Runtime / E3-E4 evidence و GitHub Actions واقعی روی SHA مشخص
2. current GitHub main HEAD و کد همان SHA
3. regression/evidence artifact قابل بازتولید روی همان SHA
4. گزارش ممیزی و گزارش agent
5. roadmap / planning
6. اظهارنظر conversational

گزارش agent یا ChatGPT هرگز جای repository evidence را نمی‌گیرد.

## 1.2 Delivery Chain

`WRITE SUCCESS ≠ COMMIT ≠ PUSH ≠ MERGE ≠ VERIFIED DELIVERY`

هر مرحله باید جداگانه اثبات شود.

- write بدون commit = تحویل نشده
- commit بدون remote = تحویل نشده
- push بدون target/PR لازم = تحویل نشده
- PR باز در حالی که merge لازم بوده = تحویل نشده
- evidence روی SHA قدیمی = برای current HEAD معتبر نیست
- repository + evidence منطبق = VERIFIED، مشروط به سطح verification

---

# 2. وضعیت فعلی پروژه

**Current phase:** HARDENING / ROOT-CAUSE REMEDIATION — NOT VERIFIED

**اصل:** پروژه هنوز در مرحله اصلاح ریشه‌ای، بازبینی و تثبیت است؛ وارد certification گسترده نشده است.

## ترتیب کلان فعلی

```
Atria Critical/High
→ Root-Cause Remediation
→ Phase-A Carry-over Closure
→ Atria Medium
→ Atria Low
→ Current-Head Revalidation
→ Full Multi-AI Validation
→ Capability Matrix
→ Role Matrix
→ E2E
→ Failure / Recovery
→ Performance
→ Final Certification
→ Production Readiness
→ Full Operational Handoff
```

**هدف نهایی پروژه:** صرفاً «بسته شدن باگ‌ها» نیست؛ مسیر باید تا **تکمیل، اعتبارسنجی، آماده‌سازی تولید، بهره‌برداری و عملیاتی شدن کامل Payesh** ادامه پیدا کند.

**ممنوع:** شروع بازنویسی بزرگ معماری، migration گسترده frontend/backend یا certification نهایی در حالی که hardening باز است؛ مگر Architecture Review صریحاً ترتیب را تغییر دهد.

---

# 3. CURRENT HEAD و قانون Single-HEAD

آخرین current main باید در هر نشست دوباره از GitHub خوانده شود.

**قانون:**
> در هر لحظه فقط یک Canonical Main HEAD وجود دارد.

هر branch/PR دیگر فقط candidate change نسبت به آن HEAD است.

زنجیره صحیح:

```
Candidate
→ Reconcile with Canonical HEAD
→ Preserve Intent
→ Integrate
→ Verify
→ New Canonical HEAD
→ Next Candidate
```

ممنوع:
- merge PR قدیمی بدون مقایسه با main فعلی
- force-push/history rewrite
- update-ref برای جایگزینی merge واقعی
- استفاده از evidence قدیمی برای HEAD جدید
- integration موازی بر مبنای یک HEAD قدیمی
- بستن PR بدون تعیین تکلیف تغییرات مفید

## 3.1 قانون جلوگیری از چند HEAD و چند رشته اجرایی

مشکل «دو HEAD» یا چند مسیر مستقل که هر کدام خود را نسخه اصلی معرفی کنند نباید تکرار شود.

الزام:

1. `main` تنها Canonical Integration Line است.
2. هر branch باید صریحاً base SHA خود را مشخص کند.
3. هر integration قبل از ادغام با **current main HEAD** reconcile شود.
4. branchهای قدیمی پس از تعیین تکلیف باید merge/close شوند و نباید به‌عنوان مسیر موازی فعال باقی بمانند.
5. هیچ agent یا chat مجاز نیست یک branch قدیمی را مستقل از current main به‌عنوان «نسخه اصلی» ادامه دهد.
6. evidence هر branch فقط برای همان SHA/target معتبر است.
7. اگر دو HEAD یا دو وضعیت متناقض مشاهده شد، **STOP → RECONCILE → SELECT CANONICAL MAIN → CONTINUE**.
8. ساختن رشته کاری موازی برای دور زدن وضعیت canonical ممنوع است.

هدف این قانون جلوگیری از تکرار خطای تاریخی چند-HEAD و جلوگیری از diverged work است.

---

# 4. قانون «اول کنترل، بعد اقدام»

قبل از هر کار مادی:

1. این سند را بخوان.
2. current main HEAD را از GitHub بخوان.
3. Project Intelligence را تطبیق بده.
4. Roadmap / Ground Truth را تطبیق بده.
5. Work Execution Plan و Dashboard را بررسی کن.
6. مالکیت agentها و missionها را بررسی کن.
7. بررسی کن کار قبلاً انجام نشده باشد.
8. بررسی کن agent دیگری همان scope را مالک نباشد.
9. dependency و blocker را مشخص کن.
10. invariant و evidence مورد انتظار را مشخص کن.
11. Delivery Contract را مشخص کن.
12. فقط در صورت لازم و stage-appropriate بودن، اقدام کن.

اگر وضعیت مبهم است:

**VERIFY FIRST — CODE LATER**

---

# 5. قانون کار بیهوده ممنوع

کار نباید فقط برای تولید activity شروع شود.

کار ممنوع است اگر:

- قبلاً در main حل شده؛
- همان scope تحت مالکیت agent دیگری است؛
- duplicate است؛
- فقط برای سبز شدن گزارش است؛
- prerequisite ندارد؛
- evidence قابل استفاده تولید نمی‌کند؛
- خارج از مرحله فعلی است؛
- صرفاً refactor تزئینی است.

خروجی صحیح در چنین شرایطی:

**NO-OP / ALREADY COVERED / BLOCKED / REVALIDATION_REQUIRED**

---

# 6. حافظه اجرایی و Continuous Synchronization

هیچ material event نباید فقط در یک فایل ثبت شود و وضعیت مرتبط آن در سایر محل‌های مربوط stale بماند.

**مهندس ناظر موظف است پس از هر گزارش، هر تغییر repository، هر commit/PR/merge مهم، هر تغییر mission/agent و هر تصمیم مادی، ابتدا اثر آن را در کل repository و وضعیت پروژه بررسی کند و سپس اطلاعات لازم را خودش در مراجع مربوط ثبت/همگام کند.**

این بررسی باید در حد لازم شامل:

- current main HEAD و commit graph
- فایل‌های تغییرکرده
- open/closed PRهای مرتبط
- branchهای مرتبط
- mission/owner
- defect/roadmap status
- tests/evidence
- dependencies/blockers
- اسناد affected

باشد.

**گزارش agent به‌تنهایی باعث تغییر status نمی‌شود؛ repository و evidence باید کنترل شوند.**

بعد از هر تغییر مرتبط، impact روی این موارد بررسی شود:

- این سند PREQUISITES
- Project Intelligence
- Roadmap / Ground Truth
- Current Work Execution Plan
- Project Dashboard
- Daily Tasks
- Decision Log
- CHANGELOG
- Agent / Chat Mission Registry
- Verification Registry
- Audit / Carry-over documents
- Issue / Task records در صورت وجود
- Architecture Decision در صورت تغییر معماری

**قانون:** کوچک بودن تغییر، دلیل برای عقب انداختن synchronization نیست.

در عین حال، update بی‌ربط و نویزی ممنوع است؛ فقط محل‌های واقعاً affected باید تغییر کنند.

---

# 7. حفاظت فعال از مسیر پروژه و جلوگیری از خرابکاری

«حفاظت» در این سند به معنی جلوگیری از تغییر قانونی یا محدود کردن توسعه نیست؛ به معنی **کنترل تغییرات مخرب، متناقض، خارج از scope و غیرقابل‌ردیابی** است.

مهندس ناظر باید بعد از هر گزارش یا تغییر بررسی کند که:

1. agent/chat دیگری invariant یا فایل مربوط را خراب نکرده باشد؛
2. تغییر جدید باعث regression نشده باشد؛
3. scope یک mission توسط chat دیگری بدون هماهنگی تغییر نکرده باشد؛
4. branch قدیمی روی main یا روی mission جدید اثر ناخواسته نداشته باشد؛
5. فایل‌های حافظه/roadmap/verification با کد متناقض نشده باشند؛
6. evidence قدیمی به اشتباه به current HEAD نسبت داده نشده باشد؛
7. هیچ chat با ایجاد branch/commit موازی مسیر canonical را دور نزده باشد؛
8. تغییرات خارج از scope یا destructive بدون approval وارد نشده باشند.

اگر انحراف یا خرابکاری مشاهده شد:

```
STOP AFFECTED WORK
→ IDENTIFY CHANGE
→ IDENTIFY OWNER
→ COMPARE WITH CANONICAL HEAD
→ ASSESS IMPACT
→ RESTORE/REMEDIATE SAFELY
→ UPDATE MEMORY
→ REVALIDATE
→ RESUME
```

هیچ chat یا agent نباید بتواند با یک گزارش صرف، وضعیت پروژه را «تمام‌شده» اعلام کند.

---

# 8. ساختار حافظه پروژه

## 8.1 لایه‌های حافظه

### A. این سند
مرجع مادر:
- وضعیت فعلی
- قوانین
- ترتیب کار
- کنترل agentها
- delivery
- synchronization
- next action
- وضعیت کلی

### B. Supervising Engineer
`docs/external-memory/SUPERVISING_ENGINEER.md`

مرجع کنترل دقیق مهندس ناظر، delivery contract، status transitions، report reconciliation و verification discipline.

### C. Project Intelligence
`docs/CURRENT_PROJECT_INTELLIGENCE.md`

مرجع snapshot هوش پروژه و current truth تجمیعی.

### D. Roadmap / Ground Truth
`docs/ROADMAP_CURRENT_GROUND_TRUTH-2026-09-21.md`

مرجع مسیر اجرایی و ground truth roadmap.

### E. Execution Plan
`docs/CURRENT_WORK_EXECUTION_PLAN.md`

مرجع ترتیب و برنامه اجرای کار.

### F. Dashboard / Tasks / Decisions
- `docs/external-memory/PROJECT_DASHBOARD.md`
- `docs/external-memory/DAILY_TASKS.md`
- `docs/external-memory/DECISION_LOG.md`

### G. Verification
Verification Registry و Strict Verification Gate برای ادعاهای verification/certification.

### H. Audit / Defect Registers
- `docs/audit/MASTER_DEFECT_PRIORITY_2026-09-25.md`
- `docs/audit/MULTI_REPORT_DEFECT_RECONCILIATION_2026-09-25.md`
- `docs/audit/CANONICAL_DEFECT_INTAKE_FREEZE_2026-09-25.md`
- `docs/audit/ATRIA_PHASE_A_CARRYOVER.md`
- A-30..A-39 hardening queue
- root-cause/reappearance program

---

# 9. ترتیب اجباری مطالعه در شروع هر نشست

```
1. PREQUISITES.md
2. SUPERVISING_ENGINEER.md
3. ROADMAP_CURRENT_GROUND_TRUTH
4. CURRENT_PROJECT_INTELLIGENCE
5. CURRENT_WORK_EXECUTION_PLAN
6. PROJECT_DASHBOARD
7. DAILY_TASKS
8. DECISION_LOG
9. Verification Registry / Strict Gate when relevant
10. current GitHub main HEAD
```

بعد از این مطالعه باید internally مشخص باشد:

```
PHASE
CURRENT HEAD
NEXT ALLOWED ACTION
OWNER
DEPENDENCIES
EVIDENCE TARGET
DELIVERY TARGET
```

---

# 10. Agent / Chat Mission Registry

هر agent باید دارای این اطلاعات باشد:

- Agent ID
- Chat ID / source
- mission
- workstream
- owner
- scope
- non-scope
- base SHA
- target branch
- dependencies
- blockers
- status
- latest commit
- pushed?
- PR
- tests
- evidence
- latest report
- remaining items
- next action
- handoff / transferred ownership

## قانون attribution

**ChatGPT 7 executor نیست.**

هر کاری که از ChatGPT 7 منتقل شده باشد، متعلق به **Arena 10** است و attribution نباید تغییر کند.

## وضعیت فعلی تیم

- Supervising Engineer: کنترل و reconciliation
- ChatGPT × 5: workstreamهای معماری، امنیت، backend/DB/infra، frontend/intelligence/UX، QA/release/evidence
- Arena × 10: workstreamهای مستقل و non-overlapping
- Atria × 3: sweep / remediation / review با scopeهای غیرهمپوشان

اگر هویت دقیق یک agent یا mission روشن نیست، ابتدا reconciliation انجام شود؛ حدس به‌عنوان fact ثبت نشود.

---

# 11. Report → Mission Reconciliation

هر گزارش agent باید:

```
Report
→ Identify Owner
→ Identify Mission
→ Compare Scope
→ Verify Repository
→ Verify Tests/Evidence
→ Update Agent Status
→ Update Project State
→ Determine Next Action
```

گزارش ناقص از نظر شناسه نباید خودکار DONE تلقی شود.

## Header اجباری گزارش

```
STATUS
COMMIT
PUSHED
PR
TARGET
TESTS
EVIDENCE
CURRENT HEAD
BLOCKERS
NEXT ACTION
```

---

# 12. Status System

وضعیت‌ها باید بر اساس evidence واقعی انتخاب شوند:

- NOT STARTED
- ASSIGNED
- IN PROGRESS
- WAITING
- BLOCKED
- READY FOR REVIEW
- REVIEWED
- COMMIT CREATED
- PUSHED
- PR OPEN
- MERGED
- FIXED
- FIXED-SCOPED
- TESTED
- RUNTIME_VERIFIED
- ADVERSARIAL_VERIFIED
- INDEPENDENTLY_VERIFIED
- CERTIFIED
- NOT VERIFIED
- REVALIDATION_REQUIRED

### تعریف مهم

**FIXED** یعنی source fix وجود دارد؛ certification نیست.

**FIXED-SCOPED** یعنی فقط scope مشخص بسته شده است.

**TESTED** یعنی test واقعاً اجرا شده.

**RUNTIME_VERIFIED** یعنی runtime evidence روی SHA مشخص وجود دارد.

**ADVERSARIAL_VERIFIED** یعنی negative/adversarial evidence هم وجود دارد.

**INDEPENDENTLY_VERIFIED** یعنی reviewer مستقل وجود دارد.

**CERTIFIED** فقط وقتی مجاز است که تمام شروط Gate برقرار باشند.

---

# 13. Progress و تیک‌های تأیید

برای هر mission:

- درصد پیشرفت = پیشرفت واقعی بر اساس scope/evidence
- `✅` = فقط موردی که واقعاً verify شده
- `⬜` = باقی‌مانده یا unverified
- ادعای agent بدون evidence = `⬜ / UNVERIFIED`
- Push فقط بعد از مشاهده commit روی remote/target branch = `✅`

هیچ تیک تأییدشده‌ای بر اساس متن گزارش به‌تنهایی داده نشود.

---

# 14. Delivery Contract

هر assignment اجرایی باید شامل:

```
OWNER
WORKSTREAM
OBJECTIVE
SCOPE
NON-SCOPE
BASE SHA
TARGET
DEPENDENCIES
REQUIRED TESTS
REQUIRED EVIDENCE
DELIVERY
```

تحویل:

```
STATUS
COMMIT
PUSHED
PR
TARGET
TESTS
EVIDENCE
CURRENT HEAD
BLOCKERS
NEXT ACTION
```

اگر push لازم بوده و انجام نشده:

**WORK_INCOMPLETE**

اگر merge لازم بوده و انجام نشده:

**WORK_INCOMPLETE**

---

# 15. Root-Cause Engineering

برای هر defect:

```
REPRODUCE
→ ROOT CAUSE
→ INVARIANT
→ ALL PATHS
→ MINIMAL SOURCE FIX
→ POSITIVE REGRESSION
→ NEGATIVE / ADVERSARIAL REGRESSION
→ CURRENT-HEAD EVIDENCE
→ INDEPENDENT REVIEW
```

اگر defect قبلاً FIXED بوده و دوباره پیدا شد:

```
REAPPEARANCE
→ WHY PREVIOUS FIX FAILED
→ ROOT CAUSE
→ INVARIANT
→ ALTERNATE PATHS
→ FIX
→ REGRESSION
→ CURRENT HEAD
→ INDEPENDENT REVIEW
```

**FIXED-SCOPED ≠ ROOT-CAUSE-CLOSED**

---

# 16. Scope Completeness

قبل از closure باید inventory مربوطه بررسی شود:

- REST/API
- Sync/Offline
- Workers / Jobs / Queues
- Direct DB writes
- Client/Browser
- Role / Tenant / Ownership
- Configuration / Environment
- Restart / Failure / Recovery
- Legacy / Compatibility paths
- Cache / Mirror / Outbox
- Alternate endpoints
- Persistence / hydration
- Cross-school / cross-tenant cases

یک مسیر سبز، invariant سراسری را ثابت نمی‌کند.

---

# 17. Security / Authorization

برای Security، Tenant Isolation، Ownership، OCC، Revocation و Conflict:

- positive test الزامی
- negative test الزامی
- cross-tenant الزامی
- cross-school الزامی
- wrong-role الزامی
- alternate-path bypass search الزامی
- policy canonical تا حد امکان single-source
- hydration/persistence parity
- fail-open و fallback adversarial test
- REST و Sync باید invariant یکسان داشته باشند

---

# 18. Data Integrity / Persistence

برای داده حساس باید روشن باشد:

- source of truth چیست؟
- transaction boundary چیست؟
- idempotency boundary چیست؟
- mirror/cache/queue چه نقشی دارند؟
- restart چه اثری دارد؟
- replay چه اثری دارد؟
- partial failure چگونه مدیریت می‌شود؟
- duplicate execution چه می‌کند؟
- reconciliation چگونه انجام می‌شود؟

`HTTP 200` یا `sent=true` به‌تنهایی اثبات persistence یا delivery نیست.

---

# 19. Test Integrity — False Green ممنوع

موارد زیر بدون justification صریح blocker هستند:

- `assert(true)`
- assertion بی‌اثر
- `process.exit(0)` برای سبز کردن
- `|| true`
- skip خودکار prerequisite و گزارش PASS
- mock-only برای ادعای integration/E2E
- target اجرا نشده
- 0/0
- swallowed error/catch
- environment شرطی که failure را PASS کند
- historical CI برای current HEAD

اگر prerequisite موجود نیست:

**NOT-RUN / BLOCKED**

نه PASS.

---

# 20. Testing Pyramid

```
Unit
→ Integration
→ Contract
→ Positive
→ Negative
→ Authorization / Tenant Isolation
→ Concurrency / Replay
→ Regression
→ Runtime Evidence
→ Independent Review
```

برای failure/recovery فقط «سیستم بالا آمد» کافی نیست.

در صورت کاربرد باید RPO/RTO/MTTA/MTTR یا معیار پذیرش واقعی اندازه‌گیری شود.

---

# 21. No Self-Certification

عامل اجراکننده مرجع نهایی صحت کار خودش نیست.

Certification نیازمند:

- current SHA
- evidence مستقل
- reviewer مستقل
- Gate کامل
- در Gate نهایی: ChatGPT + Arena + Atria طبق قرارداد پروژه

یک AI PASS = certification نیست.

---

# 22. Parallel Work / Conflict Control

Workstreamها باید non-overlapping باشند.

قبل از شروع:

- فایل‌های مشترک
- invariant مشترک
- branch
- ownership
- dependency

بررسی شود.

اگر دو agent یک invariant را لمس می‌کنند:

- یکی executor
- دیگری reviewer/validator

دو fix مستقل برای یک invariant ممنوع مگر صریحاً برنامه‌ریزی شده باشد.

---

# 23. Minimal Safe Change

اصل:

> کمترین تغییر لازم برای بستن invariant، با بیشترین evidence معتبر.

ممنوع:

- refactor نامرتبط
- rename نامرتبط
- formatting churn
- dependency churn
- تغییر destructive بدون approval
- force-push
- history rewrite
- ذخیره secret/token در repository، prompt، log یا issue

---

# 24. Regression Permanence

Regression مهم باید دائمی و قابل اجرای مجدد باشد.

اگر test حذف یا ضعیف شد:

- جایگزین قوی‌تر ثبت شود.

Recurring defects باید در Reappearance Regression Suite باقی بمانند.

---

# 25. Stop / Escalate

در این شرایط توقف:

- requirement متناقض
- target نامعلوم
- dependency مفقود
- access مفقود
- environment غیرقابل اعتماد
- invariant دیگر نقض شده
- scope creep
- evidence با code/HEAD متناقض

وضعیت:

**BLOCKED** یا **REVALIDATION_REQUIRED**

و unblocker باید ثبت شود.

---

# 26. Final Handoff

قبل از پایان هر کار:

1. diff review
2. changed files vs scope
3. test واقعی
4. count + exit code
5. evidence → SHA binding
6. remote/PR/merge verification
7. current HEAD read-back
8. synchronization اسناد affected
9. blocker/limitation
10. next action

---

# 27. قوانین توسعه و ساختار کد

مرجع کامل:

`docs/CODEBASE_STRUCTURE_STANDARD.md`

## Frontend

ساختار فعلی:

```
src + templates + public
        ↓
build.js
        ↓
index.html
```

تا migration ساختاری:

```
UI/View
→ Feature/Application
→ Data Contract
→ Sync/REST Contract
```

قواعد:

- هر فایل مسئولیت روشن
- شماره فایل فقط load order
- `src/js/_order.json` قرارداد load order
- قابلیت جدید module owner
- data access از data layer
- fetch/localStorage/IndexedDB/network access طبق contract
- global state بدون contract ممنوع
- global named function تکراری ممنوع
- business logic در فایل تصادفی ممنوع

## Backend

الگوی هدف:

```
Route
→ Application / Service
→ Policy / Authorization
→ Repository / Data
→ PostgreSQL / Redis / Outbox
```

ساختار مفهومی:

```
server/
  routes/
  domain/
  application/
  policy/
  data/
  infrastructure/
  workers/
  analytics/
```

اما در Hardening:

**جابه‌جایی گسترده فایل‌ها ممنوع مگر با Architecture Review.**

## Database

```
migrations/
   ↓
PostgreSQL = Source of Truth
Redis = Cache / Ephemeral Distributed State
Search Index = Derived Read/Search Model
```

Schema فقط از migration.

---

# 28. Naming و قابلیت پیدا کردن کد

توسعه‌دهنده آینده باید برای هر قابلیت بتواند بدون جست‌وجوی تصادفی محل این موارد را پیدا کند:

- UI
- route
- application/service
- policy
- data access
- migration
- test
- documentation
- observability
- owner

نام قابلیت/دامنه در UI، API، policy، test و docs تا حد امکان یکسان باشد.

نام فایل بر اساس responsibility باشد، نه نام شخص.

---

# 29. Feature Contract

هر قابلیت جدید باید این زنجیره را داشته باشد:

```
Feature
├── UI / Render
├── Actions / Events
├── Domain Rules
├── Data Contract
├── Authorization Hooks
├── Tests
└── Documentation
```

Checklist:

```
[ ] Domain owner
[ ] UI location
[ ] API/Sync contract
[ ] Authorization
[ ] Data model
[ ] Migration review
[ ] Tests
[ ] Negative/adversarial tests
[ ] Observability
[ ] Performance impact
[ ] User guide
[ ] Roadmap status
[ ] Current HEAD
```

---

# 30. وضعیت Defect / Hardening

مرجع تفصیلی:

`docs/audit/MASTER_DEFECT_PRIORITY_2026-09-25.md`

## صف اصلی

### P0
- F1 / bootstrap + identity + persistence integrity
- A-30 / Strict Verification Gate
- A-37 / test integrity و false-green
- NCR-01 / server entrypoint syntax integrity و موارد P0 مرتبط طبق current register

### P1
- F4 / region authorization
- F2 / PostgreSQL parent scope
- A-31 / intelligence semantic/certification
- A-32 / SMS → PostgreSQL mirror/restart/idempotency
- A-33 / PostgreSQL authorization persistence parity
- A-34 / REST/Sync authorization parity
- A-35 / Mission-5 authorization recurrence
- A-36 / migration/test infrastructure
- A-18/A-20/A-24 / Sync/OCC/conflict
- A-38 / verification registry rebind

### P2/P3
- A-39 / E4 reliability/DR
- A-01..A-06 operational/performance findings
- A-07..A-17 test/CI findings
- A-23 intelligence metric integrity
- remaining carry-over items
- NCR-16..NCR-27 و موارد مرتبط طبق register

**F3 و F5:** FIXED-SCOPED → REVALIDATION_REQUIRED؛ تا evidence روی final hardening SHA گواهی نشده‌اند.

---

# 31. قانون 37 مورد

فهرست 37 موردی که کاربر قبلاً تعیین کرده، نباید حذف یا فراموش شود.

اما:

> 37 مورد = کل universe unresolved work نیست.

آن فهرست با این‌ها تطبیق داده می‌شود:

- NCR-01..NCR-27
- F1..F5
- A-01..A-29
- A-30..A-39
- current repository findings
- Atria reports

تنها پس از reconciliation مجاز است موارد duplicate/subsumed در یک root-cause item ادغام شوند.

Classification:

```
NEW
DUPLICATE
SUBSUMED
MITIGATED
REVALIDATION_REQUIRED
NOT_REPRODUCED
BLOCKED
```

---

# 32. Atria Control

Atria-1، Atria-2 و Atria-3 باید scopeهای غیرهمپوشان داشته باشند.

برای هر report:

```
AGENT
→ MISSION
→ FINDING IDs
→ SCOPE
→ BASE SHA
→ COMMIT
→ PUSHED
→ TARGET
→ TESTS
→ EVIDENCE
→ CURRENT HEAD
→ REMAINING ITEMS
→ NEXT ACTION
```

هیچ Atria report به‌تنهایی certification نیست.

---

# 33. معماری فعلی و مسیر آینده

Payesh اکنون یک معماری دوگانه دارد:

```
Frontend:
src / templates / public
→ build.js
→ index.html

Backend:
Node.js CommonJS
→ native HTTP / routes
→ services / policy / analytics / workers
→ PostgreSQL + Redis
```

PostgreSQL منبع حقیقت تراکنشی است.

Redis برای cache/state/coordination استفاده می‌شود.

---

# 34. معماری آینده

مرجع کامل:

- `docs/ARCHITECTURE_EVOLUTION_ROADMAP.md`
- `docs/FUTURE_UPGRADES_AND_CAPABILITY_ROADMAP.md`

## مسیر پیشنهادی

```
Current Architecture Stabilization
→ Modular Monolith + Vertical Slices
→ Event-Driven + Transactional Outbox
→ OpenTelemetry
→ Policy-as-Code
→ TypeScript + Design System
→ Selective CQRS / Search
→ React + Next.js vertical slices
→ Go candidate services
→ Selective Microservices
→ Kubernetes / Service Mesh when justified
```

اصل:

**Modern technology ≠ automatic improvement.**

هر ارتقا باید:

```
Problem
→ Evidence
→ Architecture Decision
→ Bounded Design
→ Implementation
→ Contract Tests
→ Regression
→ Adversarial Tests
→ Runtime Evidence
→ Independent Review
```

را طی کند.

---

# 35. قابلیت‌های آینده

مرجع کامل capability registry:

`docs/FUTURE_UPGRADES_AND_CAPABILITY_ROADMAP.md`

گروه‌ها:

## Product
- هنرستان: نمره عملی/کارگاهی
- ثبت ساعت کارآموزی
- گیمیفیکیشن رفتاری
- کتابخانه
- اموال/انبار
- برنامه هفتگی خودکار
- امتحانات شهریور/تجدیدی
- کلاس‌های تابستانی
- مراجعین
- شاخص سلامت مدرسه
- پایگاه دانش
- صفحه وضعیت عمومی
- multi-school organization
- school capability profiles
- official verifiable certificates
- real external service adapters
- independent reception role
- expanded gamification
- operational object storage

## Frontend
- TypeScript
- React + Next.js
- Design System
- Three.js فقط در صورت نیاز واقعی

## Backend
- Modular Monolith + Vertical Slices
- Event-Driven
- Transactional Outbox
- OpenTelemetry
- Policy-as-Code
- Go برای bounded contextهای اثبات‌شده
- Microservices فقط در صورت توجیه

## Data
- PostgreSQL Source of Truth
- Redis
- Elasticsearch / Search Index
- Distributed DB فقط بعد از evidence
- Selective CQRS

## Scale / Reliability
- Horizontal API scaling
- Capacity model
- load/stress/spike/soak/chaos/recovery
- HA PostgreSQL/PITR/failover
- Kubernetes در صورت نیاز
- Service Mesh در صورت topology واقعی

## Intelligence
- اتصال orphan engines
- semantic/certification integrity
- independent read models
- provenance/version/reproducibility

هیچ‌کدام به معنی implemented/certified نیستند مگر status و evidence جداگانه آن را ثابت کند.

---

# 36. Feature Card اجباری برای آینده

هر قابلیت آینده باید حداقل این اطلاعات را داشته باشد:

```
ID / TITLE / DOMAIN / USER-ROLE
BUSINESS PROBLEM / CURRENT STATE / TARGET STATE
IN-SCOPE / OUT-OF-SCOPE / DEPENDENCIES
DATA MODEL / API-CONTRACT / AUTHORIZATION
OFFLINE-SYNC / OBSERVABILITY / PERFORMANCE
MIGRATION / ROLLBACK
TESTS / ADVERSARIAL TESTS
ACCEPTANCE EVIDENCE
DOCUMENTATION
OWNER
STATUS
CURRENT HEAD
```

Status:

```
PLANNED
DESIGNING
BLOCKED
IMPLEMENTING
TESTED
RUNTIME_VERIFIED
INDEPENDENTLY_VERIFIED
CERTIFIED
DEFERRED
REJECTED
```

---

# 37. Codebase Migration Strategy

بعد از Hardening:

1. inventory واقعی فایل‌ها
2. dependency map
3. module ownership map
4. shared contracts
5. انتخاب یک vertical slice کم‌ریسک
6. contract/regression tests
7. behavior comparison
8. migration slice-by-slice
9. حذف legacy فقط بعد از نبود reference و evidence

هدف:

**کاهش coupling و افزایش قابلیت توسعه**

نه:

**مرتب‌سازی ظاهری فایل‌ها**

---

# 38. Decision Gate قبل از هر اقدام

قبل از تغییر باید پاسخ این 7 سؤال روشن باشد:

1. چرا این کار الآن لازم است؟
2. کدام مرحله/roadmap item را جلو می‌برد؟
3. آیا قبلاً انجام شده؟
4. invariant/outcome چیست؟
5. evidence موفقیت چیست؟
6. failure چگونه تشخیص داده می‌شود؟
7. تحویل دقیقاً کجا باید دیده شود؟

اگر پاسخ روشن نیست:

**STOP / VERIFY / ESCALATE**

---

# 39. Efficiency Rule

هدف:

**کمترین کار لازم + بیشترین کاهش ریسک + بیشترین evidence معتبر**

اولویت با کاری است که:

- blocker را باز کند
- root cause را حذف کند
- چند مسیر را با invariant/policy واحد پوشش دهد
- evidence قابل بازتولید بسازد
- recurrence را متوقف کند

کار تزئینی اولویت ندارد.

---

# 40. Session End / Handoff

قبل از پایان نشست:

- missionهای تغییرکرده synchronize شوند
- statusهای stale اصلاح شوند
- current HEAD ثبت شود
- blockers ثبت شوند
- next action ثبت شود
- evidenceهای affected مشخص شوند
- ownership/handoff مشخص شود
- PREQUISITES در صورت material change به‌روز شود

هدف:

> نشست بعدی بدون اتکا به حافظه conversational بتواند وضعیت واقعی را از repository بازسازی کند.

---

# 41. پروتکل «پیشنیاز را آپدیت کن»

از این پس این عبارت یک فرمان اجرایی مشخص است.

## وقتی گفته شد «پیشنیاز را آپدیت کن»:

### مرحله 1 — Read
- PREQUISITES
- Supervising Engineer
- Project Intelligence
- Ground Truth
- Work Execution Plan
- Dashboard
- Tasks
- Decision Log
- relevant audit/verification docs
- current main HEAD

### مرحله 2 — Detect
تغییرات از آخرین وضعیت:

- code
- docs
- roadmap
- phase
- agent ownership
- mission
- PR
- commit
- push
- merge
- tests
- evidence
- defects
- architecture
- capability
- blockers
- next actions
- branch/HEAD topology

شناسایی شوند.

### مرحله 3 — Reconcile
هر تغییر با موارد موجود تطبیق داده شود.

### مرحله 4 — Update
فقط موارد affected در PREQUISITES و اسناد تخصصی مربوطه update شوند.

### مرحله 5 — Verify
اگر تغییر repository است:

```
EDIT
→ COMMIT
→ PUSH/PR/MERGE
→ READ REMOTE HEAD
→ VERIFY FILE AT REMOTE HEAD
→ UPDATE STATUS
```

### مرحله 6 — Report
گزارش باید شامل:

- چه چیزی تغییر کرد
- چرا تغییر کرد
- کدام فایل‌ها affected شدند
- current HEAD
- commit
- push
- PR/merge
- tests/evidence
- blockers
- next action

باشد.

---

# 42. قانون تغییرات کوچک

کوچک‌ترین تغییر هم اگر روی این موارد اثر دارد باید synchronize شود:

- phase
- task
- owner
- mission
- defect status
- current HEAD
- evidence
- roadmap
- architecture
- capability
- dependency
- blocker
- next action
- branch/HEAD topology

اما اگر تغییری هیچ اثر واقعی بر این موارد ندارد، از update بی‌دلیل جلوگیری شود.

---

# 43. قانون جلوگیری از دوباره‌کاری

قبل از شروع هر کار:

```
SEARCH EXISTING
→ CHECK MAIN
→ CHECK OPEN PRs
→ CHECK AGENT OWNERSHIP
→ CHECK AUDIT / ROADMAP
→ CHECK RECENT EVIDENCE
→ CHECK BRANCH / HEAD TOPOLOGY
→ THEN ACT
```

هیچ توسعه‌دهنده‌ای نباید صرفاً چون محل یک کار را پیدا نکرده، آن را دوباره بسازد.

---

# 44. قانون Developer Discoverability

هدف نهایی repository:

> توسعه‌دهنده جدید بتواند با خواندن اسناد مادر و ساختار canonical، برای هر قابلیت بفهمد «چیست، کجاست، مالک آن چیست، قراردادش چیست، چه تستی دارد و آخرین وضعیتش چیست».

برای هر قابلیت باید بتوان مسیر زیر را پیدا کرد:

```
Capability
→ Domain
→ UI
→ API / Sync
→ Policy
→ Data
→ Migration
→ Tests
→ Evidence
→ Documentation
→ Owner
→ Status
→ Current HEAD
```

---

# 45. Definition of Done

یک کار فقط وقتی DONE است که:

```
Scope complete
+ Root cause addressed
+ Required paths audited
+ Regression exists
+ Negative/adversarial checks completed
+ Tests actually executed
+ Evidence bound to SHA
+ Repository delivery verified
+ Required docs synchronized
+ Ownership/status updated
+ Next state known
```

و اگر یکی از موارد ضروری موجود نیست:

**NOT VERIFIED / WORK_INCOMPLETE / BLOCKED / REVALIDATION_REQUIRED**

---

# 46. Definition of Certified

CERTIFIED فقط زمانی:

- current/final SHA frozen
- required suites executed
- no false-green path
- evidence complete
- security/tenant/auth/data checks complete
- runtime evidence complete where required
- failure/recovery evidence complete
- performance evidence complete
- independent reviews complete
- verification registry correctly bound
- all mandatory acceptance criteria satisfied

تا آن زمان:

**NOT VERIFIED**

---

# 47. ممنوعیت‌های مطلق

- جعل evidence
- ادعای push بدون GitHub verification
- ادعای merge بدون GitHub verification
- استفاده از SHA قدیمی برای current claim
- حذف defect از حافظه بدون disposition
- حذف carry-over صرفاً به دلیل قدیمی بودن
- duplicate fix
- test manipulation برای green شدن
- source of truth دوم
- authorization موازی و متناقض
- schema بدون migration
- refactor گسترده در hardening بدون Architecture Review
- force-push/history rewrite
- secret/token در repository
- certification خوداظهاری
- حذف اطلاعات پروژه برای کوتاه کردن گزارش
- تغییر status بدون evidence
- ایجاد یا نگهداری چند Canonical HEAD
- ادامه مسیر کاری موازی که از current main جدا شده و بدون reconciliation ادامه پیدا کند
- قفل یا محدود کردن غیرضروری بخشی از repository به‌گونه‌ای که اجرای mission، بررسی، توسعه، تست یا بهره‌برداری را مختل کند

---

# 48. Repository Availability / No-Unnecessary-Lock Rule

**اصل:** هیچ بخش، فایل، ماژول، branch یا مسیر کاری نباید بدون دلیل فنی و ثبت‌شده قفل، مخفی، غیرقابل‌دسترسی یا محدود شود.

این اصل به معنی حذف کنترل‌های امنیتی یا Git governance لازم نیست؛ بلکه یعنی:

- محدودیت باید **ضروری، مشخص، مستند و متناسب** باشد.
- محدودیت نباید صرفاً برای جلوگیری از دسترسی توسعه‌دهنده/agent به بخشی از پروژه ایجاد شود.
- اگر دسترسی برای یک mission لازم است، باید مسیر قانونی و مشخص آن وجود داشته باشد.
- فایل‌ها و اسناد موردنیاز توسعه نباید عمداً خارج از discoverability قرار گیرند.
- branch protection یا review gate در صورت نیاز باید برای **حفاظت از canonical main** استفاده شود، نه برای ایجاد بن‌بست کاری.
- هیچ chat نباید با lock، branch انحصاری یا دسترسی اختصاصی، مسیر کل پروژه را متوقف کند.
- اگر محدودیتی مانع کار لازم شد، وضعیت باید **BLOCKED** ثبت شود و owner/unblocker مشخص باشد.

هدف:

> **Repository باید کنترل‌شده باشد، نه قفل‌شده؛ قابل حفاظت باشد، نه غیرقابل توسعه.**

---

# 49. مسیر اجباری تا تکمیل و بهره‌برداری

هدف نهایی execution فقط تولید commit یا بستن issue نیست.

مسیر باید تا این انتها دنبال شود:

```
Planning
→ Implementation
→ Integration
→ Verification
→ Hardening
→ Full Regression
→ Security / Authorization Validation
→ Reliability / Recovery
→ Performance / Capacity
→ Operational Readiness
→ Production Readiness
→ Deployment
→ Runtime Verification
→ Operational Handoff
→ Post-Deployment Monitoring
→ Full Project Completion
```

هر phase باید acceptance criteria داشته باشد.

**هیچ mission صرفاً به دلیل اینکه code نوشته شد، پایان‌یافته تلقی نمی‌شود.**

اگر بخشی از پروژه هنوز برای استفاده واقعی آماده نیست:

**PROJECT_COMPLETE = NO**

تا زمانی که تمام prerequisites بهره‌برداری، deployment، monitoring، recovery، security، data integrity، documentation و handoff لازم تعیین تکلیف نشده باشند.

---

# 50. Final Handoff

قبل از پایان هر کار:

1. diff review
2. changed files vs scope
3. test واقعی
4. count + exit code
5. evidence → SHA binding
6. remote/PR/merge verification
7. current HEAD read-back
8. synchronization اسناد affected
9. blocker/limitation
10. next action
11. بررسی اینکه branch/HEAD topology هنوز canonical و تک‌مسیره است
12. بررسی اینکه هیچ lock/access restriction غیرضروری ایجاد نشده باشد
13. بررسی اینکه تغییر با مسیر نهایی پروژه تا بهره‌برداری سازگار است

---

# 51. Change Log این سند

| تاریخ | تغییر | دلیل |
|---|---|---|
| 2026-09-26 | ایجاد PREQUISITES به‌عنوان سند مادر | یکپارچه‌سازی حافظه اجرایی، قوانین، roadmap، execution، verification، agent control و synchronization |
| 2026-09-26 | افزودن کنترل بازبینی کل repository بعد از گزارش/تغییر، حفاظت فعال از مسیر پروژه، قانون جلوگیری از چند HEAD، اصل Repository Availability و مسیر اجباری تا بهره‌برداری | جلوگیری از تکرار چند-HEAD، خرابکاری/انحراف بین chatها، محدودیت غیرضروری و متوقف شدن پروژه قبل از عملیاتی شدن |

**قاعده:** هر update بعدی باید یک receipt کوتاه در همین Change Log ثبت کند: تاریخ، تغییر، علت و در صورت repository change، SHA/PR مربوطه.
