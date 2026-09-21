# سیاست دائمی مهندسی و اعتبارسنجی زیروتراست مخزن (Engineering Execution & Verification Policy)

**نسخه:** ۱.۱.۰ | **تاریخ:** ۲۰۲۶-۰۹-۲۱ | **مالک:** حاکمیت مهندسی مخزن `rezaa2544/p2`  
**وضعیت:** سند مرجع دائمی و الزام‌آور برای تمام Agentها، Chatها و توسعه‌دهندگان  

---

## ۱. الزامات عمومی و پیش‌نیازهای شروع مأموریت (Rule 1)

### Rule 1 — Read Before Work (مطالعه قبل از اجرای کار)
هر Agent یا Chat قبل از دریافت یا اجرای مأموریت الزام دارد موارد زیر را بررسی، مطالعه و تطبیق دهد:
1. مطالعه کامل اسناد حاکمیتی و قوانین مخزن (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` و این سند).
2. مطالعه نقشه راه مصوب (`docs/ROADMAP.md` و `docs/ROADMAP_MASTER_EXECUTION_SCHEDULE.md`).
3. بررسی الزامات مقیاس و کارایی (`docs/CAPACITY_MODEL.md`, `docs/SCALE_10M.md`, `docs/PHASE5_OPERATIONAL_SLO_ENFORCEMENT.md`).
4. مطالعه سوابق ممیزی و شواهد قبلی در `docs/audit/` و گزارش‌های تاریخی.
5. ثبت دقیق شناسه `current HEAD SHA` و وضعیت شاخه `main`.
6. تعیین دقیق دامنه مسئولیت (Scope) و مالکیت تغییرات (Ownership).

---

## ۲. قوانین ۱۵گانه اعتبارسنجی مهندسی (The 15 Execution Rules)

### Rule 2 — One Test Is Never Enough (یک اجرای موفق هرگز کافی نیست)
هیچ نقص یا باگی با یک اجرای موفق علامت `VERIFIED` نمی‌گیرد. چرخه اجباری رفع باگ:
```
Reproduce ──▶ Diagnose ──▶ Fix ──▶ Test ──▶ Repeat ──▶ Boundary Test ──▶ Negative Test ──▶ Regression Test ──▶ Independent Re-run ──▶ Final Verification
```
برای موارد حیاتی، امنیت، رانتایم و DR حداقل **دو اجرای مستقل و تکرارپذیر** الزامی است.

### Rule 3 — Adversarial Verification (ارزیابی خصمانه)
سنجش سیستم محدود به مسیرهای موفق (Happy-Path) نیست. آزمون‌ها باید شامل موارد زیر باشند:
- Normal case & Boundary conditions
- Empty, malformed, and truncated inputs
- Duplicate, replayed, and out-of-order execution
- Concurrency, race conditions, and thread locks
- Timeouts, retries, and network degradation
- Process crashes, restarts, and recovery
- Dependency outages (PG, Redis, external APIs)
- Stale state and clock skews

### Rule 4 — Smallest Defect Detection (کشف کوچک‌ترین عیوب)
هدف فقط رفع بلاکرهای بزرگ نیست؛ ممیزی باید به صورت فعالانه عیوب ریز را کشف کند:
- Off-by-one errors & race conditions
- Improper timeout & retry storms
- Stale cache & missing validation
- False-positives & false-negatives
- Fake-green test paths & missing CI coverage
- Document vs. code drift & Test vs. runtime drift
- File modes, missing secret handling, & error swallowing

### Rule 5 — Evidence Before Status (شواهد قبل از اعلام وضعیت)
هیچ کشف یا باگی صرفاً به دلیل وجود تست، اسکریپت، کانفیگ، گزارش سبز CI یا گزارش‌های قدیمی `VERIFIED` محسوب نمی‌شود. وضعیت `VERIFIED` مستلزم ارائه **شواهد قابل ردیابی روی current HEAD** است.

### Rule 6 — Current HEAD Is Truth (حقیقت فقط در current HEAD است)
گزارش‌های قدیمی، SHAهای قبلی و نتایج سایر نشست‌ها صرفاً شواهد تاریخی (Historical Evidence) هستند. مرجع نهایی ارزیابی:
$$\text{Truth} = \text{current HEAD} + \text{current runtime} + \text{current tests} + \text{current CI} + \text{current infrastructure}$$

### Rule 7 — E3 ≠ E4 (تفکیک محیط‌های تست)
آزمون‌های محلی، mockها، شبیه‌سازی‌ها و دیتابیس‌های تک‌نودی سطح **E3 (Integrated Runtime)** هستند. سطح **E4 (Production-Equivalent)** مستلزم استقرار فیزیکی کلاستر چندنودی با تزریق خطای واقعی (Chaos) است. در غیاب E4، وضعیت رسماً `E4 NOT VERIFIED` درج می‌شود.

### Rule 8 — External Dependency ≠ Repository Fix (تفکیک وابستگی‌های خارجی)
مشکلات مربوط به رازهای خارجی، سرویس‌های خارج از کد، تنظیمات سازمان گیت‌هاب و زیرساخت‌های فیزیکی تولید نباید دور زده یا بای‌پس شوند. این موارد باید با پرچم `EXTERNAL BLOCKER` یا `OWNER DECISION REQUIRED` ثبت گردند.

### Rule 9 — Ownership (مرزهای مالکیت)
- **Repository-owned:** `reproduce ──▶ fix ──▶ test ──▶ commit ──▶ push`
- **Owner-owned:** `prove ──▶ document ──▶ identify owner ──▶ stop`

### Rule 10 — No Fake Green (منع مطلق سبزِ کاذب)
موارد زیر اکیداً ممنوع است:
- حذف یا skip کردن تست‌ها برای سبز نشان دادن لوله CI
- افزایش بی‌دلیل آستانه‌ها (Thresholds)
- استفاده از `continue-on-error` برای پنهان کردن خطاهای واقعی
- جعل تایم‌استمپ، مترییک، RPO/RTO یا بنچمارک‌ها
- ارائه شبیه‌سازی به عنوان مدرک تولید

### Rule 11 — Reproducibility (تکرارپذیری شواهد)
هر کشف یا ارزیابی باید توسط سایر Agentها قابل بازتولید باشد. شواهد باید شامل SHA، دستور دقیق اجرا، محیط، ورودی، خروجی انتظارشده، خروجی واقعی و تعداد اجراهای موفق باشد.

### Rule 12 — Regression Lock (قفل عدم پسرفت)
هر عیب اصلاح‌شده باید دارای تست پسرفت (Regression Test) اختصاصی باشد تا از بروز مجدد آن در کامیت‌های بعدی جلوگیری شود.

### Rule 13 — Stop Conditions (شرایط توقف و ریشه‌یابی)
در صورت بروز کشف یا خطای جدید در حین اجرا، مأموریت نباید با ادعای موفقیت ظاهری خاتمه یابد؛ ابتدا باید خطا طبقه‌بندی، بازتولید، اصلاح و مجدداً تست شود.

### Rule 14 — Final Verification (تطبیق نهایی قبل از تحویل)
قبل از اعلام خروجی، تمامی موارد شامل Working Tree، current HEAD، origin/main، تست‌ها، پوشش CI، اسناد و وضعیت نقشه راه باید ۱۰۰٪ تطبیق داده شوند.

### Rule 15 — Five-Task / Five-Pass Verification (الزام ۵ تسک و ۵ دور راستی‌آزمایی)
در **هر مرحله کاری**، هر Chat/Agent باید دقیقاً **۵ تسک مشخص و قابل ردیابی** دریافت کند؛ مگر اینکه Scope رسمی مرحله به‌صورت مستند کمتر از ۵ تسک داشته باشد، که در آن صورت تسک‌ها باید به ۵ واحد verification مستقل و معنادار شکسته شوند و نباید با تقسیم صوری یا تکرار بی‌معنا عدد ۵ ساخته شود.

هر یک از ۵ تسک باید **حداقل ۵ دور مستقل راستی‌آزمایی** شود. این ۵ دور نباید صرفاً تکرار یک command یکسان باشند؛ هر دور باید در صورت ارتباط با ماهیت تسک، ابعاد متفاوتی از صحت را پوشش دهد، از جمله:
1. **Functional / Happy Path** — رفتار عادی و نتیجه مورد انتظار.
2. **Boundary / Edge Cases** — حدود، ورودی‌های خالی، malformed/truncated و مقادیر مرزی.
3. **Negative / Failure Injection** — شکست، خطا، timeout، dependency outage، crash/restart یا recovery.
4. **Concurrency / Replay / Resilience** — race، duplicate/replay، out-of-order، retry و شرایط هم‌روندی/تاب‌آوری.
5. **Independent Regression / Environment Re-run** — اجرای مستقل در محیط یا مسیر اعتبارسنجی متفاوت و کنترل regression.

اگر یک بُعد برای ماهیت تسک قابل اعمال نیست، Agent باید دلیل فنی آن را ثبت و نزدیک‌ترین verification مستقل متناسب با همان ریسک را جایگزین کند.

**ممنوع است که پنج دور با کپی‌کردن یک تست، تغییر صوری ورودی، یا تکرار بدون پوشش ریسک مستقل شمرده شوند.**

هر تسک فقط زمانی می‌تواند `VERIFIED` شود که هر پنج دور لازم با evidence قابل ردیابی موفق باشند. اگر هر دور شکست بخورد، چرخه Rule 2 از ابتدا برای همان تسک اجرا می‌شود و تا رفع/طبقه‌بندی علت، تسک VERIFIED نمی‌شود.

این Rule سطح اطمینان و عمق verification را افزایش می‌دهد، اما **هیچ Agent یا Chat مجاز نیست از عبارت «تأیید ۱۰۰٪ قطعی»، «بدون امکان خطا» یا هر ادعای یقین مطلق استفاده کند**. وضعیت نهایی باید فقط بر اساس evidence واقعی و قابل بازتولید تعیین شود.

---

## ۳. مهارت‌های دائمی اعتبارسنجی مهندسی (Engineering Verification Skills)

### SKILL-01 — Zero-Trust Verification
هیچ ادعایی در مستندات یا تست‌ها بدون ارائه مدرک مستقیم روی current HEAD پذیرفته نمی‌شود.

### SKILL-02 — Adversarial Testing
تست تمام اصلاحات تحت شرایط Failure، Boundary، Concurrency، Retry و Process Crash.

### SKILL-03 — Differential Verification
مقایسه رفتار سیستم قبل و بعد از اصلاح جهت اثبات اینکه تغییر دقیقاً همان باگ را هدف گرفته است.

### SKILL-04 — Runtime Evidence Engineering
تفکیک کامل ارزیابی ایستای کد (Code Inspection) از اثبات رانتایمی (Runtime Proof).

### SKILL-05 — CI / Local Parity
تضمین یکسانی رفتار و نتایج تست‌ها بین محیط توسعه محلی و لوله CI گیت‌هاب.

### SKILL-06 — Reproducibility Engineering
مستندسازی دقیق دستورات اجرا، متغیرهای محیطی و شواهد به نحوی که برای هر شخص یا Agent دیگری قابل بازتولید باشد.

### SKILL-07 — Failure Injection
ارزیابی سیستم‌های توزیع‌شده، HA و DR با تزریق واقعی خطا (Kill process, network drop, disk full).

### SKILL-08 — Concurrency Verification
سنجش دقیق رفتارهای هم‌روندی در Outbox، Workerها، قفل‌ها و دیتابیس تحت بار چند‌نخی.

### SKILL-09 — DR Verification
محاسبه RPO و RTO واقعی صرفاً از طریق مانورهای واقعی بازیابی و Failover، نه ادعای مستندات.

### SKILL-10 — Security Hygiene
پاک‌سازی کامل لاگ‌ها، گزارش‌ها و کامیت‌ها از هرگونه توکن، رمز، PII یا داده‌های حسّاس.

### SKILL-11 — Evidence Chain
اتصال هر وضعیت و ادعا به یک زنجیره شفاف از SHA، دستور، لاگ و آرتیفکت.

### SKILL-12 — Ownership & Governance
تغییر کد فقط در محدوده اختیارات مخزن و واگذاری صریح تصمیمات مالکیتی به مالک مخزن.
