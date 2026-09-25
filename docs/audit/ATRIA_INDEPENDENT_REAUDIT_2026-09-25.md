# ATRIA — Independent Adversarial Re-Audit
## گزارشِ بازبینیِ مستقل و adversarialِ ادعاهای Phase C رویِ HEAD جاری

**پروژه:** Payesh (پایش) · **نگارنده:** Atria (Independent Adversarial Reviewer)
**تاریخ:** ۲۰۲۶-۰۹-۲۵
**HEAD شروعِ ممیزی:** `67b6683a58031f2399d249db372ca853cc8d815f` (= origin/main، tree پاک)
**HEAD پایانی:** `e4584806c1af2a1e5db648c8452580a8fa8cbcec`
**قانونِ مرجع:** `docs/STRICT_VERIFICATION_GATE.md`
**روش:** `Report Claim → Current HEAD → Code Path → Regression → Adversarial Runtime → Evidence → Verdict`
**قاعدهٔ صریح:** به هیچ PASS قبلی — از جمله PASS خودِ Atria در Phase C — اعتماد نشد. هر ادعا دوباره رویِ HEAD اجرا شد.

---

## جدولِ اجباری

| Item | Previous Verdict | Current HEAD | Reproduced | Evidence | New Verdict |
|---|---|---|---|---|---|
| A-18 | FIXED (dc60c89b) | conflicts.js: nextVer = max(target.version, c.server_version)+1؛ بررسیِ مدرسه روی رکوردِ هدف | — (نگه‌داشته) | phase-c-conflict-resolution 12/12 روی 67b6683a | **FIXED (تأیید مجدد)** |
| A-21 | FIXED (81655ef6) | guards روی classes/attendance/grades سرِ جایشان است | — | phase-c-unvalidated-fks 16/16 روی 67b6683a و e4584806 | **FIXED (تأیید مجدد)** |
| A-06 | FIXED (33a32f84) | memoسازی + شمارندهٔ یکنوای sms.js | — | phase-c-sms-quota-complexity 18/18 | **FIXED (تأیید مجدد)** |
| A-05b | FIXED (6ef3dffb) | startAutoBackup در PG-live no-op + هشدار | — | phase-c-backup-pg-noop 8/8 | **FIXED (تأیید مجدد)** |
| A-01 | FIXED (107c08da) | WHERE district_id؛ readCollection با warn | — | phase-c-regional-pg-reads 11/11 | **FIXED (تأیید مجدد)** |
| A-03 | FIXED (a640e92b) | فال‌بک console.warn دارد | — | source روی e4584806 | **FIXED (تأیید مجدد)** |
| A-23 | FIXED (6cb86b99) | سنجه از totalHard/totalExams | — | phase-c-regional-difficulty-metric 9/9 | **FIXED (تأیید مجدد)** |
| A-07 | FIXED (6a7ed35a) | skip با شمارندهٔ NOT-RUN | — | wave1 17/17(+1), wave3 12/12(+1), bell2 7/7(+1) | **FIXED (تأیید مجدد)** |
| A-14 | FIXED (6a7ed35a) | skipِ تاریخ جایِ خود | — | bell2 7/7 (+1 NOT-RUN) | **FIXED (تأیید مجدد)** |
| **A-20** | **NOT A DEFECT** | **isVersioned فقط روی grades؛ ۴ مسیرِ دیگر در strict mode هم نسخه‌نگذارنده می‌پذیرفتند** | **بله — stale-write رویِ هر ۵ موجودیت + asymmetry** | **reaudit-occ-stale-write 34/34** | **FIX REQUIRED → FIXED (02c14742)** |
| **A-22** | **ACCEPTED RISK** | **سوراخِ درگاهِ بوت برایِ REDIS_URL-only + نبودِ commandTimeout** | **بله — boot served با fail-open؛ partition آویزانِ بی‌نهایت** | **reaudit-redis-outage 17/17** | **FIX REQUIRED → FIXED (e4584806) + ACCEPTED RISKِ residual** |
| A-09 | NOT A DEFECT | codacy.yml:55 همچنان INT_MAX (دروازهٔ قرمزِ بی‌فایده) | — | source | **NOT A DEFECT (تأیید مجدد)** |
| A-02 | DEFERRED | health-index.js هنوز مسیرِ PG ندارد | نه | grep: صفر ارجاع به db | **STILL OPEN** |
| A-04-multi | DEFERRED | lastIssued درون‌پروسه‌ای؛ JSON multi-instance همچنان رقابتی | در Phase C بازتولید شد | phase-c-id-race 3/3 | **STILL OPEN (PG immune)** |
| A-08 | DEFERRED | ۱۳ پرچمِ heuristic؛ ۲ نمونهٔ بررسی‌شده LEGITIMATE | نه | بررسیِ دستی | **OPEN (بدون false-greenِ جدید)** |
| A-10 | DEFERRED | codeql.yml فقط echo | نه | source | **STILL OPEN** |
| A-11 | DEFERRED | fortify.yml اسکن را skip می‌کند (مستند) | نه | source | **STILL OPEN** |
| A-12 | DEFERRED | run-all-tests.sh به هیچ دروازه‌ای وصل نیست | نه | package.json:12 | **STILL OPEN** |
| A-13 | DEFERRED | ۳۰ سوئیتِ tests/api/ نامرئی و قرمز | بله (۰/N) | ۵/۵ نمونه ۰/N روی e4584806 | **STILL OPEN (شاهدِ جدید)** |
| A-15/16/17/F-3 | FIXED (3e96cb95) | ادعاهای تاتولوژیک جایگزین شدند | — | offline-sync-drill 29/29, client-features 12/12, multigrade2 9/9, vclass3 6/6 | **FIXED (تأیید مجدد)** |
| A-19 | FIXED (95a38845) | policy.studentRecordOk در idor.js:68 | — | phase-c-student-timeline-ownership 6/6 | **FIXED (تأیید مجدد)** |
| A-24 | تعهدِ reconciliation | branch روی origin نیست؛ A-18/A-20 رویِ main اثبات شد | partial | این ممیزی | **PARTIALLY DISCHARGED** |
| A-25 | تعهدِ reconciliation | outbox.js موجود و متصل (۱۳ ارجاع) | نه | — | **BLOCKED (زیرساخت)** |
| A-26 | تعهدِ reconciliation | codeql/fortify/codacy غیرِ اسکن | partial | source | **PARTIALLY DISCHARGED** |
| A-27 | تعهدِ reconciliation | محیطِ DR واقعی وجود ندارد | نه | multi-instance NOT-RUN | **BLOCKED** |
| A-28 | تعهدِ reconciliation | — | نه | — | **BLOCKED** |
| A-29 | تعهدِ reconciliation | — | نه | — | **NOT RE-VERIFIED** |

---

## ۱. FIXED (در این ممیزی)

دو عیبِ واقعی کشف، بازتولید، اصلاح و با regression test اثبات شد. هیچ‌کدام در Phase C دیده نشده بودند، چون آن فاز ادعاهایشان را بررسی کرده بود، نه فرضیاتِ پنهانشان را.

### R-1 (A-20) — عدمِ یکنواختیِ OCC: stale-write رویِ ۴ از ۵ مسیرِ PATCH
**Commit:** `02c14742` · **فایل‌ها:** `server/routes/{students,users,classes,attendance}.js` · **تست:** `tests/reaudit-occ-stale-write.js` (۳۴ بررسی، سرورِ واقعی HTTP)

**قرارداد واقعی است، ولی ناقص اجرا شده.** `occ.js:8-10` می‌گوید کلاینتِ کهنه که نسخه نمی‌فرستد، مانند قبل می‌نویسد (سازگاری). Phase C این قرارداد را دید و A-20 را NOT A DEFECT اعلام کرد. ولی بررسیِ مستقل نشان داد `checkOcc` فقط در `grades.js:206` با `isVersioned=true` فراخوانی می‌شود؛ چهار مسیرِ دیگر پرچم را پاس نمی‌دادند:

```
students.js:204   checkOcc(student, body, 'دانش‌آموز')          ← بدون true
users.js:179      checkOcc(target,  body, 'کاربر')             ← بدون true
classes.js:223    checkOcc(cls,     body, 'کلاس')              ← بدون true
attendance.js:177 checkOcc(rec,     body, 'رکورد حضور و غیاب')  ← بدون true
grades.js:206     checkOcc(grade,   body, 'نمره', true)         ← تنها مسیرِ strict
```

**شواهدِ runtime (pre-fix):**
- **stale-write واقعی رویِ هر ۵ موجودیت:** نویسندهٔ A با `base_version` صحیح ویرایش می‌کند (۲۰۰)؛ سپس یک PATCH **بدونِ `base_version`** محتوای کهنه می‌نویسد → **۲۰۰، نسخه بالا می‌رود، ویرایشِ A بی‌هیچ سیگنالِ تعارضی له می‌شود.**
- **asymmetry در strict mode (`PAYESH_STRICT_BASE_VERSION=1`):** `grades` ⇒ ۴۰۰ `missing_base_version`، ولی چهار مسیرِ دیگر ⇒ **۲۰۰**. همان هِلپر، دو رفتار.

**چرا این یک عیب است، نه یک قرارداد:** Phase C استدلال کرد «کلاینتِ ارسالی هرگز بدونِ base_version PATCH نمی‌زند». من این را مستقلاً تأیید کردم (صفر فراخوانیِ PATCH در `src/js`؛ `03-persistence.js:185` همیشه `op.base_version` می‌فرستد). ولی:
1. این یعنی پرچمِ «سازگاری» از کلاینتِ غیرموجودی محافظت می‌کند.
2. چهار endpoint برایِ **هیچ کلاینتِ داخلِ مخزنی** قابل‌دسترس نیستند — تنها فراخوانندگانِ واقعی آن‌ها یکپارچه‌سازی‌ها/اسکریپت‌ها/مهاجم با توکنِ سرقتی هستند.
3. اگر کلاینتِ کهنه‌ای واقعاً وجود داشت، `grades` او را می‌شکست — پس ناهمگونی، سیاستِ عمدی نیست.

**Fix:** هر چهار مسیر `isVersioned=true` گرفتند (مثلِ grades). در production نسخه لازم است؛ در dev/test سازگاری حفظ می‌شود.
**Pass-after:** در strict mode هر ۵ ⇒ ۴۰۰. `tests/occ.js` (قراردادِ سازگاری) همچنان **۱۸/۱۸** سبز است — یعنی هیچ رفتارِ مشروعی شکسته نشد.

### R-2 (A-22) — دو سوراخ در قراردادِ قطعیِ Redis
**Commit:** `e4584806` · **فایل‌ها:** `server/index.js`, `server/redis.js` · **تست:** `tests/reaudit-redis-outage.js` (۱۷ بررسی، سرورِ واقعی + فیکِ RESP قابلِ kill/blackhole)

**(a) سوراخِ درگاهِ بوت (شکلِ «فقط REDIS_URL»)**
`index.js` فقط `NODE_ENV`/`PAYESH_ENV`/`DATABASE_URL` را برایِ fail-fast می‌سنجید، ولی `redis.js` هر استقراری با `REDIS_URL` را production می‌بیند (`prodRethrow`/`prodNoRedis`). نتیجهٔ عملی (بازتولیدشده):

> بوت با `REDIS_URL` به یک پورتِ مرده → سرور بالا می‌آمد و listen می‌کرد → `health=503` می‌گفت → **ولی همچنان ترافیک سرو می‌کرد** و ابطال در **هر درخواست** fail-open می‌شد. `[FATAL] Cache readiness failed` چاپ می‌شد ولی process خارج نمی‌شد: یک zombie که می‌بایست fail-closed باشد.

این دقیقاً نقطهٔ مقابلِ P0-13 است که می‌گوید «در تولید بدونِ ردیسِ زنده سرو نمی‌دهیم».

**(b) پارتیشنِ بی‌پاسخ = آویزانِ بی‌نهایت**
یک blackhole (اتصالِ TCP زنده، بدونِ پاسخ) هیچ رویدادِ خطایی تولید نمی‌کند. چون `sessionFrom` در هر درخواست چندین عملِ ردیس می‌زند و هیچ `commandTimeout`‌ای نبود، **هر درخواستِ auth برایِ همیشه آویزان می‌شد** (تا تایم‌اوتِ سمتِ کلاینت). fail-open حتی شانسِ اجرا نداشت.

**Fixها:**
- `isProdShape()` در `index.js` — همان تعریفِ `redis.js` (شاملِ `REDIS_URL`)؛ اکنون بوت fail-fast می‌کند و **هرگز listen نمی‌کند** (شواهد: exit غیرصفر + نبودِ بنر).
- `commandTimeout` (۲s پیش‌فرض، `PAYESH_REDIS_COMMAND_TIMEOUT_MS`) در `buildRedisConfig`؛ پارتیشن اکنون به خطایی مشخصه ختم می‌شود که مسیرهایِ موجود آن را هندل می‌کنند (درخواست در ~۱۰s پاسخ می‌دهد به‌جایِ ابدیت).

**ردپای Base/Pre-existing:** هر دو تغییر با `git diff` به patch ذخیره، revert، و اثباتِ رفتارِ pristine انجام شد (`classes.test.js` رویِ کدِ دست‌نخورده ۰/۵ بود — از قبل قرمز).

---

## ۲. STILL OPEN

| Item | چرا هنوز باز است |
|---|---|
| A-02 | `health-index.js` هیچ دسترسیِ PG ندارد (صفر ارجاع). فقط performance، فقط superadmin. بدونِ pg قابلِ تأیید نیست. |
| A-04 (multi-instance) | `lastIssued` یک closureِ درون‌پروسه‌ای است؛ حالتِ JSONِ چندنمونه‌ای همچنان تصادم می‌کند. PG از طریقِ `nextval` immune است. |
| A-08 | ۱۳ پرچمِ heuristic بررسی شد؛ ۲ نمونه LEGITIMATE بودند (idiomهای متفاوت). بازبینیِ runtimeِ تک‌تکِ مسیرهای exit(0) کامل نشد. |
| A-10 | `codeql.yml` فقط echo می‌زند — هیچ اسکنی. |
| A-11 | `fortify.yml` بدونِ credential اسکن را skip می‌کند (مستند، ولی باز هم بدونِ اسکن). |
| A-12 | `run-all-tests.sh` به `package.json` یا هیچ workflowای وصل نیست. |
| A-13 | `ci-test-parity-contract` غیربازگشتی است؛ ۳۰ سوئیتِ `tests/api/` نامرئی **و قرمز**. |

هیچ‌یک از این موارد در این فاز «بررسی‌شده» رد نشدند — همگی با شواهدِ رویِ HEAD جاری باز نگه داشته شدند.

---

## ۳. ACCEPTED RISK

**فقط A-22 (بخشِ residual).** شرطِ دروازه: مالکِ قابل‌شناسایی، rationale، scope، نقطهٔ بازبینی/انقضا، و کنترل‌های جبرانیِ runtime-tested.

| شرط | وضعیت |
|---|---|
| Scope | ابطالِ نشستِ بین‌نمونه‌ای در پنجرهٔ قطعیِ Redis |
| Rationale | توازنِ موجودیتِ سرویس در برابرِ تازه‌بودنِ ابطال (مستند در headerِ revocation.js) |
| کنترل‌های جبرانی | **همگی اکنون runtime-tested** در `reaudit-redis-outage.js`: denylistِ محلی (S3b)، بارگذاریِ denylist پس از ریاستارت (S5)، انقضایِ توکن مستقل از ردیس (S4b/S4c)، `audit('revocation_redis_error')` در هر fail-open |
| **مالک** | **ثبت‌نشده — نقص** |
| **نقطهٔ بازبینی/انقضا** | **ثبت‌نشده — نقص** |

⚠️ Phase C این مورد را بدونِ مالک و بدونِ نقطهٔ بازبینی به‌عنوان ACCEPTED RISK ثبت کرده بود. این تحتِ دروازهٔ سخت‌گیرانه پذیرفته نیست. بنابراین: **ACCEPTED RISKِ مشروط** — کنترل‌ها اثبات شدند، ولی تا زمانی که مالک و نقطهٔ بازبینی ثبت نشوند، کامل حساب نمی‌شود.

---

## ۴. BLOCKED

| Item | مانع |
|---|---|
| A-27 (DR/E4) | هیچ محیطِ واقعیِ PG/Redis برایِ restore/failover وجود ندارد. `multi-instance.js` و `pg-prod-*` همگی رویِ نبودِ `DATABASE_URL` به‌صورتِ NOT-RUN باز می‌ایستند — **نه PASS**. طبقِ دستور: BLOCKED. |
| A-25 (Outbox F-1a..F-5) | نیازمندِ worker زنده و PG. `server/outbox.js` موجود و متصل است ولی runtime تأیید نشد. |
| A-28 (Architecture/Scale) | نیازمندِ محیطِ national-scale. |
| A-24 (بخشِ کامل) | A-18/A-20 رویِ main اثبات شد؛ legacy/LWW، crash durability، reconnect، multi-host هنوز تأیید‌نشده. branch روی origin وجود ندارد. |

---

## ۵. FALSE-GREEN FOUND

**هیچ false-greenِ جدیدی پیدا و اثبات نشد.** نتیجهٔ جاروب (۹۶۴ فایل):

| کلاس | نتیجه |
|---|---|
| `assert(true)` / `chk(...,true)` / `|| true` / `0/0` | هیچ‌کدام باقی نمانده‌اند — ۷ مورد در Phase C پاک‌سازی شدند و بررسیِ مجدد رویِ e4584806 پاک است. |
| skip پنهان به‌عنوانِ PASS | A-07/A-14 با شمارندهٔ NOT-RUN اصلاح شدند؛ wave1/wave3/bell2 همگی `(+N NOT-RUN)` گزارش می‌دهند. |
| `process.exit(0)` بدونِ check | ۱۳ پرچمِ heuristic؛ ۲ نمونهٔ بررسی‌شده (demo-thursday, session8-gc) LEGITIMATE بودند. **هیچ موردِ اثبات‌شده‌ای نیست.** |
| **FG-1: لایهٔ tests/api (جدید)** | ۳۰ سوئیت زیرِ `tests/api/` توسطِ **هیچ دروازه‌ای** اجرا نمی‌شوند (`npm test` رویِ run.js+smoke.js قفل است؛ parity فقط top-level را می‌بیند). ۵/۵ نمونهٔ بررسی‌شده رویِ e4584806 **۰/N و HTTP 503** هستند. این false-green نیست — قرمزِ صادقانه ولی **نامرئی** است. تا زمانی که به CI وصل یا با مالک بازنشسته نشوند، بودجهٔ parity قابل‌اعتماد نیست. |
| **FG-2: npm test 34/35** | شکستِ تنها، `index.html` build bit-identity است. با revertِ کاملِ تغییرات اثبات شد pre-existing است (baseline هم ۳۴/۳۵). قرمزِ صادقانه، ولی یعنی دروازهٔ کانونی هرگز ۳۵/۳۵ نمی‌شود. |

**توضیحِ یک ناسازگاریِ عددی:** گزارشِ Phase C نوشت «۸۹ بررسی» برایِ ۸ سوئیت، ولی جمعِ واقعی ۸۳ است (۳+۶+۱۲+۱۶+۸+۱۸+۱۱+۹). همه رویِ HEAD جاری سبز تأیید شدند؛ فقط جمعِ گزارش اشتباه بوده است.

---

## ۶. NEW FINDINGS

1. **R-1 (A-20):** stale-write واقعی + asymmetryِ OCC. توضیفِ Phase C از نوعِ «قرارداد را دید، پیاده‌سازی را سنجید نکرد».
2. **R-2a (A-22):** درگاهِ بوت برایِ شکلِ «فقط REDIS_URL» fail-closed نبود — zombie server با fail-openِ هر درخواست.
3. **R-2b (A-22):** نبودِ commandTimeout — پارتیشنِ بی‌پاسخ، auth را بی‌نهایت آویزان می‌کرد.
4. **FG-1:** لایهٔ کاملِ `tests/api` (۳۰ سوئیت) از هر دروازه‌ای نامرئی و قرمز.
5. **A-13 شاهدِ جدید:** عددِ دقیقِ ۳۰ سوئیتِ نامرئی (به‌جایِ توصیفِ کلی).
6. **خطایِ حسابداریِ Phase C:** ۸۹ گفته شد، ۸۳ واقعی.

---

## ۷. STRICT GATE STATUS

```
NOT VERIFIED
```

**چرا نه BLOCKED و نه READY:**
- **BLOCKED نمی‌شود** چون هیچ عیبِ تأییدشده‌ای باز نمانده که جلویِ حرکت را بگیرد: هر دو عیبِ جدید fix شدند (02c14742, e4584806)، regression آن‌ها ۳۴/۳۴ و ۱۷/۱۷ سبز است، و هیچ guardای که قبل سبز بود قرمز نشد.
- **READY FOR THREE-AI VERIFICATION نمی‌شود** چون: (۱) فقط یکی از سه بررسی‌کننده (Atria) شواهد تولید کرده — ChatGPT و Arena هنوز رویِ این HEAD هیچ reviewای نزده‌اند؛ (۲) دو false-green blocker (FG-1, FG-2) هنوز مالک ندارند؛ (۳) ACCEPTED RISKِ A-22 فاقد مالک و نقطهٔ بازبینی است.

**هرگز CERTIFIED اعلام نمی‌شود.** در `docs/verification/VERIFICATION_REGISTRY.json` هیچ موردی `CERTIFIED` نیست؛ ۱۳ مورد `ATRIA_PASS` (عبورِ تک‌AI) و بقیه STILL OPEN / BLOCKED / PARTIALLY DISCHARGED ثبت شده‌اند.

---

## ضمیمه — شواهدِ اجرا رویِ HEAD پایانی (`e4584806`)

| سوئیت | نتیجه | نقش |
|---|---|---|
| `tests/reaudit-occ-stale-write.js` | **۳۴/۳۴** | regressionِ A-20 (جدید) |
| `tests/reaudit-redis-outage.js` | **۱۷/۱۷** | regressionِ A-22 (جدید) |
| `tests/occ.js` | ۱۸/۱۸ | قراردادِ سازگاریِ OCC همچنان سبز |
| `tests/phase-c-unvalidated-fks.js` | ۱۶/۱۶ | A-21 رویِ HEAD جدید |
| `tests/phase-c-conflict-resolution.js` | ۱۲/۱۲ | A-18 |
| `tests/phase-c-sms-quota-complexity.js` | ۱۸/۱۸ | A-06 |
| `tests/phase-c-regional-pg-reads.js` | ۱۱/۱۱ | A-01 |
| `tests/phase-c-regional-difficulty-metric.js` | ۹/۹ | A-23 |
| `tests/phase-c-backup-pg-noop.js` | ۸/۸ | A-05b |
| `tests/phase-c-id-race.js` | ۳/۳ | A-04 |
| `tests/phase-c-student-timeline-ownership.js` | ۶/۶ | A-19 |
| `tests/redis-fallback.js` | ۱۰/۱۰ | A-22 بدون regression |
| `tests/wave6-redis.js` | ۲۲/۲۲ | A-22 بدون regression |
| `tests/wave1-reads.js` | ۱۷/۱۷ (+۱ NOT-RUN) | A-07 |
| `tests/wave3-query2.js` | ۱۲/۱۲ (+۱ NOT-RUN) | A-07 |
| `tests/bell2.js` | ۷/۷ (+۱ NOT-RUN) | A-14 |
| `tests/offline-sync-drill.js` | ۲۹/۲۹ | A-15 |
| `tests/client-features.js` | ۱۲/۱۲ | A-17 |
| `tests/multigrade2.js` | ۹/۹ | A-17 |
| `tests/vclass3.js` | ۶/۶ | F-3 |
| `npm test` | ۳۴/۳۵ (pre-existing) | درگاهِ کانونی |

**Commitهای این ممیزی:**
```
e4584806 fix(session): بستنِ دو سوراخ در قراردادِ قطعیِ Redis (A-22 re-audit)
02c14742 fix(occ): یکنواخت‌کردنِ الزامِ base_version روی همهٔ مسیرهای PATCH (A-20)
```
**فایل‌های تغییریافته:** `server/routes/{students,users,classes,attendance}.js`، `server/index.js`، `server/redis.js`، + ۲ تستِ جدید. `index.html` (artifact) پس از هر build step بازیابی شد و واردِ commit نشد. `git add -A` هرگز استفاده نشد. Force-push و rebase انجام نشد.

---

### قانونِ نهایی
**NO EVIDENCE = NO PASS** · **ONE AI PASS = NOT VERIFIED** · **THREE-AI AGREEMENT + CURRENT-HEAD EVIDENCE = ELIGIBLE FOR CERTIFICATION**

این گزارش یک artifactِ ممیزیِ مستقل است، نه گواهی.
