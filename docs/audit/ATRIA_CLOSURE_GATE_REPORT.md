# Atria — Closure Gate مستقل و Adversarial (§1–§14)

**HEAD binding:** این گزارش به `main` @ `4938631633c9c578db2679905fd46c4daaedd80a` بسته شده است.
هر ادعا در این گزارش یا روی این HEAD اجرا/بازتولید شده، یا صریحاً `NOT VERIFIED` / `NOT-RUN` علامت‌گذاری شده است.
**قانون اجرا:** «هیچ موردی را PASS / VERIFIED / CERTIFIED اعلام نکن مگر اینکه روی HEAD فعلی مخزن با evidence قابل بازتولید اثبات شده باشد.»

---

## 0. Executive Summary

| سؤال | پاسخ |
|---|---|
| HEAD فعلی | `4938631633c9c578db2679905fd46c4daaedd80a` (main، working tree clean) |
| آیا فیکس‌های A-20/A-22 روی HEAD هستند؟ | بله — `checkOcc(...,true)` در ۵ مسیر + `isProdShape()` + `commandTimeout: 2000` |
| Strict Verification Gate روی HEAD | **NOT VERIFIED** (exit 1) — هم قبل و هم بعد از سخت‌سازی |
| جدیدترین findings | **A-30 … A-34** (یکی از آن‌ها هم‌اکنون修补 شد: A-32) |
| Critical/High unresolved | ۳ مورد باز: **A-13** (لایهٔ tests/api)، **A-27/E4** (هرگز اجرا نشد)، **A-30** (cascading skip در CI) |
| وضعیت گواهی | **NOT CERTIFIED** — طبق §14: حداقل یک Critical/High باز + عدم توافق سه‌AI + E4 اجرا نشده |

**خلاصهٔ یک خطی:** روی HEAD فعلی، کنترل‌های امنیتیِ داده (A-18/A-19/A-20/A-21/A-22) واقعاً در runtime اثبات می‌شوند، اما **زنجیرهٔ evidenceproduction در CI شکسته است**: هر گیتِ متأخر از اولین شکست به بعد skip می‌شود، Gate تولیدِ evidence واقعی (Production Truth) تا به حال هرگز اجرا نشده، و یک لایهٔ کامل تست (30 سوئیت) بیرون از هر گیت و قرمز است. بنابراین پروژه نمی‌تواند گواهی شود.

---

## 1. وضعیت مخزن (§1)

```
branch: main
HEAD:   4938631633c9c578db2679905fd46c4daaedd80a
origin/main: 4938631633c9c578db2679905fd46c4daaedd80a  (در sync)
working tree: clean
```

فیکس‌های فاز قبل روی HEAD با grep مستقیم تأیید شدند:
- `server/routes/{students,users,classes,attendance}.js` — هر چهار `checkOcc(..., true)` (A-20)
- `server/routes/grades.js:206` — `checkOcc(..., true)` (قبلاً بود)
- `server/index.js:341` — `function isProdShape()` (A-22 بخش ۱)
- `server/redis.js:97` — `commandTimeout: Number(...) || 2000` (A-22 بخش ۲)

**PR های باز (هیچ‌یک merge نشده):** #411, #410, #407, #403, #402. همهٔ CI runs روی شاخهٔ PR هستند، نه روی main.

---

## 2. ماتریس A-01..A-29

وضعیت‌های مجاز فقط: `FIXED` / `VERIFIED NOT A DEFECT` / `ACCEPTED RISK` / `BLOCKED` / `NOT-RUN` / `NOT VERIFIED` / `HISTORICAL / REPRODUCTION REQUIRED`

| ID | Status | Evidence | Runtime | Regression | Independent (3-AI) | Blocker |
|---|---|---|---|---|---|---|
| A-01 خواندنِ منطقه‌ای PG | **NOT VERIFIED** | `routes/analytics.js` district scoping؛ اثبات فقط در E2 (fake PG) | ❌ live PG در این ساندباکس نیست | `tests/phase-c-regional-pg-reads.js` 11/11 (روی کامیت قبلی) | ❌ فقط Atria | خیر |
| A-02 کاهش DB calls | **NOT VERIFIED** | ادعای تعداد فراخوانی — بدون اندازه‌گیری روی HEAD | ❌ | — | ❌ | خیر |
| A-03 latency | **NOT VERIFIED** | عددی روی HEAD ثبت نشد | ❌ | — | ❌ | خیر |
| A-04 multi-instance | **NOT-RUN** | نیازمند PG زنده؛ `multi-instance.js` خودش چاپ می‌کند «در این ساندباکس PG زنده نیست» | ❌ | — | ❌ | **بله** |
| A-05b backup timer | **NOT VERIFIED** | تایمرِ پشتیبان بدون evidence اجرایی روی HEAD | ❌ | — | ❌ | خیر |
| A-06 pool/event-loop | **NOT VERIFIED** | بدون اندازه‌گیری pool/event-loop روی HEAD | ❌ | — | ❌ | خیر |
| A-08..A-17 false-green | **NOT VERIFIED** (جزئیات §6) | sweep الگوها در G7 — ۴ الگو فقط | بخشی | G7 فعّال است | ❌ | A-13 بله |
| A-18 نسخه‌گذاری/تعیین‌پذیری | **FIXED** | `conflicts.js:149-150` `nextVer = max(curVer, server_version)+1` | ✅ | `tests/reaudit-occ-stale-write.js` 34/34 | ❌ فقط Atria | خیر |
| A-19 student_id→مالکیت | **FIXED** | `policy.js:358-366` مالکیت روی student_id سوار است | ✅ **جدید: 17/17** | `tests/reaudit-a19-student-id-ownership.js` | ❌ فقط Atria | خیر |
| A-20 OCC سخت در همهٔ PATCH | **FIXED** | ۵ مسیر `checkOcc(...,true)` | ✅ | 34/34 | ❌ | خیر |
| A-21 class_id/ثبت‌نام | **FIXED** | `attendance.js:108-112` مهرِ کلاسِ واقعی | ✅ | M2b/M3b در تستِ A-19 | ❌ | خیر |
| A-22 Redis در دسترس نیست | **FIXED** | `isProdShape()` + `commandTimeout` | ✅ | `tests/reaudit-redis-outage.js` 17/17 | ❌ | خیر |
| A-24 perf مقیاس | **NOT VERIFIED** | بدون اندازه‌گیری (اعداد §4 فقط memory-mode) | ❌ | — | ❌ | خیر |
| A-25 DR/backup/restore | **NOT VERIFIED** | زنجیرهٔ failover/restore اجرا نشد | ❌ | — | ❌ | خیر |
| A-26 false-green ریز | **NOT VERIFIED** | §6 | بخشی | — | ❌ | خیر |
| A-27 E4 production truth | **NOT VERIFIED** | **هرگز اجرا نشد** (§5) | ❌ | — | ❌ | **بله** |
| A-28 معماری/مقیاس | **NOT VERIFIED** | ادعای مقیاس بدون soak/stress | ❌ | — | ❌ | خیر |
| A-29 یکپارچگی roadmap | **HISTORICAL / REPRODUCTION REQUIRED** | تطابق roadmap با کد/CI/registry نیاز به بازبینی مستقل دارد | ❌ | — | ❌ | خیر |

**هیچ موردی `CERTIFIED` نیست.** بیشترین وضعیتِ موجه روی این HEAD `FIXED` است (با evidence اجراییِ تک‌AI) و حتی آن هم به‌تنهایی برای گواهی کافی نیست.

---

## 3. Deep-Diveهای Adversarial (§3)

### A-19 — آیا student_id می‌تواند مالکیت را دور بزند؟
**نتیجه: خیر. اثباتِ runtime: 17/17.**

مسیرهای حمله و نتیجه (مدیرِ مدرسهٔ ۱ با `PAYESH_ALLOW_DEV_MEMORY_AUTHORITY=1`، dataset واقعی seed):

| حمله | نتیجه |
|---|---|
| M1 مدیر۱ → POST attendance با student_idِ مدرسهٔ ۳ | **403** |
| M2 مدیر۱ → POST grades با student_idِ مدرسهٔ ۳ | **403** |
| M2b مدیر۱ → attendance با student_id **و** class_idِ مدرسهٔ ۳ | **403** |
| M3 دبیر مدرسه۱ → attendance با student_idِ مدرسهٔ ۳ | **403** |
| M3b دبیر → دانش‌آموز/کلاسِ غیرمجاز هم‌مدرسه | **403** |
| M4 والد → attendance با student_idِ مدرسهٔ ۳ | **403** |
| M5 PATCH attendance برای انتقال student_id به مدرسهٔ دیگر | رد/نادیده — رکورد منتقل نشد |
| M6 PATCH student با `school_id: 5` | فیلد در allow-list نیست → school_id تغییر نکرد، نام به‌روز شد (مسیرِ مجاز سالم) |
| M8/M9 خواندن | مدیر۱ هیچ رکورد/دانش‌آموزی از مدرسهٔ ۳ نمی‌بیند؛ مدیر۳ داده‌های خودش را می‌بیند |

مکانیزم (کد): `policy.js:358-366` — `student_id` از رکورد حل می‌شود، رکوردِ واقعیِ دانش‌آموز از `store.users` خوانده می‌شود، و اگر `stu.school_id !== u.school_id` باشد fail-closed رد می‌شود. یعنی **هیچ Resource ID به‌تنهایی مجوز نیست**.

**محدودیتِ ثبت‌شده:** دانش‌آموزِ ناشناس (id موجود نباشد) رد نمی‌شود — رفتارِ legacy برای رکوردهای یتیم (`docs/WAVE5_AUTHZ.md §۵`). این یک مسئلهٔ کیفیتِ داده است، نه دسترسیِ بین‌مدرسه‌ای.

**مشاهدهٔ جانبی (A-33):** در memory mode و بدون `PAYESH_ALLOW_DEV_MEMORY_AUTHORITY=1`، تمام write های `/api/v1` که tenant-checked هستند `503 AUTHORITY_UNAVAILABLE` برمی‌گردانند. این fail-closedِ عمدی است، ولی برای یک محصولِ offline-first یک محدودیتِ عملیاتیِ قابل توجه است و باید در راهنمای استقرار ذکر شود.

### A-20 — inventory همهٔ مسیرهای PATCH/UPDATE
پنج مسیر وجود دارد و همه‌اش اکنون strict هستند (`checkOcc(..., true)`):

| مسیر | فایل:خط |
|---|---|
| students | `server/routes/students.js:204` |
| users | `server/routes/users.js:179` |
| classes | `server/routes/classes.js:228` |
| attendance | `server/routes/attendance.js:177` |
| grades | `server/routes/grades.js:206` |

اثبات: `tests/reaudit-occ-stale-write.js` **34/34** — فازِ strict برای هر ۵ موجودیت `400 missing_base_version` می‌دهد؛ write کهنه `409`؛ write بدون نسخه در حالتِ compat عبور می‌کند و bump می‌شود.

### A-18 — تعیین‌پذیریِ نسخه
`server/conflicts.js:149-150`: `nextVer = Math.max(curVer, Number(c.server_version)||0) + 1`. یک نسخهٔ serverِ بالاتر هرگز بازنویسی نمی‌شود و نسخه هرگز به‌عقب برنمی‌گردد. اثبات via همان 34/34.

### A-21
`attendance.js:108-112`: `class_id` باید کلاسی باشد که دانش‌آموز واقعاً در آن ثبت‌نام است (`policy.studentClassIds`)؛ ذخیرهٔ class_id بیگانه read scope-break درون‌مدرسه‌ای ایجاد می‌کرد. اثبات: M2b/M3b.

### A-22 — بررسیِ مستقلِ commit `e4584806`
این commit را مستقل از گزارشِ قبلی‌ام بررسی کردم. دو تغییر:
1. `isProdShape()` در `index.js` — در هر دو شاخهٔ `.then` و `.catch` از boot استفاده می‌شود و در شکلِ تولید `persistStore(); db.close(); process.exit(1)` را اجرا می‌کند. **این رفتار درست است** و توسط S1 (boot gate fail-fast) در `reaudit-redis-outage.js` اثبات شد.
2. `commandTimeout: 2000` در `redis.js` — قبل از این `5000` نبود (اصلاً وجود نداشت)، یعنی یک پارتیشن نامحدود بود. حالا S6 نشان داد کرَلِ پارتیشن ~10.1 ثانیه است (مجموعِ چندین command متوالی)، نه بی‌نهایت.

**ارجاع به گزارشِ قبلیِ خودم:** من در فاز قبل نوشتم S6 «bounded» است. اکنون عددِ واقعی را ثبت می‌کنم: 10154 ms. این کران از روی N × timeout به‌دست می‌آید، نه یک کرانِ یک-command.

---

## 4. اعدادِ واقعیِ پرفورمنس (§4)

**تنها اعدادی که واقعاً اندازه‌گیری شده‌اند.** dataset واقعی seed: 1040 user، 523 student، 10460 attendance، 12555 grade، 36 class.
**حالت:** memory (JSON-store، بدون `DATABASE_URL`/`REDIS_URL`). این اعداد **مسیرِ JSON-store را توصیف می‌کنند، نه مسیرِ native PostgreSQL را.**

| endpoint | p50 | p95 | max |
|---|---|---|---|
| `GET /api/v1/students?limit=50` | 6.0 ms | 13.7 ms | 14.6 ms |
| `GET /api/v1/students?limit=500` | 5.3 ms | 6.7 ms | 7.0 ms |
| `GET /api/v1/students` (بدون صفحه‌بندی) | 4.5 ms | 5.7 ms | 5.7 ms |
| `GET /api/v1/attendance?limit=100` | 12.5 ms | 16.3 ms | 18.8 ms |
| `GET /api/v1/grades?limit=100` | 5.5 ms | 9.0 ms | 12.7 ms |
| `GET /api/health` | 2.3 ms | 3.5 ms | 4.5 ms |

همزمانی روی `/api/v1/students?limit=50`:

| concurrency | wall | p50 | p95 | موفق |
|---|---|---|---|---|
| 1 | 3.8 ms | 3.7 | 3.7 | 1/1 |
| 10 | 34.9 ms | 22.8 | 34.7 | 10/10 |
| 20 | 63.6 ms | 35.1 | 63.5 | 20/20 |
| 50 | 146.3 ms | 85.3 | 140.2 | 50/50 |

**تحلیل:** صفر شکست در همهٔ سطوح. latency تقریباً خطی با concurrency بالا می‌رود (event loop تک‌نخی) — بدون gridlock. rss کلاینتِ harness: 63→74 MB (delta 10.9 MB).

**مشاهدهٔ غیرمنتظره (واقعی، اما تفسیرم محتاطانه):** `limit=50` *کندتر* است از `limit=500` و از حالتِ بدونِ صفحه‌بندی (p50: 6.0 در برابر 5.3 و 4.5؛ p95: 13.7 در برابر 6.7 و 5.7). در memory mode سربارِ صفحه‌بندی/slice از صرفه‌جوییِ برگرداندنِ رکوردهای کمتر بیشتر است. این ممکن است noise باشد؛ یک بار اندازه‌گیری شد، پس `NOT VERIFIED` به‌عنوان defect.

**نتیجه‌گیریِ §4:** ادعاهای A-01/A-02/A-03/A-06/A-24 دربارهٔ **مسیرِ PostgreSQL** هستند و این اعداد آن مسیر را پوشش نمی‌دهند. PG زنده در این ساندباکس در دسترس نیست. طبق قانونِ «اگر benchmark واقعی نیست، claim را VERIFIED نکن»، همه‌شان در ماتریس `NOT VERIFIED` علامت‌گذاری شده‌اند. A-04 (multi-instance) به‌کلی `NOT-RUN`.

---

## 5. A-05b / A-25 / A-27 و زنجیرهٔ E4 (§5)

**E4 = Production Truth Gate** (`tools/production-truth-gate.js`). این یک گیتِ واقعی و قوی است: PG زنده + Redis اختصاصی، ۳ نمونهٔ سرور، canary weight بین A==B==C==PG، replay-attack detection، tenant isolation، kill -9 + restart، PostgreSQL outage fail-closed، و ۳-cycle migration zero-residue.

**شواهدِ CI (تجربی، نه حدس):**
```
gh run view 36100027719   # main, node.js.yml, آخرین push
  FAIL: TEST/CI parity contract — npm test ≠ whole repository
  skipped  Redis outage ⇒ auth fails CLOSED (BLOCKER 5)
  skipped  OCC across two real instances — 10 concurrent writers (BLOCKER 4)
  skipped  Production Truth Gate — 5 gates, VERIFIED or NOT VERIFIED
  skipped  Phase 8.1 battery A — unified verifier + canary atomicity + R5
```

**نتیجه:** Production Truth Gate روی HEADِ main **هرگز اجرا نشده است** — اولین step ناموفق، تمام step های بعدی را (به‌خاطر نبودِ `if: always()`) skip می‌کند. بنابراین:
- **A-27 (E4): `NOT VERIFIED`.**
- زنجیرهٔ کاملِ `failure → detection → alert → on-call → runbook → recovery` و `failure → failover/restore → recovery → data validation` هرگز روی HEAD اجرا نشده است.
- **RPO/RTO اندازه‌گیری نشده‌اند** → طبق §5: `NOT VERIFIED`.
- A-05b (backup timer) و A-25 (DR/restore): `NOT VERIFIED`.

**اصلاحِ یک حدسِ اولیهٔ من:** ابتدا گفتم گیتِ truth در `strict-verification.yml` به‌خاطر باگِ env-scoping کاملاً مرده است. این نادرست است — همان گیت در `node.js.yml:200-203` **بدونِ شرط** در برابر یک سرویسِ واقعیِ PostgreSQL وصل شده است. مشکلِ اصلی cascading-skip است (A-30)، نه dead condition. با این حال، dead condition در `strict-verification.yml` هم واقعی است (A-31).

---

## 6. False-Green و یکپارچگیِ تست (§6) — A-13

### A-13 — یک لایهٔ کامل تست بیرون از هر گیت
```
tests/api/*.test.js : 30 سوئیت
workflows referencing tests/api : هیچ‌کدام
npm test : node tests/run.js && node tests/smoke.js   (روی tests/api نیست)
```
نمونهٔ اجرا روی HEAD: `tests/api/classes.test.js` → **0/5 passed** (همه 503، چون PG زنده می‌خواهد).

این یعنی ۳۰ سوئیتِ تستِ API نه در `npm test` است، نه در هیچ workflow، و نه در هیچ gate. طبق §6: «هیچ تستی نباید بیرون از گیت‌ها بماند بدون owner + reason + expiry + test جایگزین.» این رعایت نشده است → **A-13 یک Blocker باز است.**

### Sweep الگوهای false-green
گیت فقط ۴ الگو را چک می‌کند: `assert(true`, `process.exit(0)`, `|| true`, `0/0 checks`. در این HEAD:
- `assert(true` — 5 hit (در تست‌ها)
- `process.exit(0)` — 14+ hit (از جمله `build.js:142`, `server/index.js:1792/1826`, `server/seed.js`)
- `|| true` — 16 hit (بیشترش رشته‌های شرطیِ YAML در workflow ها)
- `0/0 checks` — 1 hit (خودِ فایلِ gate)

**ارزیابی صادقانه:** بسیاری از این hit ها مشروع هستند (`process.exit(0)` برای shutdown تمیز، `|| true` در conditionalsِ CI). اما گیت **نمی‌تواند** بین مواردِ مشروع و false-green واقعی تمایز قائل شود، و الگوهای خطرناکِ دیگر (مانند `chk('x', constant)`، skip محیطی، mock-only PASS، تستی که target را اجرا نمی‌کند) اصلاً پوشش داده نمی‌شوند. → A-26 `NOT VERIFIED`.

---

## 7. Strict Gate Bypass Attempts (§7) — یافتهٔ مرکزیِ این گزارش

متدولوژی: ابتدا یک **green baseline** ایزوله ساختم (allowlist معتبر + یک item well-formed)، سپس هر سناریو را **دقیقاً یک متغیر** تغییر دادم. این تنها راه برای تشخیصِ اینکه گیت کدام چک را واقعاً اجرا می‌کند.

### ۶ bypass تأییدشده (همگی سبز شدند — defect)

| # | سناریو | verdict قبل از修补 |
|---|---|---|
| B-1 | registry خالی (`items: []`) | **VERIFIED** |
| B-2 | registry جزیی (۱ از ۲۹) | **VERIFIED** |
| B-3 | evidence کاملاً ساختگی («trust me bro»، p99=4ms دروغین، ارجاع به فایلِ ناموجود) | **VERIFIED** |
| B-4 | evidence یکسان در هر سه reviewer (کپی‌شده) | **VERIFIED** |
| B-5 | allowlist با فقط `{pattern, expires:'never'}` — بدون owner/reason | **VERIFIED** |
| B-6 | گیت هیچ تستی اجرا نمی‌کند — ارجاع به فایلِ ناموجود سبز است | **VERIFIED** |

### چک‌هایی که از قبل درست اجرا می‌شدند (13 سناریو مسدود شدند)
SHA mismatch (G9)، missing reviewer (G10)، empty evidence (G10)، فقط یک AI PASS (G10)، 2-1 split در هر سه جهت (G10)، CERTIFIED بدون ۳ evidence (G11/G12)، id تکراری (G8)، evidence که object است به‌جای array، expiry نامعتبر در allowlist.

### 修补 انجام‌شده (commit `f50591d7`)
به `tools/strict-verification-gate.js` اضافه شد:
- **G6b** — allowlist فقط با `owner` + `reason` + تاریخِ معتبرِ never/future معتبر است.
- **G14a/G14b** — registry باید `expected_ids` را اعلام کند و تک‌تک آن‌ها را داشته باشد.
- **G15a/G15b** — evidence باید به یک artifact قابل بازتولید ارجاع دهد (مسیر/کامند/URL) و اگر به فایلِ `tests/*` یا `tools/*` ارجاع داد، آن فایل باید روی این HEAD وجود داشته باشد.
- **G16** — evidence یکسان بین reviewer ها رد می‌شود.

### بازآزمایی پس از修补
۱۳ از ۱۴ سناریو مسدود شدند. **یک residual باقی ماند (صدازده):**
> **RESIDUAL-1:** ارجاع به یک فایلِ واقعی با عددی ساختگی (مثلاً `tests/occ.js p99=4ms`) همچنان `VERIFIED` می‌گیرد. گیت لاگ نمی‌خواند. این یک محدودیتِ ذاتیِ بررسیِ static است و تنها با **اجرای مستقلِ مجدد** قابل ردِک kín است — دقیقاً وظیفهٔ Arena/Atria.

### تأییدِ اینکه گیت همچنان قابلِ ارضا شدن است
با evidence متمایز و واقعی در هر سه reviewer + allowlist معتبر + قراردادِ اعلام‌شده → `RESULT 29 pass / 0 fail`، `VERDICT VERIFIED`. پس سخت‌سازی به یک گیتِ همیشه-قرمز تبدیل نشده است.

### verdict نهاییِ گیت روی registry صادقانهٔ فعلی
`NOT VERIFIED` (exit 1) — زیرا registry فقط Atria را دارد، نه هر سه AI را. **این پاسخِ درست است.**

---

## 8. New Findings (§11) — A-30+

### A-30 — 🔴 بالا (Critical برای evidence-chain)
**عنوان:** cascading skip در CI — هر گیتِ متأخر از اولین شکست skip می‌شود.
**فایل:** `.github/workflows/node.js.yml` (تمام step ها) و `.github/workflows/strict-verification.yml`
**تولید مجدد:** آخرین run روی main (`36100027719`) در `TEST/CI parity contract` شکست خورد و ~۴۰ step بعدی (شامل Production Truth Gate، Phase 7/8.1، Zero-Trust، OCC multi-instance، Redis outage) همگی `skipped` شدند.
**علت ریشه‌ای:** هیچ stepی `if: always()` ندارد. GitHub Actions پس از اولین شکست، بقیه را skip می‌کند.
**اثر:** CI روی HEAD، **هیچ** runtime evidence برای ادعاهای DR/multi-instance/OCC/Redis تولید نمی‌کند.
**توصیه:** به step های گیتِ حیاتی `if: always()` (یا `if: ${{ !cancelled() }}`) اضافه کنید تا شکستِ یک مرحله، اجرایِ بقیه را مخفی نکند.
**وضعیت:** **باز.** (بخشی از علت آن — شکستِ P6 — توسط commit `f50591d7`修补 شد، چون خودم دو suite را بدون wiring اضافه کرده بودم. اما نقصِ ساختاریِ `if: always()` باقی است.)

### A-31 — 🟠 متوسط
**عنوان:** step گیتِ production در `strict-verification.yml` غیرقابل دسترس است.
**فایل:** `.github/workflows/strict-verification.yml:30`
**کد:** `if: ${{ env.DATABASE_URL != '' }}` در حالی که `DATABASE_URL` در همان step (خط ۳۲) تعریف شده. در GitHub Actions، `if:` فقط job/workflow-level env را می‌بیند، نه step env را. به‌علاوه `gh secret list` **خالی** است — یعنی `DATABASE_URL` اصلاً تنظیم نشده.
**تولید مجدد:** `gh run view` روی هر run → `Production truth gate => skipped`.
**توصیه:** `if: ${{ secrets.DATABASE_URL != '' }}` و تنظیم کردنِ secret.
**وضعیت:** **باز.** (توجه: همان گیت در `node.js.yml:200-203` درست وصل شده، پس E4 کلاً مرده نیست — فقط در این workflow.)

### A-32 — 🔴 بالا (修补 شد)
**عنوان:** Strict Verification Gate با ۶ روش قابل bypass بود.
**فایل:** `tools/strict-verification-gate.js`
**تولید مجدد:** §۷ ( harness در `.zcode/scratch/bypass*.js`).
**علت ریشه‌ای:** گیت فقط شکلِ JSON را بررسی می‌کرد، نه محتوا را — کامل نبودن registry مجاز بود، evidence هر متنی могла باشد، و استقلالِ reviewer ها چک نمی‌شد.
**اثر:** هر کسی می‌توانست با evidence ساختگی `VERIFIED` بگیرد.
**توصیه:** اعمال شد (G6b/G14/G15/G16).
**وضعیت:** **修补 شد در `f50591d7`** — اما خودِ این修补 هنوز توسط سه AI بررسی نشده، پس طبق §12 نباید به‌تنهایی سبز فرض شود.

### A-33 — 🟡 پایین
**عنوان:** در memory mode تمام write های tenant-checked بدون `PAYESH_ALLOW_DEV_MEMORY_AUTHORITY=1` عدد 503 می‌دهند.
**فایل:** `server/infrastructure/phase6-production-hardening.js` (`assertTenantBoundary`)
**توضیح:** fail-closedِ عمدی و طراحی شده. اما برای محصولِ offline-first، تجربهٔ پیش‌فرض این است که بدون پرچم، نوشتن ممکن نیست. باید در راهنمای استقرار صریح ذکر شود.
**وضعیت:** **ACCEPTED RISK** (با مستندسازیِ توصیه‌شده).

### A-34 — 🟡 پایین
**عنوان:** پارتیشنِ Redis کرانِ یک-command نیست.
**فایل:** `server/redis.js:97`
**تولید مجدد:** `reaudit-redis-outage.js` S6 → **10154 ms**.
**توضیح:** `commandTimeout: 2000` هر command را کران می‌دهد، ولی مسیرِ auth چندین Redis op متوالی دارد → مجموع = N × timeout. مقدارِ کرانِ بالای واقعی باید در SLA ذکر شود.
**وضعیت:** **ACCEPTED RISK** (با عددِ ثبت‌شده).

---

## 9. Security / Data Integrity
- **A-19 student_id ownership:** اثباتِ runtime 17/17. هیچ Resource ID به‌تنهایی مجوز نیست.
- **A-18 version determinism:** اثبات. نسخه هرگز به‌عقب برنمی‌گردد.
- **A-20 OCC strict:** اثبات در ۵ مسیر.
- **A-21 class binding:** اثبات.
- **A-22 Redis fail-closed:** اثبات (boot gate + bounded partition).
- ** revisioکنش/session:** در فاز قبل بررسی شد؛ در این HEAD تغییری ندیده است (diff نبود).

---

## 10. Test Integrity / CI / Supply Chain
- **A-13:** 30 سوئیتِ `tests/api` بیرون از همهٔ گیت‌ها و قرمز → **Blocker باز**.
- **A-30:** cascading skip → **Blocker باز**.
- **A-31:** dead step در strict workflow.
- **A-32:** خودِ گیت قابل bypass بود →修补 شد.
- **npm test روی HEAD:** 34/35 — یک شکستِ pre-existing (bit-identity `index.html`) که قبل از کارِ من هم وجود داشت.
- **Parity contract:** پس از修补ِ من 26/26 (قبلاً 25/1 به‌خاطر دو suiteِ متصل‌نشده‌ی خودم).
- **CodeQL / Fortify (A-10/A-11):** workflow ها موجودند (`codeql.yml`, `fortify.yml`)، اما اجرای آن‌ها روی HEAD را تأیید نکردم → `NOT VERIFIED`.

---

## 11. PostgreSQL / Concurrency
- PG زنده در این ساندباکس در دسترس نیست (`pg` نصب نیست؛ `multi-instance.js` خودش اعلام می‌کند). تمام ادعاهای وابسته به PG (A-01, A-02, A-04, A-25) `NOT VERIFIED` / `NOT-RUN` هستند.
- اعدادِ §4 فقط مسیرِ memory را توصیف می‌کنند.
- OCC در memory mode به‌طور کامل اثبات شد (34/34).

---

## 12. Redis / DR / Recovery
- **A-22:** 17/17 با fake RESP server واقعی (boot gate، distributed session، cross-instance، expiry، restart، partition bounded).
- **A-27/E4:** هرگز اجرا نشد → `NOT VERIFIED`. RPO/RTO اندازه‌گیری نشد.
- **A-25 (DR/restore):** `NOT VERIFIED`.

---

## 13. Multi-AI Agreement Matrix (§8)

| Item | ChatGPT | Arena | Atria | نتیجه |
|---|---|---|---|---|
| A-18 | بررسی نشده | بررسی نشده | PASS (runtime) | **NOT CERTIFIED** (نه ۳ review) |
| A-19 | بررسی نشده | بررسی نشده | PASS (runtime) | **NOT CERTIFIED** |
| A-20 | بررسی نشده | بررسی نشده | PASS (runtime) | **NOT CERTIFIED** |
| A-21 | بررسی نشده | بررسی نشده | PASS (runtime) | **NOT CERTIFIED** |
| A-22 | بررسی نشده | بررسی نشده | PASS (runtime) | **NOT CERTIFIED** |
| همهٔ بقیه | — | — | NOT VERIFIED | **NOT CERTIFIED** |

هیچ evidence مشترک یا کپی‌شده‌ای بین reviewer ها وجود ندارد (چون اصلاً reviewer دیگری نیست). طبق §8: «یک گروه بررسی نکرده ⇒ `NOT CERTIFIED`». تمام موارد به‌ همین دلیل مسدود هستند.

---

## 14. Remaining Blockers (به ترتیبِ اولویت)

1. **[Critical] A-13** — لایهٔ `tests/api` (30 سوئیت) بیرون از هر گیت و قرمز. نیاز: یا wiring به CI (با PG service) یا owner+reason+expiry+replacement صریح برای هر سوئیت.
2. **[Critical] A-27 / E4** — Production Truth Gate هرگز روی main اجرا نشده. نیاز: `if: always()` (A-30) + تنظیم `DATABASE_URL` secret.
3. **[High] A-30** — cascading skip. نیاز: `if: always()` روی step های حیاتی.
4. **[High] عدم توافق سه-AI** — هیچ موردی هر سه reviewer را ندارد.
5. **[Medium] A-31** — dead step در strict workflow.
6. **[Medium] A-24/A-28** — ادعاهای scale/perf بدون اندازه‌گیری.

---

## 15. Exact Next Actions

1. در `.github/workflows/node.js.yml` به تمام step های گیت `if: always()` اضافه کن — تا شکستِ یک مرحله، بقیه را مخفی نکند (A-30).
2. `DATABASE_URL` را به‌عنوان repo secret تنظیم کن و `strict-verification.yml:30` را به `if: ${{ secrets.DATABASE_URL != '' }}` تغییر بده (A-31).
3. `tests/api/*.test.js` (30 سوئیت) را به یک step با PG service وصل کن، یا برای هر کدام owner/reason/expiry/replacement ثبت کن (A-13).
4. بعد از اجرای واقعیِ Production Truth Gate روی HEAD جدید، RPO/RTO را اندازه بگیر و A-05b/A-25/A-27 را دوباره ارزیابی کن.
5. review های مستقلِ ChatGPT و Arena را روی A-18..A-22 و روی修补ِ A-32 انجام بده (الان فقط Atria بررسی کرده).
6. روی HEADِ جدید، gateway و registry را دوباره اجرا کن — فعلاً `NOT VERIFIED` درست است.

---

## 16. قانون نهایی (§14)

> هرگونه Critical/High unresolved، یا evidence chain ناقص، یا A-13 unresolved، یا Gate bypassable، یا A-27 E4 فقط planning، یا عدم توافق چند-AI ⇒ `NOT CERTIFIED`.

در این HEAD: **A-13 باز است**، **A-27/E4 اجرا نشده**، **A-30 باز است**، **هیچ موردی ۳-AI agreement ندارد**.

# **VERDICT: NOT CERTIFIED**

---

###Appendix — شواهدِ اجراییِ این گزارش
| شواهد | نتیجه | کجا |
|---|---|---|
| `node tools/strict-verification-gate.js` | exit 1، NOT VERIFIED | §۷ |
| harness bypass v1 (آلوده) | ۱۷ مسدود (مخفی) | `.zcode/scratch/bypass.js` |
| harness bypass v2 (ایزوله) | **۶ bypass سبز** | `.zcode/scratch/bypass2.js` |
| harness bypass v3 (پس از修补) | ۱۳ مسدود، ۱ residual | `.zcode/scratch/bypass3.js` |
| satisfiability check | 29/0 → VERIFIED | §۷ |
| `tests/reaudit-a19-student-id-ownership.js` | **17/17** | §۳ |
| `tests/reaudit-occ-stale-write.js` | 34/34 | §۳ |
| `tests/reaudit-redis-outage.js` | 17/17 (S6=10154ms) | §۳ |
| micro-benchmark memory-mode | §۴ | `.zcode/scratch/bench.js` |
| `tests/ci-test-parity-contract.js` | 26/26 | §۶ |
| `tests/api/classes.test.js` | 0/5 (503) | §۶ |
| `gh run view` روی main | truth gate = skipped | §۵ |
| `gh secret list` | خالی | §۵ |

**commit این گزارش +修补‌ها:** `f50591d7` (修补‌ها) + این فایل.
