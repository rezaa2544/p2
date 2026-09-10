# ماژولِ کتابخانهٔ مدرسه (E.4)

> امانت/بازگشت/جستجوی کتاب + کتابدارِ تفویضی + نمای دانش‌آموز.
> بنا شده روی ماژولِ موجود (`lib_books`/`lib_loans`) — بدونِ موازی‌کاری.

## ۱. داده

| کالکشن | فیلدهای کلیدی |
|---|---|
| `lib_books` | `school_id, title, author, code, serial, isbn, location, total_copies, created_at` |
| `lib_loans` | `school_id, book_id, student_id, loan_at, due_at (+۱۴ روز), returned_at, registered_by, created_at` |
| `users.lib_staff` | پرچمِ تفویضیِ کتابداری (`1` = کتابدار) — فقط مدیر می‌دهد/پس‌می‌گیرد |

- `total_copies`: سقفِ امانتِ هم‌زمان؛ **۰/خالی = نامحدود** (سازگاری با رکوردهای قدیم).
- موجودی لحظه‌ای: `libAvail = total − امانتِ فعال` (محاسبه‌شده، ذخیره نمی‌شود).
- وضعیتِ امانت هم محاسبه‌شده است: `returned / loaned / late`.

## ۲. مجوزها

| عمل | مدیر | کتابدار (دبیرِ `lib_staff=1`ِ هم‌مدرسه) | دانش‌آموز |
|---|---|---|---|
| ثبت/ویرایش/حذفِ کتاب | ✅ | ❌ | ❌ |
| امانت/بازگشت | ✅ | ✅ | ❌ |
| جستجو + مشاهده | ✅ | ✅ | ✅ (کتاب‌ها + فقط امانتِ خودش) |
| اعطا/لغوِ کتابداری | ✅ | ❌ | ❌ |

لایه‌ها (دفاعِ عمقی): گاردِ مسیر (`canRoute` + منو) ← گاردِ کلیک (`ACTION_ROLES`) ←
گاردِ داده (`libStaffCan` در تابع‌ها) ← سرور (`authz/model.json` + `inScope` در `sync.js`).
کتابدار در سطحِ **مدرسه** عمل می‌کند (نه کلاس) — آگاهانه، چون امانت به کلاس محدود نیست.

## ۳. فایل‌ها

- `src/js/54-library.js` — منطق + نماها (`viewLibrary`/`viewLibraryStudent`) + دموی قطعی
- `src/js/19-actions-core.js` — اکشن‌های `lib-*` (فرم‌ها با `lib_ser2`/`lib-serial-save` سازگار)
- `src/js/30-authz.js`، `src/js/05-router.js`، `src/js/07-shell.js` — نقش‌ها/منو/گارد
- `authz/model.json` → `authz/write-perms.json` (تولیدی — با `node tools/generate-write-perms.js`)
- `server/sync.js` — شاخهٔ `lib_loans` در `inScope` (دبیر)

## ۴. تست‌ها

- `tests/library.js` (قدیم — باید سبز بماند) و `tests/libserial2.js` (سریال)
- `tests/library2.js` — **۷/۷**: فیلدها/ویرایش، سقفِ نسخه، کتابدار، نمای دانش‌آموز، جستجو، `inScope`، `apiSync` سرتاسری
- `tests/library-mutations.js` — **۴/۴ کشته** (کتابدارِ همیشه-مجاز، بی‌سقفی، بی‌پرچمیِ سرور، بی‌نماییِ دانش‌آموز)
- گیت‌ها: smoke ‏۵۴۷/۵۴۷، `check-authz` صفر، `secret-scan` ‏۱۱/۱۱
