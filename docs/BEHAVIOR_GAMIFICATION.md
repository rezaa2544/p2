# گیمیفیکیشن رفتاریِ دبستان (E.3)

> امتیازِ سریعِ ClassDojo-وار برای مقطعِ ابتدایی — بنا شده روی لایهٔ موجود
> (`discipline` + `dojo_types`)، بدونِ جدولِ موازیِ `behavior_points`.

## ۱. نگاشتِ درخواست به موجود

| درخواست | موجود |
|---|---|
| `behavior_points` (دانش‌آموز/دبیر/امتیاز/دلیل/دسته/تاریخ) | `discipline` (`student_id/created_by/points/title+description/kind/date`) |
| دستهٔ positive/negative | `kind` (همان مقادیر) |
| مدلِ امتیازِ مدرسه | `dojo_types` (نام + آیکون + دلتا، فقط-مدیر) |

## ۲. تازه‌های E.3

- **امتیازِ سریع (⭐):** دکمه در هر ردیفِ صفحهٔ حضور (فقط ابتداییِ دارای مدل،
  فقط کلاسِ خودِ دبیر) → ثبتِ یک‌کلیکه با دلتای اولین نوعِ مثبتِ مدل.
  اکشنِ `disc-quick` (teacher/manager) + تابعِ `dojoQuickAward`.
- **کارتِ داشبورد:** نوارِ «⭐ آخرین امتیازها» (۵ تای اخیر + بجِ جمع) در
  `summaryBlock` — مشترکِ دانش‌آموز و ولی.
- **حذفِ فقط-مدیر:** دکمهٔ 🗑️ از نمای دبیر پنهان شد **و** دبیر از
  `discipline.del` در `model.json` بیرون رفت (+ بازتولیدِ `write-perms.json`)؛
  ویرایش برای دبیر ماند.

## ۳. مجوزها

| عمل | دبیر (کلاسِ خود) | مدیر | ولی/دانش‌آموز |
|---|---|---|---|
| ثبت (سریع/فرم) | ✅ | ✅ | ❌ |
| ویرایش | ✅ | ✅ | ❌ |
| حذف | ❌ (سرور هم رد می‌کند) | ✅ | ❌ |
| مشاهده (پرونده/داشبورد) | کلاسِ خود | همه | فقط خود/فرزند |

لایه‌ها: گاردِ نما (`dojoCanQuickAward` + دکمهٔ شرطی) ← گاردِ کلیک
(`ACTION_ROLES`) ← سرور (`model.json` + `inScope` کلاس‌محور).

## ۴. فایل‌ها

- `src/js/52-dojo.js` — `dojoCanQuickAward`/`dojoQuickAward`/`dojoRecent(Html)`
- `src/js/12-attendance.js` — دکمهٔ ⭐؛ `src/js/08-dashboard.js` — نوارِ داشبورد
- `src/js/14-discipline.js` — پنهان‌سازیِ حذف برای دبیر
- `src/js/19-actions-core.js` + `src/js/30-authz.js` — اکشنِ `disc-quick`
- `authz/model.json` → `authz/write-perms.json` (تولیدی) + بیلد

## ۵. تست‌ها

- `tests/dojo.js` (قدیم — باید سبز بماند)
- `tests/behavior2.js` — **۴/۴**: ثبتِ سریع، نگهبان‌ها، نماها، مدلِ سرور
- `tests/behavior-mutations.js` — **۴/۴ کشته**
- گیت‌ها: smoke ‏۵۴۷/۵۴۷، `check-authz` صفر، `secret-scan` ‏۱۱/۱۱
