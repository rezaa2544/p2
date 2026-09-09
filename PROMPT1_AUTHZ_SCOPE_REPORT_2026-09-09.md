# گزارش نهایی پرامپت ۱ — فاز ۱، بخش Authorization و Scope

- تاریخ: ۲۰۲۶-۰۹-۰۹ (۱۹ شهریور ۱۴۰۵)
- شاخه: `arena/01a0827b-p2` (از `main` در `6961b72`)
- هر ۵ قلم (P0-03 تا P0-07) پیاده‌سازی، تست، کامیت و (به‌جز آخرین، به‌علت انقضای توکن) پوش شد.

> ⚠️ وضعیت پوش: کامیت‌های P0-03 تا P0-06 روی GitHub رفت. کامیت P0-07 (`c00ddd4`) و همین گزارش
> فعلاً فقط локально کامیت‌اند چون توکن GitHub وسط کار منقضی شد (`GH_TOKEN is no longer valid`).
> با اتصال مجدد GitHub در Arena یک `git push` همه را بالا می‌برد؛ هیچ کاری گم نشده است.

---

## ۱. خلاصهٔ اقلام

| قلم | عنوان | تست جدید | نتیجه |
|-----|-------|----------|-------|
| P0-03 | یکپارچه‌سازی مجوز REST با Sync (`server/policy.js`) | `tests/policy.js` (۱۰) + `tests/policy-mutations.js` (۵ جهش) | ✅ ۱۰/۱۰، ۵/۵ کشته |
| P0-04 | قلمروِ کلاسیِ دبیر برای حضور | `tests/attendance-scope.js` (۶) | ✅ ۶/۶ |
| P0-05 | قلمروِ دبیر برای نمرات | `tests/grades-scope.js` (۶) | ✅ ۶/۶ |
| P0-06 | allowlist خودبه‌روزرسانی | `tests/user-self-update.js` (۸) | ✅ ۸/۸ |
| P0-07 | tenancy رسمیِ اداره (پایان global-pass) | `tests/edu-scope.js` (۷) | ✅ ۷/۷ |

## ۲. تغییرات کدی

**فایل‌های جدید:**
- `server/policy.js` — تک‌منبعِ مجوز REST: `authorize(user,op,{coll,id},payload)` (نقش از AUTHZ +
  قلمرو از inScope/tenancy، اصل 404-not-403)، `validate(op,coll,payload)` (شکل بدنه با ruleFor +
  aliasهای REST: `attendance.late`، `grades.base_version/type`، `users.profile_picture/email`)،
  `scope`، `selfFieldDenied` + ثابت `SELF_ALLOWED_FIELDS`.
- `server/tenancy.js` — `officeLevel/officeSchoolIds/inOfficeScope/resolveSchoolId`
  (استان→شهرستان→ناحیه→مدرسه؛ حل school_id از رکورد/data/زنجیرهٔ enrollment).

**بازنویسی‌ها:**
- هر ۵ ماژول `server/routes/*.js` (۲۳ هندلر) از `authorize()` می‌گذرد؛ پنج GET-list در
  `server/index.js` وضعیت‌محور (status-aware) شد.
- `server/sync.js`: گارد class-scope دبیر برای `attendance` و `grades` (P0-04/P0-05)، پایان
  global-pass اداره با tenancy (P0-07)، خط هم‌ترازی self ولی (P0-03)، `checkGeneric` از
  `server/validate.js` اکسپورت شد.
- `server/middleware/scope.js`: `filterByScope`/`checkSchoolScope` ده‌دار (tenancy) با پارامتر `store` (P0-07).
- `server/routes/users.js`: allowlist خودبه‌روزرسانی غیر-مدیر + اعمال `email`/`profile_picture` (P0-06).

## ۳. تغییرات رفتاریِ عمدی (هم‌ترازِ sync)

1. حذف حضور/نمره برای دبیرِ داخل‌قلمرو مجاز شد (مدل `del` — قبلاً فقط نقش دستی).
2. `edu_office` دیگر کاربر نمی‌سازد (در sync هم نمی‌توانست).
3. IEP دبیر فقط از `/students` (از `/users` → ۴۰۳).
4. بیرونِ قلمرو همیشه ۴۰۴ (اصل 404-not-403).
5. دبیر: حضور/نمره فقط در کلاس‌های تدریسی (homeroom/schedule) — در REST و sync.
6. خودبه‌روزرسانی غیر-مدیر فقط `full_name`/`profile_picture`/`email`؛ بقیه → ۴۰۳ `field_denied`.
7. اداره: خوانش و نوشتن فقط در tenancy خودش (پایان global-pass در هر سه لایه).
8. روی subject سخت‌گیری نشد (تست‌های committed در server15: C5a/C10a صراحتاً leniency می‌خواهند).

## ۴. گیت‌های نهایی (همه سبز)

- `tests/api/runner.js`: **۷/۷ سوئیت** (۳۹ تست)
- `tests/server1..18` (+sms): **همه سبز** (۳۱+۲۵+۱۹+۱۶+۱۴+۹+۱۵+۹+۱۰+۷+۹+۴۳+۹+۱۳+۴۰+۳۹+۷۰+۵۵)
- همهٔ `tests/server*-mutations.js`: **همهٔ جهش‌ها کشته شدند** (۲۰+۶+۲+۱+۴+۶+۶)
- تست‌های جدید پرامپت ۱: **policy ‏۱۰/۱۰‏، جهش ‏۵/۵‏، atts ‏۶/۶‏، grds ‏۶/۶‏، usu ‏۸/۸‏، edu ‏۷/۷‏**
- `node tools/check-authz.js`: **exit 0**
- `node tests/smoke.js`: **۵۴۷/۵۴۷** ✅

## ۵. کامیت‌ها (جداگانه برای هر قلم)

- `37bff94` — P0-03 (policy واحد + tenancy + بازنویسی ۵ روت + policy ‏۱۰/۱۰‏ + جهش ‏۵/۵‏) — پوش شد ✅
- `c9078e6` — P0-04 (class-scope حضور + atts ‏۶/۶‏) — پوش شد ✅
- `d751688` — P0-05 (class-scope نمرات + grds ‏۶/۶‏) — پوش شد ✅
- `d728c89` — P0-06 (allowlist خود + usu ‏۸/۸‏) — پوش شد ✅
- `c00ddd4` — P0-07 (tenancy اداره + edu ‏۷/۷‏) — локال، در انتظار پوش ⏳
- (همین گزارش در کامیت بعدی локال ثبت می‌شود و با همان پوش بالا می‌رود)

## ۶. اجرای تست‌ها (بازتولید)

```bash
node tests/api/runner.js            # هر ۷ سوئیت API
node tests/policy.js                # ۱۰/۱۰
node tests/policy-mutations.js      # ۵/۵ کشته
node tests/attendance-scope.js      # ۶/۶
node tests/grades-scope.js          # ۶/۶
node tests/user-self-update.js      # ۸/۸
node tests/edu-scope.js             # ۷/۷
node tools/check-authz.js           # exit 0
node tests/smoke.js                 # ۵۴۷/۵۴۷
for f in tests/server1.js tests/server2.js ... tests/server18.js; do node $f; done
```

## ۷. نکات فنی برای ادامه‌دهنده

- **درس ابزار:** فراخوانی‌های موازی `edit_file` روی «یک فایل» مسابقه می‌دهند (last-write-wins) —
  در این نشست چند ویرایش همین‌طور گم و با بازنویسی اتمی بازیابی شد. تک‌تک + `grep` تأییدی،
  یا patch اتمی با python.
- **نکتهٔ محیطی:** `server15-mutations` یک‌بار با S0b قرمز شد؛ علت سرورهای یتیم روی پورت‌های
  ثابت 9001/9002 بود (پس از kill: سبز). ربطی به کد نداشت. این سوئیت گاهی فرزند یتیم به‌جا می‌گذارد.
- **مرز آگاهانه:** self در `/api/sync` هم‌چنان `role_denied` است (رفتار M3d پین شد)؛
  خودبه‌روزرسانی فقط قرارداد REST است (کلاینت PWA از `/api/v1/users` استفاده نمی‌کند).
- رشتهٔ tenancy اداره: کاربر ← `office_id` ← رکورد `offices` (province/county/district) ←
  مدرسه‌ها. سطح از خاص‌به‌عام: district → county → province.
