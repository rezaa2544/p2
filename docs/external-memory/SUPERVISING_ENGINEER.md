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
