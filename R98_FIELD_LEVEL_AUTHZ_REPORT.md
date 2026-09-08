# گزارشِ دورِ ۹۸ — field-level authorization عمومی (FIELD_ALLOWLISTS برایِ همهِٔ مجموعه‌ها)

**تاریخ:** ۱۸/۰۶/۱۴۰۵ (2026-09-08)
**وضعیت:** ✅ بسته — **رجیسیونِ پایانی: 134/134 سبز، 0 قرمز (1343s)**
**کامیت:** `3c2a6d6` + کامیتِ این گزارش

## دستور

- در `server/sync.js` یک `FIELD_ALLOWLISTS` برایِ همهِٔ collectionها: برایِ هر
  collection، فیلدهایِ قابلِ تغییر در `ins` و `upd` مشخص باشند.
- فیلدهایِ ممنوع: `status`, `school_id`, `user_id`, `role`, `national_id`,
  `phone` — هرگز نباید با Object.assign قابلِ تزریق باشند.
- `school_id` و مالکیت باید از session/context مشتق شوند، نه از body.

## انجام شد (`server/sync.js`)

**۱. `FIELD_ALLOWLISTS` عمومی — تولیدشده برایِ هر ۸۰ مجموعهِٔ مدل:**
- `ins.fields` / `upd.fields` = فیلدهایِ شناخته‌شدهِٔ مدل (seed ∪ کلاینت ∪
  managed) **منهایِ مجموعهِٔ ممنوع**. فیلدِ ناشناخته همچنان fail-closed
  (`unknown_field`) — بدونِ تغییر.
- entryِ `leaves` پیشین (سیاستِ statusِ arch P0-1: ins=pending، upd=تصمیم
  فقط مدیر) رویِ همان allowlist حفظ شده — رفتارِ قفل‌شدهِٔ AD 78.3 دست‌نخورده.

**۲. `PROTECTED_FIELDS` + `protPolicy` — سیاستِ صریحِ تک‌دریوزه برایِ
فیلدهایِ ممنوع** (هیچ‌کدام در allowlistِ عمومی نیستند):

| فیلد | سیاست |
|---|---|
| `school_id` | مشتق از نشست (نقش‌هایِ scoped؛ مغایرت = `school_mismatch`). superadmin مدرسه در نشست ندارد → مدرسهِٔ مقصد از عملیات می‌آید (صلاحیتِ بین‌مدرسه — مستند) |
| `status` | سیاستِ workflowِ موجود (ins = مقدارِ اولیهٔ مجموعه؛ upd = مدیر یا نقش‌هایِ صریحِ کارکرد) |
| `user_id` | **جدید:** فقط مدیریت (manager/superadmin/edu_office) — پیش‌تر یک دبیر می‌توانست `user_id` نوتیفیکاسیونِ هم‌مدرسه را رویِ کاربرِ دیگر بازنام کند (inScope او را رد نمی‌کرد) |
| `role` | `users` = بدونِ ارتقاء (موجود)؛ roleِ دامنه‌ای (`exam_duties`/`notifications`) = فقط مدیریت |
| `national_id` / `phone` | `users` = فقط مدیریت (موجود)؛ سایرِ مجموعه‌ها = فقط مدیریت؛ استثنأ: `teacher_sms.phone` = تلفنِ گیرنده، دادهِٔ خودِ SMS دبیر |

**۳. فازِ اعمال (apply) — «هرگز از Object.assignِ عمومی»:**
- `stripProtected` فیلدهایِ ممنوع را از کپیِ payload جدا می‌کند؛ مقدارِ
  اعتبارسنجی‌شده/مشتق‌شدهِٔ سرور بعداً **صریحاً** نوشته می‌شود (نه inject).
- روی کپی کار می‌کند تا `op.data` برایِ hookهایِ بعد از apply
  (اعلانِ مرخصی/پیام/اصلاح) دست‌نخورده بماند.
- `filterFields` برایِ entryهایِ تولیدشده سخت‌سازی شد (نرمال‌سازیِ status
  فقط وقتی `defaultRoles` وجود دارد — یعنی فقط leaves).

## یافته

- **سوراخِ واقعی:** `user_id` رویِ نوتیفیکاسیون — دروازهٔ inScope برایِ
  دبیر، رکوردِ هم‌مدرسه را رد می‌کرد و فیلدِ `user_id` در allowlistِ عمومی
  بود → reassignِ گیرندهِٔ اعلان بدونِ ردّ. با سیاستِ صریحِ جدید بسته شد
  (F2/F3/F6 در server17).
- باگِ خودِ بازطراحی: `filterFields` رویِ entryهایِ جدید، `fa.ins
  .defaultRoles[0]` را می‌خواند که برایِ بقیهٔ مجموعه‌ها undefined بود →
  TypeError رویِ هر ins. با guard بسته شد (پیش از اولینِ رجیسیون).

## آزمون — `tests/server17.js` بخشِ F (F0–F7)

مدیر: ins notifications با user_id → ok · دبیر: upd همان رکورد با
user_id → `field_denied` (per-op، 200) + **store دست‌نخورده** · دبیر:
upd فقط `read` → ok (مسیرِ مشروع بیش‌ازحد بسته نشده) · مدیر: ins
exam_duties با roleِ دامنه‌ای → ok · دبیر: role → `field_denied` ·
آدیتِ `sync_field_gate` ثبت.

## نتیجهٔ آزمون‌هایِ دستور + رجیسیون

- `node build.js` ✅ (با گیتِ authz)
- `node tests/smoke.js` ✅ 547/547
- `node tests/server17.js` ✅ 70/70 (F0–F7)
- رجیسیونِ کامل: **134/134 سبز، 0 قرمز (1343s)** — اجرایِ اول، بدونِ flake
