# M15-06 — Validation (Zod-رده): لایهٔ اعتبارسنجیِ یکپارچه روی HEAD

**تاریخ:** 2026-11-14 · **سوئیت:** tests/validate-contract.js (۴۸/۴۸) · **تصمیمِ معماری:** بدونِ وابستگیِ zod

## تصمیمِ معماری — چرا zod به‌عنوانِ وابستگی اضافه نشد

مقصدِ تسک (اعتبارسنجیِ اسکیمای ورودیِ API) از قبل با یک لایهٔ داخلیِ
یک‌منبع‌حقیقت تأمین شده است:

- `server/validate.js` (۴۴۷ خط) — «همهٔ endpointها بدنه را پیش از هر منطقی
  از همین‌جا رد می‌کنند» (درسِ R96 P0-1: کنترلِ پراکنده = شکاف):
  `validate(body, schema)` با fail-closedِ فیلدِ ناشناخته + الزامی + قواعدِ
  تایپ‌دار (۱۵ نوعِ checkRule) + `validateSyncEnvelope/validateSyncData`
  برای همگام‌سازی + `ruleFor(coll,key)` با enumهای ۲۴ مجموعه.
- `server/reports-sql.js` L233+ — قراردادِ پارسرهایِ query (broken ⇒ 400،
  هرگز NaN خاموش) — سوئیتِ خودش: wave23-reports-sql + mutations.
- مصرف‌کنندگان: auth/admin/sms/sync/conflict-transaction.

افزودنِ zod = منبعِ حقیقتِ دوم برایِ همان قواعد (خطرِ واگرایی در یک کدبیسِ
hardened و offline-first؛ runtime-dep جدید بدونِ ارزشِ افزوده). قواعدِ
دامنه — موبایلِ ایران/کدِ ملی/تقویم با کبیسه/scoreِ ۰-۲۰ — دقیق‌تر از
schemaهای عمومیِ zodاند.

## تحویلِ جدیدِ این نوبت — قراردادِ مستقیم

`tests/validate-contract.js` (۴۸ چک، cross-platform) — لایه تا دیروز فقط
پوششِ غیرمستقیم داشت؛ حالا مستقیم قفل است:

- هر اعتبارسنجِ صادرشده: موبایل/ثابت/authphone/نید/OTP/شناسه/YMD/datetime —
  **هم سمتِ پذیرش هم سمتِ رد** (اثباتِ منفیِ دو-سمت: لوس‌شدنِ regex سمتِ
  رد را قرمز می‌کند، سخت‌شدنش سمتِ پذیرش را — هیچ جهشِ یک‌سویه سبز نمی‌ماند)
- موتورِ validate: unknown_field/missing/invalid + بدنهٔ غیرِ شیء
- **قراردادِ §4 (PII):** پیامِ خطا نامِ فیلد دارد، هرگز مقدارِ خام را نه (V40)
- score ۰-۲۰، HH:MM (ردِ 24:00)، array-of (bad_item)، bad_type
- ruleFor/STATUS_ENUMS/USER_ROLES/SCHOOL_GENDERS

## تأیید

- `node tests/validate-contract.js` → ۴۸ passed, 0 failed (exit 0)
- CI: رانِ پس از push (هر دو لاین) — شمارشِ جدید: ۶۴۶+۳۳
