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
