
# 52. Project Operating System — اصل استفاده حداکثری از ظرفیت تیم و Chatها

این سند فقط برای نگهداری وضعیت نیست؛ باید مانند **Operating System پروژه** عمل کند.

هدف از استفاده از چند Chat / Agent:
- افزایش throughput بدون افزایش chaos
- تقسیم واقعی کار، نه تقسیم صرفاً اسمی
- استفاده از تخصص‌های متفاوت
- کشف خطا از چند زاویه
- کاهش زمان انتظار
- جلوگیری از دوباره‌کاری
- حفظ یک Truth واحد
- تبدیل خروجی هر agent به evidence قابل استفاده

**اصل مهم:** تعداد بیشتر agent به‌تنهایی سرعت را زیاد نمی‌کند. Parallelism فقط وقتی مجاز است که dependency، ownership، scope و integration point روشن باشند.

---

# 53. Capacity Management — استفاده هوشمند از Chatها

برای هر کار ابتدا تعیین شود:
1. آیا نیاز به یک executor دارد یا چند executor؟
2. آیا کار قابل parallel شدن است؟
3. آیا dependency دارد؟
4. آیا فایل/invariant مشترک دارد؟
5. آیا یک reviewer مستقل لازم است؟
6. آیا یک agent بهتر است کل مسیر را end-to-end بگیرد؟
7. آیا تقسیم کار هزینه coordination را بیشتر از سود parallelism می‌کند؟

## الگوهای مجاز

### Sequential
برای کارهایی که strongly dependent هستند.

A → B → C

### Parallel / Independent
برای scopeهای واقعاً مستقل.

A ─┐
B ─┼→ Reconcile → Integrate
C ─┘

### Executor + Reviewer
برای invariant حساس.

Executor → Independent Reviewer → Revalidation

### Discovery → Canonical Execution
برای ممیزی گسترده:

Multiple Discovery Agents → Reconciliation → One Canonical Fix Queue → Executors

**ممنوع:** چند agent همزمان یک invariant را مستقل اصلاح کنند بدون اینکه ownership و integration مشخص باشد.

---

# 54. Context Budget و جلوگیری از اتلاف ظرفیت

هر Chat/Agent باید context را مانند یک منبع محدود مدیریت کند.

قواعد:
- اطلاعات تکراری غیرضروری وارد context نشود.
- سند مادر وضعیت را خلاصه و به source تخصصی ارجاع دهد.
- قبل از خواندن فایل بزرگ، ابتدا search/find هدفمند انجام شود.
- فقط بخش مرتبط فایل خوانده شود مگر full review لازم باشد.
- گزارش‌های طولانی بدون finding/action/evidence جدید ارزش اجرایی ندارند.
- هر handoff باید با یک وضعیت فشرده و machine-readable انجام شود.
- در صورت نزدیک شدن به محدودیت context، handoff قبل از از دست رفتن state انجام شود.

### Handoff Minimum Packet

MISSION / OWNER / CURRENT HEAD / BASE SHA / TARGET / DONE / OPEN / BLOCKER / EVIDENCE / NEXT ACTION

هدف: Chat جدید بتواند بدون بازسازی کورکورانه کل تاریخچه ادامه دهد.

---

# 55. Mission Contract — هر Chat دقیقاً بداند چرا وجود دارد

هیچ Chat/Agent نباید با مأموریت مبهم شروع شود.

Mission باید مشخص کند:
- Objective
- Business/technical outcome
- Scope
- Non-scope
- Inputs
- Files/areas
- Invariants
- Dependencies
- Forbidden changes
- Required tests
- Required evidence
- Delivery target
- Reviewer
- Exit criteria

اگر mission فقط «بررسی کن» است، باید تبدیل شود به finding taxonomy و output contract مشخص.

---

# 56. Workstream Ownership Matrix

برای هر حوزه باید فقط یک **primary owner** وجود داشته باشد؛ reviewer می‌تواند جدا باشد.

الگوی ثبت:

| Workstream | Primary Owner | Reviewer | Base SHA | Target | Status |
|---|---|---|---|---|---|
| Domain / Defect | مشخص شود | مستقل | SHA | branch/PR | status |
| Frontend | مشخص شود | مستقل | SHA | branch/PR | status |
| Backend | مشخص شود | مستقل | SHA | branch/PR | status |
| DB / Migration | مشخص شود | مستقل | SHA | branch/PR | status |
| Security | مشخص شود | مستقل | SHA | branch/PR | status |
| QA / Evidence | مشخص شود | مستقل | SHA | branch/PR | status |
| Infra / Operations | مشخص شود | مستقل | SHA | branch/PR | status |

**این جدول نمونه است و نباید به‌عنوان وضعیت واقعی تفسیر شود.**

---

# 57. Dependency Graph و Critical Path

هر mission مهم باید dependencyهای خود را ثبت کند.

Root Cause → Fix → Regression → Integration → Runtime → Certification

مهندس ناظر باید تشخیص دهد:
- چه کاری blocker اصلی است؟
- چه کارهایی مستقل و قابل parallel هستند؟
- کدام کار روی critical path است؟
- کدام agent منتظر کدام خروجی است؟
- آیا parallel work واقعاً زمان را کم می‌کند؟

**اولویت با باز کردن bottleneck واقعی است، نه بیشترین تعداد task همزمان.**

---

# 58. Evidence Ledger — دفتر شواهد

هر ادعای مهم باید به evidence قابل ردیابی وصل باشد.

CLAIM → TEST/OBSERVATION → ARTIFACT → SHA → DATE → ENVIRONMENT → OWNER → REVIEWER → STATUS

مثال:
- bug fixed
- migration valid
- authorization closed
- performance acceptable
- recovery successful
- feature complete
- production ready

اگر evidence به SHA یا environment مشخص bind نشده باشد، claim باید **UNVERIFIED** بماند.

---

# 59. Assumption Register — ثبت فرضیات

هر جا تصمیم بر اساس فرض گرفته می‌شود، فرض باید ثبت شود.

ASSUMPTION / WHY / IMPACT / HOW TO VERIFY / OWNER / STATUS

فرض تأییدنشده نباید به‌عنوان fact وارد roadmap، certification یا architecture decision شود.

ASSUMPTION → VERIFIED / INVALIDATED → UPDATE DEPENDENT DECISIONS

---

# 60. Decision Quality Gate

برای تصمیم‌های معماری، امنیتی، داده‌ای و عملیاتی ثبت شود:
- Problem
- Options considered
- Constraints
- Evidence
- Decision
- Rejected alternatives
- Consequences
- Rollback/reversal path
- Owner
- Date
- Affected components

تصمیمی که فقط در conversation باقی مانده و روی repository اثر دارد، باید به Decision Log منتقل شود.

---

# 61. Change Impact Analysis

قبل از تغییر مهم:

CHANGE → AFFECTED COMPONENTS → CONTRACTS → TESTS → DOCS → AGENTS → DEPLOYMENT → DATA → ROLLBACK

حداقل این موارد بررسی شوند:
- API
- UI
- Sync/offline
- Authorization
- DB/schema
- migrations
- workers/outbox
- cache
- observability
- tests
- docs
- deployment
- compatibility

**کوچک بودن diff به معنی کوچک بودن impact نیست.**

---

# 62. Compatibility و Migration Safety

هر تغییر contract باید مشخص کند:
- backward compatible است یا نه؛
- consumerهای فعلی چه هستند؛
- migration چند مرحله دارد؛
- rollback چگونه انجام می‌شود؛
- داده قدیمی چگونه مدیریت می‌شود؛
- mixed-version deployment چه اثری دارد.

برای schema/APIهای حساس:

Expand → Migrate → Verify → Contract Switch → Cleanup

تا زمانی که compatibility اثبات نشده، destructive migration ممنوع است.

---

# 63. Rollback / Recovery Contract

هر تغییر مادی باید rollback strategy داشته باشد، حتی اگر strategy آن «rollback not applicable» باشد و دلیل ثبت شود.

باید مشخص باشد:
- چه چیزی rollback می‌شود؟
- چگونه؟
- تا چه نقطه‌ای؟
- داده چگونه recover می‌شود؟
- آیا rollback خودش data loss ایجاد می‌کند؟
- چه evidenceای موفقیت recovery را ثابت می‌کند؟

برای تغییرات پرریسک:

Backup/Checkpoint → Change → Verify → Failure Injection → Recovery → Re-verify

---

# 64. Incident / Regression Response

اگر بعد از تغییر regression یا incident پیدا شد:

DETECT → FREEZE AFFECTED WORK → IDENTIFY LAST GOOD SHA → CONTAIN → ROOT CAUSE → FIX → REGRESSION → REVALIDATE → DOCUMENT

مهندس ناظر باید مشخص کند:
- آخرین وضعیت سالم چه بوده؛
- کدام تغییر باعث divergence شده؛
- آیا defect جدید است یا recurrence؛
- آیا سایر workstreamها تحت تأثیرند؛
- آیا evidence قبلی invalid شده است.

در incident مهم، statusهای مرتبط باید تا revalidation به **NOT VERIFIED / REVALIDATION_REQUIRED** برگردند.

---

# 65. Regression Blast-Radius Rule

هر defect یا change فقط در فایل خودش بررسی نشود.

باید پرسیده شود:

> «این invariant در کجاهای دیگری هم وجود دارد؟»

جست‌وجوی blast radius حداقل شامل:
- callers
- routes
- services
- policy
- persistence
- sync
- workers
- tests
- UI
- legacy paths
- alternate endpoints

باشد.

Fix باید بر اساس invariant باشد، نه صرفاً line/filename.

---

# 66. Contract Registry

برای قراردادهای مهم یک مرجع canonical وجود داشته باشد:
- API contract
- Sync contract
- Auth policy
- DB schema/migration contract
- event/outbox contract
- client/server version contract
- error/status contract
- conflict/OCC contract

اگر دو فایل دو تعریف متفاوت از یک contract دارند، یکی باید canonical و دیگری derived باشد.

**Parallel Contract Sources ممنوع.**

---

# 67. API / Sync Parity Rule

هر business invariant که هم REST و هم Sync آن را اجرا می‌کنند باید یک policy/contract مشترک یا یک معادل قابل اثبات داشته باشد.

برای هر invariant:

REST Positive + REST Negative + Sync Positive + Sync Negative + Cross-Tenant + Persistence

عدم parity باید finding محسوب شود.

---

# 68. Offline / Distributed State Rule

در قابلیت‌های offline/distributed باید همیشه روشن باشد:
- local source چیست؟
- server source of truth چیست؟
- version چیست؟
- conflict rule چیست؟
- replay/idempotency چیست؟
- ordering چگونه حفظ می‌شود؟
- restart چه می‌کند؟
- duplicate message چه می‌کند؟
- eventual consistency کجا مجاز است؟

هیچ رفتار distributed نباید فقط با happy-path اثبات شود.

---

# 69. Performance / Capacity Rule

Performance فقط وقتی بررسی شود که workload و acceptance criteria مشخص باشند.

حداقل در صورت نیاز:
- baseline
- workload model
- concurrency
- latency
- throughput
- error rate
- resource usage
- saturation point
- degradation behavior
- recovery

تست performance بدون workload واقعی یا قابل توجیه، evidence کامل محسوب نمی‌شود.

---

# 70. Observability Rule

برای هر capability مهم باید بدانیم در production چگونه تشخیص می‌دهیم:
- request failure
- authorization failure
- data inconsistency
- queue backlog
- worker failure
- latency degradation
- DB pressure
- cache failure
- sync conflict
- recovery failure

هر critical path باید حداقل log/metric/trace مناسب یا دلیل مستند برای نبود آن داشته باشد.

---

# 71. Security Hygiene

همه Chatها و Agentها باید این موارد را رعایت کنند:
- secret/token/password هرگز در repository ذخیره نشود؛
- secret در report/log/evidence چاپ نشود؛
- credential در source code hardcode نشود؛
- test fixture حساسیت واقعی نداشته باشد؛
- access حداقلی و هدفمند باشد؛
- داده شخصی/حساس فقط در حد نیاز استفاده شود؛
- در صورت مشاهده secret leak، **STOP + ROTATE/REVOKE + REMEDIATE + AUDIT**.

**هیچ agent نباید credential را به‌عنوان بخشی از context کاری دائمی نگه دارد.**

---

# 72. Reproducibility Rule

هر finding یا test مهم باید تا حد امکان قابل بازتولید باشد.

SHA / COMMAND / ENVIRONMENT / INPUT / EXPECTED / ACTUAL / RESULT

«من اجرا کردم و درست بود» evidence کافی نیست.

---

# 73. Environment Matrix

اگر رفتار به environment وابسته است، محیط باید صریح باشد:
- local
- CI
- staging
- production-like
- production
- PostgreSQL واقعی / mock / pg-mem
- Redis واقعی / mock
- browser/runtime version
- Node version

PASS در یک environment نباید به environment دیگر تعمیم داده شود مگر contract آن را اثبات کند.

---

# 74. Test Data Integrity

Test data باید مشخص کند:
- seed source
- ownership/tenant
- role
- expected invariants
- cleanup strategy
- deterministic بودن یا نبودن

Test نباید با fixture تصادفی یا stale به‌صورت غیرقابل تشخیص سبز شود.

---

# 75. Flaky Test Protocol

هر test flaky باید:

DETECT → REPRODUCE → CLASSIFY → FIX ROOT CAUSE → STABILIZE → RE-RUN

Flaky test نباید بی‌سر و صدا skip شود.

اگر موقتاً quarantine شد:
- owner
- reason
- ticket/defect
- expiration/review date
- impact

ثبت شود.

---

# 76. Dependency Hygiene

برای dependencyهای جدید باید:
- دلیل نیاز
- جایگزین‌های بررسی‌شده
- license/compatibility
- security posture
- maintenance status
- bundle/runtime impact
- migration/rollback

مشخص باشد.

Dependency فقط برای «مدرن‌تر شدن» اضافه نشود.

Dependency حذف‌شده نیز باید اثراتش بررسی و مستند شود.

---

# 77. Documentation as Code

مستندات مهم باید مانند code مدیریت شوند:
- owner
- status
- source of truth
- change history
- current relevance
- affected version/SHA در صورت نیاز

مستندات stale باید علامت‌گذاری، اصلاح یا archive شوند؛ نباید به‌عنوان current truth باقی بمانند.

---

# 78. Stale Information Sweeper

در هر synchronization مهم، مهندس ناظر باید دنبال stale information بگردد:
- current HEAD قدیمی
- status قدیمی
- agent owner قدیمی
- PR بسته‌شده ولی هنوز open نشان داده‌شده
- defect رفع‌شده ولی active نشان داده‌شده
- feature implemented ولی planned نشان داده‌شده
- evidence مربوط به SHA قدیمی
- documentation خلاف code

هدف:

**No stale truth.**

---

# 79. Knowledge Compression Rule

اطلاعات پروژه باید به‌صورت لایه‌ای نگهداری شود:

PREQUISITES → INDEX/STATUS → SPECIALIZED DOC → RAW EVIDENCE

از کپی کردن یک متن طولانی در چند فایل پرهیز شود.

به‌جای duplicate content:
- canonical source
- link/reference
- short status
- last verified SHA

ثبت شود.

---

# 80. Learning Loop

هر خطای جدی فقط با fix تمام نمی‌شود.

بعد از defect مهم بررسی شود:
1. چرا ایجاد شد؟
2. چرا زودتر کشف نشد؟
3. کدام test/gate آن را از دست داد؟
4. کدام invariant باید صریح‌تر می‌شد؟
5. آیا process باید تغییر کند؟
6. آیا documentation باید تغییر کند؟
7. آیا agent mission باید تغییر کند؟
8. آیا recurring regression لازم است؟

خروجی:

DEFECT → ROOT CAUSE → PROCESS LESSON → NEW GUARD → REGRESSION

هدف این است که **همان نوع خطا دوباره با همان مسیر وارد پروژه نشود.**

---

# 81. Automation First, Judgment Always

هر کار تکراری که با automation قابل اطمینان است، تا حد امکان automated شود:
- status checks
- branch/PR reconciliation
- test inventory
- stale reference detection
- duplicate detection
- schema/migration checks
- syntax checks
- documentation consistency checks
- evidence indexing

اما automation جای judgment مهندسی را نمی‌گیرد.

Automation false-green باید مانند test false-green با severity بالا برخورد شود.

---

# 82. Human Decision Gate

تصمیم‌های پرریسک یا غیرقابل برگشت بدون مشخص شدن approval requirement انجام نشوند.

نمونه‌ها:
- destructive migration
- حذف داده
- تغییر source of truth
- معماری جدید
- حذف legacy path
- تغییر authorization model
- production deployment
- تغییر recovery strategy

اگر user approval لازم است:

**BLOCKED — WAITING FOR USER DECISION**

و تصمیم باید بعداً در Decision Log ثبت شود.

---

# 83. Scope Creep Firewall

در حین اجرای mission اگر کار جدیدی پیدا شد:

FOUND → CLASSIFY → LINK TO EXISTING ITEM OR CREATE NEW ITEM → PRIORITIZE → ASSIGN

ممنوع است که agent وسط mission scope را بی‌صدا گسترش دهد و چند کار را بدون ثبت انجام دهد.

Exception فقط برای:
- security-critical blocker
- data-corruption risk
- build-breaking issue

است که باید فوری گزارش و synchronize شود.

---

# 84. Priority Model

اولویت فقط بر اساس «بلندترین لیست» تعیین نشود.

ترتیب ارزیابی:

Safety / Data Integrity → Security → Blocker → Root Cause → Reliability → Correctness → Performance → Maintainability → Convenience

در هر مورد:

Severity × Reach × Recurrence × Uncertainty × Dependency

به‌صورت کیفی بررسی شود.

این مدل برای **اولویت اجرایی** است، نه امتیازدهی یا حذف evidence.

---

# 85. Uncertainty Register

اگر چیزی نامعلوم است، نباید با حدس به fact تبدیل شود.

ثبت:

UNKNOWN / WHY UNKNOWN / IMPACT / HOW TO RESOLVE / OWNER / DEADLINE / STATUS

سطوح:
- CONFIRMED
- PROBABLE
- SUSPECTED
- UNKNOWN
- DISPROVED

گزارش agent می‌تواند finding را به SUSPECTED برساند؛ repository/evidence لازم است تا CONFIRMED شود.

---

# 86. Review Independence Rule

Reviewer نباید صرفاً copy/paste یا تکرار گزارش executor باشد.

Reviewer باید حداقل یک مسیر مستقل داشته باشد:
- source inspection
- alternate test
- adversarial test
- runtime observation
- different environment
- independent reproduction

هدف: جلوگیری از common-mode failure.

---

# 87. Four-Eyes Rule برای تغییرات حساس

برای تغییرات پرریسک، حداقل دو نگاه مستقل لازم است:

Author → Independent Review → Integration

برای تغییرات بسیار حساس:

Author → Domain Review → Security/QA Review → Integration

سطح review باید متناسب با risk باشد.

---

# 88. Branch Lifecycle

هر branch باید lifecycle داشته باشد:

CREATE → BASE → WORK → TEST → REVIEW → INTEGRATE → VERIFY → CLOSE

branchهای stale باید:
- merge
- close
- archive
- یا formally retained with reason

باشند.

هیچ branch قدیمی نباید بدون owner و purpose در پروژه باقی بماند.

---

# 89. Merge Safety

قبل از merge:
- base current است؟
- conflict resolve شده؟
- intended changes باقی مانده؟
- unintended changes وارد نشده؟
- tests روی merge result قابل قبول‌اند؟
- docs/evidence affected شده؟
- بعد از merge current main read-back شده؟

**Merge خودش verification نیست.**

---

# 90. Post-Merge Verification

هر merge مهم:

MERGE → READ CURRENT HEAD → DIFF INTENT → RUN REQUIRED CHECKS → VERIFY EVIDENCE → SYNC MEMORY

اگر merge result با intent متفاوت است، وضعیت باید **REVALIDATION_REQUIRED** شود.

---

# 91. Release Train Discipline

برای releaseهای آینده:
- scope freeze
- release candidate SHA
- changelog
- migration plan
- rollback plan
- test inventory
- known limitations
- security review
- operational checklist
- deployment evidence
- post-deploy verification

ثبت شود.

Release candidate نباید همزمان محل تغییرات نامرتبط و uncontrolled باشد.

---

# 92. Production Readiness Gate

قبل از production readiness باید بررسی شود:
- functional completeness
- authorization/security
- data integrity
- migrations
- backup/restore
- observability
- alerting
- rate limits
- capacity
- failure/recovery
- deployment/rollback
- documentation
- support/runbook
- incident response
- user/admin handoff

تا همه mandatory acceptance criteria تعیین تکلیف نشده‌اند:

**NOT PRODUCTION READY**

---

# 93. Operational Runbook Requirement

قابلیت‌های عملیاتی مهم باید runbook داشته باشند:
- startup
- shutdown
- deployment
- rollback
- backup
- restore
- migration
- failure diagnosis
- queue recovery
- cache recovery
- incident escalation
- health verification

توسعه‌دهنده باید بتواند بعد از تحویل، سیستم را اداره کند؛ نه فقط compile کند.

---

# 94. Supportability Rule

برای هر قابلیت production-grade باید مشخص باشد:
- owner
- support contact/process
- known failure modes
- diagnostic signals
- recovery action
- escalation path

قابلیتی که فقط سازنده‌اش می‌تواند آن را debug کند، discoverability و operational maturity کافی ندارد.

---

# 95. End-of-Day / End-of-Session Reconciliation

در پایان هر نشست کاری مهم:
1. current HEAD دوباره خوانده شود؛
2. branch/PR state بررسی شود؛
3. mission statusها sync شوند؛
4. evidence ثبت شود؛
5. stale information اصلاح شود؛
6. blockers مشخص شوند؛
7. next action مشخص شود؛
8. owner/handoff ثبت شود؛
9. PREQUISITES در صورت material change update شود؛
10. مسیر canonical برای نشست بعدی روشن باشد.

هدف:

> **هیچ نشست مهمی با وضعیت مبهم، مالکیت نامعلوم یا HEAD نامعلوم تمام نشود.**

---

# 96. Pre-Action / Post-Action Self-Check مهندس ناظر

## قبل از اقدام

TRUTH → SCOPE → OWNER → DEPENDENCY → RISK → EVIDENCE → DELIVERY

## بعد از اقدام

DIFF → TEST → EVIDENCE → REMOTE → CURRENT HEAD → DOC SYNC → NEXT STATE

مهندس ناظر نباید صرفاً «دستور اجرا» را دنبال کند؛ باید صحت زنجیره را کنترل کند.

---

# 97. Project Integrity Invariants

این invariants در تمام مدت پروژه باید برقرار باشند:
1. یک Canonical Main HEAD
2. یک Truth hierarchy مشخص
3. یک owner برای هر workstream
4. یک canonical contract برای هر invariant مهم
5. هیچ DONE بدون evidence لازم
6. هیچ PASS بدون execution واقعی
7. هیچ merge بدون reconciliation
8. هیچ defect مهم بدون disposition
9. هیچ migration حساس بدون rollback strategy
10. هیچ production readiness بدون operational evidence
11. هیچ secret در repository/log/report
12. هیچ parallel work بدون ownership/dependency contract
13. هیچ stale status به‌عنوان current truth
14. هیچ duplicate implementation برای یک responsibility بدون دلیل معماری
15. هیچ مسیر کاری که از canonical main جدا شده و بدون reconciliation ادامه یابد

---

# 98. Maximum Useful Parallelism Rule

هدف استفاده از حداکثر ظرفیت Chatها نیست؛ هدف استفاده از **حداکثر ظرفیت مفید** است.

Useful Throughput = Parallel Work − Coordination Cost − Rework − Integration Risk

اگر افزایش agent باعث افزایش conflict، duplicate work یا review burden شود، parallelism باید کاهش یابد.

اصل:

> **کمترین تعداد agent لازم برای بیشترین خروجی قابل‌اعتماد.**

---

# 99. No Lost Work Rule

هیچ خروجی مفید agent نباید بدون تعیین تکلیف ناپدید شود.

اگر workstream بسته شد یا owner تغییر کرد:

CAPTURE → CLASSIFY → TRANSFER / MERGE / ARCHIVE → VERIFY

برای هر خروجی:
- implemented
- pending
- duplicate
- superseded
- rejected
- blocked

مشخص شود.

---

# 100. Project Completion Reconciliation

قبل از اعلام پایان پروژه، مهندس ناظر باید مستقل از task list، یک inventory نهایی انجام دهد:

ROADMAP ↔ FEATURES ↔ ROLES ↔ API ↔ SYNC ↔ DATA ↔ SECURITY ↔ TESTS ↔ OPS ↔ DOCS ↔ DEPLOYMENT

سپس:
- open defects
- known limitations
- deferred capabilities
- operational gaps
- stale docs
- stale branches
- unresolved evidence

مشخص شوند.

**PROJECT_COMPLETE فقط وقتی مجاز است که این reconciliation با acceptance criteria نهایی سازگار باشد.**

---

# 101. اصل نهایی — کیفیت، سرعت و حافظه باید همزمان حفظ شوند

سه هدف پروژه همزمان هستند:

### Quality
کار درست، امن، قابل تست و قابل اثبات باشد.

### Speed
گلوگاه‌ها باز شوند، کار مستقل parallel شود و coordination بی‌فایده حذف شود.

### Continuity
هیچ دانش، تصمیم، evidence، ownership یا وضعیت مهمی با پایان یک Chat از بین نرود.

اگر یکی از این سه قربانی دیگری شود، سیستم اجرایی باید اصلاح شود.

اصل نهایی:

> **ما فقط کد تولید نمی‌کنیم؛ یک سیستم مهندسی قابل‌ردیابی می‌سازیم که بتواند خودش را در برابر خطا، دوباره‌کاری، تغییر، چند-Agent بودن و رشد آینده کنترل کند.**

---

# 102. Change Log — افزوده‌های تکمیلی

| تاریخ | تغییر | دلیل |
|---|---|---|
| 2026-09-26 | افزودن Project Operating System، Capacity Management، Context/Handoff، Mission Contract، Ownership Matrix، Dependency/Critical Path، Evidence Ledger و Assumption Register | استفاده مؤثرتر از ظرفیت چند Chat و جلوگیری از ambiguity و اتلاف context |
| 2026-09-26 | افزودن Change Impact، Compatibility/Migration، Rollback/Recovery، Incident/Regression، Contract Registry، REST/Sync parity و Distributed-State rules | کاهش regression، migration failure و نقص‌های مسیرهای جایگزین |
| 2026-09-26 | افزودن Observability، Security Hygiene، Reproducibility، Environment Matrix، Test Data، Flaky Test، Dependency و Documentation hygiene | افزایش قابلیت اثبات، پشتیبانی و کیفیت عملیاتی |
| 2026-09-26 | افزودن Learning Loop، Automation، Human Decision Gate، Scope Firewall، Priority/Uncertainty، Independent Review و Four-Eyes | تبدیل خطاها به guard دائمی و کنترل تصمیم‌های پرریسک |
| 2026-09-26 | افزودن Branch/Merge/Release/Production/Runbook/Support discipline، Session reconciliation، Integrity Invariants و Maximum Useful Parallelism | جلوگیری از چند-HEAD، از دست رفتن کار و رسیدن ناقص به بهره‌برداری |

**قاعده:** هر update بعدی باید receipt کوتاه، اثر تغییر، و در صورت repository change، SHA/PR مربوطه را ثبت کند.
