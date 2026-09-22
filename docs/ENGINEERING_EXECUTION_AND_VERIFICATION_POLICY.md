# سیاست دائمی مهندسی و اعتبارسنجی زیروتراست مخزن (Engineering Execution & Verification Policy)

**نسخه:** ۱.۲.۰ | **تاریخ:** ۲۰۲۶-۰۹-۲۱ | **مالک:** حاکمیت مهندسی مخزن `rezaa2544/p2`  
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

 
### Rule 16 — Task Contract Before Execution (قرارداد اجباری تسک)
پیش از شروع هر Chat، برای هر یک از ۵ تسک باید Objective، Scope، Out of Scope، Owner، Dependencies، Acceptance Criteria، Required Evidence، Verification Plan و Expected Output مشخص شود. تسک مبهم نباید بدون تعیین این موارد اجرا شود.

### Rule 17 — Plan Before Change (برنامه قبل از تغییر)
پیش از هر تغییر کد/پیکربندی حساس، Agent باید Understand → Plan → Change → Verify → Document را اجرا کند و Root-Cause Hypothesis، Impact Analysis، Change Plan و Verification Plan را ثبت نماید.

### Rule 18 — No Context Loss (تداوم وضعیت)
هر Chat باید وضعیت قابل انتقال شامل Current Phase، Completed Tasks، Open Tasks، Decisions، Evidence، Blockers و Next Action تولید کند تا با قطع نشست یا انتقال کار، context از بین نرود.

### Rule 19 — Independent Reviewer Mindset (بازبینی خصمانه)
پس از هر Task، Agent باید Self-Adversarial Review انجام دهد و مشخص کند اگر تغییر غلط باشد چگونه شکست می‌خورد، چه چیزی هنوز اثبات نشده و چه فرض‌هایی بدون evidence باقی مانده‌اند.

### Rule 20 — Change Minimality (حداقل‌گرایی تغییر)
هر تغییر باید کوچک‌ترین تغییر لازم برای رفع مسئله باشد. Refactor غیرضروری، cleanup نامرتبط، تغییر معماری یا dependency upgrade بدون نیاز و دلیل مستند ممنوع است.

### Rule 21 — Evidence Ledger (دفتر شواهد)
هر Chat باید Evidence Ledger شامل Item، Claim، Evidence، SHA، Command و Status داشته باشد. نتیجه‌ای که فقط در متن Chat وجود دارد evidence معتبر محسوب نمی‌شود.

### Rule 22 — Dependency Awareness (آگاهی وابستگی)
قبل از تغییر، dependencyهای سرویس، API، database، migration و infrastructure و اثر تغییر بر آن‌ها باید بررسی و ثبت شوند.

### Rule 23 — Rollback First (بازگشت‌پذیری)
قبل از تغییرات حساس باید نقطه بازگشت و روش rollback مشخص باشد، به‌خصوص برای Database، Security، Infrastructure، Deployment و Migration.

### Rule 24 — Artifact Integrity (تمامیت آرتیفکت)
هر artifact مهم باید دارای version، owner، timestamp، SHA و source/provenance قابل ردیابی باشد.

### Rule 25 — No Silent Assumption (عدم فرض پنهان)
هر فرض باید صریحاً یکی از این وضعیت‌ها را داشته باشد: VERIFIED FACT، DOCUMENTED ASSUMPTION، OPEN QUESTION یا BLOCKER. فرض پنهان ممنوع است.

### Rule 26 — Cross-Chat Synchronization (همگام‌سازی بین Chatها)
در کار موازی، هر Chat باید پیش از شروع وضعیت کار سایر Chatها، تغییرات فایل‌ها و dependencyهای جدید را بررسی کند. Conflict باید پیش از merge یا overwrite شناسایی و حل شود.

### Rule 27 — Completion Requires Three Proofs (سه اثبات برای تکمیل)
هیچ Task کامل نیست مگر سه نوع proof متناسب با Scope داشته باشد: Implementation Proof، Behavior Proof و Failure Proof. در مواردی که یکی قابل اعمال نیست، دلیل فنی باید ثبت شود.

### Rule 29 — Reusable Security Audit Module (استفادهٔ مجدد از چک‌لیست امنیتی)
هر Security Audit / Red-Team مرتبط با مخزن باید علاوه بر قواعد عمومی این سند، از چک‌لیست مرجع امنیتی docs/SECURITY_AUDIT_CHECKLIST.md به‌عنوان یک baseline قابل استفادهٔ مجدد بهره ببرد.

این چک‌لیست باید حداقل این سطوح را پوشش دهد، هرجا با معماری و Scope مرتبط است:
- Secrets و Secret Hygiene
- Authentication و Session/Token Security
- Authorization، RBAC و Tenant Isolation / IDOR
- Input Validation و Injection (SQL/NoSQL/XSS/Command/Path Traversal/Unsafe Deserialization)
- SSRF و دسترسی‌های خروجی شبکه
- Rate Limiting و Abuse Controls
- File Upload و File Handling
- Dependency / Supply-chain Risk
- Error Disclosure و Information Leakage
- Infrastructure / Storage / IAM / Database Exposure

برای هر Finding، Agent باید تا حد امکان Reproduce → Evidence → Root Cause → Impact → Remediation را اجرا کند و دست‌کم این provenance را ثبت نماید: Current HEAD SHA، مسیر فایل/بخش کد، دستور/سناریوی بازتولید، Expected، Actual، تعداد اجرا، و سطح Evidence (E3/E4 در صورت ارتباط).

این Rule چک‌لیست را جایگزین تست نفوذ تخصصی نمی‌کند؛ بلکه یک baseline دائمی برای جلوگیری از فراموش‌شدن دسته‌های مهم حمله و افزایش قابلیت مقایسه بین Auditهای آینده است. هر Agent می‌تواند موارد جدیدی را به چک‌لیست پیشنهاد کند، اما افزودن یا تغییر baseline باید به‌صورت مستند و قابل ردیابی انجام شود.

### Rule 28 — Agent Efficiency Optimization (بهینه‌سازی بازده Agent)
هدف، بیشترین evidence قابل اتکا با کمترین عملیات ضروری است؛ تعداد commandها یا تغییرات به‌خودی‌خود معیار موفقیت نیست. کار تکراری بدون افزایش پوشش ریسک ممنوع است.

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

### SKILL-13 — Task Decomposition
شکستن مأموریت‌های بزرگ به واحدهای مشخص، مستقل، قابل اندازه‌گیری و قابل Verification.

### SKILL-14 — Root Cause Analysis
استفاده از 5 Why، Fault Tree و Dependency Analysis برای تشخیص علت ریشه‌ای پیش از Fix.

### SKILL-15 — Evidence Engineering
ساخت evidence package قابل ردیابی شامل logs، metrics، traces، test output، artifacts و SHA متناسب با نیاز.

### SKILL-16 — Change Risk Assessment
طبقه‌بندی ریسک تغییر به LOW، MEDIUM، HIGH یا CRITICAL و تعیین عمق Verification متناسب با ریسک.

### SKILL-17 — State Continuity Management
حفظ context و handoff قابل استفاده بین Chatها، Phaseها و Sessionها.

### SKILL-18 — Rollback Engineering
طراحی و آزمون مسیر rollback برای تغییرات مهم و حساس.

### SKILL-19 — Dependency Mapping
شناسایی service graph، API dependency، database dependency و infrastructure dependency پیش از تغییر.

### SKILL-20 — Artifact Provenance
قابل‌ردیابی نگه‌داشتن منشأ، نسخه، SHA، تولیدکننده و محیط هر artifact مهم.

### SKILL-21 — Agent Self Audit
ممیزی مستقل خروجی خود Agent پیش از اعلام completion و بررسی فرض‌ها، شواهد ناقص و خطاهای احتمالی.

### SKILL-22 — Parallel Work Coordination
هماهنگی کار موازی برای جلوگیری از duplicate work، conflicting changes و merge failure.

### SKILL-23 — Performance Impact Verification
بررسی اثر تغییرات مرتبط بر latency، throughput، memory، CPU و database load.

### SKILL-24 — Security Boundary Review
بررسی authentication، authorization، secrets، data exposure و privilege boundaries برای تغییرات مرتبط.

### SKILL-25 — Operational Readiness
پیش از completion مرتبط با عملیات، بررسی monitoring، alerting، logging، recovery و runbook.

