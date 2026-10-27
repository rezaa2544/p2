# M15-01 — EXECUTION MISSION 2 · شواهد، تطبیق گیت و بستن (2026-10-27، نشست دوم)

**شاخه:** `arena/0008c4f4-p2` · **PR:** #484 · **پایه:** `origin/main` = `fff1beae09ff45d69e554f8c000a9d15b75d968c`
**HEAD در زمان نگارش:** `2f93d7ae` + دو commit مستندات/CI پس از آن (SHA نهایی در بخش ۱ همین سند)
**tree:** با `git rev-parse HEAD^{tree}` در همان commit اندازه‌گیری می‌شود (جدول §۱)
**محیط:** Node `v22.22.3` · npm registry در دسترس · `api.github.com` در دسترس ·
`*.blob.core.windows.net` و `results-receiver.actions.githubusercontent.com` **مسدود**
(`gh run view --log-failed` → `EOF`) · بدون PostgreSQL/Redis/Docker/Chromium در sandbox

---

## ۰. تصمیم این نشست

`M15-01 OPEN — ACTIONABLE DEFECTS REMAIN`

سه نقصِ واقعی پیدا و رفع شد (یکی‌شان **همهٔ CI را زمین‌گیر کرده بود**)، دو ابزار
سنجش با هم هم‌خوان شدند، علتِ قطعیِ نقصِ دسترس‌پذیری پیدا و درمان شد، و یک تشخیصِ
**نادرستِ خودم** با اجرای واقعی رد شد (بند ۷-۳). اما
M15-01 بسته **نمی‌شود**، چون معیارهای بستن مستقل از کدِ این شاخه‌اند: تا زمانی که
شاهدِ پس‌از‌فرود روی `main` جمع نشود و رجیستری با کامیتِ فقط-رجیستری والدِ آن
گره نخورد، گیت سبز نمی‌شود — و این کار به فرودِ کد در `main` نیاز دارد.

---

## ۱. تثبیتِ حقیقت (Phase A)

| مورد | مقدار اندازه‌گیری‌شده |
|---|---|
| `origin/main` | `fff1beae09ff45d69e554f8c000a9d15b75d968c` (بدون تغییر در این نشست) |
| `origin/main` تاریخ | ۵ کامیت مستندات (#497 «owner intervention exceptional») + bump `@opentelemetry/resources` 2.12.0→3.0.0 |
| کامیتِ متادیتای رجیستری روی main | `46e3a448d30849dfa402ef107be1c6e4531a49b7` — **والدها: `bf263bf2` تنها**؛ diff: فقط `docs/verification/VERIFICATION_REGISTRY.json` |
| PR #497 | **MERGED** (`docs/owner-action-minimization-policy@c9edeba76`, 2026-10-27T14:04:22Z). هیچ ادغام/تغییرِ تکراری انجام نشد. |
| Issue #468 (M15-02) | دست‌نخورده. شروع نشد. |
| کاندیدِ گزارش‌شده `78b65ce2…` | در **هیچ ref** وجود ندارد؛ دوباره تأیید شد (`git cat-file` → fatal، `ls-remote` → هیچ) |
| PR #484 | `MERGEABLE / UNSTABLE` — ۱۶ success، ۳ failure (Fortify/APIsec/Jscrambler)، ۱ skipped، ۳۶ بدون‌وضعیت (در حال اجرا) |

**تغییرِ مهم نسبت به گزارش قبل:** رجیستری روی `main` باز‌گره خورده است
(`head_bound = bf263bf2`، بدون `human_governance`، طبق بازنشستگیِ V-10) و شاخهٔ
این نشست با `ff1beae` **هم‌تراز** شد (rebase) تا تغییراتِ ابزارهای گیت/رجیستری در
این PR، آن بازنشستگی را عقب‌نزنند. تفاوتِ رجیستری شاخه با main اکنون **صفر** است.

---

## ۲. بازیابیِ شواهدِ canonical (Phase B)

**لاگ خامِ `40491800409` بازیابی نشد — دوباره و با شواهد تلاش شد:**
`gh run view 40549403314 --log-failed` →
`Get "https://results-receiver.actions.githubusercontent.com/rest/runs/…/logs?…": EOF`.
هیچ artifactی هم برای آن run ثبت نشده است. این محدودیتِ شبکه است، نه انتخاب.

**راه‌حلِ ساختاری (این نشست):** چون شاهدِ غیرقابل‌بازیابی «شاهد» نیست، گام‌های CI
تغییر کردند تا هر اجرای آینده خودش شاهد تولید کند:

- `.github/workflows/node.js.yml` پس از runnerِ کانونیک (با `if: always()`)
  `/tmp/all-tests.log`، همهٔ `/tmp/at-*.log` و `out/a11y-runtime.json` را در
  `out/canonical/` جمع می‌کند، **`SHA256SUMS`** (sha256 هر فایل + `head_sha` +
  `run_id` + `collected_at`) می‌سازد و به‌عنوان artifact آپلود می‌کند.
  artifact از `api.github.com` قابلِ دریافت است — یعنی حتی با مسدود بودنِ blob،
  شاهد به دست بازبین می‌رسد.

**اجرای کانونیک روی گردنِ این شاخه در sandbox** (پیش از این تغییرات، روی `ab47bb03`):
`561 green / 64 red، 5831s، exit 1` — و **هر ۶۴ قرمزی** به پیش‌نیازِ غایب نسبت داده شد
(40 PostgreSQL، 4 Redis، 3 Chromium، 15 chaos/docker، 1 تصادمِ lane، ۱ false-red که
همان نشست رفع شد). اجرای کانونیکِ **معتبر** برای بستن، باید در CI (که PG/Redis/مرورگر
دارد) روی SHA نهایی انجام شود — گام‌های بالا آن را قابل‌بازیابی می‌کنند.

---

## ۳. تطبیقِ Gate و Provenance (Phase C) — **نقصِ واقعی، اثبات‌شده، رفع‌شده**

### ۳-۱. تناقضِ گزارش‌شده بازتولید شد و منشأش پیدا شد

روی `main@46e3a448` (کامیتِ متادیتای **معتبر**):

| ابزار | خروجی |
|---|---|
| `tools/strict-verification-gate.js` | `698 OK`، `EVIDENCE_SHA bf263bf2 (metadata-only)`، `CONTRACT PASS`، `VERIFIED_ITEMS 3/32`، `VERDICT NOT VERIFIED`، exit 1 |
| `tools/registry-provenance.js --audit` (پیش از رفع) | `UNBOUND 32`، `MISMATCH bf263bf2 vs 46e3a448`، exit 2 |

`698 PASS` و `0 FAIL` **هم‌زمان** با `NOT VERIFIED`: این تناقض نیست. گیت ۶۹۸ سنجهٔ
ساختاری را پاس می‌کند و سپس **V-16** حکم می‌دهد: هیچ آیتمی در باندِ تأییدکننده نیست
(۳ آیتم `RUNTIME_VERIFIED` هستند ولی سقفِ رجیستری `UNKNOWN` است و V-15 سرصفحه را
به ضعیف‌ترین آیتم می‌بندد). پس `exit 1` **رفتارِ درست** است، نه نقص.

اما `provenance` واقعاً **نقص داشت** — دو باگ در `tools/registry-provenance.js`:

```
P1  عبارتِ ancestor بدونِ پیشوندِ git اجرا می‌شد:
    sh('merge-base --is-ancestor ' + bound + ' ' + head)   // همیشه throw → null
P2  نتیجه با  !!(r === '' ? false : true)  نگاشت می‌شد
    ⇒ throw (null)  به‌عنوان «جد است» تفسیر می‌شد
```

**اثرِ اندازه‌گیری‌شدهٔ P2:** برای SHA‌ی که **وجود ندارد** و برای کامیتی روی
**شاخهٔ بی‌ربط**، هر دو بار چاپ می‌شد
`ancestor-of-HEAD: YES (evidence is STALE, not lost)` — یک خطِ اطمینان‌بخشِ جعلی.
این دقیقاً کلاسِ false-green است.

### ۳-۲. رفع (بدونِ تضعیفِ هیچ قاعده‌ای)

- audit اکنون **همان تشخیصِ metadata-only گیت** را آینه می‌کند: تک‌والد + دقیقاً یک
  مسیرِ تغییر‌یافته = رجیستری ⇒ شاهد به **والد** بسته می‌شود.
- تبار با `spawnSync` و `status` اندازه‌گیری می‌شود، نه با تهی‌بودنِ رشته.
- طبقه‌بندی: `MATCH` / `MISMATCH — STALE` / `MISMATCH — DIVERGED` / `MISMATCH — INVALID`.
- خطوطِ `EVIDENCE_SHA` و `AGREES-WITH-GATE` چاپ می‌شوند تا تطبیقِ دو ابزار **ماشینی** باشد.
- واژهٔ `MISMATCH` که `tests/false-green-defense.test.js` (C6) پین کرده حفظ شد — آن سنجه تضعیف نشد.

**نتیجهٔ پس از رفع، روی همان commit:**

```
evidence commit : bf263bf2  (metadata-only registry commit; evidence binds parent …)
V-02 HEAD-BIND  : MATCH (head_bound equals the evidence commit)
EVIDENCE_SHA    : bf263bf2 (metadata-only registry commit)
AGREES-WITH-GATE: YES (same evidence SHA)
```

### ۳-۳. تستِ مثبت/منفی با git واقعی

`tests/registry-provenance-protocol.test.js` — ۱۶ سنجه، پنج سناریو، **repo موقتِ واقعی**
(بدون mock): کامیتِ متادیتای معتبر (والد بسته می‌شود و توافق اعلام می‌شود) · SHAی جعلی
(`INVALID`) · والدِ واقعی (`STALE`) · شاخهٔ بی‌ربط (`DIVERGED`) · کامیتِ کد که رجیستری
هم دست می‌زند (نباید ادعای بسته‌شدن کند).
**Mutation-verified:** با بازگرداندنِ عبارتِ قدیمی، سناریوهای B و D قرمز می‌شوند (۱۴/۱۶).

### ۳-۴. مسیرِ قانونیِ کامیتِ متادیتا (پاسخِ قطعی)

گیت شاهد را با **HEAD** مقایسه می‌کند مگر آن‌که HEAD یک کامیتِ فقط-رجیستری باشد:

| زمینه | شرطِ V-06 | V-02/G9 | نتیجه |
|---|---|---|---|
| push روی شاخه | HEAD باید جدِ `origin/main` باشد — **هر شاخه‌ای نقض می‌کند** | شاهد ≠ HEAD | قرمز (ساختاری) |
| pull_request | `origin/main` باید جدِ HEAD باشد ✓ | شاهد ≠ HEAD | قرمز (ساختاری) |
| HEAD = کامیتِ فقط-رجیستری | ✓ | شاهد = والد = `head_bound` ✓ | **تنها حالتِ سبز** |

پس توالیِ صحیح: (۱) کد در `main` فرود آید؛ (۲) روی همان `main` مجموعهٔ کانونیک اجرا و
شواهد **کامیت** شود؛ (۳) یک کامیتِ **تک‌والدِ فقط-رجیستری** با `head_bound = main`؛
(۴) پیش‌پروازِ بند ۸ (`rev-list --parents` = دو توکن، diff = فقط رجیستری)؛
(۵) فرود با squash/rebase. **OD-3 همین است.**

---

## ۴. نقصِ دسترس‌پذیری (Phase D) — **ریشه‌یابی و رفع شد**

### ۴-۱. آزمونِ قطعی، بدونِ مرورگر

اسکنِ css: هر قاعده‌ای که **هم `color` و هم `background`** می‌دهد، با حلِ `var(--token)`
برای هر سه تم سنجیده شد. **۱۴ نقض** پیدا شد — و حضورشان به مسیر/وضعیت گره خورده است:

| انتخابگر | نسبت (پیش از رفع) | چه زمانی رندر می‌شود |
|---|---:|---|
| `.avatar` | **4.4988** (`#fff` روی `#2f6bff`) | همیشه؛ ۰٫۰۰۱۲ زیرِ آستانه ⇒ در گزارشِ گردشده «4.50» دیده می‌شد و «فلیک» به نظر می‌رسید |
| `.back-btn` | 4.28 (root) / 4.17 (theme-3) | فقط مسیرهای غیرِ خانه |
| `.sync-chip.off` | 4.23 | فقط در وضعیتِ off |
| `.sync-chip.busy` | 4.28 (root) / 4.17 (theme-3) | فقط در وضعیتِ busy |

`npm test` و اجرای موازی در همان زمان → وضعیتِ sync و مسیرِ فعال بین اجراها تفاوت
می‌کند ⇒ گاهی آن نودها در DOM هستند و گاهی نه. **این علتِ «متناوب» بود: نقصِ واقعی با
نمایشِ وابسته به وضعیت، نه تستِ غیرقطعی.**

### ۴-۲. رفع و گارد

| انتخابگر | تغییر | نسبت پس از رفع |
|---|---|---:|
| `.avatar` | `background 2f6bff → 2563eb` | 5.17 |
| `.back-btn` | `color var(--primary) → var(--primary-dark)` | 6.16–6.27 |
| `.sync-chip.off` | `color 64748b → 556074` | 5.64 |
| `.sync-chip.busy` | `color var(--primary) → var(--primary-dark)` | 6.16–6.27 |

`tests/a11y-regressions.js` به‌جای چهار جفتِ hardcode، یک **گاردِ عمومی** گرفت: هر
قاعده‌ای که هم `color` و هم `background` دارد باید در هر سه تم ≥ 4.5 بدهد (با حلِ
`var()`). بازبینیِ پس از رفع: **۰ نقض**؛ مجموعه **۸۳/۸۳**.
**Mutation-verified سه‌باره:** بازگرداندنِ هر یک از سه انتخابگر ⇒ exit 1.

### ۴-۳. شاهدِ زمان‌اجرا

CI (که Chromium دارد) در run `40533240014` نخستین اجرای واقعی axe را انجام داد:
هر سه تم اسکن شدند و `theme-3 counselor` تمیز بود، اما گام `exit 1` داد ⇒ نشانهٔ
نقصی در جای دیگر. چون برشِ annotation فقط ۴۰۰ کاراکترِ اولِ ۱۲ خطِ آخر را نگه
می‌دارد، `tests/a11y-runtime.js` اکنون خطِ `A11Y-EVIDENCE {...}` را **اولِ** همان
پنجره می‌گذارد (شبیه‌سازیِ همان pipeline در تست تأیید شد) و artifact هم آپلود می‌شود.
**اجرای تأییدیِ پس از رفع، در SHA نهاییِ این نشست در CI انجام می‌شود.**

---

## ۵. یافتهٔ بحرانی: `main` نصب‌شدنی نبود (و همهٔ بررسی‌ها را می‌کشت)

```
npm error While resolving: @opentelemetry/resources@3.0.0
npm error Found: @opentelemetry/api@1.9.1
npm error peer @opentelemetry/api@">=1.10.0 <1.11.0" from @opentelemetry/resources@3.0.0
```

بالا بردنِ `api` هم کار نمی‌کند، چون **دامنهٔ peer متقابلاً ناسازگار است**:

| بسته | peer روی api |
|---|---|
| `@opentelemetry/resources@3.0.0` | `>=1.10.0 <1.11.0` |
| `@opentelemetry/sdk-trace-node@2.12.0` (**جدیدترین**؛ 3.x وجود ندارد) | `>=1.0.0 <1.10.0` |
| `@opentelemetry/context-async-hooks@2.12.0` | `>=1.0.0 <1.10.0` |

⇒ هیچ درختِ قابلِ نصبی با `resources@3.0.0` وجود ندارد. رفع: نگه‌داشتنِ
`resources` روی `^2.12.0` (همان مجموعهٔ پیش از bump).

**اثرِ اندازه‌گیری‌شده روی CI (SHA `2f93d7ae`):**

| workflow | پیش از رفع | پس از رفع |
|---|---|---|
| Runtime Reliability | failure (`npm ci`) | **success** |
| observability-regression | failure (`Install locked dependencies`) | **success** |
| Security Program (SAST·SCA·SBOM) | failure | **success** |
| Microsoft Defender for DevOps | — | **success** |
| M15-01 E3 Runtime Evidence | — | **success** |
| Codacy | — | **success** |
| Node.js CI | step5 `npm ci` failure ⇒ ۱۷ step، ۱۶ cascade | در حال اجرا |

این تنها تغییری بود که «هیچ بررسی‌ای روی هیچ شاخه‌ای» را به «بررسی‌ها اجرا می‌شوند» برد.

---

## ۶. E4 و اسکنرها (Phase E)

### ۶-۱. E4 — هفت دریل، همه BLOCKED (زیرساخت)

`node tools/m15-01-e4-verify.js` → `exit 2`، `counts {total:7, pass:0, fail:0, blocked:7}`،
`BLOCKED WITH PROOF`.

| # | دریل | ورودی | پیش‌شرط | خروجیِ لازم | وضعیت |
|---|---|---|---|---|---|
| E4-01 | PG primary + streaming standby روی **میزبان‌های جدا** | دو URL مستقل | دو host | `pg_stat_replication` + lag | BLOCKED |
| E4-02 | `pgBackRest` **off-site/منطقهٔ دوم** + سنِ بکاپ | stanza off-site | مقصدِ خارج | stanza + backup age | BLOCKED |
| E4-03 | PITR روی میزبانِ جدا + checksum کاتالوگ ۲۶ مایگریشن | بکاپ + target time | پیکربندیِ PITR جدا | restore + checksum | BLOCKED |
| E4-04 | `PgBouncer` transaction + RTOِ reroute | pooler روی host دوم | دو host | reroute + RTO | BLOCKED |
| E4-05 | Sentinel با ≥۳ نودِ **میزبانِ متفاوت** | ۳ نود | ۳ host | quorum + persistence | BLOCKED |
| E4-06 | دامنهٔ خرابیِ مستقلِ observability | Prometheus/Alertmanager جدا | پلنِ جدا | probe دامنه | BLOCKED |
| E4-07 | on-call زنده → ack انسانی → runbook → recovery | ابزارِ alerting + انسانِ on-call | فرایندِ عملیاتی | MTTA/MTTR | BLOCKED |

E3 تک‌میزبانه (که در `2f93d7ae` سبز شد) **هیچ‌یک** از این هفت را برآورده نمی‌کند و E4 حساب نشد.

### ۶-۲. اسکنرها — علتِ قطعی از روی شاهدِ ماشینی

| اسکنر | گامِ شکست | علت | دسته |
|---|---|---|---|
| Fortify-AST-Scan | `Fail closed when Fortify credentials are unavailable` | `FOD_*` secret غایب (گام `if: env.FOD_CREDENTIALS_PRESENT == 'false'`) | credential |
| APIsec | `Fail closed when APIsec credentials are missing` | `apisec_username`/`apisec_password` غایب | credential |
| Jscrambler | `Fail closed when Jscrambler credentials or configuration are missing` | secret/config غایب | credential |

هیچ‌کدام به کد یا منطقِ اسکن مربوط نیست: هر سه **پیش از اجرای هر اسکن** fail-closed
می‌کنند (`NOT SCANNED`). در این محیط: `gh secret list` → **403**، و
`env | grep -iE 'FORTIFY|APISEC|JSCRAMBLER'` → **۰** ⇒ اعتبارنامهٔ مجازِ موجود وجود ندارد.
مسیرهای جایگزینِ تیم بررسی شد (اجرای محلی/CLI، توکنِ موجود، fork-context) و هیچ‌یک
قابلِ اجرا نبود ⇒ این یک اقدامِ **انحصاریِ مالک** است (ثبتِ secret سازمانی).

---

## ۷. سایر موانع (Phase F)

### ۷-۱. SI-013 — تعیین‌تکلیفِ مستند، با اسکنِ واقعیِ تاریخ

| لایه | ابزار | نتیجه |
|---|---|---|
| درختِ فعال | `node tests/secret-scan.js` | **13/13 سبز** |
| درختِ فعال (M15) | `node tests/si013-secret-scan.js` | **18/18 PASSED** |
| **تاریخِ گیت** (پیش‌تر هیچ گیتی این را نمی‌سنجید) | اسکنِ ۳۴۳۲ کامیت | — |

اسکنِ تاریخ (مقادیر هرگز چاپ نشد):

- **کلاسِ بحرانی** (GitHub PAT `ghp_`، `github_pat_`، AWS `AKIA`، PEM private key):
  ۱۸۷ کامیت تطبیق داشتند، **همه در `tests/experience-store.test.js`** و مقدار
  بررسی شد: بدنه = **۳۶ بار تکرارِ یک کاراکتر** ⇒ فیکسچرِ ساختگی است، نه اعتبارنامه.
  نسخهٔ امروز حتی آن را با الحاق می‌سازد (`'ghp_' + 'A'.repeat(36)`) تا در سورس ظاهر نشود.
- **کوکیِ نشست** (`payesh_session=eyJ…`): در `tests/performance/results/w18-*.json`
  تاریخی وجود دارد (خروجیِ load-test). نسخهٔ فعلی تمیز است؛ تنها تطبیقِ امروز یک
  JWTِ **عمداً جعلی** در تستِ منفی است (`Forged JWT token rejected with 401`).

**حکم:** در محدودهٔ این مخزن هیچ اعتبارنامهٔ واقعی در تاریخ پیدا نشود ⇒ «تاریخِ عمومی
بازنویسی‌نشده» دیگر ریسکِ اعتبارنامه‌ای **قابل‌اثبات** نیست. آنچه باقی می‌ماند و از
مخزن قابلِ داوری نیست: تأییدِ چرخشِ کلیدِ امضاکنندهٔ نشست در محیطِ مستقر (مالک).
**اقدامِ تیم: هیچ.** اقدامِ مالک: فقط اگر چرخش انجام نشده، یک تأیید/چرخش.

### ۷-۲. OD-1..4 — وضعیتِ مستند

| OD | موضوع | وضعیتِ واقعی | چه چیزی آن را می‌بندد |
|---|---|---|---|
| OD-1 | تأییدِ انسانیِ رجیستری (V-10) | **بسته شد** — طبق تصمیمِ مالک V-10 بازنشسته است؛ گیت هیچ چکِ human_governance ندارد (تأیید‌شده در `tools/strict-verification-gate.js`) | — |
| OD-2 | trigger روی `arena/**` در برابر V-06 | **مشخص شد و مستند**: V-06 branch-aware است؛ در push روی شاخه ساختاراً قرمز است و در PR سبز. تغییرِ trigger یا V-06 لازم نیست؛ کافی است بدانیم STRICT روی شاخه هرگز سبز نمی‌شود و این طبیعی است | تصمیمِ مالک فقط اگر بخواهد STRICT را required check برای شاخه‌ها کند |
| OD-3 | نحوهٔ فرودِ کامیتِ رجیستری | **مسیرِ قانونی اثبات شد** (§۳-۴): تنها حالتِ سبز = HEAD خودِ کامیتِ تک‌والدِ فقط-رجیستری؛ فرود با squash/rebase | اجرای فرود پس از merge کد |
| OD-4 | تعدادِ `expected_ids` (۲۹/۳۲/۳۹) | رجیستری ۳۲ اعلام می‌کند و G14/G14b/G14c روی همین می‌گذرد؛ عدد را چت انتخاب نمی‌کند | تصمیمِ مالک اگر بخواهد ۲۹ یا ۳۹ |

### ۷-۳. Production Truth Gate — چرا skip می‌شود (پاسخِ قطعی) و یک تشخیصِ رد‌شده

**پاسخ:** چون `secrets.DATABASE_URL` در این مخزن **خالی** است، و گام به‌درستی برای
نبودنِ آن skip می‌شود.

**ردِ تشخیصِ قبلی (شفاف):** در نشست قبل حدس زدم که `if` گام نمی‌تواند `env` خودِ همان
گام را ببیند و در نتیجه گام **همیشه** skip می‌شود. برای آزمونِ آن، یک workflow موقت
(`zz-env-visibility-probe.yml`، کامیت `f00617ec`) با دو گامِ هم‌شکل نوشتم: کنترل با
`env` سطحِ job و آزمایش با `env` سطحِ گام، هر دو با `if` روی همان متغیر. اجرای
**`40572991240`** کامل شد و هر دو گام `success` گرفتند (گامِ skip در API مقدار
`skipped` می‌گیرد — همان اجرای STRICT `40570647326` برای همین گام `skipped` است).

⇒ **آزمایش اجرا شد ⇒ `env` سطحِ گام برای `if` همان گام قابلِ دیدن است ⇒ فرضیهٔ قبلی رد
است.** نتیجهٔ درست این است: شرطِ گام واقعاً مقدارِ واقعیِ secret را می‌سنجد و false
شده، یعنی خودِ secret خالی است. فایل موقت حذف شد.

**چرا «skip» رفتارِ درست است:** `tools/production-truth-gate.js:154` بدون
`DATABASE_URL` با `exit 1` و پیام `NOT VERIFIED — DATABASE_URL required (dependency
missing = FAIL)` **fail-closed** می‌شود. پس گاردِ `env.DATABASE_URL != ''` در workflow
دقیقاً برای جلوگیری از قرمز‌کردنِ job به‌خاطرِ نبودِ زیرساخت است، نه برای پنهان‌کردن.
همچنین این job **هیچ سرویسِ PostgreSQL ندارد**؛ اجرای واقعیِ گیت در `node.js.yml` است
که Postgres دارد، `export DATABASE_URL="$PGURL"` می‌کند و به `pg-chain-ready` گره خورده.

**نقصِ واقعیِ باقی‌مانده فقط «خاموشی» بود، نه شرط:** گامِ skip‌شده در یک jobِ سبز
دیده نمی‌شود. رفع (بدونِ تغییرِ هیچ حکمی): گامِ
`Report production truth gate availability` با `always()` که وجود/نبودِ secret را صریح
اعلام می‌کند و در حالتِ نبود، **`::warning title=Production truth gate NOT RUN`** می‌دهد.
شرط و `env` گامِ اصلی **دست‌نخورده** ماند؛ YAML معتبر، ۱۰ گام، و هیچ گامِ دیگری
`DATABASE_URL` را در env ندارد (تأییدِ ماشینی).

> **پاسخ به «skip در `node.js.yml`»:** آن‌جا علت متفاوت است — گام با
> `if: always() && steps.pg-chain-ready.conclusion == 'success'` به زنجیرهٔ مایگریشن
> گره خورده (CI-CASCADE). اگر زنجیره بشکند گام skip می‌شود ولی همان شکست job را قرمز
> نگه می‌دارد ⇒ false-green نیست.

> **پیامد برای بستن:** برخلافِ تصورِ قبلی، production truth gate **هیچ آیتمی از رجیستری
> ۳۲گانهٔ M15-01 نیست** (بررسی‌شده: هیچ آیتمی به آن ارجاع نمی‌دهد)، پس اجرا‌نشدنش در
> CI معیارِ M15-01 را نقض نمی‌کند؛ اما به‌عنوان شاهدِ محیطِ تولید باید در گزارش
> «NOT RUN» ثبت شود، نه PASS. اجرای آن نیازمندِ `DATABASE_URL`ِ واقعی است (اقدامِ مالک).

### ۷-۴. PR #484 — هر failure/skip با علت

| check | علت | قابلِ رفع در تیم؟ |
|---|---|---|
| Fortify / APIsec / Jscrambler | credential غایب (fail-closed) | نه — مالک |
| Payesh Watch (Notion sync) | secretهای Notion/GitHub | نه — مالک |
| **STRICT — 3-AI Evidence Gate** | شاهد به `bf263bf2` بسته است و HEAD شاخه ≠ آن ⇒ V-02/G9 قرمز **به‌طورِ ساختاری** | نه در PR — فقط پس از فرود با کامیتِ فقط-رجیستری |
| Node.js CI | پیش از این: `npm ci` (رفع شد). اکنون در حال اجرا | بله |
| SCS / CodeRabbit | گیت‌های اختیاری | — |

---

## ۸. همگام‌سازی و بازبینی (Phase G)

- **Notion:** کانکتور در این گفتگو **متصل نیست** (`disconnected`). هیچ sync انجام نشد و
  هیچ ادعایی هم ثبت نمی‌شود. (workflowِ «Notion ↔ GitHub status sync» در CI اجرا
  می‌شود و success است، ولی آن، شاهدِ محتوای Notion نیست و این‌جا به‌عنوان sync حساب نشد.)
- **بازبینی مستقل:** برای بازبینیِ SHA نهایی آماده است (بستهٔ شاهد = همین سند +
  `docs/verification/evidence/` + artifactِ `canonical-evidence-<sha>`). **انجام نشده**؛
  کانالِ جدید ساخته نشد و ادعای بازبینی ثبت نمی‌شود. مجری نمی‌تواند تنها تأییدکنندهٔ کار خودش باشد.
- **مستندات:** `docs/CURRENT_WORK_EXECUTION_PLAN.md` تنها پس از شاهدِ تازه به‌روز می‌شود؛
  لاگ‌های چرخهٔ قبلی بازنویسی نمی‌شوند (فقط «منسوخ» برچسب می‌خورند).

---

## ۹. تغییراتِ این نشست

| SHA | دامنه |
|---|---|
| `f5f632d5` | `tools/registry-provenance.js` بازنویسیِ binding + `tests/registry-provenance-protocol.test.js` (۱۶ سنجه، git واقعی) |
| `be20b49c` | رفعِ ۴ نقصِ کنتراست + گاردِ عمومی در `tests/a11y-regressions.js` + rebuildِ `index.html`/`USER_GUIDE.html` |
| `679301de` | `A11Y-EVIDENCE` در پنجرهٔ annotation + گام‌های جمع‌آوری/آپلودِ شاهد در `node.js.yml` (با `SHA256SUMS`) |
| `2f93d7ae` | `@opentelemetry/resources` → `^2.12.0` (نصب‌شدنی‌کردنِ مخزن؛ ۶ workflow را از failure به success برد) |
| `f00617ec` | probeِ موقت (حذف شد در commit بعد) |
| نهایی | حذفِ probe + اعلامِ صریحِ نبودِ Production Truth Gate (بدونِ تغییرِ شرط) + همین سند |

هیچ تستی حذف/skip نشد، هیچ آستانه‌ای پایین نیامد، هیچ رجیستری/allowlist دست نخورد،
`V-02/V-15/V-16/V-17/V-18` و `N-11` و SHA-binding دست‌نخورده‌اند، و V-10 بازنشسته ماند.

---

## ۱۰. ماتریسِ موانعِ باقی‌مانده

| مورد | وضعیت | مالکِ فنی | اقدامِ بعدی |
|---|---|---|---|
| شاهدِ پس‌از‌فرود روی `main` | BLOCKED | تیم | پس از merge کد: اجرای کانونیک روی `main`، کامیتِ شواهد، سپس کامیتِ فقط-رجیستری |
| V-16: هیچ آیتمِ تأییدکننده | BLOCKED | تیم + مالک | بستن آیتم‌ها با شاهد، سپس بازبینی مستقل |
| E4-01..07 | BLOCKED (0/7) | مالک | تأمینِ میزبان‌های چندگانه |
| Fortify/APIsec/Jscrambler | BLOCKED | مالک | ثبتِ secretها |
| Payesh Watch (Notion) | BLOCKED | مالک | secretهای Notion |
| SI-013 (چرخشِ کلیدِ نشست) | OPEN (مخزن پاک است) | مالک | تأیید/چرخش |
| OD-2/OD-4 | تصمیمِ مالک | مالک | فقط اگر رفتارِ فعلی تغییر کند |
| Production Truth Gate | تشخیص نهایی: secret خالی ⇒ NOT RUN (fail-closed) | مالک | ثبتِ `DATABASE_URL` اگر این گیت لازم است |
| بازبینی مستقل | NOT RUN | کانالِ دیگر | بازبینیِ SHA نهایی |
| Notion sync | NOT RUN | — | کانکتور متصل نیست |

**اقدامِ مالک: سه موردِ انحصاری** (Vendor credentials، میزبان‌های E4، چرخشِ کلید) —
هر سه با مدرکِ §۶-۲ و §۷-۱ اثبات شد که از راهِ مهندسیِ تیم قابلِ انجام نیستند.
