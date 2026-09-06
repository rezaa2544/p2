# گزارش پیاده‌سازی رفع‌های حیاتیِ پیش از استقرار (دور 85)

- **برنچ:** `fix/pre-deployment-critical` — رویِ `main` = `bab2036` (دور 84)
- **تاریخ:** 2026-09-07 (تهران)
- **منبع:** `docs/ARCHITECTURE_REVIEW.md` — فقط 5 موردِ حیاتی؛ طبقِ دستور، مواردِ P0-3 / P1-3 / P2 و ریفکتورهای ساختاری **انجام نشدند**.

## 1) لیستِ 5 کامیت

| # | هش | مورد | فایل‌ها |
|---|-----|-------|---------|
| 1 | `3e68008` | **P0-1** سفیدفهرستِ فیلد برای `leaves` | `server/sync.js` · `tests/server12.js` (18 بررسی) · `tests/server12-mutations.js` (2/2) · `tests/server-mutations.js` (الگوی M3 با خطِ تازه) |
| 2 | `6b32db0` | **P0-2** dead-letter برای صفِ همگام‌سازی | `src/js/27-sync.js` · `index.html` + `USER_GUIDE.html` (بیلد) · `tests/deadletter.js` (18 بررسی) · `tests/deadletter-mutations.js` (2/2) |
| 3 | `773d94f` | **P0-4** `PAYESH_DEMO_CODE` پیش‌فرضِ خاموش | `server/index.js` · `tests/server1.js` (S31) · `tests/server-mutations.js` (M20) · `docs/DEVELOPMENT.md` |
| 4 | `19d5b37` | **P1-4** fail-fastِ TLS در production | `server/index.js` · `tests/server13.js` (9 بررسی) · `tests/server13-mutations.js` (1/1) |
| 5 | `43018d6` | **P1-2** قراردادِ هم‌شکلِ `httpGetJson` | `src/js/00-data-layer.js` · `src/js/42-self-diagnostics.js` · `index.html` + `USER_GUIDE.html` (بیلد) · `tests/httpgetjson.js` (10 بررسی) · `tests/httpgetjson-mutations.js` (3/3) · `tests/server1.js` (سخت‌سازی S31) |

## 2) نتیجهٔ تست‌ها (gate نهایی — بعد از هر کامیت اجرا شد)

- `node build.js` → ✅ · `node build.js --check` → راهنما همگام با index.html است ✅
- `node tests/smoke.js` → **546/546** ✅ (در هر gate)

| سئوت | نتیجه | سئوت | نتیجه |
|------|-------|------|-------|
| server1 | 31/31 ✅ | server9 | 10/10 ✅ |
| server2 | 25/25 ✅ | server10 | 7/7 ✅ |
| server3 | 14/14 ✅ | server11-sms | 9/9 ✅ |
| server4 | 16/16 ✅ | server11-mutations | 6/6 ✅ |
| server5 | 14/14 ✅ | server12 | 18/18 ✅ |
| server6 | 9/9 ✅ | server12-mutations | 2/2 ✅ |
| server7 | 15/15 ✅ | server13 | 9/9 ✅ |
| server8 | 9/9 ✅ | server13-mutations | 1/1 ✅ |
| server-mutations | **20/20** ✅ | deadletter | 18/18 ✅ |
| httpgetjson | 10/10 ✅ | httpgetjson-mutations | 3/3 ✅ |

`tests/server11-child.js` **هاپِر** است (با آرگومان فراخوانی می‌شود — از server11-sms)؛ مستقیم اجرا نمی‌شود.

## 3) نکاتِ خاص و تصمیم‌ها

### P0-1 (کامیت 1)
- **قاعدهٔ `ins` نقش‌محور شد** (انحرافِ مستند از متنِ سادهٔ دستور): والد فقط `pending`؛ مدیر/سوپرادمین می‌توانند `pending|approved|rejected` بفرستند. دلیل: روندِ قفل‌شدهٔ AD 78.3 (مدیرِ خوابگاه، مرخصیِ آخر هفته را مستقیماً `approved` insert می‌کند) — با قاعدهٔ یکدست این روندِ smoke-test‌شده می‌شکست.
- **ردِّ per-op به‌جای 403ِ کل‌دسته:** دستور «403 (یا ردِّ خاموش)» قبول داشت؛ ردِّ عملیات‌محور (`200 + ok:false + code:'field_denied'` + آدیت `sync_field_denied` بدون phone) opهای سالمِ همان دسته را زنده نگه می‌دارد و با الگوی موجودِ `virtual_day` یکی می‌شود.
- سه استثنا (IEP / ترک / leaves) حالا از **یک درِ مشترک** (`filterFields`) رد می‌شوند؛ semantic IEP/DROP byte-identical (همهٔ 19 جهشِ قدیمی server-mutations دست‌نخورده سبز ماندند).

### P0-2 (کامیت 2)
- کدهایِ پایدار: `field_denied, malformed_op, role_denied, out_of_scope, forged_by, user_mismatch, school_mismatch` → وضعیت `rejected` (از همهٔ دسته‌های بعدی خارج).
- `401` / `5xx` / شبکه → `failed` با backoff (گذرا)؛ `duplicate_ignored` → `synced` (قبلاً در حلقهٔ ابدیِ retry می‌ماند).
- UI: نشانگرِ «رد شده» با شمارنده + پنل + دکمهٔ حذفِ دستی (`sync-del`).
- **چشم‌اندازِ تست که پرهیز شد:** ردِّ کل‌دستهٔ 403 (مثل `role_denied`) op سالم را هم رد می‌کند — سناریوی «سالم + خراب» از ردِّ per-opِ `field_denied` (خودِ کامیت 1) استفاده می‌کند تا چیزی ثابت کند.

### P0-4 (کامیت 3)
- سِوهٔ کامل: هر **21** تستی که `demo_code` می‌خواند از قبل `PAYESH_DEMO_CODE` را صریح می‌ست — **شکاف صفر**؛ هیچ تستی شکست نخورد.
- S31: سرورِ فرزندِ بدونِ env → `send-code` شمارهٔ واقعی → 200 + `code:'sent'` **بدون** `demo_code`. M20 (بازگشتِ پیش‌فرض به روشن) → S31 شکست.
- `docs/DEVELOPMENT.md` به‌روز شد؛ `DEPLOY.md` از قبل همین پیش‌فرض را (۰) می‌گفت — حالا کد با سند یکی شد.

### P1-4 (کامیت 4)
- تشخیصِ self-signed از `subject === issuer` در `crypto.X509Certificate` — نه string-match روی خروجیِ `tls-cert.js` (هر self-signed را می‌گیرد).
- خطا: `Error: Production requires valid CA certificate` (+ نسخهٔ `cert unreadable` برای گواهیِ خراب) → `exit(1)`.
- development با self-signed **دست‌نخورده** (T3). گواهیِ CA-signedِ تست با ابزارِ DERِ خودِ پروژه ساخته می‌شود — صفرِ وابستگی.

### P1-2 (کامیت 5)
- قرارداد: `{ ok, status, code, serverTime, data, error, networkError?, timedOut? }` — **همیشه resolve، هرگز reject**؛ تمایز 4xx/5xx از راهِ `status`؛ بدنهٔ خراب → `data:null + error:'bad_json'`.
- `code` به‌عنوانِ aliasِ `status` **نگه داشت** شد: `42-self-diagnostics` از `r.code` استفاده می‌کرد؛ آن را از راهِ `r.error` بازنویسی کردم تا پیامِ «وصل به سرور نشد» دقیقاً همان باشد.
- `46-bell-now` و `detectServer`: **صفرِ تغییر کد** — رفتارِ قبلی به‌طورِ دقیق حفظ شد (تست‌های H7/H8 + سئوت‌های server2/server5 سبز).

### یافته‌های محیط (غیرمرتبط با کد، ولی در مسیرِ کار دیدیم)
- `/tmp` این سنبوکس tmpfsِ 993MB است؛ دایرکتوری‌هایِ موقتِ تست (هرکدام ~5MB) انباشته شدند (166 orphan) و `ENOSPC` ساخت — چند «شکست»ِ اولیهٔ gate را دقیقاً این می‌ساخت. بینِ batteryها `rm -rf /tmp/payesh-*` زدیم.
- سرورهایِ orphan رویِ پورت‌هایِ تست (8987/8989) چند gate را به‌هم زد؛ با `try/finally` برایِ killِ تضمینی (S31) + poolِ پورتِ گسترده‌تر و killِ `t1.proc` (server13) حل شد. در پایانِ هر gate: **0 فرآیندِ سرورِ مانده**.
- ریسِتِ سنبوکس، `.git/config` (remote + identity) را پاک می‌کند؛ رفرانسِ کهنهٔ `origin/main` (= 3e100b7) یک بار reset را گمراه کرد. `main` واقعیِ GitHub = `bab2036` (با `ls-remote` تأیید شد)؛ remote و identity (`Payesh Dev`) از تاریخچهٔ کامیت‌ها بازیابی شدند.

## 4) صریحاً انجام نشد (طبقِ دستور)

- ❌ P0-3 فشرده‌سازیِ logِ کلاینت (compactLogIfNeeded)
- ❌ P1-3 GC وضعیتِ سرور (pruneStoreState)
- ❌ ریفکتورِ `19-actions.js` (تقسیم + cache)
- ❌ `base_version` / حل‌تعارضِ P2 / همهٔ «پیشنهادِ آینده»ها

## 5) وضعیتِ برنچ

- `fix/pre-deployment-critical`: 5 کامیت + این گزارش — push شده به GitHub.
- سئوتِ دودی 546/546 و همهٔ سئوت‌های server*/client سبز؛ درختِ کاری تمیز.
