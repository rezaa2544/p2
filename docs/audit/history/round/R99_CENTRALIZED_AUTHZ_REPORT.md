# گزارشِ دورِ ۹۹ — centralized authorization source (سرور از فایلِ تولیدشده می‌خواند)

**تاریخ:** ۱۸/۰۶/۱۴۰۵ (2026-09-08)
**وضعیت:** ✅ بسته — **رجیسیونِ پایانی: 134/134 سبز، 0 قرمز (1360s)**
**کامیت:** `fdf8961` + کامیتِ این گزارش

## دستور

1. در `src/js/30-authz.js` یک `ACTION_ROLES` مرکزی که شاملِ نقش‌ها و
   collectionهایِ قابلِ نوشتن باشد.
2. `tools/generate-write-perms.js` — مولدِ `WRITE_PERMS` از روی `ACTION_ROLES`.
3. `server/sync.js` باید از **فایلِ تولیدشده** استفاده کند، نه جدولِ دستی.
4. `node build.js --check` باید این تطابق را بررسی کند.

## طراحی (سازگار با تک‌منبعِ R96)

زنجیرهٔ تک‌منبع، حالا قطعی و با گیتِ build:

```
src/js/30-authz.js        (ACTION_ROLES — نقش‌هایِ مجازِ هر اکشن؛ مرکزی و موجود)
      +
تحلیلِ استاتیکِ اکشن‌ها    (مجموعه‌هایِ نوشتاریِ هر اکشن — همان استخراجِ
      +                    tools/check-authz.js؛ از کد واقعی، نه جدولِ دست‌نویس)
authz/model.json          (fields + نقش‌هایِ هر عمل ins/upd/del — منبعِ کوراکشن/GRANTS)
      ↓
tools/generate-write-perms.js
      ↓  (fail-closed: هر ناهماهنگیِ نقش↔مجموعه = exit 1، فایل نوشته نمی‌شود)
authz/write-perms.json    (فایلِ تولیدشده — perms + ops + fields +
                           نقشهٔ صریحِ «اکشن ← نقش‌ها + مجموعه‌هایِ قابلِ نوشتن»)
      ↓
server/sync.js            (AUTHZ + WRITE_PERMS = requireِ این فایل؛ مشتقِ
                           دستیِ قدیمی حذف شد)
```

تصمیم: `ACTION_ROLES` شکلِ فعلی‌اش (اکشن ← نقش‌ها) را نگه می‌دارد؛ نقشهٔ
اکشن ← مجموعه‌ها **از کدِ واقعی استخراج می‌شود** (نه جدولِ دومِ دست‌نویس —
دقیقاً ریسکِ دریفی که یادداشتِ R96 در 30-authz.js هشدارش را داده بود) و در
فایلِ تولیدی (بخشِ `actions`) قفل می‌شود. TODOیِ قدیمیِ «پیش از اتصال به
سرور» در 30-authz.js بسته شد و زنجیرهٔ جدید مستند است.

## انجام شد

- **`tools/generate-write-perms.js` (جدید):** مولد + گیتِ سازگاری.
  - ورودی: ACTION_ROLES + analysis (reuse از check-authz) + model.json.
  - خروجی: `authz/write-perms.json` — ۸۰ مجموعه، ۱۶۳ اکشنِ نویسنده،
    `perms` (نقش ← مجموعه‌ها؛ superadmin = `*`)، `ops` (نقش‌هایِ هر عمل)،
    `fields`، و `actions` (نقشهٔ صریح).
  - حالت‌ها: پیش‌فرض = تولید + نوشتن؛ `--check` = مقایسهٔ خروجی با فایلِ
    موجود (کهنه = exit 1) — برایِ `build.js --check`.
- **`server/sync.js`:** `AUTHZ` و `WRITE_PERMS` از فایلِ تولیدشده
  (`require('../authz/write-perms.json')`)؛ بلوکِ مشتقِ دستی حذف شد.
  exports بی‌تغییر (authz-model/check-authz/server16 همان‌طور کار می‌کنند).
- **`build.js --check`:** حالا ابتدا `generate-write-perms.js --check`
  (جدولِ کهنه یا ناهماهنگ = build قرمز) و سپس `check-authz.js` (معنایی:
  اکشن‌هایِ نویسنده ↔ WRITE_PERMS) را اجرا می‌کند.
- **`authz/model.json`:** سرتیتر به‌روز — حالا «منبعِ کوراکشن» است؛ سرور
  فایلِ تولیدشده را می‌خواند.
- **`tests/dropout-mutations.js`:** کپیِ موقتیِ سرور حالا
  `authz/write-perms.json` را هم می‌کوبد (requireِ sync.js).

## یافته

- هیچِ باگِ امنیتیِ جدید نیافت (ساختارِ R96 از قبل تک‌منبع بود؛ این دور
  آن را از «مشتقِ در لحظهٔ لود از فایلِ کوراکت‌شده» به «فایلِ تولیدشده با
  گیتِ build» ارتقاء داد — جدولِ دستی/کوراکت‌شده دیگر مسیرِ سرور نیست).
- یک شکستِ واقعیِ محتمل پیش‌بینی و پوشش شد: dropout-mutations سرور را در
  in-memory tree کپی می‌کرد؛ بدونِ کپیِ فایلِ جدید، require می‌مرد (افزوده شد).
- گیتِ منفی تست شد: دست‌کاریِ فایلِ تولیدشده → `--check` با exit 1 و
  پیامِ روشن می‌میرد؛ بازگردانی → exit 0.

## نتیجهٔ آزمون‌ها

| آزمون | نتیجه |
|---|---|
| `node build.js` | ✅ (با گیتِ authz) |
| `node build.js --check` | ✅ (هر دو گیت: مولد + check-authz) |
| `node tests/smoke.js` | ✅ 547/547 |
| `tests/authz-model.js` | ✅ 230/230 |
| `tests/check-authz.js` | ✅ 6/6 |
| `tests/server16.js` (ماتریسِ منفی) | ✅ 39/39 |
| `tests/dropout-mutations.js` | ✅ 6/6 کشته |
| سرورِ زنده (probe: manager ins) | ✅ ok:true |
| رجیسیونِ کامل | ✅ **134/134 سبز، 0 قرمز (1360s)** — اجرایِ اول، بدونِ flake |
