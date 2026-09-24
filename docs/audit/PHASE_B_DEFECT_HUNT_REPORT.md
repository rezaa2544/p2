# گزارش ممیزی مستقل — Phase B
## High/Critical Defect Hunt + Runtime Verification + Remediation
### پروژهٔ Payesh · شاخهٔ `main` · تاریخ: ۲۰۲۶-۰۹-۲۴

---

## A) خلاصهٔ اجرایی

این یک ممیزی مستقلِ zero-trust بود: هر ادعای امنیتی با خواندنِ سورس، اجرای مستقیمِ توابع روی دادهٔ واقعیِ seed، و در موارد کلیدی با سرورِ زنده و ورودِ OTP واقعی بازتولید شد. **هیچ finding ساخگی برای رسیدن به عدد تولید نشد** — یک ادعا (دروازهٔ Redis) پس از بررسی دقیق **رد شد** و در بخش G ثبت گردید.

سرانجام **۱۱ عیبِ واقعی** کشف و اصلاح شد: یک **P0** (نشتِ دادهٔ بین‌مستأجری از `/api/v1/pull`) و ده **P1**. همه با شواهد E2 (اجرای مستقیم روی seed) یا E3 (HTTP زنده با نشستِ واقعی) بازتولید، اصلاح، و با رگرسیون‌تست پوشش داده شدند.

**درخواست مهمِ فرض: دو تستِ قدیمی به‌جای اینکه شکست بخورند، خودِ رفتارِ ناامن را تضمین می‌کردند** — `edu_office` را «همیشه مجاز» اعلام می‌کردند. این دو تست تقویت شدند (سخت‌گیرانه‌تر شدند، نه تضعیف)، چون پیشانهٔ آن‌ها دقیقاً همان نقصِ امنیتی بود.

### درصدها
| شاخص | مقدار |
|---|---|
| findings کشف‌شدهٔ واقعی | ۱۱ |
| P0 اصلاح‌شده | ۱ از ۱ — ۱۰۰٪ |
| P1 اصلاح‌شده | ۱۰ از ۱۰ — ۱۰۰٪ |
| findings ردشده (بررسی → SAFE) | ۱ (شفافیت) |
| Medium/Low شناسایی‌شده و معوق | ۲۲ (قسمت D) |
| سوئیت رگرسیون جدید | `tests/phase-b-tenant-and-data-boundaries.js` — **۲۸/۲۸ پاس** |
| سوئیت‌های موجود پس از اصلاحات | semantic-layer **۳۳/۳۳** · npm test **۳۴/۳۵** (۱ شکستِ ازپیش‌موجود، تأییدشده روی baseline) · ۵ دروازهٔ CI دیگر همگی سبز |

---

## B) یافته‌های بحرانی (P0)

| ID | زیرسیستم | فایل:خط | عنوان | وضعیت |
|---|---|---|---|---|
| F-08 | همگام‌سازی/لایهٔ pull | `server/pull.js:341`، `:237` | نشتِ کاملِ جدول‌های بدونِ school_id به هر نقش | ✅ اصلاح + E3 |

**F-08 — جزئیات:** `GET /api/v1/pull?collections=X` هر کلکشنی که در store وجود داشت را می‌پذیرفت (`store[c] != null`) و فیلترِ پیش‌فرض هر ردیفی با `school_id == null` را به **همه** برمی‌گرداند.

**بازتولیدِ E3 (سرورِ زنده، نشستِ ولیِ واقعی، OTP واقعی):**
```
parent 17 → GET /api/v1/pull?collections=bus_locations        → 200 + مختصاتِ زندهٔ GPSِ دانش‌آموزانِ دیگر
parent 17 → GET /api/v1/pull?collections=parent_subscriptions  → 200 + مبالغِ اشتراکِ خانواده‌های دیگر
parent 17 → GET /api/v1/pull?collections=parent_links          → 200 + ۵۲۷ رابطهٔ ولی/فرزند از همهٔ مدارس
parent 17 → GET /api/v1/pull?collections=offices               → 200 + زیرساختِ ادارات
```
همچنین `collections=tombstones` پذیرفته می‌شد و در صورتِ هر حذفِ نرم، رکوردهای حذف‌شده با `phone` و `national_id` نشت می‌کرد.

**ریشه:** `requestedCols.filter(c => store[c] != null || ALL_COLLECTIONS.includes(c))` — فهرستِ مجاز فقط یک گزینهٔ یا بود؛ و فیلترِ پایانی `school_id == null` را به‌جای «خارج از دامنه» به‌معنای «عمومی برای همه» تفسیر می‌کرد.

**اصلاح:** درخواست فقط از `ALL_COLLECTIONS` سرو می‌شود (کلکشن‌های ناشناخته در `ignored_unknown_collections` گزارش می‌شوند)؛ `sync_conflicts`/`counselor_*` محدود به نقش‌های اداری شد؛ ردیف‌های سراسری فقط برای `subjects`/`announcements` (عمومیِ واقعی) مجاز ماند و `edu_office` فقط مدارسِ زیرِ پوششِ جغرافیاییِ دفترش را می‌بیند.

---

## C) یافته‌های بالا (P1)

| ID | زیرسیستم | فایل:خط | عنوان | وضعیت |
|---|---|---|---|---|
| F-01 | لایهٔ هوشمندی | ۴ گارد (زیر) | دور زدنِ حریمِ استانیِ `edu_office` | ✅ اصلاح + E2/E3 |
| F-03 | موتورهای تجمیع | ۳ تابع | پنهان‌سازیِ دادهٔ گم‌شده با پیش‌فرض‌های جادویی | ✅ اصلاح |
| F-05 | دروازهٔ بسترِ فاز ۶ | `server/index.js:1175-1185` | محرومیتِ کاملِ `edu_office` از `/api/v1` + پیش‌فرضِ جادوییِ `07` | ✅ اصلاح + E3 |
| F-06 | ایزولاسیونِ استانی | `phase6-production-hardening.js:80-96` | تصادمِ کدِ استان (دو استان → یک توکن) | ✅ اصلاح |
| F-07 | یکپارچگیِ تست | `tests/subs2.js:149` | assert همواره-درست، نقصِ paywall را می‌پوشاند | ✅ اصلاح |
| F-09 | همگام‌سازی | `server/pull.js` (۳ شاخه) | حلِ فرزند از `users.parent_id` به‌جای `parent_links` | ✅ اصلاح |
| F-10 | رصدپذیری | `server/metrics.js:756` | دور زدنِ احرازِ `/metrics` در `NODE_ENV=production` | ✅ اصلاح |
| F-11 | بوت | `server/index.js:335` | سوکت پیش از تصمیمِ دروازهٔ Redis باز می‌شد | ✅ اصلاح |
| F-12 | یکپارچگیِ تست | `tests/config-reference-coverage.js:46` | `\|\| true` غربالگری را بی‌اثثر کرده بود | ✅ اصلاح (۷۹/۷۹) |
| F-13 | یکپارچگیِ تست | ۲ فایل تست | تضمینِ نقص: تست‌ها «همیشه-مجاز» را assert می‌کردند | ✅ تقویت |

### F-01 — دور زدنِ حریمِ استانی در ۴ گارد
چهار گارد با الگوی `if (role === 'edu_office') return true;` هیچ مهارِ جغرافیایی‌ای نداشتند:
- `server/routes/semantic-analytics.js:65` `assertCanSeeSchool` (۸ مسیر)
- `server/analytics/school-intelligence-center.js:48` (مسیرِ `routes/analytics.js:117`)
- `server/analytics/teacher-evidence.js:52`
- `server/analytics/intervention-case-management.js:64`

**بازتولیدِ E2 پیش از اصلاح** (edu_office دفترِ کردستان، مدرسهٔ ۳ در تهران):
```
school-intelligence-center.enforceSchoolIntelligenceAccessGuard => true   ← نشت
teacher-evidence.enforceTeacherAccessGuard                              => true   ← نشت
semantic-analytics.assertCanSeeSchool                                   => true   ← نشت
```
**پس از اصلاح:** هر سه `TENANT_ISOLATION_VIOLATION` پرتاب می‌کنند. الگویِ مرجعِ درست (`policy.userOffice` + `officeCoversSchool`، همان `reports.js`) به‌کار رفت. این گارد حتی **دقتِ شهرستانی** را حفظ می‌کند: دفترِ ناحیه‌ای ۳ (کردستان/سنندج/ناحیه۱) فقط مدرسهٔ ۱ را می‌بیند، نه مدارس ۲ و ۵ را.

### F-05 — محرومیتِ `edu_office` + پیش‌فرضِ جادوییِ `07`
`index.js` استانِ عامل را inline با یکternary می‌ساخت که `province_id === 1` و `province_id === 2` را **هر دو** به `'07'` نگاشت می‌کرد، و در پایان `|| '07'` به‌عنوان پیش‌فرض می‌آمد. کاربرانِ `edu_office` (۸ کاربر در seed) `school_id` و `province_code` ندارند، پس `effProv` همیشه `'07'` می‌شد و گارد برای **همهٔ مدارس حتی مدرسهٔ خودشان** ۴۰۳ می‌داد.

**بازتولیدِ E3 پیش از اصلاح:** ۸ از ۸ endpoint شامل `/api/v1/bootstrap` → `403 PHASE6_TENANT_ISOLATION_BREACH`.
**پس از اصلاح:** `bootstrap`/`students`/`school-intelligence?school_id=1` → **۲۰۰**؛ `school_id=3` → ۴۰۳؛ تزریقِ `x-province-code: 07` → ۴۰۳.

اصلاح: `resolveActorProvince` (منبعِ واحد) گسترش یافت تا `office_id` را هم حل کند؛ پیش‌فرضِ `07` حذف و در نبودِ استانِ قابل‌حل، fail-closed شد. `mapProvinceToken` و `resolveActorProvince` که از قبل در `index.js:64` import شده بودند اما export نشده بودند، export شدند.

### F-06 — تصادمِ کدِ استان (اثرِ امنیتیِ پنهان)
در `IRAN_PROVINCE_BY_NAME`: `'سیستان': '12'` و `'کردستان': '12'` — دو استانِ متمایز به یک توکن نگاشته می‌شدند، پس گاردِ حریمِ استانی بینِ این دو استان بی‌اثر بود. کدهای چند استان دیگر هم نادرست بود (خراسان رضوی ۰۹ به‌جای ۲۴، البرز ۰۰ که وجود ندارد). با کدهای استانداردِ سازمان ثبت احوال جایگزین شدند (همه یکتا و دو رقمی). این نقش کاملاً silent بود و فقط با خواندنِ دقیقِ جدول کشف شد.

### F-09 — ولی، فرزندانش را نمی‌دید
سه شاخهٔ parent در `pull.js` فرزندان را با `u.parent_id === userId` حل می‌کردند، در حالی که در seed `users.parent_id` خالی است و پیوندِ رسمی در `parent_links` است. نتیجه: یک ولی `attendance`/`grades` فرزندش را **صفر** دریافت می‌کرد. اصلاح: استفاده از `policy.childrenOfParent` (منبعِ یکتا که `parent_links` و `users.parent_id` را اجتماع می‌گیرد).

### F-10 — دور زدنِ `/metrics`
`scrapeGate` تولید را فقط با `PAYESH_ENV` می‌سنجید، در حالی که دروازه‌های DB/Redis/TLS هر دو پرچم را می‌بینند. با `NODE_ENV=production` و بدونِ توکن، شاخص‌ها از مسیرِ loopback باز می‌شدند و پشتِ یک پروکسیِ هم‌میزبانی (توسعهٔ مستندشده با `PAYESH_BEHIND_PROXY=1`) `remoteAddress` برابرِ `127.0.0.1` است → **هر مهاجمِ خارجی `/metrics` را بدونِ احراز می‌خواند**. اصلاح: `isProd` هر دو پرچم را می‌بیند.

### F-11 — مسابقهٔ بوت
`cache.init()` fire-and-forget بود و `startListening` آن را await نمی‌کرد. با ردیسِ پیکربندی‌شده اما غیرقابلِ دسترس، `redis.init` تا ۳ ثانیه طول می‌کشد، پس `server.listen()` سوکت را **۳ ثانیه پیش از** `process.exit(1)` دروازهٔ Redis باز می‌کرد. اصلاح: `cacheReady` ساخته و پیش از `listen()` await شد.

### F-03 — پنهان‌سازیِ دادهٔ گم‌شده (بازمانده از موجِ قبل)
سه تابع از اصلاحِ قبلیِ D1 جا مانده بودند:
- `generateDistrictAggregation`: `?? 90.0` / `?? 5.0` + `status || 'HEALTHY'` (مدرسهٔ بدون داده سالم فرض می‌شد)
- `buildRegionalSnapshot`: `resolution_rate ?? 100.0`، `effective_interventions_ratio: ... ? 0.85 : 1.0` (عددِ دل‌بخواه)
- `generateActionRecommendations`: `?? 90.0` و `attRate < 85 ? 14.2 : 5.0`

اصلاح با همان idiomِ تثبیت‌شده: شمارشِ فقطِ مدارسِ دارای داده، `null` در نبودِ داده، و افشایِ صریحِ `schools_reported_in_*_average` / `schools_with_no_data_count`.

---

## D) Medium/Low معوق (شناسایی، اصلاح‌نشده — خارج از دامنهٔ P0/P1)

این موارد شناسایی و مستند شدند ولی اصلاح نشدند، چون یا P2 هستند یا اصلاحشان نیازمند بازآراییِ وسیع با ریسکِ بالاتر از فایدهٔ فوری است:

**عملکرد (P1 از منظرِ قابلیت، اما بدونِ اثرِ امنیتی/تننت):**
1. `routes/analytics.js` گزارش‌های منطقه‌ای: O(schools × collections) اسکنِ همگام + مسیرِ PG شکسته (حتی در حالتِ PG از `store.*` می‌خواند و mirror capped است).
2. `health-index.js` همین الگو؛ مسیرِ PG کلاً ندارد.
3. `routes/analytics.js` + `semantic-analytics.js` ۶ کوئریِ موازی روی **پولِ اصلی** (نه `queryRead`) → اشباعِ pool و قطعِ auth/sync.
4. `ids.js:78-88` قفل را پیش از push رها می‌کند → ID تکراری بین دو درخواستِ همزمان (در حالتِ memory store).
5. بکاپِ خودکار پیش‌فرض خاموش و بدونِ هشدارِ بوت.
6. `sms_log`/`notify_queue` رشدِ نامحدود و بازخوانی در هر درخواست.

**یکپارچگیِ تست/CI:**
7. `wave1-reads.js`، `wave3-query2.js`، `wave4-sync.js` — self-skipِ مسیرِ PG به‌جای شکست، به‌عنوان PASS شمرده می‌شود.
8. شش سوئیت با `process.exit(0)` و ۰/۰ چک «سبزِ نهایی» چاپ می‌کنند.
9. `.github/workflows/codacy.yml` با `max-allowed-issues: 2147483647` هرگز شکست نمی‌خورد.
10. `codeql.yml` فقط `echo` می‌زند؛ `fortify.yml` بدونِ اسکن سبز است.
11. `scripts/run-all-tests.sh` توسط هیچ CI یا package.json اجرا نمی‌شود.
12. `ci-test-parity-contract.js` فقط `tests/*.js` سطحِ بالا را می‌بیند (۱۴۳ فایل تست در زیرشاخه‌ها نامرئند) و بودجهٔ ۴۸۵ یتیم را تضمین می‌کند.
13. `tests/bell2.js:184` skipِ وابسته به تاریخ در روزهای پنجشنبه/جمعه به‌عنوان پاس گزارش می‌شود.
14. `tests/offline-sync-drill.js:183` `chk(..., true)` سخن‌گوی ثابت.
15. `tests/chaos-drill-lib.js:384` مقایسهٔ `=== Buffer.alloc(0)` مرده.
16. `tests/client-features.js:139` / `multigrade2.js:181` `assert(true, ...)`.

**سایر:**
17. `conflicts.js:137-145` resolve-conflict شمارندهٔ نسخه را rewind می‌کند و از تمام دروازه‌های sync عبور نمی‌کند.
18. `student-timeline` تدریسِ معلم را برای student_id بررسی نمی‌کند (فقط مدرسه).
19. OCC در همهٔ PATCHها به‌جز grades قابل‌دورزدن است (`occ.js` فقط در `grades.js` strict است).
20. `class_id`/`homeroom_teacher_id` در نوشتن بدونِ بررسیِ مالکیت ذخیره می‌شوند.
21. `revocation.js` در قطعیِ Redis fail-open می‌شود (logout بین‌نمونه‌ای).
22. `average_difficulty_p_value: totalExams > 0 ? 0.62 : 0.65` در `buildRegionalSnapshot` عددِ ساختگی.

---

## E) اصلاحات (diff حداقلی)

۱۵ فایل تغییر یافت + ۱ فایل تستِ جدید. هیچ فایلِ کلاینت یا build artifact دست نخورد.

| فایل | تغییر |
|---|---|
| `server/infrastructure/phase6-production-hardening.js` | اصلاحِ جدولِ کدِ استان؛ `resolveActorProvince` گسترش برای `office_id`؛ export دو تابع |
| `server/index.js` | حذفِ inline derivation و پیش‌فرضِ `07`؛ استفاده از `resolveActorProvince`؛ fail-closed در نبودِ استان؛ await `cacheReady` پیش از `listen()`؛ اصلاحِ بنرِ metrics |
| `server/routes/semantic-analytics.js` | `assertCanSeeSchool` مهارِ دفتر + پاسِ store در ۸ فراخوانی |
| `server/routes/analytics.js` | پاسِ store به گارد |
| `server/analytics/school-intelligence-center.js` | گارد + `generateDistrictAggregation` بدونِ masking |
| `server/analytics/teacher-evidence.js` | گارد |
| `server/analytics/intervention-case-management.js` | گارد |
| `server/analytics/regional-intelligence-network.js` | `buildRegionalSnapshot` بدونِ masking |
| `server/analytics/recommendation-action-planning.js` | `generateActionRecommendations` بدونِ masking |
| `server/pull.js` | allowlistِ کلکشن + گاردهای نقش + فیلترِ دامنه + `childrenOfParent` |
| `server/metrics.js` | `isProd` هر دو پرچم |
| `tests/subs2.js` | حذفِ `\|\| true` |
| `tests/config-reference-coverage.js` | حذفِ `\|\| true` |
| ۲ فایل تستِ semantic-layer | تقویتِ پیشانهٔ edu_office (از «همیشه مجاز» به «فقط در حوزه») |
| `tests/phase-b-tenant-and-data-boundaries.js` | **جدید** — ۲۸ رگرسیون |

---

## F) ماتریکس تست

| سوئیت | انتظار | واقعی | نتیجه | سطحِ شواهد | محیط |
|---|---|---|---|---|---|
| `tests/phase-b-tenant-and-data-boundaries.js` (جدید) | ۲۸/۲۸ | ۲۸/۲۸ | ✅ | E2 (ماژول + seed واقعی) | Node 24 |
| `tests/semantic-layer/runner.js` | ۳۳/۳۳ | ۳۳/۳۳ | ✅ | E2 | Node 24 |
| `tests/no-data-masking.test.js` | ۹/۰ | ۹/۰ | ✅ | E2 | Node 24 |
| `tests/analytics-timestamps.test.js` | ۵/۰ | ۵/۰ | ✅ | E2 | Node 24 |
| `tests/analytics-wiring-guard.test.js` | ۴/۰ | ۴/۰ | ✅ | E2 | Node 24 |
| `tests/semantic-analytics-e2e.test.js` | ۱۲/۰ | ۱۲/۰ | ✅ | E2 | Node 24 |
| `tests/certification-non-circular.test.js` | ۱۴/۰ | ۱۴/۰ | ✅ | E2 | Node 24 |
| `tests/intelligence-client-render.test.js` | ۲۹/۰ | ۲۹/۰ | ✅ | E2 | Node 24 |
| `tests/config-reference-coverage.js` | ۷۹/۷۹ | ۷۹/۷۹ | ✅ | E2 | Node 24 |
| `npm test` (run.js + smoke.js) | ۳۵/۳۵ | ۳۴/۳۵ | ⚠️ | E2 | Node 24 |
| **حملهٔ E3 زنده: edu_office** (OTP واقعی، سرور روی :3401) | درون-حوزه ۲۰۰ / برون-حوزه ۴۰۳ | دقیقاً مطابق | ✅ | **E3** | سرورِ زنده + seed |
| **حملهٔ E3 زنده: parent pull** | نشتِ کلکشن‌های غیرمجاز | پس از اصلاح: `ignored_unknown_collections` + ۴۰۳ | ✅ | **E3** | سرورِ زنده + seed |
| **بوتِ E3: ردیسِ مرده + شکلِ تولید** | exit غیرصفر | exit 1 | ✅ | **E3** | سرورِ زنده |

**توضیحِ ⚠️:** شکستِ `npm test` یک مورد است: `خروجی build با index.html بیت‌به‌بیت یکسان است`. با `git stash` روی baselineِ تمیز تأیید شد که **پیش از تغییراتِ من هم وجود داشت** (baseline هم ۳۴/۳۵). این شکستِ ازپیش‌موجود مربوط به artifact است و من `index.html` یا `src/` را تغییر ندادم؛ تغییراتِ سرور/تست اثری بر آن ندارد.

---

## G) ریسک‌های باقی‌مانده

1. **P1های عملکردیِ اصلاح‌نشده** (قسمت D، موارد ۱–۶): گزارش‌های منطقه‌ای در مقیاسِ ملی ممکن است event loop را مسدود کنند و مسیرِ PG آنها از mirror استفاده می‌کند. اینها واقعی اما خارج از دامنهٔ امنیتیِ این مأموریت بودند و بازآراییِشان ریسکِ بیشتری از فایدهٔ فوری داشت.
2. **`conflicts.js` (D-17)**: resolve-conflict می‌تواند دادهٔ جدیدتر را بازنویس کند — واقعی، اما در یک flow مدیریتی است و اصلاحِ درست نیاز به طراحیِ version-resolution دارد.
3. **`student-timeline` (D-18)**: معلم می‌تواند هر دانش‌آموزِ مدرسهٔ خودش را بخواند. این متناقض با مدلِ کانونی `policy.readOk` است ولی در همان مدرسه است (نه بین‌مدرسه).
4. **`revocation.js` fail-open**: در قطعیِ Redis ابطالِ نشست بین‌نمونه‌ای کار نمی‌کند.
5. **کدهای استان و `tenant_policy`**: من جدولِ کد را به کدهای استانداردِ ثبت احوال اصلاح کردم. اگر یک استقرارِ واقعی `tenant_policy.province` را با کدهای قدیمی (مثلاً `12` برای کردستان) پر کرده باشد، باید آن ردیف‌ها به `05` به‌روز شوند. این ریسک را به‌جای نگه‌داشتنِ یک نگاشتِ تصادمی پذیرفتم.

---

## H) ادعاهایی که **نمی‌توانم** بکنم

- **«تولید آماده است»** — نه. من در یک محیطِ بدون PostgreSQL/Redis تست کردم. هیچ drill تولیدی انجام نشد.
- **«۱۰۰٪ پوششِ نقص»** — نه. این یک پاسِ عمیق روی لایهٔ هوشمندی، همگام‌سازی، و دروازهٔ تننت بود؛ زیرسیستم‌های دیگر (مثلاً vclass، bus، dormitory، library) به‌صورتِ خلاصه بررسی شدند.
- **«دروازهٔ Redis وجود ندارد»** — **این ادعا را بررسی کردم و رد کردم.** دروازه وجود دارد و fail-closed است (`redis.js:254` → `cache.js:109` → `index.js:349` → `process.exit(1)`). بوتِ زنده با ردیسِ مرده غیرصفر خارج شد. این شفاف‌سازی ثبت می‌شود چون مأموروریت صراحتاً finding ساختگی را منع کرده است.
- **«دادهٔ.fromString client ایمن است»** — کلاینت توسط `intelligence-client-render` (۲۹/۰) بررسی شد اما من حملاتِ XSS/DOM روی آن اجرا نکردم.
- **`x-province-code` header قابل سوءاستفاده نیست** — این را تأیید کردم: header فقط با استانِ خودِ عامل مقایسه می‌شود و مسیرها روی `req.user.school_id` scope می‌گیرند، پس گسترشی ممکن نیست. اما این یک نتیجهٔ منفی است که با کدِ پیش از اصلاح به‌دست آمد.
- **P1های عملکردیِ قسمت D برطرف شده‌اند** — نه، فقط شناسایی و مستند شده‌اند.
- **۲۲ موردِ Medium/Low بی‌اهمیتند** — نه؛ چند مورد (analyticهای PG-broken، بازنشانیِ نسخه در resolve-conflict) می‌توانند در تولید برجسته شوند.

---

## روش‌شناسی (شفاف)

- هر finding با خواندنِ سورس بازتولید شد؛ هیچی صرفاً از documentation پذیرفته نشد.
- حملات روی سرورِ زندهٔ محلی (:3401) با دادهٔ seed واقعی، ورودِ OTP واقعی، و نشست‌های واقعی انجام شد (E3).
- یک ادعا پس از بررسی رد شد (قسمت H).
- هیچ `git add -A`، force push، یا بازنویسیِ history انجام نشد. diff حداقلی نگه داشته شد.
- دو تستِ قدیمی که رفتارِ ناامن را تضمین می‌کردند، **تقویت** شدند (سخت‌گیرانه‌تر)، نه تضعیف — پیشانهٔ آن‌ها همان نقص بود.
- هیچ secret/token در کد یا گزارش قرار نگرفت.
