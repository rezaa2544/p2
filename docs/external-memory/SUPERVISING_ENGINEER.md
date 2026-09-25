# Payesh — Supervising Engineer (مهندس ناظر)
## Canonical project-memory control document
**Status:** ACTIVE / MANDATORY  
**Created:** 2026-09-25

### Mission
این سند «حافظه اجرایی/ناظر» پروژه است. هدف آن جلوگیری از فراموش شدن وظایف، مراحل، تصمیم‌ها، مالکیت عامل‌ها، وضعیت evidence و قوانین غیرقابل‌مذاکره بین نشست‌ها و بین agentهاست.

این سند جایگزین Roadmap یا Strict Verification Gate نیست؛ بلکه لایه کنترل‌کننده‌ای است که باید آن‌ها را به‌صورت روزانه و بعد از هر تغییر به هم متصل کند.

## 1. قانون اصلی
هیچ تغییر مادی، گزارش، تصمیم، merge، fix، regression، تغییر مالکیت یا تغییر مرحله بدون به‌روزرسانی هوش پروژه و حافظه کامل تلقی نمی‌شود.

پس از هر material event:
1. current HEAD را بخوان.
2. اثر تغییر را روی roadmap تشخیص بده.
3. Project Intelligence را به‌روزرسانی کن.
4. Dashboard/Daily Tasks/Decision Log/CHANGELOG را در صورت ارتباط به‌روزرسانی کن.
5. evidence و registry binding را بررسی کن.
6. اگر code merge شده، evidence قبلی affected را REVALIDATION_REQUIRED کن مگر خلاف آن اثبات شود.
7. handoff بعدی را ثبت کن.

## 2. قانون Push اجباری

وقتی به یک agent دستور اجرایی داده می‌شود که شامل تغییر repository است، Push/PR/Merge جزء خود وظیفه است، نه یک کار اختیاری بعدی.

Agent بدون commit/push معتبر: WORK_INCOMPLETE

Agent با commit روی branch ولی بدون push: WORK_INCOMPLETE

Agent با push ولی بدون PR/تحویل شناسه قابل بررسی: WORK_INCOMPLETE

Agent با PR باز ولی بدون merge، در صورتی که دستور ورود به main بوده: WORK_INCOMPLETE

### علت شکست قبلی
گزارش‌های قبلی نشان دادند الزام push عمدتاً در prompt بود اما enforcement ماشینی و تحویل‌گیری صریح نداشت. در نتیجه agent می‌توانست تحلیل/کدنویسی را «تمام‌شده» گزارش کند بدون اینکه repository state به‌عنوان معیار تحویل تغییر کند.

### کنترل جدید
هر prompt اجرایی آینده باید یک Delivery Contract داشته باشد:
- required branch/target
- required commit
- required push
- required PR یا مستقیم-main طبق سیاست مخزن
- exact commit/PR identifier
- changed files
- tests
- final repository verification

### Gate
در گزارش نهایی agent این فیلدها اجباری‌اند:
STATUS / COMMIT / PUSHED / PR / TARGET / TESTS / EVIDENCE

اگر PUSHED != true باشد، status هرگز DONE نیست.

اگر دستور merge-to-main بوده و MERGED != true باشد، status هرگز DONE نیست.

گزارش کلامی agent بدون repository evidence اعتبار تحویل ندارد.

## 3. Agent ownership
- ChatGPT 7 executor نیست.
- کار منتقل‌شده از ChatGPT 7 متعلق به Arena 10 است.
- این دو هرگز در گزارش‌ها ادغام یا اشتباه attribution نشوند.
- هر agent باید workstream و target خود را صریح اعلام کند.

## 4. Supervising Engineer checklist

### قبل از کار
- [ ] current HEAD خوانده شد.
- [ ] roadmap/ground truth خوانده شد.
- [ ] dashboard و daily tasks خوانده شد.
- [ ] owner و scope مشخص شد.
- [ ] dependency/conflict با کار دیگران بررسی شد.
- [ ] Delivery Contract ساخته شد.

### حین کار
- [ ] تغییرات با scope تعریف‌شده تطبیق دارند.
- [ ] root cause بررسی شده، نه فقط symptom.
- [ ] regression ساخته شده.
- [ ] negative/adversarial cases بررسی شده.
- [ ] تغییرات خارج از scope ثبت شده‌اند.

### تحویل
- [ ] commit وجود دارد.
- [ ] commit روی remote وجود دارد.
- [ ] PR identifier در صورت نیاز وجود دارد.
- [ ] target branch مشخص است.
- [ ] merge status مطابق دستور است.
- [ ] tests/evidence ثبت شده.
- [ ] current HEAD دوباره خوانده شده.
- [ ] intelligence/memory/roadmap به‌روزرسانی شده.
- [ ] blockers صریح ثبت شده‌اند.

## 5. Recurring-defect control
هر موردی که قبلاً FIXED بوده و دوباره مشاهده می‌شود، خودکار وارد مسیر:
REAPPEARANCE → ROOT CAUSE → INVARIANT → ALTERNATE PATHS → FIX → REGRESSION → CURRENT HEAD → INDEPENDENT REVIEW

FIXED-SCOPED با ROOT-CAUSE-CLOSED یکی نیست.

## 8. Universal Work-Quality Rules — mandatory for every task

این بخش از تجربه گزارش‌های قبلی استخراج شده و از این پس «قانون اجرایی» است، نه توصیه.

### 8.1 Rule Zero — اول کنترل، بعد اقدام
قبل از هر کار مادی:
1. همین سند را بخوان.
2. current main HEAD را از GitHub بخوان و SHA را ثبت کن.
3. Roadmap/Ground Truth و Project Intelligence را با آن تطبیق بده.
4. مرحله فعلی و دقیقاً «کار بعدی مجاز» را تعیین کن.
5. بررسی کن آیا کار قبلاً انجام شده، در branch/PR دیگری در حال انجام است، یا blocker دارد.
6. فقط اگر کار لازم، non-duplicate و stage-appropriate است شروع کن.
اگر وضعیت یا مالکیت مبهم است: اول verify؛ کدنویسی نکن.

### 8.2 قانون «کار بیهوده ممنوع»
هیچ agent نباید صرفاً برای تولید activity کاری انجام دهد.
کار شروع نشود اگر قبلاً در main حل شده، همان scope را agent دیگری مالک است، نتیجه بدون evidence قابل استفاده نیست، به مرحله فعلی مربوط نیست، فقط برای سبز کردن گزارش است، یا پیش‌نیازش موجود نیست.
در این شرایط خروجی مطلوب NO-OP / BLOCKED / ALREADY COVERED است، نه تغییر کد.

### 8.3 قانون Source of Truth
ترتیب اعتبار:
1. current runtime / E3-E4 evidence و GitHub Actions واقعی
2. current GitHub main HEAD و کد همان SHA
3. regression/evidence artifact قابل بازتولید روی همان SHA
4. گزارش ممیزی
5. roadmap/planning
6. اظهارنظر agent یا chat
گزارش agent جای repository evidence را نمی‌گیرد.

### 8.4 قانون SHA و Evidence
هر claim باید به exact SHA، scope، command، exit code و artifact/log قابل بازتولید متصل باشد.
evidence روی SHA قدیمی برای current HEAD معتبر فرض نمی‌شود.
هر material merge کد، evidence affected را REVALIDATION_REQUIRED می‌کند.
registry فقط بعد از freeze hardening SHA و بازاجرای evidence همان SHA قابل rebind است.

### 8.5 قانون Root Cause
برای هر defect:
Reproduce → Root Cause → Invariant → All Paths → Source Fix → Negative/Adversarial Regression → Current-HEAD Evidence → Independent Review
اگر defect قبلاً FIXED بوده و دوباره پیدا شد، REAPPEARANCE و root-cause analysis اجباری است.
FIXED-SCOPED را ROOT-CAUSE-CLOSED گزارش نکن.

### 8.6 قانون Scope Completeness
قبل از closure، inventory مرتبط باید بررسی شود:
REST/API، sync/offline، workers/jobs/queues، direct DB writes، client/browser، role/tenant/ownership، configuration/env، restart/failure، legacy/compatibility.
یک مسیر سبز به‌تنهایی invariant سراسری را ثابت نمی‌کند.

### 8.7 قانون Security / Authorization
برای security، tenant isolation، ownership، OCC، revocation و conflict:
- positive و negative test هر دو الزامی؛
- cross-tenant / cross-school / wrong-role cases الزامی؛
- bypass از مسیر جایگزین جست‌وجو شود؛
- policy تا حد امکان single-source باشد؛
- hydration/persistence parity از seed تا DB تا session/policy اثبات شود؛
- fail-open، fallback و compatibility path عمداً adversarial تست شوند.

### 8.8 قانون Data Integrity / Persistence
برای داده حساس: source of truth، transaction boundary و idempotency مشخص باشد؛ restart/replay، DB read-back، partial failure، duplicate execution و reconciliation بین mirror/cache/queue و DB بررسی شود.
HTTP 200 / sent / success به‌تنهایی اثبات persistence یا delivery نیست.

### 8.9 قانون Test Integrity — False Green ممنوع
این موارد بدون justification صریح blocker هستند:
assert(true)، assertion بی‌اثر، process.exit(0) برای سبز کردن، || true، skip خودکار prerequisite و گزارش PASS، mock-only برای ادعای integration/E2E، target اجرا نشده، 0/0، swallowed error/catch، environment شرطی که failure را PASS کند، historical CI برای current HEAD.
اگر prerequisite موجود نیست: NOT-RUN / BLOCKED؛ هرگز PASS.

### 8.10 قانون Negative / Adversarial / Failure Testing
هر claim مهم باید تا حد کاربرد شامل happy path، negative، adversarial/bypass، malformed/empty/no-data، permission boundary، restart/recovery، timeout/failure و duplicate/replay باشد.
برای failure/recovery فقط «سیستم بالا آمد» کافی نیست؛ RPO/RTO/MTTA/MTTR یا معیار پذیرش تعریف‌شده باید اندازه‌گیری و artifact شود.

### 8.11 قانون No Self-Certification
عامل اجراکننده تنها مرجع نهایی صحت کار خودش نیست.
برای certification: reviewer مستقل، evidence مستقل، current SHA و در Gate نهایی ChatGPT + Arena + Atria لازم است.
یک AI PASS = certification نیست.

### 8.12 قانون Parallel Work / Conflict Control
workstreamها non-overlapping باشند.
قبل از شروع، فایل/مسیر/مسئله تحت مالکیت سایر agentها بررسی شود.
اگر دو agent روی یک invariant کار می‌کنند، یکی owner و دیگری reviewer/validator باشد؛ دو fix مستقل ممنوع مگر صریحاً برنامه‌ریزی شده.
Atria هنگام sweep اختصاصی خود نباید با تغییرات موازی همان scope مختل شود.
ChatGPT 7 executor نیست؛ work منتقل‌شده متعلق به Arena 10 است.

### 8.13 قانون Minimal Safe Change
کمترین تغییر لازم برای بستن invariant اعمال شود.
refactor، rename، formatting و dependency churn نامرتبط ممنوع مگر لازم و ثبت‌شده.
baseline حفظ شود.
تغییر destructive یا irreversible بدون تأیید صریح ممنوع.
force-push/history rewrite ممنوع.
secret/token هرگز در code، commit، issue، log یا prompt ذخیره نشود.

### 8.14 قانون Regression Permanence
Regression برای defect مهم باید دائمی و قابل اجرای مجدد باشد.
اگر test حذف/ضعیف/skip شد، جایگزین قوی‌تر ثبت شود.
Recurring defects باید در Reappearance Suite باقی بمانند.

### 8.15 قانون Delivery Contract
هر prompt اجرایی باید مشخص کند:
OWNER / WORKSTREAM / OBJECTIVE / SCOPE / NON-SCOPE / BASE SHA / TARGET / DEPENDENCIES / REQUIRED TESTS / REQUIRED EVIDENCE / DELIVERY
تحویل باید شامل:
STATUS / COMMIT / PUSHED / PR / TARGET / TESTS / EVIDENCE / CURRENT HEAD / BLOCKERS
باشد.
DONE فقط وقتی معتبر است که repository state با target موردنظر منطبق باشد.

### 8.16 قانون Stop / Escalate
در requirement متناقض، target نامعلوم، dependency/access مفقود، محیط تست غیرقابل اعتماد، نقض invariant دیگر، scope creep یا تناقض evidence با code/HEAD، توقف کن.
وضعیت را BLOCKED یا REVALIDATION_REQUIRED کن و unblocker را ثبت کن.

### 8.17 قانون Final Handoff
قبل از پایان:
1. diff را review کن.
2. changed files را با scope مقایسه کن.
3. tests را واقعاً اجرا و count/exit code را ثبت کن.
4. evidence را به SHA bind کن.
5. remote/PR/merge را verify کن.
6. current HEAD را دوباره بخوان.
7. roadmap/intelligence/memory را در صورت material بودن به‌روزرسانی کن.
8. blocker/limitation را صریح اعلام کن.

### 8.18 قانون گزارش‌نویسی دقیق
FIXED یعنی source fix موجود است و لزوماً certification نیست.
FIXED-SCOPED یعنی فقط scope مشخص بسته شده.
TESTED یعنی test اجرا شده.
RUNTIME_VERIFIED یعنی runtime evidence روی SHA مشخص وجود دارد.
ADVERSARIAL_VERIFIED یعنی negative/adversarial evidence هم وجود دارد.
INDEPENDENTLY_VERIFIED یعنی reviewer مستقل تأیید کرده.
CERTIFIED یعنی همه شروط Gate برقرار است.
NOT VERIFIED یعنی اثبات کافی وجود ندارد.
BLOCKED یعنی پیش‌نیاز/دسترسی مانع اجراست.
REVALIDATION_REQUIRED یعنی code/evidence boundary تغییر کرده و باید دوباره اثبات شود.
هرگز برای سرعت، وضعیت بالاتری از evidence واقعی انتخاب نکن.

## 9. Decision Gate — قبل از هر اقدام
قبل از هر تغییر، این 7 سؤال باید جواب داشته باشد:
1. چرا این کار الآن لازم است؟
2. دقیقاً کدام مرحله/آیتم roadmap را جلو می‌برد؟
3. آیا قبلاً انجام شده یا کسی دیگر مالک آن است؟
4. Invariant یا outcome مورد انتظار چیست؟
5. چه evidence ای موفقیت را ثابت می‌کند؟
6. اگر شکست خورد یا ناقص بود، چگونه تشخیص می‌دهیم؟
7. تحویل نهایی دقیقاً کجا باید دیده شود؟
اگر پاسخ روشن نیست، اقدام متوقف می‌شود تا ابهام رفع شود.

## 10. Rule of Efficiency
هدف «کار بیشتر» نیست؛ هدف کمترین کار لازم برای بیشترین کاهش ریسک و بیشترین evidence معتبر است.
اولویت با کاری است که blocker فعلی را باز کند، root cause را حذف کند، چند مسیر را با یک invariant/policy درست کند، evidence قابل بازتولید بسازد یا از recurrence جلوگیری کند.
کار تزئینی، گزارش‌سازی، تست بدون gate و refactor خارج از scope در اولویت نیست.

## 11. Mandatory session-start state
در شروع هر کار، پس از خواندن این سند و اسناد لازم، این وضعیت باید internally تعیین شود:
PHASE / CURRENT HEAD / NEXT ALLOWED ACTION / OWNER / DEPENDENCIES / EVIDENCE TARGET / DELIVERY TARGET
این مرحله تشریفاتی نیست؛ برای جلوگیری از فراموشی، دوباره‌کاری و تصمیم اشتباه است.

## 6. Session-start mandatory read order
1. docs/external-memory/SUPERVISING_ENGINEER.md
2. docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md
3. docs/CURRENT_PROJECT_INTELLIGENCE.md
4. docs/CURRENT_WORK_EXECUTION_PLAN.md
5. docs/external-memory/PROJECT_DASHBOARD.md
6. docs/external-memory/DAILY_TASKS.md
7. docs/external-memory/DECISION_LOG.md
8. verification registry / Strict Verification Gate when making verification claims
9. current Git HEAD

## 7. Current state — 2026-09-25
- Project phase: Hardening / Reconciliation — NOT VERIFIED
- Immediate priority: root-cause recurrence elimination + A-30..A-39
- Registry: intentionally stale until final hardening SHA
- Recurring-defect program: active
- Mandatory push/delivery contract: active
- ChatGPT 7 / Arena 10 ownership separation: active

### Immediate next controls
1. Add delivery-contract enforcement to future agent prompts.
2. Verify every claimed agent completion against GitHub, not prose.
3. Track unpushed/unmerged work as incomplete.
4. Invalidate affected evidence after material merges.
5. Keep the root-cause/reappearance program ahead of broad certification.


## 12. Continuous Synchronization / No-Stale-Memory Rule

**حکم:** هیچ material event نباید در یک فایل/سطح ثبت شود و وضعیت مرتبط در جای دیگر به‌روز نشده باقی بماند.

هر تغییر، حتی اگر کوچک باشد، باید فوراً impact خود را روی محل‌های مربوط بررسی کند و در صورت ارتباط همان‌جا به‌روزرسانی شود:
- Roadmap / Ground Truth
- Project Intelligence
- Current Work Execution Plan
- Project Dashboard
- Daily Tasks
- Decision Log
- CHANGELOG
- Agent/Chat mission & status registry
- Verification Registry / evidence bindings
- audit/carry-over documents
- issue/task records در صورت وجود

**قانون:** «کوچک بودن تغییر» دلیل برای عقب انداختن synchronization نیست. فقط محل‌های واقعاً مرتبط به‌روزرسانی شوند؛ از updateهای بی‌ربط و نویز جلوگیری شود.

### 12.1 Agent/Chat Mission Registry — حافظه عملیاتی اجباری

مهندس ناظر باید یک تصویر جاری از تمام executorها و reviewerها داشته باشد:
- شناسه یکتا: ChatGPT 1..5 / Arena 1..11 / Atria
- mission فعلی
- workstream / ownership
- scope و non-scope
- base SHA
- target branch
- dependencies / blockers
- status
- آخرین commit / PR
- آخرین evidence
- آخرین گزارش دریافت‌شده
- next action
- handoff / transferred ownership

**ChatGPT 7 executor نیست.** کار منتقل‌شده از ChatGPT 7 متعلق به Arena 10 است و این attribution باید همیشه ثابت بماند.

این registry باید طوری نگهداری شود که با دیدن یک گزارش agent بتوان مشخص کرد:
1. این گزارش مربوط به کدام agent است؛
2. مربوط به کدام mission است؛
3. چه چیزی قرار بوده تحویل دهد؛
4. چه چیزی واقعاً تحویل داده؛
5. چه چیزی هنوز باقی مانده؛
6. آیا commit/push/PR/merge واقعاً انجام شده یا فقط ادعا شده؛
7. قدم بعدی چیست.

### 12.2 قانون Report-to-Mission Reconciliation

هر گزارش agent که دریافت می‌شود باید بلافاصله به mission مربوطه map شود.

فرآیند اجباری:
**Report → Identify Owner → Identify Mission → Compare Scope → Verify Repository → Verify Tests/Evidence → Update Agent Status → Update Project State → Determine Next Action**

اگر گزارش فاقد شناسه کافی باشد، از روی متن، scope، branch، commit، PR و شواهد موجود باید تلاش برای تطبیق انجام شود؛ اما تطبیق حدسی نباید به‌عنوان fact ثبت شود.

### 12.3 Status Transition Rule

بعد از هر گزارش، وضعیت agent باید صریحاً یکی از این حالت‌ها باشد:
- NOT STARTED
- ASSIGNED
- IN PROGRESS
- WAITING / BLOCKED
- READY FOR REVIEW
- REVIEWED
- COMMIT CREATED
- PUSHED
- PR OPEN
- MERGED
- VERIFIED
- DONE
- REVALIDATION_REQUIRED

**DONE فقط با repository/evidence confirmation معتبر است.**
گزارش «تمام شد» بدون تحقق target delivery فقط گزارش است، نه DONE.

### 12.4 Mission State باید بعد از هر گزارش به‌روز شود

پس از هر گزارش، حداقل این موارد باید به‌روز شوند:
- current status
- last report
- last verified commit/HEAD
- tests
- evidence
- unresolved findings
- blockers
- next action
- delivery gap
- dependency changes

اگر report نشان دهد mission تمام نشده، نباید آن را completed ثبت کرد.

### 12.5 حافظه نباید فقط در ChatGPT باقی بماند

حافظه missionهای agentها باید repository-backed باشد.
Chat history، prompt و حافظه مدل منبع نهایی وضعیت mission نیستند.
اگر اطلاعات mission مهم است، باید در سند/registry مناسب پروژه ثبت شود تا در نشست بعدی قابل بازیابی باشد.

### 12.6 Update Cascade Rule

بعد از هر material event این زنجیره بررسی شود:

**Event → Affected Mission → Affected Workstream → Affected Roadmap Phase → Affected Evidence → Affected Registry → Affected Dashboard/Tasks/Decision/Changelog**

اگر یک حلقه affected است، همان لحظه update شود.
اگر affected نیست، update مصنوعی انجام نشود.

### 12.7 No Stale Status

هیچ agent نباید به دلیل قدیمی بودن اطلاعات، دوباره مأموریتی را انجام دهد که:
- قبلاً merge شده؛
- به agent دیگری منتقل شده؛
- blocked شده؛
- scope آن تغییر کرده؛
- evidence آن invalid شده؛
- یا mission آن superseded شده است.

قبل از assignment جدید، mission registry و current HEAD بررسی شود.

### 12.8 Assignment Ledger

هر assignment جدید باید با این اطلاعات ثبت شود:
**DATE / OWNER / MISSION / OBJECTIVE / SCOPE / NON-SCOPE / BASE SHA / TARGET / DEPENDENCIES / REQUIRED EVIDENCE / DELIVERY CONTRACT**

هر transfer نیز باید ثبت کند:
**FROM / TO / REASON / REMAINING WORK / LAST KNOWN STATE / SOURCE SHA / NEW TARGET**

این ledger برای جلوگیری از گم‌شدن وظایف و اشتباه در attribution الزامی است.

### 12.9 گزارش ورودی سریع‌خوان

برای اینکه با دیدن گزارش فوراً مشخص شود مربوط به کدام chat/agent است، هر delivery report باید در ابتدای خود یک header استاندارد داشته باشد:

**AGENT / MISSION-ID / STATUS / BASE SHA / COMMIT / PUSHED / PR / TARGET / TESTS / EVIDENCE / BLOCKERS / NEXT ACTION**

اگر agent این header را ارائه نکرد، ناظر باید آن را در reconciliation تولید کند و وضعیت «unconfirmed» را حفظ کند تا با repository شواهد کافی پیدا شود.

### 12.10 قانون ضد فراموشی

مهندس ناظر باید قبل از هر assignment و بعد از هر report بتواند پاسخ دهد:
- الان هر agent روی چه چیزی است؟
- چه چیزی به او سپرده شده؟
- چه چیزی تحویل داده؟
- چه چیزی push/merge نشده؟
- چه dependency دارد؟
- قدم بعدی چیست؟
- آیا assignment با roadmap فعلی سازگار است؟

اگر پاسخ یکی از این موارد نامشخص است، ابتدا registry را reconcile کن؛ سپس تصمیم اجرایی بگیر.

### 12.11 پایان جلسه / تحویل نشست

قبل از پایان یک نشست کاری:
- missionهای تغییرکرده synchronize شوند؛
- statusهای stale اصلاح شوند؛
- handoffهای جدید ثبت شوند؛
- blockers و next actions ثبت شوند؛
- current HEAD ثبت شود؛
- evidenceهای affected مشخص شوند.

هدف این است که نشست بعدی بتواند بدون اتکا به حافظه conversational، وضعیت واقعی را از repository بازسازی کند.


### 12.12 قانون گزارش پیشرفت، تیک‌ها و راستی‌آزمایی Push

برای هر گزارش دریافتی از agent، مهندس ناظر باید وضعیت **همان task/mission مرتبط** را به‌صورت صریح گزارش کند:

- **درصد پیشرفت:** درصد واقعی پیشرفت همان task/mission، بر اساس scope و evidence موجود، نه صرفاً ادعای agent.
- **موارد انجام‌شده:** با `✅` مشخص شوند.
- **موارد انجام‌نشده/باقی‌مانده:** با `⬜` مشخص شوند.
- **موارد ادعایی ولی تأییدنشده:** تا زمان verification با `⬜`/UNVERIFIED باقی بمانند و DONE محسوب نشوند.
- **Push:** مهندس ناظر باید وضعیت remote را مستقیماً از repository بررسی کند. صرف وجود commit محلی، متن گزارش، یا ادعای agent برای تأیید Push کافی نیست.
- **تیک Push:** فقط وقتی `✅` مجاز است که commit موردنظر واقعاً روی remote/target branch قابل مشاهده و با SHA مورد انتظار منطبق باشد.
- **گزارش Push:** در خلاصه نهایی، وضعیت Push فقط با `✅` نمایش داده شود؛ اگر قابل تأیید نیست، تیک تأییدشده داده نشود.
- **اتصال گزارش به مأموریت:** هر گزارش باید به agent، mission/task، workstream و target مربوطه map شود تا مشخص باشد گزارش مربوط به کدام چت و کدام مأموریت است.

### 12.13 قانون اجباری برای خودِ مهندس ناظر — Repository Delivery First

مهندس ناظر نیز مشمول تمام قوانین Delivery Contract است و برای تغییرات repository خودش هیچ استثنایی ندارد.

هرگاه مهندس ناظر سند، حافظه، هوش پروژه، roadmap، registry، dashboard، task record، changelog یا هر فایل repository-backed دیگری را تغییر دهد:

1. تغییر باید واقعاً در repository ثبت شود.
2. commit باید ایجاد شود.
3. تغییر باید طبق target تعیین‌شده **Push** شود.
4. اگر target طبق سیاست پروژه PR است، PR باید ایجاد/تحویل و در صورت الزام merge شود.
5. بعد از push/merge، current remote HEAD دوباره خوانده شود.
6. path، commit SHA، target branch و وضعیت remote با تغییر موردنظر تطبیق داده شوند.
7. فقط پس از این راستی‌آزمایی، مهندس ناظر مجاز است تغییر را «ثبت‌شده / تحویل‌شده / DONE» گزارش کند.

**ممنوع:** گفتن «در فایل اضافه شد»، «ثبت شد»، «ذخیره شد» یا «Push شد» صرفاً بر اساس موفقیت یک عملیات نوشتن محلی/ابزاری، بدون verification نهایی روی GitHub.

### 12.14 قانون عدم ادعای تحویل

برای مهندس ناظر و تمام agentها:

`WRITE SUCCESS ≠ COMMIT ≠ PUSH ≠ MERGE ≠ VERIFIED DELIVERY`

هر مرحله باید جداگانه تأیید شود.

اگر هر مرحله ناقص باشد، وضعیت واقعی همان مرحله گزارش شود:
- بدون commit → WORK_INCOMPLETE
- commit بدون remote → WORK_INCOMPLETE
- push بدون target/PR لازم → WORK_INCOMPLETE
- merge لازم ولی انجام نشده → WORK_INCOMPLETE
- evidence ناسازگار با HEAD → REVALIDATION_REQUIRED
- repository/evidence تأییدشده → VERIFIED

### 12.15 قانون Self-Update + Self-Verification

هر تغییر مهندس ناظر به این سند یا اسناد کنترل پروژه باید در همان چرخه کاری به‌صورت زنجیره‌ای پیگیری شود:

**EDIT → COMMIT → PUSH/PR/MERGE طبق TARGET → READ REMOTE HEAD → VERIFY FILE AT REMOTE HEAD → UPDATE STATUS → REPORT**

اگر verification نهایی انجام نشده باشد، وضعیت تغییر **UNVERIFIED** است و نباید با `✅` یا DONE گزارش شود.




## 12.16 — Fresh Repository Defect Audit / Two-Atria Remediation Control — 2026-09-25

**Canonical defect register:** `docs/audit/MASTER_DEFECT_PRIORITY_2026-09-25.md`

The Supervising Engineer performed a fresh repository/source audit and reconciled it with Ground Truth, Project Intelligence, Current Work Execution Plan, Atria carry-over, A-30..A-39 and the latest independent fresh-defect report.

### Current fresh-defect truth
- **F1 — P0 OPEN:** bootstrap→PG seed can silently skip incompatible rows, does not advance identity sequences, and can combine with ID allocation + `ON CONFLICT (id) DO UPDATE` to overwrite seeded identity rows. **Root-cause fix first.**
- **F2 — P1 OPEN:** legacy parent scope still queries PostgreSQL-nonexistent `users.parent_id`; production turns schema drift into a 404.
- **F3 — P1 FIXED-SCOPED / REVALIDATION_REQUIRED:** current `pull` collection allowlist/scoping blocks the previously reported arbitrary `parent_links` exposure; final regression required.
- **F4 — P1 OPEN:** manager can reach analytics region branches without proof of region ownership; school/province guard does not establish region ownership.
- **F5 — P1 FIXED-SCOPED / REVALIDATION_REQUIRED:** current province resolution includes `office_id → offices.province_id/province_code`; final regression required.

### Mandatory remediation order
**F1 → A-30 → A-37 → F4 → F2 → A-31..A-36 → A-18/A-20/A-24 → A-38 → A-39 → remaining carry-over → independent multi-AI validation.**

### Two-Atria mission ledger
**Atria-1 — Product/Security/Data Root Causes**
- Scope: F1, F2, F4, A-31..A-36, A-18/A-20/A-24 product/runtime remediation.
- Non-scope: A-30/A-37 gate implementation, except review/evidence as requested.
- Target: main via required delivery contract.
- Status: ASSIGNED / awaiting verified execution.

**Atria-2 — Gate/Test-Integrity/Reliability**
- Scope: A-30, A-37, A-39 preparation/acceptance work, A-01..A-17/A-23 test/CI/operational carry-over, A-38 preparation.
- Non-scope: F1/F2/F4 product fixes owned by Atria-1.
- Target: main via required delivery contract.
- Status: ASSIGNED / awaiting verified execution.

**Non-overlap:** the two Atria agents must not concurrently modify the same invariant/file. If a dependency crosses scopes, one agent is executor and the other reviewer.

### Phase control
The project remains **HARDENING / RECONCILIATION — NOT VERIFIED**. Broad testing/certification is explicitly blocked until the open P0/P1 root-cause queue is fixed or formally dispositioned with evidence. F3/F5 remain revalidation obligations and are not certified by source inspection.

### Progress/reporting control
For every Atria report the Supervising Engineer must immediately map:
**AGENT → MISSION → FINDING IDs → SCOPE → BASE SHA → COMMIT → PUSHED → TARGET → TESTS → EVIDENCE → CURRENT HEAD → REMAINING ITEMS → NEXT ACTION**.

Progress percentage is based on verified scope/evidence, not claimed activity. Each item is shown as **✅** only after the corresponding delivery/evidence gate is actually verified; otherwise it remains **⬜ / UNVERIFIED**.


## 12.17 — Direct Remediation Before Atria Handoff — 2026-09-25

The Supervising Engineer must not defer a safely actionable defect merely because an executor agent exists. Before Atria execution, the following direct source fixes were applied:

- **F1:** hardened `seedPgFromBootstrap()` against the observed bootstrap/PG integrity failure: semantic grade preservation for legacy `classes.grade`, explicit identity-sequence advancement, fail-closed fallback insertion, and hard failure on skipped seed/sequence operations. The first-boot caller no longer converts seed failure into a warning-only successful boot.
- **F2:** removed the obsolete `users.parent_id` PostgreSQL lookup from parent scope resolution. `parent_links` is the authoritative relation.
- **F4:** added explicit manager denial for regional targets in both quality-governance and longitudinal-intelligence authorization guards.

**Delivery state:** code is **FIXED-SCOPED / TEST PENDING**. CI on the latest code HEAD is currently pending, so these fixes must not be reported as VERIFIED/CERTIFIED.

### Team correction
The executor team is now **1 Supervising Engineer + 5 ChatGPT + 10 Arena + 3 Atria**.

Atria-3 is a new execution/review slot. Its exact mission must be assigned from the remaining queue without overlapping Atria-1/Atria-2 or redoing F1/F2/F4 unless fresh residual evidence requires it.


## 12.19 — Canonical Integration / Single-HEAD Policy — 2026-09-25

از این تاریخ، ترتیب زیر روش رسمی و اجباری یکپارچه‌سازی پروژه است. هدف، حذف هم‌زمانیِ HEADهای مبهم، جلوگیری از merge اشتباه، و حفظ تمام تغییرات واقعی بدون حذف یا overwrite ناخواسته است.

### ترتیب قطعی یکپارچه‌سازی

**1. Freeze & Read**
- current main HEAD از GitHub خوانده و به‌عنوان **Canonical HEAD** ثبت می‌شود.
- هیچ agentی حق ندارد بر اساس HEAD قدیمی تصمیم merge بگیرد.
- scope، مالکیت، dependency و evidence هر تغییر قبل از integration بررسی می‌شود.

**2. Reconcile Each Candidate Against Current Main**
- هر PR/branch قدیمی ابتدا با **آخرین Canonical HEAD** مقایسه می‌شود.
- merge-base، ahead/behind، فایل‌های مشترک و invariantهای مشترک بررسی می‌شوند.
- اگر branch از main عقب است، «merge مستقیم» به‌عنوان راه‌حل پیش‌فرض پذیرفته نیست.
- انتقال صرف ref به main، force-push یا حذف تاریخچه برای از بین بردن conflict ممنوع است.

**3. Preserve Intent, Resolve Conflicts**
- برای هر PR مشخص می‌شود کدام تغییر واقعاً هنوز لازم است.
- تغییرات duplicate، superseded یا قبلاً حل‌شده حذف می‌شوند؛ تغییرات مفید حفظ می‌شوند.
- conflict باید با حفظ intent و invariant هر دو سمت حل شود، نه با انتخاب کورکورانه ours/theirs.
- اگر PR چند موضوع مستقل دارد، ابتدا تفکیک منطقی scope انجام می‌شود.

**4. Integrate One Logical Unit at a Time**
- فقط یک واحد منطقی در هر مرحله وارد main می‌شود.
- پس از هر integration، یک **HEAD جدید و یکتا** ایجاد می‌شود.
- integration بعدی فقط بر اساس همان HEAD جدید انجام می‌شود.
- هم‌زمان چند merge متکی بر یک HEAD قدیمی ممنوع است.

**5. Verify Immediately After Every Integration**
- current remote HEAD دوباره خوانده می‌شود.
- فایل‌ها و diff واقعی روی همان SHA بررسی می‌شوند.
- تست‌های مرتبط و regressionهای invariant اجرا/بررسی می‌شوند.
- evidenceهای وابسته به کد تغییرکرده به‌صورت خودکار **REVALIDATION_REQUIRED** تلقی می‌شوند تا دوباره تولید شوند.

**6. Advance the Single Canonical HEAD**
- پس از تأیید هر واحد، همان SHA به‌عنوان تنها baseline معتبر مرحله بعد ثبت می‌شود.
- branchها و PRهای قدیمی دیگر source of truth نیستند.
- هر PR باقی‌مانده باید با Canonical HEAD جدید reconcile شود.

**7. Close or Supersede Old PRs Only After Preservation Check**
- PR فقط وقتی merge/close می‌شود که مشخص باشد تغییر مفید آن یا وارد main شده یا صریحاً superseded/dispositioned شده است.
- بستن PR برای «خلوت شدن لیست» بدون تعیین تکلیف تغییرات ممنوع است.
- PR دارای conflict نباید با force/close به‌عنوان merged تلقی شود.

**8. Final Repository Verification**
- در پایان batch integration، current main HEAD، changed files، commits، tests و evidence دوباره با اسناد پروژه تطبیق داده می‌شوند.
- سپس Project Intelligence / Dashboard / Tasks / Decision Log / mission registry در صورت material بودن synchronize می‌شوند.

### قانون طلایی HEAD

> **در هر لحظه فقط یک Canonical Main HEAD داریم. هر branch/PR دیگر فقط یک candidate change نسبت به آن HEAD است.**

زنجیره صحیح:

Candidate PR → Reconcile with Canonical HEAD → Resolve/Preserve → Integrate → Verify → New Canonical HEAD → Next Candidate

و نه:

Old PR A + Old PR B + Old PR C → merge هم‌زمان → چند HEAD مبهم

### ممنوعیت‌های صریح
- merge یک PR قدیمی بدون مقایسه با current main؛
- force-push برای حذف conflict؛
- update-ref یک branch به main به‌جای ادغام تغییرات آن؛
- اعلام MERGED/CLOSED بدون GitHub confirmation؛
- استفاده از evidence مربوط به SHA قدیمی برای current HEAD؛
- اجرای موازی integrationهایی که همگی بر یک base قدیمی تکیه دارند؛
- حذف تغییرات PR صرفاً برای سبز شدن merge.

### Integration Delivery Contract
هر integration report باید حداقل این header را داشته باشد:

CANDIDATE / SOURCE SHA / CANONICAL BASE SHA / SCOPE PRESERVED / CONFLICTS / COMMIT / PUSHED / MERGED / TESTS / EVIDENCE / NEW CANONICAL HEAD / REMAINING PRs / NEXT ACTION

هیچ integration تا زمانی که **NEW CANONICAL HEAD** از GitHub خوانده و محتوای موردنظر روی همان SHA تأیید نشده باشد، VERIFIED محسوب نمی‌شود.


## 12.20 — Final Canonical HEAD After Integration Batch — 2026-09-25
- Integration PR #418 was merged successfully.
- Canonical main HEAD is now **1853fb08676c34fbb07f7a65f2c907dcf53583df** after the required post-merge synchronization commits.
- Legacy PRs #402, #403, #407, #410, #411, #412, #413 and #417 are closed as superseded by the canonical integration. Their applicable changes were reconciled into #418; they were not blindly merged because several were stale/conflicting and some were superseded by newer fixes.
- The single-HEAD rule is now operational: this SHA is the only current baseline for subsequent work.
- Verification/certification remains **NOT VERIFIED**; material integration invalidates historical evidence that depended on older SHAs.


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
