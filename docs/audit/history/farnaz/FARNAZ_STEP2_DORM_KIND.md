# گزارش قدم ۲ — S5: تمایز پانسیون از اقامت کامل (فاز فرناز)

**شاخه:** `feat/farnaz-phase1` · **تاریخ:** ۲۰۲۶-۰۹-۰۸
**حکم:** پیاده‌سازی کامل + تست + جهش — همه سبز ✅

## تغییرها
| فایل | تغییر |
|---|---|
| `authz/model.json` + `authz/write-perms.json` | `kind` به فیلدهای dorm_assignments (+۱ خط، بازتولید با ژنراتور) |
| `server/validate.js` | `kind→enum[full,pansion]` محدود به dorm_assignments |
| `src/js/19-actions-dorm.js` | سلکت `dorm_kind` در مودال انتساب + اعتبارسنجی در dorm-assign-pick (پیش‌فرض full) |
| `src/js/65-dorm.js` | `DORM_KINDS` + `dormKindOf` (پیش‌فرض full برای قدیمی‌ها) + `dormKindLabel` + چیپ نوع روی بج ساکن |
| `index.html` + `USER_GUIDE.html` | بازبیلد |
| `tests/dorm-kind.js` (جدید) | ۱۷ ادعا (سلکت، ثبت هر دو نوع، رد نامعتبر، سازگاری قدیمی، برچسب‌ها، رندر صفحه، allowlist، قانون سرور، سینک زنده) |
| `tests/dorm-kind-mutations.js` (جدید) | ۵ جهش (اعتبارسنجی، پیش‌فرض، enum سرور، سلکت، برچسب) |

## نتایج
- `tests/dorm-kind.js`: **۱۷/۱۷** ✅ (۴.۵ ثانیه، اولین اجرا سبز)
- `tests/dorm-kind-mutations.js`: **۵/۵ کشته**، بیزلاین سبز، ۰ خطای محیطی ✅
- `build --check` exit=0 ✅ · `check-authz` exit=0 ✅ · `smoke` **۵۴۷/۵۴۷** ✅

## تصمیم‌ها
- ظرفیت اتاق همه انتساب‌ها را می‌شمارد (رفتار عوض نشد) — تغییرش یک‌خطی و برگشت‌پذیر است.
- نمایش نوع فقط در صفحه خوابگاه (کارت پرونده دست‌نخورد — بیرون از اسکوپ «تمایز»).

**ثبت:** بخش S5 در `HANDOFF.md`.
**قدم بعد:** به‌روزرسانی USER_GUIDE + گزارش تجمیعی.
