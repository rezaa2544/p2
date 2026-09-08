# گزارشِ گامِ ۰ — آماده‌سازی (دورِ ۱۰۰، رفعِ ۶ یافتهٔ رفتاری)

**تاریخ:** ۱۸/۰۶/۱۴۰۵ (2026-09-08) · **برنچ:** `fix/behavior-findings` (از `main` در `078c6bc`)
**طرحِ مرجع:** `docs/FIXES_ACTION_PLAN.md` · **کامیتِ این گام:** (پایین، پس از ثبت)

---

## ۱. کارهایِ انجام‌شده

| # | کار | نتیجه |
|---|-----|-------|
| ۱ | `git checkout -b fix/behavior-findings` | ✅ برنچ ساخته شد |
| ۲ | هویتِ گیت (`Payesh Dev / dev@payesh.local`) | ✅ طبقِ قراردادِ `run-all-tests.sh` |
| ۳ | `node build.js --check` | ✅ سبز (بیت‌به‌بیت + راهنما + write-perms + check-authz) |
| ۴ | نصبِ `jsdom` با `--no-save` | ✅ `package.json` دست‌نخورده؛ smoke دیگر skip نمی‌شود |
| ۵ | `node tests/smoke.js` (واقعی) | ✅ **547/547** (تنها هشدار: `window.scrollTo`ِ jsdom — پیش‌موجود و بی‌ضرر) |
| ۶ | ورودیِ دورِ ۱۰۰ در `HANDOFF.md` | ✅ بالایِ فایل، وضعیتِ «در حالِ اجرا» |
| ۷ | الحاقِ `docs/FIXES_ACTION_PLAN.md` به این کامیت | ✅ (فایلِ طرحِ مرجع، قبلاً untracked بود) |

## ۲. یافتهٔ مهمِ آماده‌سازی

- `tests/smoke.js` **بدونِ jsdom فقط skip می‌شد** (exit 0 کاذب). حالا با نصبِ jsdom، دروازهٔ
  «smoke سبز» در همهٔ گام‌ها **واقعی** است (547/547).
- `dist/` در `.gitignore` است — بازسازیِ `index.html` در هر گام فقط همان فایل + مُهرِ
  `USER_GUIDE.html` را لمس می‌کند.

## ۳. نقشهٔ گام‌هایِ بعد (هرکدام = یک کامیت)

| گام | نقص | تستِ تازه | جهش‌ها |
|-----|-----|-----------|--------|
| ۱ | ۲ — درجِ بدونِ log/queue (P0) | `tests/persist-roundtrip.js` | `tests/persist-roundtrip-mutations.js` |
| ۲ | ۱ — chunking صف (P0) | `tests/sync-chunk.js` | `tests/sync-chunk-mutations.js` |
| ۳ | ۳ — طرحِ شهریه (P1) | `tests/tuition-plan.js` | `tests/tuition-plan-mutations.js` |
| ۴ | ۴ — سرریزِ چیدمان (P1) | `tests/placement-overflow.js` | `tests/placement-overflow-mutations.js` |
| ۵ | ۵ — backup/snapshot (P2) | `tests/backup-snap.js` | `tests/backup-snap-mutations.js` |
| ۶ | ۶ — تداخلِ generateP12 (P2) | `tests/genp12.js` | `tests/genp12-mutations.js` |
| ۷ | دروازهٔ نهایی + رجیسیونِ کامل | — | — |

فایل‌هایِ تازهٔ `tests/*.js` به‌صورتِ خودکار (`ls tests/*.js` در `run-all-tests.sh`) واردِ
رجیسیون می‌شوند — بدونِ نیاز به ثبتِ دستی.

## ۴. دروازهٔ این گام

- [x] `node build.js --check` سبز
- [x] `node tests/smoke.js` سبز (547/547 واقعی)
- [x] ورودیِ HANDOFF ثبت شد

**گامِ بعد:** گامِ ۱ — نقصِ ۲ (P0، ماندگاریِ داده).
