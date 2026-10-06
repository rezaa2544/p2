# Agent instructions for Payesh

این فایل نقطهٔ ورود Agentهاست. قوانین کامل را در [CONTRIBUTING.md](CONTRIBUTING.md) و [Engineering Execution & Verification Policy](docs/ENGINEERING_EXECUTION_AND_VERIFICATION_POLICY.md) بخوانید.

## الگوهای production

**الگوهای مهندسی production برای مشکلات شناخته‌شدهٔ این پروژه** در [docs/AGENT_PATTERNS.md](docs/AGENT_PATTERNS.md) آمده است. این فایل مرجعی است که از بررسی چهار ریپوی production واقعی استخراج شده و قوانین آن مستقیماً مشکلات پایش را هدف می‌گیرند:

- **بخش ۳ و ۴ — دفاع tenant isolation زیر router + الگوی تست آن.** مستقیماً M14-A01: رد کردن عملیات در لایه HTTP کافی نیست، هر مسیر درخواستی می‌تواند دور آن بزند. الگوی tombstone guard و هفت تست اجباری isolation.
- **بخش ۱ — Stall و ابزارهای بدون deadline.** مستقیماً stall زدکد: timeout race با دو سیگنال، AbortController مشتق‌شده، پرچم `settled`، تبدیل timeout به structured error.
- **بخش ۲ — پروتکل lease برای صف کارگر.** claim دو مرحله‌ای (اسکن خوش‌بینانه سپس lock-and-recheck)، شارژ attempt در takeover، cancel ترمینال در زمان claim، assertActiveLease قبل از هر write.
- **بخش ۵ — False green در تست‌ها.** مستقیماً false-green پایش: شاهد واقعی که حذف یک `authorize()` باعث شد TIA `1487 passed` گزارش کند در حالی که suite کامل fail شد.
- **بخش ۷ — انضباط evidence ریپو.** پنج قانون برای اینکه هر claim به source واقعی قابل trace باشد: freeze identity، trace slice متصل، ownership در call sites، line ranges دقیق، نام‌گذاری عدم قطعیت.

**همین الگوها در Hermes Agent هم نصب شده‌اند** — کپی کامل و به‌روزرسانی‌شدهٔ آنها در skill `ai-engineering-corpus` (بخش‌های ۱۸–۲۰) در مسیر `C:/Users/R.M/AppData/Local/hermes/skills/ai-engineering/ai-engineering-corpus/SKILL.md` قرار دارد. اگر آن فایل و این فایل تضاد داشتند، این فایل (داخل ریپو) برنده است چون مستقیماً روی کد پایش اعمال می‌شود.

## قبل از کار

1. Current HEAD را ثبت کن.
2. [docs/README.md](docs/README.md)، [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) و [docs/REPOSITORY_MAP.md](docs/REPOSITORY_MAP.md) را بخوان.
3. [docs/ROADMAP.md](docs/ROADMAP.md) و Master Schedule را تطبیق بده.
4. Scope/Owner/Dependencies/Acceptance Criteria/Evidence/Verification Plan را مشخص کن.
5. Rule 15 و پنج Pass مستقل را اجرا کن.
6. هیچ statusی را بدون evidence روی Current HEAD ارتقا نده.
7. گزارش Chat/Agent ناقص را در همان چرخه با Roadmap/Ground Truth reconcile کن.

## بعد از کار

Current HEAD، tests/CI، documentation، roadmap و origin/main را دوباره بررسی کن و SHA نهایی را ثبت کن.

Historical reports منبع truth نیستند؛ فقط evidence تاریخی‌اند.

---

## Atria Operating Model — OpenCode bootstrap (added 2026-10-06)

پروتکل کامل ۱۰-فازهٔ Mission و قالب گزارش استاندارد در skill
`payesh-mission` (`.claude/skills/payesh-mission/SKILL.md`) ثبت شده است.

**نقش‌ها:** Atria = Executor/Remediator (inspect → diagnose → implement →
test → measure → document → report؛ تصمیم‌گیر نهایی **نیست**) ·
ChatGPT = Control Plane (priority، mission definition، scope، تصمیم نهایی،
reconcile گزارش‌ها) · Hermes = Independent Verification Engine (گزارش Atria
را کورکورانه قبول نمی‌کند؛ repository را مستقل بررسی می‌کند) ·
16-view network = selective adversarial/discovery review — فقط برای معماری
حساس، security، tenant isolation، correctness بحرانی، disputed findings.

**قوانین اجرایی:**
- **قانون طلایی:** REPORT = PROOF نیست. هر ادعا: CLAIM → EVIDENCE →
  REPRODUCTION → CURRENT HEAD → VERIFICATION.
- **Current HEAD Rule:** هر finding نسبت به CURRENT HEAD ارزیابی می‌شود؛
  PASS تاریخی برای SHA قدیمی بدون re-verify معتبر نیست.
- **False-Green Law:** NOT-RUN ≠ PASS · NO-OP ≠ PASS · TEST EXISTS ≠
  TEST VALID · EXIT 0 ≠ AUTOMATIC PROOF.
- **Negative Proof اجباری:** کد را عمداً جهش بده؛ test باید FAIL کند؛
  اگر جهش هم سبز ماند TEST INVALID است.
- **Scope Discipline:** finding خارج از scope را ثبت + severity + target
  mission کن؛ بدون اجازه scope گسترش نده.
- **Parallel Session Safety:** فرض نکن workspace فقط متعلق به توست؛
  قبل از commit `git status` ببین؛ race/conflict را REPORT کن —
  force-push و تاریخ‌نویسی ممنوع.
- **Status Vocabulary (فقط):** VERIFIED · FIXED-SCOPED ·
  REVALIDATION_REQUIRED · NOT VERIFIED · UNKNOWN · BLOCKED · FAIL.

**Experience Learning (task-observer):** در شروع هر session skill
`task-observer` را invoke کن و مشاهدات قابل تعمیم را در
`skill-observations/log.md` ثبت کن (internal agent state — در
`.gitignore` است، جزو source پروژه نیست).

**هشدار هویت N-36:** شناسهٔ N-36 دو معنا دارد و نباید قاطی شود:
N-36 اصلی = API/Test-CI parity contract (باز / اجرانشده)؛
N-36 / M15-CACHE-PACMA / M15-05 = durable cross-instance cache
invalidation (IMPLEMENTED + VERIFIED on live PG/Redis — 2026-10-04).

**وضعیت روز project** در `docs/CURRENT_PROJECT_INTELLIGENCE.md` و
`docs/CURRENT_WORK_EXECUTION_PLAN.md` است — آن دو source of truth
وضعیت‌اند، نه این فایل.
