# گزارش ریبیسِ دوم `arena/01a08545-p2` روی `origin/main` (`351bd10`) — چت ۳ — ۱۹/۰۶/۱۴۰۵ (2026-09-10)

## ۱) چه شد

پس از ریبیسِ نخست (`d554eea` روی `40c5f96`) و ساختِ PR #47، `main` با ادغامِ **PR #45** (چت ۴:
رفعِ کرشِ دمو در پنجشنبه + برنامهٔ شش‌روزهٔ دمو + سندِ آرنا ۵ + `tests/wave20-arena5.js` +
`tests/demo-thursday.js`) از `40c5f96` به `351bd10` جابه‌جا شد و PR #47 `CONFLICTING` شد.
ریبیسِ دوم روی `351bd10` با **همان قاعدهٔ «هر دو سمت»** کامل شد.

- شاخهٔ نهایی: **17 کامیت** روی `origin/main` (`351bd10`)
- push: `git push --force-with-lease=arena/01a08545-p2:302886a…` → **`da5d571`** (تأیید با `ls-remote`)
- **PR #47:** https://github.com/rezaa2544/p2/pull/47 — `mergeable=MERGEABLE` · CI **CLEAN**
  (build 22.x، SAST، Secret scan، SCA، SBOM، DAST، WAF — همه SUCCESS)

## ۲) رفعِ تداخل‌ها (هر دو سمت حفظ شد)

| فایل | تصمیم |
|---|---|
| `HANDOFF.md` | هر دو ورودی (چت ۴ + چت ۳) — زمانی |
| `USER_GUIDE.html` | فقط مُهرِ بیلد — `node build.js` + `--check` در هر توقف |
| `tests/otp-ratelimit-mutations.js` | M3–M6 هر دو فرمِ لنگر (8 entry) — هر دو در `server/auth.js`ِ ادغام‌شده موجودند؛ جهش **11/11 کشته** |
| `docs/ARENA5_QA_RELIABILITY.md` | add/add — **یک فایل با دو سندِ کامل**: سندِ فارسیِ چت ۴ (متنِ اصلی، قراردادِ `tests/wave20-arena5.js`) + پیوستِ کاملِ سندِ «نهایی‌شده»ِ چت ۳ (سطحِ سرعنوان‌ها یک‌جور پایین‌تر؛ ارجاع‌هایِ §4.3/§5 سالم) |
| `src/js/02-demo-data.js` | ادغامِ خودکار برنامهٔ شش‌روزهٔ چت ۴ + نگاشت/فِلبکِ ما (فرمِ نهایی در بند ۴) |

## ۳) سه‌تا نقصِ واقعی که ریبیس آشکار کرد (هر دو سمت درست بود؛ ترکیب ناسازگار)

1. **جفتِ خودتضادِ PR #45 روی `main`:** `node.js.yml` ماتریسِ صادقِ فقط-`22.x` (لن‌های 18/20 با
   jsdom 30 سبزِ کاذب می‌دادند — `19ea463`) ولی `CIN-1` در `tests/wave20-arena5.js` هنوز
   18/20/22 را می‌خواست ⇒ **`main` با گیتِ خودش قرمز بود.** رفع: `CIN-1` به ماتریسِ صادق
   هم‌راستا شد (فقط `22.x` + ممنوعیتِ صریحِ بازگشتِ 18/20).
2. **`G3` در `tests/arena5-demo-guard.js`:** پیش‌فرضِ قدیم (مدرسهٔ دمو 5روزه ⇒ دمایِ خامِ
   d=5 نباید باشد) را assert می‌کرد؛ دموِ شش‌روزهٔ PR #45 پیش‌فرض را وارونه کرد.
   رفع: `G3` حالا وجودِ دمایِ d=5 را ثابت می‌کند؛ فِلبکِ `period` به‌عنوانِ **دفاعِ دوم**
   می‌ماند (پوشش: G2 + بندِ 1.5ِ smoke).
3. **آلودگیِ مارکرِ موروث** در `USER_GUIDE.html`ِ یک کامیتِ میانیِ ریبیسِ نخست — با ریبیسِ
   تعاملی + rebuild برطرف شد. ممیزی: **هر 17 کامیتِ شاخه مارکر-فرید است.**

## ۴) فرمِ نهاییِ بندِ 1.5 (`src/js/02-demo-data.js`)

```js
const dow=dow0<=4?dow0:0;
const dt=dow0<=5?todayISO():addDaysISO(todayISO(),1);
let slot=db.schedule.find(x=>x.class_id===classes[0].id&&x.day===dow&&x.period===2);
if(!slot) slot=db.schedule.find(x=>x.class_id===classes[0].id&&x.period===2);
```

دمو در پنجشنبه با `dt=today` (بندِ 1.5ِ smoke: «جابه‌جایِ امروز») و با برنامهٔ شش‌روزهٔ
چت ۴ (work_days=[0..5]) سازگار است.

## ۵) دروازه‌ها — همه سبز (پنجشنبه 2026-09-10 — روزِ پرخطرِ باگِ dow)

| گیت | نتیجه |
|---|---|
| `node tests/smoke.js` | **547/547** |
| `node tools/check-authz.js` | **0** |
| `node tests/secret-scan.js` | **11/11** |
| `node build.js --check` | ✅ بیت‌به‌بیت |
| `node tests/wave6-redis.js` | **22/22** |
| `node tests/wave11-cache.js` | **20/20** |
| `node tests/wave15-health.js` | **10/10** |
| `node tests/wave18-load-test.js` | **38/38** |
| `node tests/wave19-chaos.js` | **28/28** |
| `node tests/arena5-recovery.js` | **32/32** |
| `node tests/arena5-demo-guard.js` | **4/4** |
| `node tests/wave20-arena5.js` (از main) | **22/22** |
| `node tests/demo-thursday.js` (از main) | ✅ |
| CI GitHub (PR #47) | **CLEAN — 7/7 SUCCESS** |

## ۶) وضعیت

- ریبیس‌های هر دو سمت کامل؛ درختِ HEAD سبز؛ تاریخچهٔ کامیت‌ها تمیز (یک کامیت به‌ازایِ هر کار).
- **مرجِ PR #47: آمادهٔ تأییدِ ناظر ارشد.** بعد از مرج: Go-Live (سوپروایزر) + اجرای
  زندهٔ W18/W19 (در انتظارِ زیرساختِ چند-نمونه).
