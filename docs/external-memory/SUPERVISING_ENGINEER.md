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
