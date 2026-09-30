
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


# 103. Report-Driven Supervisor Protocol — قانون اجباری پس از دریافت هر گزارش

از این بخش به بعد، **هر گزارشی که کاربر برای مهندس ناظر ارسال می‌کند** یک Trigger رسمی برای چرخهٔ کنترل پروژه است. این قانون باید بدون یادآوری مجدد کاربر، هم توسط مهندس ناظر و هم توسط هر Chat/Agent که در پروژه نقش اجرایی یا نظارتی دارد رعایت شود.

## 103.1 اصل Trigger

به‌محض دریافت هر گزارش:

**REPORT RECEIVED → READ PREQUISITES → RECONCILE PROJECT STATE → CHECK CURRENT HEAD → CLASSIFY REPORT → UPDATE STATUS → DETERMINE NEXT WORK → GENERATE MISSION PROMPTS → HANDOFF**

هیچ گزارش جدیدی نباید مستقیماً به اجرای کد، صدور مأموریت یا اعلام وضعیت منجر شود، مگر اینکه این چرخه طی شده باشد.

## 103.2 اولین اقدام اجباری مهندس ناظر

مهندس ناظر باید ابتدا:

1. `docs/PREQUISITES.md` را به‌عنوان سند مادر بررسی کند؛
2. وضعیت فعلی `main` و Current HEAD را از repository بررسی کند؛
3. در صورت نیاز اسناد canonical مرتبط با گزارش را بخواند؛
4. گزارش را با Mission، Defect، Roadmap، Agent/Chat، PR/Branch و Evidence موجود تطبیق دهد؛
5. مشخص کند گزارش چه چیزی را **تغییر داده، تأیید کرده، رد کرده یا نیازمند revalidation کرده است**.

**ممنوع:** شروع تحلیل اجرایی صرفاً بر اساس متن گزارش، بدون بررسی PREQUISITES و Truth فعلی repository.

## 103.3 خروجی اجباری شماره ۱ — خلاصهٔ وضعیت با تیک

پس از reconciliation، مهندس ناظر باید قبل از هر پرامپت یا دستور اجرایی، یک خلاصهٔ کوتاه و تیک‌دار ارائه کند.

حداقل قالب:

- [x] **PREQUISITES بررسی شد**
- [x] **Current HEAD بررسی شد**
- [x] **گزارش با وضعیت پروژه تطبیق داده شد**
- [x] **Findingهای جدید / تکراری / رفع‌شده / نیازمند revalidation مشخص شد**
- [x] **Mission و Ownerهای تحت تأثیر مشخص شد**
- [x] **اثر گزارش بر Roadmap / Defect Queue / Evidence مشخص شد**
- [ ] **کار بعدی:** ...
- [ ] **Owner / Chat:** ...
- [ ] **Evidence موردنیاز:** ...

تیک `[x]` فقط برای کاری مجاز است که واقعاً بررسی یا انجام شده باشد؛ تیک نباید بر اساس فرض زده شود.

## 103.4 خروجی اجباری شماره ۲ — تشخیص خودکار کار بعدی

مهندس ناظر باید از روی **برنامهٔ کاری canonical** تشخیص دهد که پس از گزارش، چه اقدامی باید انجام شود.

ترتیب تصمیم:

**Current Truth → Open Defects → Dependencies → Blockers → Critical Path → Existing Missions → Next Safe Action**

اگر گزارش باعث تغییر priority یا dependency شود، برنامهٔ کاری باید با آن reconcile شود.

اگر کار بعدی از قبل در roadmap/execution plan تعریف شده باشد، نباید بدون دلیل یک task جدید و تکراری ساخته شود.

اگر کار جدید است:

**FOUND → CLASSIFY → LINK/CREATE → PRIORITIZE → ASSIGN**

## 103.5 خروجی اجباری شماره ۳ — تفکیک Chatهای موردنیاز

مهندس ناظر باید مشخص کند:
- آیا فقط یک Chat لازم است؟
- آیا چند Chat واقعاً مستقل هستند؟
- کدام Chat executor است؟
- کدام Chat reviewer مستقل است؟
- dependency بین Chatها چیست؟
- چه کاری نباید همزمان انجام شود؟
- integration point کجاست؟
- کدام Chat باید منتظر evidence Chat دیگر بماند؟

اصل:

> **هر Chat فقط وقتی مأموریت می‌گیرد که وجود آن نسبت به کار واحد یا Chat دیگر ارزش اجرایی مشخص داشته باشد.**

تعداد Chat بیشتر به‌خودی‌خود مزیت نیست.

## 103.6 قانون اجباری تولید Prompt برای هر Chat

هرگاه مهندس ناظر تشخیص دهد که یک یا چند Chat باید کاری انجام دهند، برای **هر Chat یک Prompt جداگانه** تولید شود.

Promptها باید مستقل، قابل کپی و بدون نیاز به توضیح شفاهی تکمیلی باشند.

هر Prompt حداقل باید شامل این موارد باشد:

1. نقش Chat
2. هدف دقیق
3. جملهٔ اجباری مطالعهٔ PREQUISITES
4. Current HEAD / Base SHA در صورت نیاز
5. Scope
6. Non-Scope
7. فایل‌ها/حوزه‌های مجاز
8. Invariant یا defect موردنظر
9. Dependency
10. ممنوعیت تغییرات خارج از scope
11. تست‌های لازم
12. Evidence لازم
13. نحوهٔ گزارش نهایی
14. Delivery target
15. شرط پایان Mission

## 103.7 جملهٔ اجباری ابتدای تمام Promptها

**اولین بخش عملیاتی هر Prompt که مهندس ناظر برای Chat/Agent تولید می‌کند باید صریحاً این دستور را داشته باشد:**

> **قبل از شروع هرگونه بررسی، تغییر، اجرا یا تصمیم‌گیری، ابتدا سند `docs/PREQUISITES.md` را کامل و دقیق مطالعه کن و قوانین، وضعیت پروژه، Truth hierarchy، Current HEAD، Mission/Ownership، Evidence و پروتکل‌های آن را مبنای اجباری کار خود قرار بده. تا این مطالعه و تطبیق با وضعیت فعلی repository انجام نشده، هیچ اقدام اجرایی انجام نده.**

این جمله باید در **اول هر Prompt** تکرار شود و حذف یا کوتاه‌سازی آن مجاز نیست.

پس از آن، Prompt باید در صورت نیاز مطالعهٔ این اسناد canonical را نیز الزام کند:

- `docs/external-memory/SUPERVISING_ENGINEER.md`
- `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md`
- `docs/CURRENT_PROJECT_INTELLIGENCE.md`
- `docs/CURRENT_WORK_EXECUTION_PLAN.md`
- `docs/external-memory/PROJECT_DASHBOARD.md`
- `docs/external-memory/DAILY_TASKS.md`
- `docs/external-memory/DECISION_LOG.md`
- اسناد audit/verification مرتبط با Mission

## 103.8 قانون «اول PREQUISITES، بعد کار» برای همهٔ Chatها

هر Chat/Agent موظف است قبل از اقدام:

**READ → UNDERSTAND → RECONCILE → ACKNOWLEDGE MISSION → ACT**

اگر Chat نتواند Current HEAD، scope، owner، dependency، evidence requirement یا ممنوعیت‌های Mission را از اسناد canonical تشخیص دهد:

**SUPERVISOR/AGENT BOOTSTRAP FAILED → NO EXECUTION → RE-READ CANONICAL DOCS → VERIFY CURRENT HEAD → CONTINUE ONLY AFTER BOOTSTRAP**

هیچ Chat مجاز نیست به دلیل طولانی بودن سند، آن را نادیده بگیرد و صرفاً بر اساس Prompt وارد اجرا شود.

## 103.9 قانون عدم نیاز به یادآوری کاربر

کاربر نباید هر بار یادآوری کند که:

- PREQUISITES مطالعه شود؛
- وضعیت فعلی بررسی شود؛
- گزارش reconcile شود؛
- کار بعدی از roadmap تشخیص داده شود؛
- Chat مناسب انتخاب شود؛
- Promptها جداگانه تولید شوند؛
- هر Prompt با دستور مطالعهٔ PREQUISITES شروع شود.

این‌ها **رفتارهای پیش‌فرض و اجباری سیستم اجرایی پروژه** هستند.

## 103.10 اگر گزارش ناقص یا مبهم باشد

اگر گزارش برای تصمیم اجرایی کافی نباشد:

**REPORT → IDENTIFY MISSING EVIDENCE → CLASSIFY UNKNOWN → DO NOT GUESS → REQUEST/GENERATE EVIDENCE MISSION**

مهندس ناظر نباید gap را با حدس پر کند.

## 103.11 اگر گزارش با PREQUISITES یا repository تناقض داشته باشد

ترتیب مرجع:

**CURRENT REPOSITORY / CURRENT EVIDENCE → CANONICAL PROJECT DOCS → REPORT → HISTORICAL MEMORY**

گزارش متناقض نباید بدون reconciliation به current truth تبدیل شود.

## 103.12 اگر گزارش باعث تغییر Mission شود

هر تغییر در:

- owner
- scope
- priority
- dependency
- blocker
- target
- current status
- evidence requirement
- branch/PR
- next action

باید همان زمان در منابع canonical مربوطه synchronize شود.

## 103.13 قالب استاندارد پاسخ مهندس ناظر پس از هر گزارش

مگر اینکه کاربر قالب دیگری بخواهد، پاسخ عملیاتی باید این ترتیب را داشته باشد:

### 1. وضعیت سریع
- [x] PREQUISITES
- [x] Current HEAD
- [x] Report reconciliation
- [x] Mission/Owner
- [x] Evidence
- [ ] Next action

### 2. نتیجهٔ گزارش
خلاصهٔ بسیار کوتاه از آنچه واقعاً تغییر کرده یا تأیید شده است.

### 3. وضعیت کار
فقط وضعیت‌های مستند:
**DONE / IN PROGRESS / BLOCKED / NOT VERIFIED / REVALIDATION_REQUIRED / NEXT**

### 4. برنامهٔ اقدام بعدی
به‌ترتیب dependency و critical path.

### 5. Promptهای Chatها
برای هر Chat یک Prompt جداگانه و کامل، با جملهٔ اجباری PREQUISITES در ابتدای آن.

### 6. Evidence / Delivery
مشخص شود چه evidence، SHA، test، branch/PR یا runtime verification بعداً لازم است.

## 103.14 قانون گزارش نهایی هر Chat به مهندس ناظر

هر Chat پس از Mission باید گزارشی ارائه کند که حداقل این موارد را داشته باشد:

**MISSION / OWNER / BASE SHA / CURRENT HEAD / STATUS / CHANGES / TESTS / EVIDENCE / COMMIT / PUSHED / PR / BLOCKERS / NEXT ACTION**

و گزارش آن Chat نیز باید توسط مهندس ناظر reconcile شود؛ گزارش Chat به‌تنهایی current truth نیست.

## 103.15 قانون زنجیرهٔ کامل

زنجیرهٔ استاندارد از لحظهٔ دریافت گزارش تا اجرای کار بعدی:

**USER REPORT**
→ **PREQUISITES CHECK**
→ **CURRENT HEAD CHECK**
→ **REPORT RECONCILIATION**
→ **TICKED STATUS SUMMARY**
→ **NEXT ACTION FROM WORK PLAN**
→ **CHAT/AGENT OWNERSHIP**
→ **SEPARATE PROMPTS**
→ **PREQUISITES-FIRST BOOTSTRAP**
→ **EXECUTION**
→ **TEST / EVIDENCE**
→ **REPORT**
→ **SUPERVISOR RECONCILIATION**
→ **PROJECT MEMORY SYNC**
→ **NEXT ACTION**

هیچ حلقه‌ای نباید بدون دلیل حذف شود.

## 103.16 Self-Enforcement

این پروتکل بخشی از **Project Integrity Invariants** محسوب می‌شود.

بنابراین:
- مهندس ناظر نمی‌تواند بگوید «کاربر یادآوری نکرد»؛
- Chat/Agent نمی‌تواند بگوید «در Prompt ذکر نشده بود»؛
- نبودن یادآوری کاربر، مجوز عبور از PREQUISITES نیست؛
- Prompt ناقص، Mission معتبر محسوب نمی‌شود؛
- گزارش بدون reconciliation، مبنای اعلام DONE/CERTIFIED نیست.

اصل:

> **PREQUISITES باید قبل از هر اقدام خوانده شود؛ گزارش باید قبل از هر اقدام reconcile شود؛ کار بعدی باید از Truth و برنامهٔ کاری استخراج شود؛ و هر Chat باید مأموریت مستقل و PREQUISITES-first داشته باشد.**

# 104. Change Log — Report-Driven Execution Protocol

| تاریخ | تغییر | دلیل |
|---|---|---|
| 2026-09-26 | افزودن Report-Driven Supervisor Protocol، تیک وضعیت، تشخیص خودکار Next Action، تفکیک Promptها و PREQUISITES-first bootstrap | تبدیل دریافت هر گزارش به یک چرخهٔ استاندارد و خودکار برای جلوگیری از فراموشی، دوباره‌کاری و اجرای بدون context |
| 2026-09-26 | اجباری کردن جملهٔ مطالعهٔ PREQUISITES در ابتدای هر Prompt و تعریف failure-to-bootstrap | تضمین رعایت قوانین توسط تمام Chat/Agentها بدون نیاز به یادآوری کاربر |


# 105. Runtime Incident — F1 server/index.js syntax corruption — 2026-09-26

## وضعیت

- **Incident:** اجرای `npm start` در Codespaces به SyntaxError در `server/index.js:250` متوقف شد.
- **Root Cause:** بدنهٔ fallback تابع `seedPgFromBootstrap()` در entrypoint از وسط expression قطع شده بود؛ بنابراین parser قبل از هرگونه DB/Redis readiness gate متوقف می‌شد.
- **Impact:** Server process اصلاً به مرحلهٔ `listen()` و اتصال runtime به PostgreSQL/Redis نمی‌رسید؛ در نتیجه Frontend می‌توانست بالا بیاید ولی API server قابل اجرا نبود.
- **Classification:** F1 / P0 / BUILD-BLOCKER / RUNTIME-BLOCKER.
- **Historical note:** همین corruption در چند HEAD قبلی نیز وجود داشت؛ بنابراین finding جدیدِ runtime است اما root cause جدیدی خارج از F1 محسوب نمی‌شود.

## اصلاح انجام‌شده

Commit canonical:
`3451b4cbe1ec51b9fd6a5016bd5d41aa32f05e16`

اصلاح شامل:
1. بازسازی fallback row-by-row با INSERT پارامتری.
2. جلوگیری از swallow شدن failureهای row-level.
3. realignment کردن PostgreSQL identity sequence بعد از seed هر table.
4. تبدیل failure هر row/sequence به `skipped`.
5. تبدیل `skipped > 0` به خطای صریح `bootstrap_seed_incomplete`.
6. بازگرداندن closure صحیح تابع `seedPgFromBootstrap()` پیش از readiness logic.

## Evidence status

- [x] Root cause از خطای واقعی Codespaces مشخص شد.
- [x] خرابی در source repository بازتولید/بازبینی شد.
- [x] اصلاح روی `main` ثبت شد.
- [x] بخش اصلاح‌شده از GitHub read-back شد.
- [ ] `node --check server/index.js` در Codespaces اجرا و PASS نشده است.
- [ ] `npm start` بعد از اصلاح اجرا و PASS نشده است.
- [ ] PostgreSQL واقعی در Codespaces متصل و readiness آن اثبات نشده است.
- [ ] Redis واقعی در Codespaces متصل و readiness آن اثبات نشده است.
- [ ] Frontend → Backend → PostgreSQL/Redis E2E هنوز Runtime-Verified نیست.

## قانون ادامهٔ این Incident

تا زمانی که این زنجیره در همان environment اثبات نشده:

`SOURCE FIX → node --check → npm start → health → readiness → API → PostgreSQL/Redis → Frontend E2E`

وضعیت **NOT VERIFIED / RUNTIME_VERIFIED نشده** باقی می‌ماند.

## دستور canonical برای Codespaces

پس از pull/sync آخرین `main`:

```bash
git pull --ff-only origin main
git rev-parse HEAD
node --check server/index.js
npm start
```

اگر `node --check` سبز شد ولی `npm start` متوقف شد، خطای بعدی باید به‌عنوان **next runtime blocker** ثبت و reconcile شود؛ نباید بدون evidence به سراغ تغییرات تصادفی در کد رفت.


# 106. Runtime Incident Follow-up — F1 fallback try/catch closure — 2026-09-26

## Report received

Codespaces was updated to canonical main and reported:

- git rev-parse HEAD = 2726c87c9049a0a49dab5998fdba467238f3557e
- node --check server/index.js failed at line 258 with:
  SyntaxError: Missing catch or finally after try
- npm start failed with the same parser error.

## Reconciliation

The first syntax corruption at line 250 was removed by commit 3451b4cbe1ec51b9fd6a5016bd5d41aa32f05e16, but the repaired fallback contained a second structural defect: the per-row outer try had no catch/finally.

Classification:
- F1 / P0
- BUILD-BLOCKER
- RUNTIME-BLOCKER
- same root-cause area; not a new independent defect

## Immediate remediation

Commit:
749b1532d3bc77dd7d7090e27a970b64ad30dee6

Change:
- closed the per-row fallback try with an explicit catch;
- row-level construction/execution failures increment skipped;
- preserves the existing fail-closed bootstrap_seed_incomplete gate.

## Evidence status

- [x] User-provided Codespaces evidence reconciled.
- [x] Current repository HEAD before remediation identified.
- [x] Root cause localized to the exact fallback block.
- [x] Source remediation committed to canonical main.
- [ ] node --check server/index.js after commit 749b1532... — pending Codespaces evidence.
- [ ] npm start after commit 749b1532... — pending.
- [ ] DB/Redis readiness — pending.
- [ ] API and Frontend → Backend → PostgreSQL/Redis E2E — pending.

## Mandatory next evidence

Codespaces must run:

    git pull --ff-only origin main
    git rev-parse HEAD
    node --check server/index.js
    npm start

Expected HEAD:
749b1532d3bc77dd7d7090e27a970b64ad30dee6

No RUNTIME_VERIFIED or DONE status is permitted until the post-fix runtime chain is evidenced.


# 107. Canonical HEAD update after F1 fallback closure — 2026-09-26

- Code remediation commit: 7a240d1ab5dcb98b97e86e981558d5923e392bb4
- Canonical main HEAD after code remediation: 7a240d1ab5dcb98b97e86e981558d5923e392bb4
- The repository blob for server/index.js was reconstructed from the known-good 2726c87 server blob and the missing outer row-level catch was added.
- Source-level syntax status: remediation is structurally complete; runtime syntax PASS still requires Codespaces evidence.
- Required next evidence remains: node --check server/index.js, then npm start, then health/readiness/API/DB/Redis/E2E.


# 108. F1 remediation re-opened: prior canonical code commit was malformed — 2026-09-26

The Codespaces evidence showed that the previous claimed F1 remediation was not actually syntactically valid at the canonical HEAD.

Observed sequence:
- `72309e514aca0a6522b5bd5a5f3f4a4611942366`: `node --check server/index.js` still failed at line 250 with `SyntaxError: Invalid or unexpected token`.
- GitHub inspection confirmed the malformed source remained in `server/index.js`; the `placeholders` expression was truncated inside a string literal.
- Therefore the previous source-level completion statement was invalidated and the F1 status remains **NOT VERIFIED / RUNTIME-BLOCKED**.

Corrective code commit:
`456c061ee709e8a24c1a3fa373e4f4ae4a6f8c9d`
Message:
`fix(bootstrap): repair malformed row fallback syntax`

Current canonical main HEAD:
`456c061ee709e8a24c1a3fa373e4f4ae4a6f8c9d`

Verified GitHub source state:
- `server/index.js` blob: `2c03ed769b8b1730fe0cc2bb76bb0830b4573149`
- fallback placeholder generation is complete;
- parameterized fallback INSERT is complete;
- nested row-level catch is present;
- outer fallback-row catch is present;
- sequence realignment block remains present.

Runtime status:
- [ ] Codespaces `node --check server/index.js`
- [ ] Codespaces `npm start`
- [ ] health/readiness
- [ ] API
- [ ] PostgreSQL
- [ ] Redis
- [ ] Frontend → Backend → PostgreSQL/Redis E2E

No `RUNTIME_VERIFIED`, `CERTIFIED`, or `DONE` status is permitted until current-HEAD runtime evidence is received.


# 109. F1 Boot Crash Resolved & Five-Pass Verification — 2026-09-26

## Incident Summary

- **HEAD Audited:** `44014a2ee7b87bdd3e1aa38bfc70b52b84c13400`
- **Reported Error:** `node --check server/index.js` failed at line 373 with `SyntaxError: Unexpected token ')'` at `}).catch(err => {`.
- **Secondary Defect:** Line 1994 failed with `SyntaxError: Unexpected token ')'` due to repeated multi-thousand line file duplications and fragment appends (`+ (n + 1)).join(', ');`).

## Root Cause Analysis

1. **Unclosed `seedPgFromBootstrap` Function:**
   In commit `456c061` and predecessors, the closing brace `}` for `async function seedPgFromBootstrap(store, db)` was omitted after the collection iteration loop. Consequently, all subsequent `dbReady` promises, conditional checks, and hydrations were lexically nested inside `seedPgFromBootstrap()`. When the parser reached line 373 (`}).catch(err => {`), it encountered a syntax error because `seedPgFromBootstrap` was never terminated.
2. **Structural Misplacement in Bootstrap Seed:**
   Sequence realignment (`SELECT pg_get_serial_sequence`) was improperly placed inside the row fallback `catch (e)` block rather than executing once per table across all chunks. Furthermore, the `skipped > 0` validation and `return` statement were trapped inside the table iteration loop, which would prematurely terminate after the first table.
3. **Repeated File Concatenation (Trailing Garbage):**
   The repository blob for `server/index.js` had ballooned from 1,992 lines to 14,205 lines due to repeated accidental file appends after `module.exports`.

## Remediation

1. Restored proper structural closure `}` for `seedPgFromBootstrap(store, db)`.
2. Structured sequence realignment to execute per collection after all chunks complete.
3. Positioned fail-closed error check (`if (skipped > 0) throw e`) and `{ rows, tables, skipped }` return after all collections complete.
4. Cleaned up all 12,212 trailing redundant lines after `module.exports = { ... };`.

## Five-Pass Zero-Trust Verification (`tests/f1-boot-syntax-five-pass.js`)

- **Pass 1 (Functional): VERIFIED**
  - `node --check server/index.js` exited 0 (clean syntax).
  - Server process booted live in child process and responded 200 OK to `/api/health`, `/api/readiness`, `/api/liveness`.
- **Pass 2 (Boundary): VERIFIED**
  - Module exports (`server`, `store`, `db`, `__drainForTests`, `__gcStoreForTests`) validated.
- **Pass 3 (Negative/Failure): VERIFIED**
  - Production mode without `DATABASE_URL` asserted to fail fast with non-zero exit code (exit 1).
- **Pass 4 (Concurrency/Chaos/Recovery): VERIFIED**
  - 50 concurrent HTTP requests resolved cleanly with 200 OK.
  - Graceful SIGTERM shutdown completed in 56ms with clean connection draining.
- **Pass 5 (Independent Regression): VERIFIED**
  - Backend API regression runner `tests/api/runner.js` executed 30/30 suites passing with 0 errors.
  - Zero syntax corruption fragments remaining in `server/index.js`.


# 110. Repository synchronization after PR #420 / Codespace export — 2026-09-26

## Current repository truth

- Repository HEAD before this documentation-only synchronization commit: `a78b835ce0580a0e7ee9ce7cc80e9539b8b1a9eb`
- Current canonical main HEAD after synchronization: `85dd575ee3bb5ad6b77dde1a85772540c3d09295`
- PR #420: merged
- PR #420 title: `Pending changes exported from your codespace`
- Merge commit: `a78b835ce0580a0e7ee9ce7cc80e9539b8b1a9eb`
- The previous supervisor snapshot was `44014a2ee7b87bdd3e1aa38bfc70b52b84c13400`.
- Comparison `44014a2e... → a78b835c...`: 3 commits ahead, 0 behind.

## Changes reconciled

### 1. F1 / server entrypoint structural repair
`server/index.js` changed from the malformed/duplicated state to a structurally closed bootstrap path:
- restored closure of `seedPgFromBootstrap(store, db)`;
- moved sequence realignment outside the row fallback catch so it runs per table after chunk processing;
- moved the fail-closed `skipped > 0` check and return outside the collection loop;
- removed approximately 12,212 trailing duplicated/corrupted lines after `module.exports`;
- current `server/index.js` blob: `e2c9327b906d409efa9c931f283b0f2798cac33b`.

### 2. Formal F1 five-pass verification artifact added
New file:
`tests/f1-boot-syntax-five-pass.js`

The committed verification suite covers:
- syntax check and live health/readiness/liveness boot;
- module/export boundary checks;
- production fail-fast without `DATABASE_URL`;
- 50 concurrent HTTP requests and graceful SIGTERM shutdown;
- API regression runner and server-file integrity checks.

The repository documentation reports all five passes as VERIFIED. This is **reported repository evidence**, not an independent supervisor certification; current-head evidence must still be distinguished from self-reported/committed test claims.

### 3. Offline pull / version-order hardening
The codespace export also modified the generated/distribution artifacts:
- `index.html`
- `USER_GUIDE.html`

Changes include:
- added `_VERSIONED_C` collection version metadata;
- added `PULL_APPLIED_TIME` watermark;
- reject stale pull responses by server timestamp;
- preserve queued/pending local rows when incoming full snapshots are older by version/timestamp;
- reject incoming records whose version is older than the locally stored version;
- return `stale_pull` when a pull response is rejected.

This maps directly to the existing hardening queue around **A-18/A-24 and FND-07/NCR-16 (LWW/base_version/pull ordering)** and must be revalidated with adversarial offline/concurrency/replay tests. It is not a new independent defect unless later evidence shows a distinct root cause.

### 4. Build artifact synchronization
- `USER_GUIDE.html` build marker changed from `02bc229ecf35` to `ed8e7c00b38a`.
- `index.html` contains the corresponding sync/version-order changes.
- These generated-artifact changes must remain synchronized with the source/build contract.

## Status reconciliation

- F1 source remediation: **FIXED-SCOPED / repository-verified; runtime evidence is represented by the committed five-pass report but remains subject to independent re-run.**
- F1 five-pass suite: **PRESENT / reported VERIFIED; independently re-run = pending.**
- Offline pull/LWW hardening: **FIXED-SCOPED / adversarial revalidation pending.**
- Current project phase remains **HARDENING / ROOT-CAUSE REMEDIATION — NOT VERIFIED**.
- No broad certification is inferred from PR #420 or its committed verification claims.

## Mandatory next verification

At current HEAD `a78b835ce0580a0e7ee9ce7cc80e9539b8b1a9eb`:
1. run `node --check server/index.js`;
2. run `node tests/f1-boot-syntax-five-pass.js`;
3. run the relevant API/test integrity gates;
4. revalidate offline pull ordering, replay, version conflict, and stale-response paths;
5. then continue health/readiness → API → PostgreSQL → Redis → Frontend → Backend → PostgreSQL/Redis E2E.

No historical HEAD or committed test claim may be promoted to `CERTIFIED` without current-head execution evidence and the required independent/adversarial passes.


# 111. Structural Decoupling of seedPgFromBootstrap and Explicit dbReady Chain — 2026-09-26

## Objective & Scope

Following the successful repository merge of the syntax repair in PR #420 / commit `a78b835`, this hardening pass resolves the architectural fragility that led to repeated closure corruption:
1. Decoupled `seedPgFromBootstrap(store, db)` from the inline promise handler of `dbReady`, hoisting it to a standalone top-level module function.
2. Formatted the `dbReady = db.init(store).then(...).catch(...)` chain with explicit braces `{ }` around the `else` block (eliminating the fragile dangling `} else try { ... }` pattern).
3. Preserved 100% of all existing semantics: PostgreSQL readiness, bootstrap→PG seed, authoritative PG hydration, partition auto-discovery, ops-kv attach, national traffic fabric hydration, control plane authority attach, and fail-closed error handling.

## Verification Evidence at Current HEAD

- `node --check server/index.js`: PASS (0 errors)
- `node -c server/index.js`: PASS (0 errors)
- `npm run build:check`: PASS (build output byte-for-byte identical with index.html)
- `tests/f1-boot-syntax-five-pass.js`: ALL 5 PASSES VERIFIED
  - Pass 1 (Functional): clean syntax, live health/readiness/liveness boot
  - Pass 2 (Boundary): module exports and runtime handles verified
  - Pass 3 (Negative/Failure): production fail-fast without DATABASE_URL
  - Pass 4 (Concurrency/Recovery): 50 concurrent requests 200 OK, SIGTERM clean drain in 60ms
  - Pass 5 (Regression): 30/30 API test suites passed, 0 corrupt trailing fragments
- `npm start`: live boot verified on http://0.0.0.0:3000

# 112. Evidence Gate — دروازه شواهد و الزام سراسری پروژه

## 112.1 تعریف و جایگاه

**Evidence Gate (دروازه شواهد)** یکی از Project Integrity Invariants و یک گیت اجباری برای تمام مأموریت‌ها، تغییرات، تست‌ها، گزارش‌ها، releaseها و ادعاهای وضعیت پروژه است.

اصل حاکم:

> **هیچ ادعای DONE / PASSED / VERIFIED / CERTIFIED / PRODUCTION-READY بدون Evidence معتبر، قابل ردیابی و متصل به وضعیت فعلی پروژه پذیرفته نیست.**

Evidence Gate جایگزین تست، review یا judgment مهندسی نیست؛ نقطه‌ای است که بررسی می‌کند ادعای انجام/تأیید واقعاً با شواهد کافی پشتیبانی شده است.

این قانون برای همه اعمال می‌شود:
- Chat
- Agent
- Atria
- Executor
- Reviewer
- مهندس ناظر
- CI/CD
- automation
- documentation
- runtime verification
- security review
- release/certification

هیچ agent یا roleای از این Gate مستثنی نیست.

## 112.2 تفاوت Report، Finding، Evidence و Certification

**REPORT** گزارش agent یا Chat است و می‌تواند شامل ادعا، مشاهده و پیشنهاد باشد.

**FINDING** نتیجه یک بررسی است که ممکن است هنوز مستقل تأیید نشده باشد.

**EVIDENCE** یک artifact یا observation قابل بازتولید و قابل بررسی است که نشان می‌دهد یک claim در شرایط مشخص درست یا نادرست بوده است.

**CERTIFICATION** نتیجه نهایی supervisor/reviewer پس از بررسی Evidence، reconciliation و acceptance criteria است.

بنابراین:

REPORT ≠ EVIDENCE

و:

EVIDENCE ≠ CERTIFICATION

گزارش agent به‌تنهایی مجوز عبور از Evidence Gate نیست.

## 112.3 حداقل بسته شواهد (Minimum Evidence Packet)

هر Mission که خروجی آن به تغییر، رفع defect، تأیید capability، تغییر status یا certification منجر می‌شود باید حداقل این اطلاعات را داشته باشد:

~~~text
MISSION_ID
OWNER
REVIEWER
BASE_SHA
CURRENT_HEAD
BRANCH
WORKTREE_STATUS
CLAIM
SCOPE
CHANGED_FILES
COMMANDS
TESTS
TEST_RESULTS
EXPECTED
ACTUAL
EVIDENCE_ARTIFACTS
ENVIRONMENT
RUNTIME_VERSION
TIMESTAMP
COMMIT
PUSHED
PR
REVIEW_STATUS
BLOCKERS
NEXT_ACTION
~~~

مواردی که برای نوع خاص Mission کاربرد ندارند باید صریحاً N/A شوند؛ حذف بی‌صدا مجاز نیست.

## 112.4 طبقه‌بندی شواهد

Evidence باید در یکی از این طبقات ثبت شود:

1. SOURCE_EVIDENCE: inspection کد، diff، file/blob، configuration، schema/migration، contract.
2. TEST_EVIDENCE: unit، integration، API، regression، smoke، E2E، property/invariant، adversarial/negative.
3. RUNTIME_EVIDENCE: boot، health/readiness/liveness، real API response، DB/Redis connectivity، browser/runtime behavior.
4. SECURITY_EVIDENCE: authorization negative tests، tenant/office/province isolation، authentication، rate limiting، secret handling، abuse/adversarial tests.
5. DELIVERY_EVIDENCE: commit SHA، branch، PR، merge، CI run، deployment artifact.
6. REVIEW_EVIDENCE: independent source inspection، alternate test، reviewer result، second environment، adversarial validation.
7. RECOVERY_EVIDENCE: failure injection، rollback، restore، restart، replay/recovery، post-recovery verification.
8. DOCUMENTATION_EVIDENCE: synchronized source-of-truth documents، architecture/contract updates، status reconciliation، changelog.

## 112.5 الزام اتصال Evidence به SHA و Environment

هر Evidence مهم باید به وضعیت دقیق اجرای خود bind شود:

EVIDENCE → SHA → BRANCH → ENVIRONMENT → COMMAND/OBSERVATION → TIMESTAMP

اگر Evidence مربوط به SHA دیگری باشد، برای HEAD فعلی معتبر فرض نمی‌شود مگر اینکه dependency و unchanged invariant به‌صورت قابل اثبات ثبت شده باشد.

اگر environment متفاوت باشد، PASS فقط برای همان environment معتبر است؛ تعمیم به environment دیگر نیازمند evidence یا contract صریح است.

## 112.6 Freshness Rule

Evidence دارای عمر منطقی است.

Evidence باید دوباره اعتبارسنجی شود اگر:
- source code تغییر کرده؛
- dependency مؤثر تغییر کرده؛
- configuration مؤثر تغییر کرده؛
- schema/migration تغییر کرده؛
- environment مؤثر تغییر کرده؛
- contract تغییر کرده؛
- security boundary تغییر کرده؛
- incident/regression مرتبط رخ داده؛
- HEAD از commit مورد آزمایش عبور کرده و تغییر مؤثر داشته است.

در این شرایط Evidence قبلی به STALE / REVALIDATION_REQUIRED تبدیل می‌شود.

Evidence تاریخی نباید به‌عنوان current evidence ارائه شود.

## 112.7 Evidence Gate Decision States

دروازه فقط یکی از این نتایج را می‌دهد:

- PASS — تمام required evidenceها معتبر و acceptance criteria برآورده شده‌اند.
- BLOCKED — Evidence ضروری موجود نیست یا prerequisite اجرا نشده است.
- FAILED — Evidence وجود دارد و نشان می‌دهد acceptance criteria برآورده نشده است.
- STALE — Evidence مربوط به وضعیت قبلی است و برای وضعیت فعلی معتبر نیست.
- REVALIDATION_REQUIRED — change/incident/dependency/environment جدید evidence قبلی را نیازمند بازآزمایی کرده است.
- INVALID — Evidence ناقص، متناقض، غیرقابل بازتولید، ساختگی یا غیرقابل انتساب است.
- WAIVED — فقط با exception رسمی و approval مجاز؛ هرگز به معنی PASS نیست.

## 112.8 ممنوعیت عبور بدون Evidence

این تبدیل‌ها بدون Evidence Gate ممنوع‌اند:

PLANNED → DONE
RUNNING → PASSED
VERIFYING → VERIFIED
FIXED → CERTIFIED
TESTED → PRODUCTION-READY
REPORTED → RESOLVED

همچنین ممنوع است:
- checkbox فقط بر اساس گفته agent تیک بخورد؛
- PASS بدون command/test/observation قابل بررسی اعلام شود؛
- Evidence مربوط به commit قدیمی بدون reconciliation استفاده شود؛
- test report قدیمی بعد از تغییر مؤثر استفاده شود؛
- build success به functional correctness تعمیم داده شود؛
- unit-test PASS به E2E/runtime PASS تعمیم داده شود؛
- static inspection به security certification تعمیم داده شود؛
- finding فقط چون یک test سبز شده حذف شود.

## 112.9 Evidence برای انواع Claim

| Claim | حداقل Evidence |
|---|---|
| bug fixed | source/diff + regression test + current SHA |
| test passed | command + result + test identity + environment |
| build passed | exact build command + artifact/parity result |
| API fixed | positive + relevant negative test |
| authorization fixed | allowed + denied + scope-boundary evidence |
| security issue fixed | source inspection + adversarial/negative validation |
| DB/migration safe | schema/migration + forward validation + rollback/recovery when applicable |
| sync/offline fixed | version/conflict/replay/concurrency evidence |
| runtime healthy | boot + health/readiness/liveness + relevant dependencies |
| Redis/DB ready | real dependency connectivity/readiness when required |
| performance acceptable | workload + baseline + measured result + acceptance criterion |
| recovery successful | injected failure + recovery action + post-recovery verification |
| documentation synchronized | current SHA + affected docs + reconciliation |
| PR delivered | branch + commit + PR + merge/CI evidence |
| certified | all required evidence + independent review + supervisor reconciliation |

این جدول حداقل است؛ Mission Contract می‌تواند الزامات سخت‌گیرانه‌تری تعیین کند.

## 112.10 Positive + Negative Evidence Rule

برای invariantهای امنیتی، authorization، validation، isolation، state transition و failure handling، positive test به‌تنهایی کافی نیست.

در صورت کاربرد باید هر سه مسیر بررسی شوند:

POSITIVE / EXPECTED
NEGATIVE / FORBIDDEN
BOUNDARY / EDGE

برای multi-tenant یا scope-sensitive logic، در صورت کاربرد:

VALID SCOPE
INVALID SCOPE
CROSS-TENANT / CROSS-SCOPE
MISSING / EXPIRED AUTHORITY

نبودن negative evidence در یک invariant حساس باید به‌عنوان evidence gap ثبت شود.

## 112.11 Independent Review Rule

برای تغییرات عادی، reviewer باید حداقل یک بررسی مستقل انجام دهد.

برای موارد Critical/P0/P1، security boundary، authorization، data integrity، migration، recovery و certification:

EXECUTOR → INDEPENDENT REVIEWER → REVALIDATION

Reviewer نباید صرفاً متن گزارش executor را تکرار کند.

روش مستقل می‌تواند شامل source inspection مستقل، test متفاوت، adversarial test، runtime observation، environment متفاوت یا بررسی invariant به‌جای implementation باشد.

اگر independent review موردنیاز انجام نشده باشد:

Evidence Gate ≠ PASS

## 112.12 Evidence Anti-False-Green Rule

هر mechanismای که می‌تواند بدون اثبات واقعی PASS بدهد، evidence معتبر تولید نمی‌کند.

موارد مشکوک شامل:
- assert(true)
- testهای بدون assertion واقعی
- process.exit(0) برای پنهان کردن failure
- catch کردن خطا و اعلام PASS
- mock کردن همان چیزی که باید واقعاً verify شود
- skip کردن test بدون quarantine ثبت‌شده
- fixtureای که failure واقعی را حذف می‌کند
- چاپ PASS بدون exit/result قابل بررسی
- testای که assertion مربوط به claim ندارد.

هر false-green باید finding مستقل یا regression/process defect محسوب شود.

## 112.13 Evidence Artifact Integrity

Artifactهای Evidence باید:
- قابل شناسایی باشند؛
- قابل انتساب به Mission باشند؛
- قابل ارتباط با SHA باشند؛
- در صورت نیاز timestamp و environment داشته باشند؛
- قابل بازتولید یا independently inspectable باشند؛
- secret یا PII غیرضروری نداشته باشند.

Log خامی که فقط بخشی از command/result را نشان می‌دهد، در صورت عدم امکان اثبات context، evidence کامل محسوب نمی‌شود.

## 112.14 Reproducibility Rule

برای هر test/finding مهم:

COMMAND
INPUT
ENVIRONMENT
EXPECTED
ACTUAL
EXIT/STATUS
SHA
TIMESTAMP

باید به‌صورت کافی ثبت شود تا reviewer بتواند مسیر بررسی را تکرار کند.

عبارت‌هایی مانند «اجرا کردم، درست بود» یا «تست‌ها سبز شدند» به‌تنهایی Evidence نیستند.

## 112.15 Evidence Invalidation

هر change مرتبط باید Evidence قبلی را بازبینی کند.

اگر تغییر باعث شود invariant قبلی دیگر قابل اتکا نباشد:

OLD EVIDENCE → INVALIDATED
STATUS → REVALIDATION_REQUIRED
NEW TEST/REVIEW → REQUIRED

پس از regression:

DETECT → INVALIDATE AFFECTED EVIDENCE → FIX → REVALIDATE → RESTORE STATUS

## 112.16 Evidence و Git/Delivery

برای هر تغییر source که قرار است تحویل‌شده محسوب شود، زنجیره زیر باید با نوع Mission سازگار باشد:

WORKTREE → TEST → EVIDENCE → COMMIT → PUSH → PR → REVIEW → MERGE → CI → CURRENT-HEAD REVALIDATION

COMMITTED به معنی VERIFIED نیست.
MERGED به معنی CERTIFIED نیست.
CI PASS به معنی RUNTIME VERIFIED نیست.

## 112.17 Evidence Gate و Mission Lifecycle

هر Mission باید از این الگو پیروی کند:

PLANNED → READY → RUNNING → VERIFYING → EVIDENCE_GATE → PASSED → COMMITTED → CI_RUNNING → VERIFIED

Failure path:

EVIDENCE_GATE → BLOCKED / FAILED / STALE / INVALID / REVALIDATION_REQUIRED

Mission فقط پس از رفع وضعیت Gate مجاز به ادامه است.

## 112.18 مسئولیت‌ها

### Executor
Evidence اولیه و گزارش دقیق را تولید می‌کند.

### Reviewer
Evidence را مستقل بررسی می‌کند.

### Supervisor
reconciliation، کفایت Evidence و Gate status را تعیین می‌کند.

### CI/Automation
machine evidence قابل اتکا تولید می‌کند و نباید verdict جعلی تولید کند.

### Documentation Owner
source-of-truth و status را sync می‌کند.

### هر Agent/Chat
مسئول رعایت Gate است و نمی‌تواند به دلیل نبود reminder از آن عبور کند.

## 112.19 Evidence Ledger Integration

هر Evidence قابل استفاده باید در Evidence Ledger به claim مربوط شود:

CLAIM → EVIDENCE_ID → TYPE → MISSION_ID → SHA → ENV → COMMAND/ARTIFACT → OWNER → REVIEWER → RESULT → CREATED_AT → LAST_VALIDATED → STATUS

اگر claim در Ledger ثبت نشده یا reference آن قابل ردیابی نباشد، claim برای certification کامل محسوب نمی‌شود.

## 112.20 Exception / Waiver

هیچ bypass دائمی برای Evidence Gate وجود ندارد.

اگر به دلیل محدودیت واقعی امکان تولید یک evidence وجود ندارد:

GAP IDENTIFIED → IMPACT ASSESSED → RISK DOCUMENTED → MITIGATION DEFINED → HUMAN APPROVAL (if required) → WAIVER RECORDED → EXPIRATION/REVIEW DATE → FOLLOW-UP EVIDENCE

WAIVED هرگز خودکار به PASS تبدیل نمی‌شود.

Security، data integrity و destructive changes به‌صورت پیش‌فرض قابل bypass نیستند مگر با تصمیم انسانی صریح و ثبت‌شده.

## 112.21 Evidence Gate برای تست‌های Blocked

اگر test به دلیل نبودن dependency واقعی، credential، PostgreSQL، Redis، browser یا environment اجرا نشود:

BLOCKED

و نه PASS.

مثال:

DATABASE_URL missing → truth-gate BLOCKED → NOT VERIFIED

نبودن environment، evidence نبودن را به evidence تبدیل نمی‌کند.

## 112.22 Evidence Gate برای Documentation

هر ادعای current truth در documentation باید با repository truth reconcile شود.

اگر document بگوید HEAD = X ولی repository بگوید HEAD = Y و Y جدیدتر باشد، documentation مربوطه stale است.

هر synchronization مهم باید حداقل این‌ها را بررسی کند:

HEAD
BRANCH
WORKTREE
MISSION STATUS
DEFECT STATUS
TEST STATUS
EVIDENCE STATUS
PR/CI STATUS
ROADMAP
DASHBOARD

## 112.23 Evidence Gate برای Security و Critical Changes

برای تغییرات امنیتی یا Critical/P0/P1، حداقل باید بررسی شود:
- source-level control؛
- positive path؛
- negative path؛
- boundary/scope isolation؛
- regression؛
- relevant runtime behavior؛
- independent review؛
- current SHA binding.

برای authorization، در صورت applicable بودن:

ALLOWED
DENIED
WRONG SCOPE
WRONG TENANT
MISSING AUTHORITY
EXPIRED/INVALID AUTHORITY

## 112.24 Evidence Gate Self-Test

خود Evidence Gate نیز باید قابل آزمون باشد.

باید بتوانیم ثابت کنیم که Gate:
1. بدون Evidence PASS نمی‌دهد؛
2. Evidence مربوط به SHA قدیمی را stale تشخیص می‌دهد؛
3. test failure را PASS نمی‌کند؛
4. missing dependency را BLOCKED می‌کند؛
5. false-green pattern را detect می‌کند؛
6. reviewer evidence را از executor report متمایز می‌کند؛
7. waiver را با PASS اشتباه نمی‌گیرد؛
8. current-head mismatch را detect می‌کند؛
9. incident می‌تواند Evidence قبلی را invalidate کند؛
10. statusهای پروژه را با Evidence status هماهنگ نگه می‌دارد.

Evidence Gate بدون این self-test نباید به‌عنوان gate قابل اعتماد فرض شود.

## 112.25 Supervisor Acceptance Checklist

پیش از اعلام PASSED یا VERIFIED:

- [ ] Mission مشخص است.
- [ ] Owner مشخص است.
- [ ] Scope مشخص است.
- [ ] Base SHA و Current HEAD مشخص‌اند.
- [ ] Claim دقیق و قابل آزمون است.
- [ ] Required evidence مشخص است.
- [ ] Evidence واقعاً تولید شده است.
- [ ] Evidence به SHA صحیح bind است.
- [ ] Environment مشخص است.
- [ ] Test command/result قابل بازبینی است.
- [ ] Expected/Actual مشخص است.
- [ ] Negative/boundary checks در صورت نیاز انجام شده‌اند.
- [ ] Regression بررسی شده است.
- [ ] Security impact بررسی شده است.
- [ ] Reviewer مستقل در موارد لازم انجام شده است.
- [ ] Artifactها قابل ردیابی‌اند.
- [ ] secret/PII غیرضروری افشا نشده است.
- [ ] Git delivery وضعیت صحیح دارد.
- [ ] CI/runtime evidence لازم وجود دارد.
- [ ] Documentation و dashboard sync هستند.
- [ ] Evidence stale یا invalid نشده است.
- [ ] blocker یا waiver پنهان وجود ندارد.
- [ ] Next action روشن است.

هر checkboxی که بدون Evidence قابل اثبات تیک بخورد، نقض این قانون است.

## 112.26 گزارش استاندارد Evidence Gate

~~~text
[EVIDENCE_GATE]

MISSION_ID:
CLAIM:
OWNER:
REVIEWER:

BASE_SHA:
CURRENT_HEAD:
BRANCH:
WORKTREE:

ENVIRONMENT:
RUNTIME:

REQUIRED_EVIDENCE:
- ...

COLLECTED_EVIDENCE:
- ...

COMMANDS:
- ...

EXPECTED:
- ...

ACTUAL:
- ...

NEGATIVE/BOUNDARY:
- ...

ARTIFACTS:
- ...

RESULT:
PASS | BLOCKED | FAILED | STALE | INVALID | REVALIDATION_REQUIRED | WAIVED

EVIDENCE_STATUS:
VALID | INCOMPLETE | STALE | INVALID

COMMIT:
PUSHED:
PR:
CI:

BLOCKERS:
NEXT_ACTION:
TIMESTAMP:
~~~

## 112.27 قانون عدم ارتقای خودکار

هیچ agent، script یا automation نباید فقط بر اساس متن گزارش وضعیت را ارتقا دهد.

ارتقا باید:

REPORT → RECONCILE → EVIDENCE CHECK → GATE DECISION → STATUS UPDATE

باشد، نه REPORT → DONE.

## 112.28 قانون سراسری و تقدم

این بخش برای همه Missionها و همه roleها **لازم‌الاجرا** است.

در صورت تعارض بین گزارش agent، checklist محلی، conversation memory، documentation قدیمی، status dashboard و Evidence Gate، برای ادعای verification، **Evidence معتبر و current repository truth** مرجع تصمیم است.

این Gate باید در Mission Contract، Report-Driven Supervisor Protocol، Evidence Ledger، CI/verification scripts و certification workflow منعکس شود.

هیچ Prompt، Chat، Agent، branch یا workstream نمی‌تواند با wording متفاوت این الزام را حذف کند.

## 112.29 Enforcement Rule

نقض Evidence Gate یک **Process Integrity Defect** است.

نمونه‌های نقض:
- اعلام DONE بدون evidence؛
- استفاده از evidence قدیمی؛
- پنهان کردن test failure؛
- گزارش PASS بدون execution؛
- حذف negative test لازم؛
- ادعای runtime verification بدون runtime؛
- ادعای CI verification بدون CI evidence؛
- ادعای reviewer approval بدون reviewer evidence؛
- ارتقای status توسط automation بدون validation.

نقض باید:
1. گزارش شود؛
2. status ادعای متاثر به NOT VERIFIED یا REVALIDATION_REQUIRED برگردد؛
3. evidence chain بازسازی شود؛
4. در صورت تکرار، process/automation اصلاح شود.

## 112.30 اصل نهایی

> **در پروژه پایش، هر ادعا باید شاهد داشته باشد، هر شاهد باید قابل ردیابی باشد، هر شاهد باید به وضعیت صحیح پروژه bind باشد، و هیچ status بالاتری از سطح اثبات موجود مجاز نیست.**

فرمول اجرایی:

CLAIM → EVIDENCE → REPRODUCE → RECONCILE → REVIEW → GATE → STATUS

این زنجیره برای تمام پروژه اجباری است.

# 113. Change Log — Evidence Gate

| تاریخ | تغییر | دلیل |
|---|---|---|
| 2026-09-27 | افزودن Evidence Gate جامع و سراسری شامل تعریف Evidence، حداقل بسته شواهد، انواع Evidence، SHA/Environment binding، freshness/invalidation، negative testing، independent review، anti-false-green، waiver، self-test، lifecycle و enforcement | تبدیل Evidence Ledger موجود به یک دروازه اجرایی و غیرقابل‌عبور برای جلوگیری از DONE/VERIFIED/CERTIFIED بدون شواهد معتبر و current |

# 114. Central Engineering Law — قانون مرکزی و سند مادر پروژه

این فایل (docs/PREQUISITES.md) سند مرکزی قوانین و پیش‌نیازهای مهندسی پروژه پایش است و باید به‌عنوان Project Engineering Constitution / Operating System استفاده شود.

این سند مرجع canonical برای موارد زیر است و هیچ Agent/Chat نباید نسخه موازی و متناقضی از این قوانین ایجاد کند:

- قوانین و invariants پروژه؛
- استانداردهای مهندسی و Quality/Security/Verification؛
- مهارت‌ها و Skill Matrix موردنیاز Agentها؛
- روند یادگیری و Evidence-based skill progression؛
- برنامه کاری، فازها، Mission Contract و Critical Path؛
- workflow کامل Discovery → Root Cause → Fix → Test → Evidence → Delivery؛
- قوانین Git/GitHub و Source of Truth؛
- قوانین امنیت، Authorization، Scope و Tenant Isolation؛
- قوانین Database/Migration/Sync/Offline/Distributed State؛
- قوانین Testing، CI/CD، False-Green و Evidence Gate؛
- قوانین Agent/Chat collaboration، ownership و handoff؛
- تجربیات، incidentها، lessons learned و process improvements ثبت‌شده در همین سند و اسناد canonical مرتبط؛
- ارجاع به اسناد تخصصی canonical مانند Dashboard، Roadmap، Mission Plan، Defect Master، Decision Log و Verification Registry.

## 114.1 تقدم منابع حقیقت

برای ادعاهای current engineering state، ترتیب اعتبار چنین است:

1. Current GitHub repository truth + current evidence
2. Evidence معتبر bind‌شده به SHA و Environment
3. این سند و سایر اسناد canonical همگام‌شده با repository
4. گزارش Agent/Chat
5. حافظه یا context قدیمی Agent

Memory هر Agent هرگز نمی‌تواند repository truth یا current evidence را override کند.

## 114.2 قانون «اول PREQUISITES، بعد کار»

هر Agent قبل از شروع Mission باید این سند را به‌عنوان قوانین پایه بخواند و سپس وضعیت واقعی repository، Mission و Evidence را reconcile کند.

هیچ Prompt یا Mission جدیدی مجاز نیست این قوانین را حذف، تضعیف یا دور بزند؛ مگر با یک تصمیم صریح، ثبت‌شده و قابل ردیابی در Decision Log.

## 114.3 Skill / Learning Law

Skill فقط با مطالعه ارتقا نمی‌یابد. ارتقای skill باید بر اساس شواهد واقعی باشد:

UNKNOWN → LEARNING → PRACTICING → UNDERSTOOD → VERIFIED → MASTERED

VERIFIED نیازمند کاربرد واقعی و قابل تکرار در Payesh است.
MASTERED نیازمند شواهد مستقل و چندموردی در contextهای متفاوت است.

هر failure مهم باید به یکی از این خروجی‌ها منجر شود:

DEFECT → ROOT CAUSE → LESSON → GUARD/TEST/AUTOMATION → REVALIDATION

## 114.4 قانون هماهنگی قوانین با تغییرات

هر تغییر کوچک در code، architecture، contract، security boundary، test infrastructure، workflow یا process که بر این قوانین اثر می‌گذارد باید بلافاصله بخش مرتبط این سند و اسناد canonical وابسته را synchronize کند.

هدف:

ONE PROJECT — ONE ENGINEERING LAW — ONE CURRENT TRUTH

# 115. Filter / Scope / Data-Access Law — قانون مرکزی فیلترها و محدوده دسترسی

این بخش قانون سراسری پروژه برای تمام مسیرهای دسترسی به داده، Query، API، Sync، Report، Analytics، Export، Cache و Aggregation است.

## 115.1 اصل بنیادی

هیچ داده‌ای نباید فقط به این دلیل که از یک table، collection، service یا endpoint قابل خواندن است، وارد لایه بالاتر شود و بعداً صرفاً در application code حذف شود.

الگوی مطلوب:

AUTHENTICATE → AUTHORIZE/SCOPE → FILTER AT SOURCE → TRANSFORM → OUTPUT

و نه:

READ BROAD DATA → FILTER LATER → AUTHORIZE LATER

## 115.2 Filter باید با Authorization یکی باشد

Filter صرفاً ابزار performance نیست؛ در Payesh بخشی از data-access security boundary است.

هر مسیر حساس باید scope مربوط به context کاربر را اعمال کند، از جمله در صورت کاربرد:

- tenant/school scope؛
- province/region scope؛
- office scope؛
- role scope؛
- ownership؛
- parent/student relationship؛
- teacher/class relationship؛
- organization/unit scope؛
- temporal/date scope؛
- state/status constraints.

Role به‌تنهایی مجوز دسترسی به object را اثبات نمی‌کند.

## 115.3 SQL/Source-Level Filtering

برای PostgreSQL و منابع داده مشابه، تا حد امکان filtering و authorization باید در نزدیک‌ترین لایه به source اعمال شود.

برای queryهای حساس، الگوی ترجیحی:

SQL WHERE / JOIN / EXISTS / policy-aware query → scoped result

است.

خواندن کل dataset و سپس فیلتر کردن آن در JavaScript/Node/Python به‌صورت پیش‌فرض safe فرض نمی‌شود و باید از نظر authorization، data leakage، memory، performance، pagination، aggregation، count/total، export و cache بررسی شود.

اگر چنین الگویی به‌دلیل معماری یا compatibility ناگزیر باشد، باید دلیل، scope proof و regression evidence داشته باشد.

## 115.4 Scope باید در تمام مسیرهای داده حفظ شود

Filter نباید فقط روی مسیر اصلی GET اعمال شود و در مسیرهای دیگر حذف شود.

حداقل blast radius قابل بررسی:

- REST/API؛
- Sync/offline؛
- PATCH/PUT/DELETE؛
- Reports؛
- Analytics؛
- Aggregations؛
- Count/Total؛
- Search؛
- Export؛
- Background jobs/workers؛
- Outbox/events؛
- Cache؛
- Admin/management paths؛
- Legacy/alternate endpoints.

اگر یک invariant در REST وجود دارد و Sync یا worker همان داده را مصرف می‌کند، باید parity آن invariant اثبات شود.

## 115.5 Cross-Scope / Cross-Tenant Rule

برای هر endpoint یا service حساس، در صورت applicability باید حداقل این حالت‌ها بررسی شوند:

VALID SCOPE

INVALID SCOPE

CROSS-SCOPE / CROSS-TENANT

MISSING AUTHORITY

EXPIRED/INVALID AUTHORITY

دسترسی cross-scope نباید صرفاً به دلیل وجود object ID یا role مجاز شود.

## 115.6 Empty / Null / Boundary Filter Rule

این موارد باید به‌طور صریح بررسی شوند:

- empty filter؛
- missing filter؛
- NULL؛
- zero/false values؛
- pagination boundaries؛
- date boundaries؛
- inclusive/exclusive ranges؛
- unknown IDs؛
- deleted/inactive objects؛
- mixed valid/invalid scope inputs.

نباید رفتار empty filter به‌صورت ضمنی به «همه داده‌ها» تبدیل شود مگر اینکه این رفتار صریحاً بخشی از contract و authorization باشد.

## 115.7 Count / Aggregation / Export Parity

اگر داده‌ای scope-sensitive است، موارد زیر باید دقیقاً همان scope را رعایت کنند:

- SELECT result؛
- COUNT/TOTAL؛
- SUM/AVG/other aggregates؛
- pagination metadata؛
- reports؛
- exports؛
- analytics.

نباید result فیلترشده باشد ولی count یا aggregate شامل داده خارج از scope باشد.

## 115.8 Cache Rule

Cache key و cache invalidation باید scope را در صورت نیاز encode/حفظ کنند.

ممنوع:

unscoped cache → scoped consumer

مگر اینکه ثابت شود داده cache شده ذاتاً public و non-sensitive است.

## 115.9 Filter Mutation Tests

برای filterهای security-sensitive، تا حد امکان mutation/adversarial testing باید نشان دهد که حذف یا تضعیف filter باعث failure می‌شود.

Mutationهای مهم:

- حذف WHERE؛
- حذف tenant condition؛
- حذف school condition؛
- حذف office/province condition؛
- broad کردن scope؛
- حذف relationship guard؛
- حذف ownership condition؛
- حذف NULL protection؛
- حذف filter از COUNT/TOTAL؛
- حذف filter از export؛
- حذف filter از pagination؛
- bypass کردن policy helper.

اگر mutation بدون fail شدن test عبور کند، coverage برای آن invariant کافی نیست.

## 115.10 Filter Review Checklist

برای هر filter مهم بررسی شود:

- [ ] منبع داده مشخص است.
- [ ] owner/scope مشخص است.
- [ ] authorization قبل از disclosure اعمال می‌شود.
- [ ] filter در source تا حد امکان اعمال می‌شود.
- [ ] cross-scope test وجود دارد.
- [ ] negative test وجود دارد.
- [ ] boundary/empty/null behavior مشخص است.
- [ ] count/aggregate parity بررسی شده است.
- [ ] export/search/pagination parity بررسی شده است.
- [ ] cache impact بررسی شده است.
- [ ] Sync/worker/legacy paths بررسی شده‌اند.
- [ ] regression test وجود دارد.
- [ ] Evidence به SHA و Environment bind است.

## 115.11 Filter Law Enforcement

هر finding مربوط به filter/scope باید با این زنجیره مدیریت شود:

DISCOVER → REPRODUCE → BLAST-RADIUS SEARCH → ROOT CAUSE → FIX AT CORRECT BOUNDARY → NEGATIVE/BOUNDARY TEST → INDEPENDENT REVIEW → EVIDENCE GATE → DELIVERY

«در این endpoint درست کار می‌کند» برای certification کافی نیست؛ sibling paths باید بررسی شوند.

## 115.12 اصل نهایی Filter Law

هیچ داده‌ای نباید خارج از محدوده مجاز خود از مرز data-access عبور کند. Scope باید در همان جایی که داده محدود می‌شود enforce شود و تمام مسیرهای مشتق‌شده همان invariant را حفظ کنند.

# 116. Change Log — Central Law / Filter Law

| تاریخ | تغییر | دلیل |
|---|---|---|
| 2026-09-28 | تبدیل docs/PREQUISITES.md به مرجع صریح Central Engineering Law و افزودن Filter / Scope / Data-Access Law شامل authorization-aware filtering، source-level filtering، cross-scope tests، aggregation/export/cache parity و filter mutation testing | یکپارچه‌سازی قوانین، skill/learning، workflow، lessons learned و قانون فیلترها در یک سند مادر و جلوگیری از پراکندگی قوانین بین Agentها |


# 117. Atria / ZCode Capability Development Law

در مرحله فعلی، تمرکز راهبردی پروژه بر شناخت عمیق، هدایت، آموزش و ارتقای Atria در محیط ZCode است تا از ظرفیت آن به‌عنوان بازوی اصلی مهندسی Payesh حداکثر استفاده شود. این تمرکز تا زمانی ادامه دارد که شواهد کافی برای سطح حرفه‌ای موردنظر به‌دست آید؛ سپس توسعه عادی Payesh ادامه می‌یابد.

## 117.1 نقش‌ها
- Atria/ZCode: بازوی اصلی اجرای مهندسی، تحلیل، implementation، test، verification و Git/GitHub delivery.
- ChatGPT: ناظر و هدایت‌کننده؛ طراحی Mission، تحلیل گزارش، تشخیص gap و تعیین فرمان/آموزش بعدی.
- Hermes: حافظه، مدیریت عملیاتی و watchdog؛ در جریان قوانین، وضعیت، مأموریت‌ها، تصمیمات و پیشرفت Atria باقی می‌ماند و برای مأموریت‌های کوتاه و نقش‌های آینده آماده می‌شود.
- GitHub + PREQUISITES: مرجع مشترک و current source of truth.

## 117.2 قانون «فرمان بهتر، نه قانون بیشتر»
هر ضعف Atria نباید خودکار با Rule جدید درمان شود. ابتدا باید مشخص شود gap مربوط به Knowledge، Skill، Mission/Prompt/Command، Workflow، Tool/Environment، Verification/Evidence، Self-review، Context/Memory یا خود قانون است. راه‌حل باید متناسب با علت انتخاب شود.

## 117.3 چرخه ارتقا
OBSERVE → ANALYZE → CLASSIFY GAP → TARGETED TRAINING/COMMAND → APPLY → TEST/EVIDENCE → REVIEW → REASSESS

گزارش Atria به‌تنهایی اثبات Mastery نیست.

## 117.4 Self-Audit
وقتی Atria معیار، قانون یا skill جدیدی دریافت می‌کند، در صورت applicability باید کارهای قبلی مرتبط را نیز با معیار جدید بازبینی کند:
NEW KNOWLEDGE → REASSESS PRIOR WORK → FIND GAPS → CORRECT → REGRESSION → EVIDENCE

## 117.5 Capability Review
در گزارش‌های مهم، در صورت وجود evidence این موارد پایش شوند: فهم مسئله، root cause، blast radius، implementation، testing، negative/boundary/security testing، CI/GitHub، evidence discipline، documentation sync، self-review، prior-work reassessment، uncertainty handling و اجرای Mission Contract.

## 117.6 معیار Mastery
اعلام رسیدن Atria به سطح حرفه‌ای موردنظر فقط با شواهد متعدد و مستقل در contextهای متفاوت مجاز است. شواهد باید نشان دهند که skillها در عمل و به‌صورت تکرارپذیر اجرا می‌شوند، verification و evidence معتبر است، self-audit رخ می‌دهد، root cause از symptom تفکیک می‌شود، security/scope/filter invariants حفظ می‌شوند، regression و negative testing انجام می‌شوند، GitHub/CI/post-merge verification رعایت می‌شود و در نبود evidence ادعای قطعی مطرح نمی‌شود.

## 117.7 Continuous Capability Development
پس از شروع توسعه Payesh نیز هر weakness یا skill موردنیاز جدید باید ثبت، طبقه‌بندی، آموزش/هدایت، عملیاتی و با evidence ارزیابی شود. در صورت اثر بر قوانین یا فرآیند، PREQUISITES و اسناد canonical مرتبط باید synchronize شوند.

اصل نهایی:
UNDERSTANDS → REASONS → EXECUTES → VERIFIES → SELF-AUDITS → LEARNS → IMPROVES

# 118. Change Log — Atria Capability Development

| تاریخ | تغییر | دلیل |
|---|---|---|
| 2026-09-28 | ثبت Atria/ZCode به‌عنوان تمرکز فعلی ارتقای capability، تعریف نقش ChatGPT/Hermes، gap classification، self-audit، معیار mastery و continuous capability development | استفاده حداکثری از Atria/ZCode و جلوگیری از درمان خودکار هر ضعف با Rule جدید بدون تشخیص علت |


# 119. Clean Code Engineering Law — اصول کدنویسی تمیز

این بخش از خلاصه مقاله/منبع «۱۰ اصل طلایی Clean Code» دریافت شده در 2026-09-28 استخراج شده است. فقط اصولی که در منبع دریافت‌شده به‌طور صریح در دسترس بود وارد قانون پروژه شده‌اند.

## 119.1 Meaningful Naming — نام‌گذاری معنادار

نام‌ها باید intent و معنای واقعی خود را منتقل کنند، نه اینکه صرفاً نوع یا وجود یک چیز را بیان کنند.

قواعد عملی:
- نام تابع باید تا حد امکان بگوید چه کاری انجام می‌دهد؛ نامی مانند getUserData از نام مبهمی مانند handleUser قابل فهم‌تر است.
- از نام‌های عمومی و مبهم مانند info، data، manager و process تا حد امکان دوری شود.
- وضوح بر کوتاهی مقدم است؛ نام واضح و طولانی می‌تواند از اختصار مبهم بهتر باشد.
- برای function از نامی استفاده شود که عمل را بیان کند و برای variable نامی که مفهوم داده را روشن کند.
- نام‌های دروغ‌گو، نادرست، نزدیک به هم و اختصارهای گیج‌کننده نامطلوب‌اند.
- واژگان نام‌گذاری در یک domain باید consistent باشند؛ تغییر بی‌دلیل واژه‌هایی مانند fetch و get برای یک مفهوم باعث ambiguity می‌شود.
- نام باید با رفتار واقعی کد مطابقت داشته باشد؛ دروغ‌گویی نام می‌تواند عیب منطقی و نگهداری را پنهان کند.

### کاربرد در Payesh
در code review، debugging و re-audit، نام‌گذاری باید به‌عنوان بخشی از readability و correctness بررسی شود؛ مخصوصاً در policy، scope، authorization، sync، database، analytics و test helpers که نام مبهم می‌تواند باعث برداشت اشتباه از security boundary یا contract شود.

## 119.2 Single Responsibility — هر تابع یک مسئولیت روشن

یک تابع تمیز باید یک کار مشخص و قابل توضیح انجام دهد. اگر برای توضیح رفتار تابع نیاز به فهرست طولانی از مسئولیت‌ها باشد، احتمالاً چند concern در یک واحد ترکیب شده‌اند.

قواعد عملی:
- intent تابع باید با یک نگاه قابل فهم باشد.
- تابع نباید بدون دلیل معماری چند مسئولیت مستقل مانند validation، authorization، persistence، transformation و side-effectهای نامرتبط را در خود جمع کند.
- افزایش اندازه و پیچیدگی تابع باید باعث بازبینی responsibility آن شود، نه صرفاً پذیرش آن به‌عنوان کدی که کار می‌کند.
- refactor برای Single Responsibility نباید contract، security boundary یا behavior را بدون regression evidence تغییر دهد.

### کاربرد در Payesh
در مسیرهای حساس مانند authorization/scope، database transaction، sync/offline، outbox، API handlers و verification gates، توابع بزرگ یا چندمسئولیتی باید در re-audit به‌عنوان محل بالقوه پنهان‌شدن defect بررسی شوند؛ اما refactor صرفاً برای زیبایی و بدون defect/risk justification انجام نشود.

## 119.3 Clean Code ≠ Certification

Clean Code یک quality attribute و ابزار کاهش complexity و maintenance risk است، نه evidence امنیت، correctness یا certification.

بنابراین:
- readable code جای negative test را نمی‌گیرد.
- naming خوب جای authorization proof را نمی‌گیرد.
- single-responsibility جای runtime evidence را نمی‌گیرد.
- refactor بدون regression evidence، verified محسوب نمی‌شود.

اصل اجرایی:
CLARITY → REVIEWABILITY → TESTABILITY → MAINTAINABILITY

اما برای وضعیت مهندسی همچنان قانون Evidence Gate مقدم است:
CLAIM → EVIDENCE → REPRODUCE → RECONCILE → REVIEW → GATE → STATUS

# 120. Change Log — Clean Code Engineering Law

| تاریخ | تغییر | دلیل |
|---|---|---|
| 2026-09-28 | استخراج و وارد کردن دو اصل پشتیبانی‌شده از منبع Clean Code: meaningful naming و single responsibility؛ همچنین تفکیک Clean Code از security/correctness/certification | بهبود خوانایی، reviewability، testability و نگهداری بدون تضعیف Evidence Gate یا تبدیل style guidance به ادعای verification |


# 121. Capability Development — Latest Evidence Synchronization (2026-09-29)

این بخش وضعیت و درس‌های حاصل از آخرین چرخه ارتقای اعضای تیم را به قانون مرکزی منتقل می‌کند. این بخش وضعیت capability و lessons learned است، نه گواهی تکمیل پروژه Payesh.

## 121.1 وضعیت Atria / ZCode

Atria در چرخه اخیر از سطح صرفاً implementation به سمت engineering مبتنی بر evidence، root-cause analysis و self-audit ارتقا یافته است.

### شواهد مثبت ثبت‌شده
- پس از دریافت قانون/skill جدید، Atria در یک مورد به‌صورت خودکار prior work را بازبینی کرد و missing CI verification را شناسایی و دنبال کرد.
- در مأموریت D-3 مربوط به false-green harness، root cause را در سطح lifecycle/process تشخیص داد: child process مرده + listener دیرهنگام + Promise unresolved + drain شدن event loop → خروجی 0 بدون اثبات موفقیت.
- برای D-3 دو جهت negative test ایجاد کرد: broken tree → exit 0 و بازتولید false-green؛ fixed tree → exit 1 و fail-fast.
- blast radius را بررسی کرد و چند harness مشابه را پیدا کرد، اما بدون reproduction آن‌ها را بی‌دلیل تغییر نداد و به‌عنوان reported-only نگه داشت.
- پس از push، CI را جداگانه بررسی کرد و failure پیش از test stage را به‌عنوان CI regression ناشی از تغییر خود claim نکرد.
- محدودیت‌های evidence را صریحاً جدا کرد: local regression = VERIFIED؛ CI regression = NOT EXECUTED / blocked by earlier CI failure؛ PostgreSQL/Redis runtime = NOT RUN به‌دلیل نبود runtime لازم.
- در گزارش‌ها تفاوت REPORTED / IMPLEMENTED / TESTED / VERIFIED / INDEPENDENTLY VERIFIED / CERTIFIED را رعایت کرده و Mastery را بدون evidence کافی ادعا نکرده است.

### وضعیت capability
Atria در حال حاضر:
**VERIFIED / ADVANCED ENGINEERING AGENT — NOT MASTERED**

Mastery هنوز اعلام نمی‌شود. مهم‌ترین evidenceهای باقی‌مانده برای mastery:
- اجرای واقعی PostgreSQL/Redis و distributed/concurrency scenarios؛
- failure injection و recovery با post-condition قابل اثبات؛
- CI-level regression proof در محیطی که کل gate اجرا شود؛
- تکرار همین کیفیت reasoning در context مستقل و متفاوت؛
- independent verification و evidence provenance؛
- self-audit و generalization در چند context غیرمرتبط.

## 121.2 قانون جدید برای Atria: Evidence Boundary

Atria باید برای هر claim، boundary شواهد را صریح اعلام کند:

**LOCAL PASS ≠ CI PASS ≠ RUNTIME PASS ≠ PRODUCTION-TRUTH PASS ≠ CERTIFICATION**

نباید موفقیت یک environment به environment دیگر تعمیم داده شود مگر contract/evidence آن را اثبات کند.

در گزارش هر mission باید حداقل مشخص شود:
- چه چیزی واقعاً اجرا شد؛
- در چه SHA؛
- در چه environment؛
- چه چیزی اجرا نشد؛
- blocker چه بود؛
- کدام نتیجه مستقل verify شد؛
- کدام نتیجه فقط reported یا historical است.

## 121.3 Atria — درس D-3 برای False-Green

هر test/harness باید نه فقط happy-path، بلکه failure-path خود را نیز اثبات کند.

برای harnessهای child-process/event-driven، در صورت applicability باید process exit، event listener timing، Promise settlement، timeout، stderr/stdout، non-zero exit، signal/crash و process already-dead state بررسی شوند.

قاعده:
**A test that can silently exit 0 without observing the intended assertion is not evidence of success.**

False-green detection خود یک security/reliability invariant است، نه صرفاً test hygiene.

## 121.4 Atria — قانون Scope Control

یافتن sibling pattern به‌تنهایی مجوز اصلاح همه موارد مشابه نیست.

الگوی الزامی:
**DISCOVER → CLASSIFY → REPRODUCE → CONFIRM BLAST RADIUS → FIX**

اگر sibling بدون reproduction فقط suspected است:
- گزارش شود؛
- severity/status مشخص شود؛
- evidence موردنیاز ثبت شود؛
- از تغییر بی‌دلیل جلوگیری شود.

Exception فقط برای security-critical، data-corruption یا build-breaking blocker است که باید فوری synchronize شود.

## 121.5 Atria — Runtime/Distributed Capability Gap

تا زمانی که evidence واقعی برای PostgreSQL، Redis، multi-instance، OCC، migration/rollback، outbox/idempotency، scope/filter و failure/recovery وجود ندارد، capability runtime/distributed نباید MASTERED اعلام شود.

Mock، in-memory و static inspection می‌توانند evidence مفید باشند اما جای runtime truth را نمی‌گیرند.

---

# 122. Hermes Capability Development — Latest Evidence Synchronization (2026-09-29)

Hermes در چرخه‌های اخیر از نقش صرفاً project-memory به سمت:
**Project Memory + Mission Controller + Engineering Watchdog + Evidence Manager**
حرکت کرده است.

## 122.1 شواهد مثبت
- baseline واقعی GitHub را در ابتدای mission بررسی کرده و stale baseline را شناسایی کرده است.
- duplicate/superseded work را با upstream مقایسه کرده و از ادامه کار تکراری جلوگیری کرده است.
- در contradiction مهم Local PASS / CI FAIL برای docs-refs، از فرضیه‌سازی به آزمایش محیطی رفت.
- اختلاف Windows/NTFS و Linux/ext4 را با یک probe مشخص کرد و case-sensitive path defect را ریشه‌یابی کرد.
- instrumentation برای خروجی docs-refs اضافه کرد تا evidence در محیط CI قابل مشاهده باشد.
- false-green و stale evidence را بررسی کرده و در موارد unresolved به‌جای حدس، UNKNOWN نگه داشته است.
- در یک مورد، contradiction داخلی خود را با verification مستقل تشخیص داد و نتیجه‌گیری قبلی را اصلاح کرد.
- recovery از تغییرات upstream، branch divergence و conflict را بدون destructive reset مدیریت کرده است.
- گزارش capability خود را از VERIFIED بالاتر نبرده و MASTERED را بدون evidence کافی اعلام نکرده است.

## 122.2 وضعیت capability
Hermes:
**VERIFIED / ADVANCING — NOT MASTERED**

ضعف‌های اصلی باقی‌مانده:
- runtime independence؛
- PostgreSQL/Redis واقعی و failure/recovery؛
- delegation/handoff در contextهای جدید؛
- generalization در contextهای مستقل؛
- مشاهده و تحلیل کامل CI step-level در missionهای طولانی.

## 122.3 قانون Hermes برای Contradiction

وقتی دو evidence معتبر ظاهراً متناقض‌اند:

**STOP CLAIM → IDENTIFY ENVIRONMENT/SHA → FORM HYPOTHESES → RUN DISCRIMINATING EXPERIMENT → INSTRUMENT → REPRODUCE → ROOT CAUSE → REVALIDATE**

هیچ evidence با evidence دیگر صرفاً به‌دلیل «احتمال بیشتر» حذف نشود.

---

# 123. Independent Review — Arena Findings Intake Law (2026-09-29)

Arena به‌عنوان reviewer مستقل برای جلوگیری از single-agent truth ثبت می‌شود.

## 123.1 اصل نقش
Arena نباید جای Atria را به‌عنوان executor بگیرد و Atria نباید تنها منبع کشف defect باشد.

الگو:
**Atria / Executor → Arena / Independent Review → Reconciliation → Canonical Fix Queue → Atria / Executor → Verification**

## 123.2 Findings دریافت‌شده در آخرین review

Arena 1، 2 و 3 findings زیر را مطرح کردند. این موارد تا reproduction/verification در repository باید **DISCOVERY / SUSPECTED / REVALIDATION_REQUIRED** تلقی شوند و نباید صرفاً بر اساس گزارش Arena به confirmed defect تبدیل شوند.

### Security / scope / CI findings مطرح‌شده
- OTP 0000 bypass در non-production path؛
- دوگانگی production-truth بین isProdShape() و NODE_ENV/PAYESH_ENV؛
- CI early-exit / false-green risks؛
- stale/broken documentation references؛
- Strict Verification Gate و Verification Registry دارای evidenceهای stale؛
- A-26..A-29 در registry به‌طور کامل current-bound نیستند؛
- office/region fallback که نیازمند بررسی scope است؛
- canary logging که ممکن است وضعیت memory را به‌صورت PostgreSQL-derived نشان دهد؛
- structural lint budget concerns؛
- tombstone/pull scope behavior؛
- امکان green-on-zero در authz checks؛
- محدود بودن برخی syntax checks.

### Architecture / data / distributed findings مطرح‌شده
- احتمال حذف DB/Redis environment در tests/api/runner.js و اثر آن بر truthfulness برخی suiteها؛
- احتمال outbox collision که در آن ON CONFLICT (id) DO NOTHING می‌تواند event را silently drop کند؛
- احتمال fail-open در officeCoversSchool(null)؛
- احتمال schema mismatch مربوط به user.region_id؛
- in-memory SMS quota/idempotency؛
- migration/PK compatibility با ON CONFLICT(id)؛
- الگوهای بالقوه false-green مانند assert(true)، process.exit(0) و || true.

**اصل مهم:** Arena discovery ≠ confirmed defect. هر مورد باید با repository evidence، reproduction، blast-radius و independent verification تعیین تکلیف شود.

---

# 124. Copilot / External Finding Intake — Bootstrap Grade Path (2026-09-29)

در بررسی مستقل مسیر seedPgFromBootstrap() در server/index.js، درباره تبدیل classes.grade و grade_level چند finding مطرح شد.

## 124.1 Triage ثبت‌شده
- خطر structural ناشی از fieldSet.add('grade_level') بدون تضمین وجود column در schema، یک ریشه مشترک برای findingهای 1 و 6 تلقی شد و نیازمند reproduction واقعی PostgreSQL است.
- mapping فعلی Persian grade با trim() whitespace معمولی را پوشش می‌دهد، اما variant/prefixهای دیگر ممکن است mapping نشوند.
- finding مربوط به حذف grade در نبود grade عددی، به‌صورت blanket تأیید نشد؛ چون Persian values شناخته‌شده ابتدا به ordinal تبدیل می‌شوند و unknown stringها در compatibility path به grade_level منتقل می‌شوند.
- unknown/non-numeric handling باید با داده mixed و schema واقعی PostgreSQL verify شود.
- mixed numeric/unknown chunks به‌عنوان test scenario مهم ثبت شد.

## 124.2 قانون
برای bootstrap/seed conversion:
- schema discovery باید قبل از write معتبر باشد؛
- conversion نباید باعث data loss خاموش شود؛
- mixed-shape input باید test شود؛
- هر تبدیل grade → grade_level باید با actual DB schema و positive/negative/boundary evidence revalidate شود.

این intake در زمان ثبت، **REVALIDATION_REQUIRED** است و نباید به‌عنوان defect confirmed یا fixed تلقی شود مگر evidence جدید آن را تعیین کند.

---

# 125. ZCode / Atria Provider Integration — Engineering Environment Law

اتصال Atria به ZCode نیز به‌عنوان بخشی از engineering environment ثبت شد.

## 125.1 E2E evidence
در یک E2E کنترل‌شده:
- zcode-executor نسخه 0.3.2 نصب و فعال بود؛
- معماری واقعی مشخص شد: Hermes host → zcode-executor Node CLI → ZCode zcode.cjs؛
- provider Atria با base URL و model موردنظر در یک temporary worktree و temporary executor home تست شد؛
- doctor موفق شد؛
- session ساخته شد؛
- task واقعی sandbox اجرا و پاسخ دریافت شد؛
- هیچ تغییر Payesh در این E2E ایجاد نشد؛
- temporary state پاک شد.

## 125.2 Provider compatibility lesson
provider مورد آزمایش با فرض پیش‌فرض high در zcode-executor سازگار نبود و در مسیر مورد آزمایش disabled/enabled را پذیرفت. برای E2E موقت، variantها به disabled/enabled محدود و default روی enabled قرار گرفت.

این نتیجه فقط compatibility evidence برای آن E2E است و به‌تنهایی به معنی persistent production configuration یا certification کل integration نیست.

## 125.3 Security rule
Credential/API key هرگز نباید در report، source، repository یا evidence چاپ شود. در صورت exposure:
**STOP → ROTATE/REVOKE → REMEDIATE → AUDIT**

---

# 126. Evidence Status Model — تجربه تکمیل‌شده

برای جلوگیری از overclaiming، statusها در کل پروژه باید به‌صورت زیر استفاده شوند:

1. **DISCOVERED** — مشاهده/گزارش اولیه.
2. **REPORTED** — finding به‌صورت رسمی ثبت شده.
3. **SUSPECTED** — evidence اولیه وجود دارد ولی reproduction/confirmation ناقص است.
4. **REPRODUCED** — رفتار در شرایط مشخص بازتولید شده.
5. **ROOT-CAUSED** — علت ریشه‌ای با evidence مشخص شده.
6. **IMPLEMENTED** — fix در code/docs اعمال شده.
7. **TESTED** — test مرتبط اجرا شده.
8. **VERIFIED** — evidence معتبر و محیط/SHA مشخص، بدون contradiction شناخته‌شده.
9. **INDEPENDENTLY VERIFIED** — مسیر مستقل دیگری همان invariant/result را تأیید کرده.
10. **CERTIFIED** — تمام gates موردنیاز capability/project و evidence prerequisites برقرار است.

قواعد:
- status بالاتر جای status پایین‌تر را بدون حفظ provenance حذف نمی‌کند.
- historical evidence با current evidence یکی نیست.
- یک failure جدید می‌تواند status را به NOT VERIFIED / REVALIDATION_REQUIRED برگرداند.
- fixed، tested، verified و certified مترادف نیستند.

---

# 127. Current Strategic State — 2026-09-29

## 127.1 تمرکز فعلی
تمرکز راهبردی فعلی همچنان:
**Atria capability development / mastery proof**
است، نه ادامه کورکورانه broad Payesh hardening.

تا زمانی که evidence کافی برای سطح حرفه‌ای موردنظر Atria به‌دست نیامده:
- missionهای جدید باید capability gap را هدف بگیرند؛
- از broad duplicate scanning بدون هدف پرهیز شود؛
- هر گزارش جدید باید با وضعیت قبلی reconcile شود.

پس از احراز سطح موردنظر Atria، توسعه عادی Payesh ادامه می‌یابد و capability development متوقف نمی‌شود؛ هر weakness جدید در جریان توسعه Payesh باید targeted training/command دریافت کند.

## 127.2 نقش فعلی اعضا
| عضو | نقش | وضعیت فعلی |
|---|---|---|
| ChatGPT | Supervisor / Architect / Mission Designer / Evidence Adjudicator | فعال |
| Atria / ZCode | Primary Engineering Executor | VERIFIED / ADVANCED — NOT MASTERED |
| Hermes | Project Memory / Mission Controller / Watchdog / Evidence Manager | VERIFIED / ADVANCING — NOT MASTERED |
| Arena | Independent Reviewer / Adversarial Discovery | reviewer مستقل |
| GitHub + CI | Source/Evidence Infrastructure | مرجع delivery و verification؛ هر run باید با SHA/commit مشخص تفسیر شود |

## 127.3 Current project certification rule
Payesh تا زمانی که Strict Verification Gate، runtime truth، relevant security/scope invariants، test integrity، registry binding، CI evidence و سایر gates موردنیاز به‌صورت current و مستقل برقرار نشده‌اند، نباید CERTIFIED تلقی شود.

## 127.4 Known unresolved themes carried forward
این موارد از آخرین چرخه‌ها به‌عنوان موضوعات باز/نیازمند revalidation حمل می‌شوند و وضعیت دقیق هرکدام باید از current GitHub/evidence تعیین شود:
- OTP 0000 bypass؛
- A-13 test coverage/gate closure؛
- A-40 cascading CI skip؛
- A-41 strict-verification production-truth condition؛
- Verification Registry current-SHA rebinding؛
- stale/false-green verification evidence؛
- G7 / test-runner integrity؛
- writer-action authorization review؛
- real PostgreSQL/Redis runtime evidence؛
- DR/recovery/RPO/RTO؛
- performance/scale evidence؛
- multi-AI independent validation؛
- legacy harness/test ownership و false-green patterns؛
- Copilot bootstrap grade/grade_level revalidation؛
- Arena discoveries listed in section 123.

**این فهرست status نهایی هر item نیست؛ فقط queue/themeهای منتقل‌شده از آخرین evidence cycle است.**

---

# 128. Capability Mastery Proof Protocol — آخرین معیار

برای Atria و Hermes، Mastery فقط زمانی قابل اعلام است که در یک context تازه و مستقل، چرخه زیر با evidence واقعی طی شود:

**BASELINE → NEW CONTEXT → REPRODUCE → ROOT CAUSE → FIX/DECISION → NEGATIVE/BOUNDARY TEST → RUNTIME (when applicable) → FAILURE INJECTION → RECOVERY → INDEPENDENT VERIFICATION → CI/GITHUB → SELF-AUDIT → REASSESS**

حداقل quality gates:
- evidence provenance؛
- SHA binding؛
- environment declaration؛
- no false-green؛
- no unsupported claim؛
- scope/ownership discipline؛
- independent verification؛
- explicit limitations؛
- regression after fix؛
- documentation synchronization.

اگر runtime مورد نیاز باشد ولی runtime اجرا نشده باشد، status نباید به‌صورت ضمنی Mastered/Certified اعلام شود.

---

# 129. Lessons Learned — Consolidated Engineering Lessons

آخرین چرخه پروژه این lessons را به قانون reusable تبدیل کرده است:

1. **Current SHA مهم‌تر از memory است.**
2. **Local PASS بدون CI/runtime context کافی نیست.**
3. **Windows و Linux می‌توانند برای path/case/line-ending رفتار متفاوت داشته باشند؛ cross-platform verification باید هدفمند باشد.**
4. **False-green می‌تواند از خود harness بیاید، نه از application.**
5. **Negative tests برای اثبات failure behavior ضروری‌اند.**
6. **گزارش agent evidence نیست؛ artifact قابل بازتولید evidence است.**
7. **Mock/in-memory runtime جای production-like runtime truth را نمی‌گیرد.**
8. **Fix کوچک می‌تواند blast radius بزرگ داشته باشد.**
9. **Sibling finding بدون reproduction الزاماً مجوز bulk fix نیست.**
10. **Stale registry می‌تواند false-red ایجاد کند؛ rebind بدون rerun ممنوع است.**
11. **CI contradiction باید با discriminating experiment حل شود، نه با حدس.**
12. **اگر evidence متناقض است، status باید پایین بیاید تا reconciliation کامل شود.**
13. **Root cause از symptom مهم‌تر است؛ fix باید invariant را ببندد.**
14. **Clean Code quality است، نه certification.**
15. **Filter و scope بخشی از security boundary هستند، نه فقط optimization.**
16. **تعداد Agent بیشتر لزوماً throughput بیشتر نمی‌دهد؛ coordination cost باید سنجیده شود.**
17. **هر mission باید ownership، scope، non-scope و exit criteria داشته باشد.**
18. **Capability development باید با targeted command انجام شود، نه با افزودن بی‌رویه rule.**
19. **Self-audit پس از دریافت قانون جدید یک capability کلیدی است.**
20. **در نبود evidence، UNKNOWN وضعیت سالم‌تری از ادعای قطعی است.**
21. **سیگنال سلامت/verdict باید از اندازه‌گیریِ تازهٔ همان درخواست ساخته شود، نه از پرچمِ همگامی که به رویدادِ transport وصل است.** رویدادِ 'connect' زمانی حالت می‌دهد که TCP پذیرفته شده، نه زمانی که فرمانی پاسخ گرفته؛ در یک پارتیشنِ «اتصالِ زنده ولی بی‌پاسخ» (blackhole) پرچم روشن می‌ماند و ok:true / HTTP 200 با alive:false در همان بدنه تولید می‌شود — stale-flag false-green در سطحِ protocol. اثبات: redis.ready() زیر blackhole → ok:true (۷ از ۱۰ نمونه)، redis.ping() همیشه → ok:false.

---

# 130. Central Synchronization Rule — قانون به‌روزرسانی خودکار سند مادر

هر گزارش معتبر جدید از Atria، Hermes، Arena یا reviewer مستقل که یکی از موارد زیر را تغییر دهد، باید در اولین synchronization مناسب به PREQUISITES منتقل یا به canonical source مربوطه ارجاع داده شود:
- engineering law؛
- skill/capability level؛
- mission/workflow؛
- defect taxonomy؛
- evidence methodology؛
- security/scope invariant؛
- test/CI rule؛
- project role؛
- lesson learned؛
- unresolved critical finding؛
- source-of-truth mapping.

اما PREQUISITES نباید به محل dump کردن raw reports تبدیل شود.

الگو:
**RAW REPORT → TRIAGE → RECONCILE → EXTRACT LAW/LESSON/STATUS → CANONICAL SYNC**

---

# 131. Change Log — Latest Team Capability / Evidence / Lessons

| تاریخ | تغییر | دلیل |
|---|---|---|
| 2026-09-30 | اصلاحِ stale-flag health verdict در server/index.js (isHealthy/cache اکنون از redis.ping() تازهٔ همان درخواست ساخته می‌شوند، نه از redis.ready()) + ثبت Lesson 21 (blackhole partition و connect-event flag) | یک پارتیشنِ واقعی TCP blackhole باعث ok:true / HTTP 200 با redis.alive:false در همان بدنه می‌شد؛ اثبات بازتولیدشده با tests/a-next-health-blackhole.js (درخت broken: 10/10 false-green، درخت fixed: 9/9 green) |
| 2026-09-29 | ثبت آخرین وضعیت Atria پس از D-3 false-green mission، شامل root-cause analysis، دوطرفه negative testing، scope control، CI/runtime evidence boundaries و وضعیت VERIFIED/ADVANCED — NOT MASTERED | جلوگیری از overclaiming و تبدیل تجربه واقعی Atria به معیار reusable |
| 2026-09-29 | ثبت چرخه Hermes شامل contradiction resolution، cross-environment probe، stale/false-green handling، recovery، delegation و وضعیت VERIFIED/ADVANCING — NOT MASTERED | انتقال capability و lessons از Hermes به قانون مرکزی |
| 2026-09-29 | ثبت Arena به‌عنوان independent reviewer و انتقال discoveries به intake/revalidation pipeline به‌جای confirmed defect | جلوگیری از single-agent truth و جلوگیری از تبدیل report به fact بدون reproduction |
| 2026-09-29 | ثبت Copilot bootstrap grade/grade_level intake و الزام PostgreSQL/mixed-shape revalidation | جلوگیری از data-loss/schema assumptions در bootstrap |
| 2026-09-29 | ثبت ZCode/Atria provider E2E architecture و compatibility lesson با حفظ secret hygiene | تثبیت engineering environment و جلوگیری از secret leakage |
| 2026-09-29 | اضافه‌شدن Evidence Status Model از DISCOVERED تا CERTIFIED و بازگشت status در صورت contradiction/regression | یکسان‌سازی زبان verification و certification در کل تیم |
| 2026-09-29 | ثبت current strategic state، mastery protocol، consolidated lessons و Central Synchronization Rule | تبدیل تجربه چند agent به یک operating law قابل استفاده در missionهای بعدی |



# 132. Multi-Agent Micro-Defect Discovery Protocol — 16-View Review Model (2026-09-29)

از این مرحله، **11 Arena + در missionهای مهم 5 ChatGPT** به‌عنوان یک شبکه مستقل برای کشف defect، به‌خصوص **باگ‌های ریز، edge caseها، regressionهای پنهان و mismatchهای ظریف** استفاده می‌شوند.

## 132.1 اصل 16-view

وقتی mission برای Arena تعیین می‌شود، یک prompt canonical و یکسان به هر 11 Arena داده می‌شود و خروجی‌ها در یک بسته واحد جمع‌آوری می‌شوند. برای missionهای مهم bug-finding/testing می‌توان همان prompt را به 5 ChatGPT مستقل نیز داد.

الگو:
**1 Prompt → 11 Arena + 5 ChatGPT → 16 Independent Reports/Views → Reconciliation → Evidence**

هدف رأی‌گیری یا انتخاب «قوی‌ترین Chat» نیست؛ هدف افزایش پوشش زاویه‌های کشف و کاهش blind spot است.

## 132.2 قانون مهم: تعداد گزارش = evidence نیست

- consensus فقط signal است، نه proof.
- finding تک‌agent نباید به‌دلیل نبود consensus حذف شود؛ ممکن است blind-spot candidate باشد.
- contradiction باید صریح ثبت و با آزمایش تمایزبخش حل شود.
- هیچ finding صرفاً به‌علت «اکثریت 16 agent» confirmed نمی‌شود.
- هر finding مهم باید به repository evidence، reproduction، root cause و در صورت نیاز independent verification برسد.

## 132.3 وظیفه اصلی این 16 reviewer

تمرکز پیش‌فرض آنها **کشف** است، نه اصلاح مستقیم؛ مخصوصاً برای مواردی که در review سطحی از دست می‌روند:

- off-by-one و boundary conditions؛
- null/undefined/empty/zero/false و missing-field behavior؛
- type coercion و parsing؛
- Unicode/whitespace/normalization؛
- case sensitivity و path/filename mismatch؛
- date/time/timezone/locale؛
- pagination/count/total/export parity؛
- duplicate/idempotency/race/concurrency؛
- stale cache/invalidation؛
- retry/replay/order/restart/recovery؛
- authorization/scope/filter leakage؛
- legacy/alternate endpoints و bypass paths؛
- mixed-version/schema/data-shape compatibility؛
- partial failure و fail-open/fail-closed؛
- false-green/false-red در test harness و CI؛
- assertionsی که عملاً چیزی را assert نمی‌کنند؛
- swallowed errors، ignored return values، silent fallback؛
- dead code و unreachable branches؛
- documentation/code/test divergence؛
- stale SHA/evidence و claims خارج از محیط اجرا؛
- کوچک‌ترین regression ناشی از تغییرات اخیر.

## 132.4 Maximum-Capacity Prompting

Promptهای multi-agent نباید صرفاً «کل پروژه را بررسی کن» باشند. برای استفاده حداکثری از ظرفیت reviewer، هر mission باید تا حد امکان این قرارداد را صریح کند:

1. Context: project laws، current SHA، scope و هدف mission.
2. Role: adversarial independent defect hunter؛ نه executor.
3. Primary objective: پیدا کردن defectهای واقعی، به‌خصوص موارد کوچک و hidden.
4. Search strategy: source inspection + call graph/blast radius + invariant tracing + tests + alternate paths.
5. Adversarial strategy: boundary، negative، malformed، missing، duplicate، concurrent، restart و failure scenarios.
6. Evidence discipline: هر claim با file/line، reproduction یا دلیل دقیق، environment و confidence همراه باشد.
7. Contradiction handling: موارد مشکوک و متناقض جدا از confirmed findings ثبت شوند.
8. No bulk-fix: sibling pattern بدون reproduction نباید خودکار fix یا confirmed شود.
9. Scope discipline: از mission خارج نشود مگر security/data-corruption/build-breaking blocker کشف شود.
10. Output taxonomy: CONFIRMED / REPRODUCED / SUSPECTED / UNKNOWN / DISPROVED، همراه root cause candidate و next verification.
11. Micro-defect pass: قبل از پایان، یک pass مستقل فقط برای ریزباگ‌ها و edge caseها انجام شود.
12. Self-review: reviewer باید قبل از گزارش، یافته‌های خود را برای false positive، duplicate و unsupported inference دوباره بررسی کند.

## 132.5 Skill Layer — مهارت‌های reusable

اگر یک mission نشان دهد reviewer در یک capability ضعف دارد، به‌جای تکرار صرف prompt باید آن skill به‌صورت reusable در repository ثبت شود؛ برای نمونه:

- adversarial code review؛
- boundary-value analysis؛
- negative testing؛
- root-cause analysis؛
- blast-radius analysis؛
- authorization/scope reasoning؛
- SQL/schema/invariant review؛
- concurrency/distributed-state reasoning؛
- test-harness/false-green detection؛
- cross-platform verification؛
- evidence/reproducibility discipline؛
- contradiction resolution؛
- regression archaeology؛
- micro-defect and edge-case hunting.

Skill progression:
**UNKNOWN → LEARNING → PRACTICING → UNDERSTOOD → VERIFIED → MASTERED**

ثبت skill به‌تنهایی mastery نیست؛ mastery نیازمند evidence تکرارشونده در contextهای مستقل است.

## 132.6 حافظه بین missionها

پس از هر cycle:
**16 Reports → Extract Findings → Normalize/Deduplicate → Group by Root Cause → Extract Lessons/Skills → Canonical Sync**

اگر lesson یا skill عمومی و reusable باشد، در PREQUISITES یا سند canonical تخصصی ثبت شود. در missionهای بعدی، prompt باید **یادآوری کوتاه به skill/law موجود** بدهد، نه اینکه متن کامل آن دوباره کپی شود.

## 132.7 Evidence Matrix

برای هر cycle مهم، reconciliation باید حداقل این سه دسته را جدا کند:

- Consensus: چند agent مستقل به یک invariant/finding نزدیک شده‌اند.
- Disagreement: agentها در نتیجه، policy یا interpretation اختلاف دارند.
- Blind-spot candidates: findingهایی که فقط یک یا چند agent محدود کشف کرده‌اند.

سپس:
**DISCOVER → NORMALIZE → DEDUPLICATE → REPRODUCE → ROOT-CAUSE → NEGATIVE/BOUNDARY → INDEPENDENT VERIFY → EVIDENCE GATE**

این مدل برای افزایش confidence است، اما confidence نهایی فقط از evidence حاصل می‌شود، نه از شمارش رأی agentها.

## 132.8 Prompt Reuse Rule

از این پس هر mission جدید Arena/ChatGPT باید از این protocol به‌عنوان baseline استفاده کند و فقط قسمت mission-specific را تغییر دهد:

**Canonical Review Skill Reminder → Mission Context → Target Scope → Invariants → Adversarial Checklist → Evidence Contract → Output Contract**

هدف این است که ظرفیت reasoning هر reviewer به‌جای مصرف شدن برای بازسازی قوانین پایه، روی defect discovery همان mission متمرکز شود.

## 132.9 Operational outcome

این شبکه reviewer برای **افزایش پوشش کشف باگ، مخصوصاً micro-defectها** است؛ جایگزین Atria به‌عنوان executor یا جایگزین Evidence Gate نیست. Atria/Executor اصلاح و validation اجرایی را انجام می‌دهد و findings شبکه reviewer پس از reconciliation وارد canonical fix/verification queue می‌شوند.


# 56. Current Monitoring Team Operating Contract — 2026-09-30

This section is an operating update to the existing prerequisites; it does not create a new project document.

## 56.1 Team model
The project now uses a 16-view discovery/validation network plus two principal agents:
- Atria: execution and adversarial remediation.
- Hermes: independent verification and supervisory evidence review.
- 11 Arena views + 5 ChatGPT views: targeted discovery/validation when their scope is independent or a checkpoint requires additional coverage.
- ChatGPT control plane: prioritization, reconciliation, central-document maintenance, and final governance.

## 56.2 Monitoring is continuous
The project is not considered complete merely because one mission is green. Each material change creates a new current-HEAD boundary. Findings and fixes are revalidated against the current repository state.

## 56.3 Hermes invocation rule
Hermes is not required after every Atria prompt. Invoke it at high-risk checkpoints, P0/P1 findings, false-green/test-integrity findings, disputed evidence, recovery/security/data-integrity changes, and certification gates. This preserves both independence and throughput.

## 56.4 Agent learning rule
Weaknesses observed in Atria or Hermes are recorded as reusable lessons in the existing central intelligence/prerequisites material and tested in subsequent missions. The objective is measurable improvement, not repeated prompt inflation.

## 56.5 Repository cleanliness rule
Prefer consolidation in existing canonical files. Do not add a report file for a routine update. Any documentation deletion/consolidation requires dependency/reference/freeze impact review first. Generated/freeze metadata must remain synchronized.

## 56.6 Ground-truth order
current Git HEAD + reproducible runtime evidence + CI → source/tests → audited reports → planning documents → conversation claims

No lower layer may override a higher layer without new evidence.

## FINAL TEAM OPERATING CONTRACT — 2026-09-30

Before each material mission, the team must preserve this information chain:

**Canonical project context → Atria mission → Atria evidence → Hermes independent verification → Current-HEAD reconciliation → ChatGPT final decision.**

Hermes must be briefed from canonical documents sufficiently to understand architecture, current phase, prior completed work, open queue, evidence boundaries, current HEAD and remaining roadmap. The 16-view network is invoked only for targeted independent discovery/review.

Completion states are explicit: **VERIFIED / FIXED-SCOPED / REVALIDATION_REQUIRED / NOT VERIFIED / UNKNOWN / BLOCKED**. Historical evidence cannot silently become current evidence.

