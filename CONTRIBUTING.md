# راهنمای برنامه‌نویس

> ⭐ **دو اصل همیشگی پروژه**
> ۱. با هر تغییری، این سند و `docs/AI_PROMPT.md` **در همان نوبت** به‌روز شوند.
> ۲. ساختار کد طوری بماند که تازه‌وارد بدون پرسیدن بخش موردنظرش را پیدا کند.

> هدف این سند: اگر برنامه‌نویسی تازه وارد پروژه شد، **در کمتر از ده دقیقه**
> بفهمد کد کجاست، چطور تغییرش دهد و چطور مطمئن شود چیزی نشکسته.

---

## در سه دقیقه شروع کنید

```bash
npm install            # فقط برای آزمون‌ها لازم است
npm test               # باید ۳۱ و ۱۵۳ سبز باشد
node build.js          # ساخت خروجی تک‌فایلی
node scripts/dev-server.js   # سرور توسعه روی درگاه ۳۰۰۰
```

سه قانون که هرگز نباید شکسته شوند:

| قانون | چرا |
|---|---|
| **`index.html` را دستی ویرایش نکنید** | خروجی ساخته‌شده است؛ تغییرتان با اجرای بعدی `build.js` پاک می‌شود |
| **همیشه در `src/` کار کنید** سپس `node build.js` | تنها راه درست |
| **ماژول تازه را در `src/js/_order.json` ثبت کنید** | ثبت‌نشده اصلاً وارد خروجی نمی‌شود |

---

## می‌خواهم فلان چیز را عوض کنم — کجا بروم؟

### صفحه‌ها (هر صفحه = یک تابع با پیشوند `view`)

| صفحه در برنامه | تابع | فایل |
|---|---|---|
| داشبورد | `viewDashboard` | `08-dashboard.js` |
| مدارس | `viewSchools` | `09-schools.js` |
| کاربران | `viewUsers` | `10-users.js` |
| کلاس‌ها · دروس | `viewClasses` · `viewSubjects` | `11-classes-subjects.js` |
| حضور و غیاب | `viewAttendance` | `12-attendance.js` |
| نمرات | `viewGrades` | `13-grades.js` |
| انضباطی | `viewDiscipline` | `14-discipline.js` |
| برنامه هفتگی | `viewSchedule` | `15-schedule.js` |
| اطلاعیه‌ها | `viewAnnouncements` | `16-announcements.js` |
| کارنامه · فرزندان | `viewRecord` · `viewChildren` | `17-student-record.js` |
| اعلان · مرخصی · تقویم · گفتگو · شهریه | ۵ تابع | `20-communication-finance.js` |
| دبیران · امتحانات · خانواده · اصلاحات | ۴ تابع | `21-exams-teachers-family.js` |
| اشتراک · قفل · پنل اشتراک | ۳ تابع | `23-subscription.js` |
| تقسیمات · ادارات · داشبورد اداره | ۴ تابع | `24-edu-office.js` |
| چرخهٔ تحصیلی | `viewLifecycle` | `31-student-lifecycle.js` |
| افت تحصیلی · جلسات · رشد | ۳ تابع | `32-atrisk-meetings-growth.js` |
| فرم‌ها و پیامک | `viewFormsSms` | `33-forms-sms.js` |
| ورود اکسل | `viewImport` | `34-excel-import.js` |
| مالی سراسری · سلامت سامانه | `viewFinance` · `viewHealth` | `35-superadmin.js` |
| سابقه تغییرات · بازدید و بار | `viewAudit` · `viewActivity` | `36-audit-activity.js` |
| شناسنامه دانش‌آموز (تب) | `studentProfileCard` | `17-student-record.js` |
| وضعیت مدارس · خروجی · اطلاعیه سراسری | `schoolsOverview` · `exportData` · `broadcastAnnouncement` | `37-admin-tools.js` |
| پلان فروش · پشتیبان و بازیابی | `viewPlans` · `buildBackup` · `restoreBackup` | `38-plans-backup.js` |
| اشتراک مشترک پدر و مادر | `studentSubscription` · `effectiveParentAccess` | `23-subscription.js` |

**راه سریع‌تر:** نام صفحه را در برنامه ببینید، بعد `grep` بزنید:
```bash
grep -rn "function viewGrades" src/js/
```

### کارهای رایج

| می‌خواهم… | کجا |
|---|---|
| دکمه‌ای را کارا کنم | `19-actions.js` — شیء `A` داخل شنوندهٔ کلیک |
| آیتم منو اضافه کنم | `05-router.js` — ثابت `NAV` |
| عنوان صفحه بگذارم | `05-router.js` — ثابت `TITLES` |
| صفحهٔ تازه به مسیریاب اضافه کنم | `07-shell.js` — `renderRoute` |
| به نقشی اجازهٔ دیدن صفحه بدهم | `30-authz.js` — `EXTRA_ROUTES` |
| اکشنی را به نقشی محدود کنم | `30-authz.js` — `ACTION_ROLES` |
| مجموعهٔ دادهٔ تازه بسازم | `02-demo-data.js` — شیء `db` |
| داده را تغییر دهم | `insert` · `update` · `remove` (هرگز `db.x.push`) |
| کوئری نقش‌محور بنویسم | `04-queries.js` |
| ایندکس بسازم | `28-indexes.js` |
| مودال یا فرم بسازم | `18-modals.js` |
| فیلتر جمع‌شونده بگذارم | `25-filters.js` |
| تاریخ شمسی کار کنم | `22-jalali-calendar.js` |
| نام فارسی یک مجموعه داده بگذارم | `36-audit-activity.js` — `COLL_FA` |
| عملیاتی را «حساس» علامت بزنم | `36-audit-activity.js` — `SENSITIVE` |
| ستون تازه‌ای به ورود اکسل اضافه کنم | `34-excel-import.js` — `IMP_FIELDS` (مترادف‌ها را هم بنویسید) |
| فیلدی را در ثبت نهایی ذخیره کنم | `34-excel-import.js` — `IMP_EXTRA_FIELDS` |
| فیلدی را در شناسنامه نشان دهم | `17-student-record.js` — `studentProfileCard` |
| ستونی به خروجی اکسل اضافه کنم | `37-admin-tools.js` — `exportData` |
| پلان فروش تازه‌ای اضافه کنم | `38-plans-backup.js` — `PLAN_DEFS` |
| قاعده‌ای به اعتبارسنجی قیمت بیفزایم | `38-plans-backup.js` — `validatePlanSettings` |

---

## ساختار پوشه

```
src/
 ├─ head.html            بخش <head>
 ├─ body.html            اسکلت اولیهٔ صفحه
 ├─ styles/              سه فایل شیوه‌نامه: فونت، پایه، موبایل
 └─ js/
     ├─ _order.json      ⚠️ ترتیب بارگذاری — منبع حقیقت
     └─ ۳۵ ماژول
build.js                 چسبانندهٔ همه‌چیز به index.html
tests/run.js             ۳۱ آزمون ایستا (بدون مرورگر)
tests/smoke.js           ۱۵۳ آزمون رفتاری (با jsdom)
docs/AI_PROMPT.md        سند مرجع کامل پروژه
```

### ترتیب بارگذاری مهم است

شمارهٔ فایل‌ها لزوماً ترتیب بارگذاری **نیست**؛ ترتیب واقعی در `_order.json`
است. دلیلش وابستگی‌هاست:

```
۱. پایه            helpers → demo-data → indexes → persistence → queries → scope
۲. مسیریابی        router → filters → curriculum → sync → login → authz → shell
۳. صفحه‌ها          dashboard … superadmin
۴. کنترلگر         actions  ← آخر از همه، چون به همهٔ صفحه‌ها نیاز دارد
```

دو قاعدهٔ وابستگی که رعایتشان الزامی است:
- `28-indexes.js` باید **پیش از** `03-persistence.js` بیاید
- `30-authz.js` باید **پس از** `05-router.js` بیاید (به `NAV` نیاز دارد)

---

## افزودن یک صفحهٔ تازه — گام‌به‌گام

فرض کنید می‌خواهید صفحهٔ «کتابخانه» بسازید.

**۱. ماژول بسازید** — `src/js/36-library.js`
```js
/* ═══════ کتابخانه — امانت کتاب ═══════ */
function viewLibrary(){
  return '<div class="card"><div class="card-head"><h3>کتابخانه</h3></div>'
       + '<div class="card-body">…</div></div>';
}
```

**۲. در `_order.json` ثبت کنید** — پیش از `19-actions.js`

**۳. به مسیریاب اضافه کنید** — در `07-shell.js`:
```js
case 'library': return viewLibrary();
```

**۴. عنوان و منو** — در `05-router.js`:
```js
const TITLES={ library:['کتابخانه','امانت و بازگشت کتاب'], … }
// و در NAV نقش موردنظر:  ['library','📚','کتابخانه']
```

**۵. مجوز** — در `30-authz.js`، اگر در منو نیست به `EXTRA_ROUTES` اضافه کنید.

**۶. آزمون بنویسید** — در `tests/smoke.js`

**۷. بسازید و بیازمایید:**
```bash
node build.js && npm test
```

---

## قواعدی که کد را سالم نگه می‌دارند

### امنیت

```js
// ✅ همیشه
'<b>' + esc(user.full_name) + '</b>'
// ❌ هرگز
'<b>' + user.full_name + '</b>'
```
هر متنی که از کاربر می‌آید باید از `esc` بگذرد. آزمون‌ها ۱۷۴ ترکیب
نقش×صفحه را با چهار نوع حملهٔ تزریق می‌سنجند.

مجوز در **دو** لایه اعمال می‌شود و هر دو لازم است:
`canRoute` برای دیدن صفحه · `canAction` برای انجام عمل.

### کارایی

```js
// ❌ جستجوی خطی داخل حلقه — رفتار درجه‌دوم
students.forEach(s => db.grades.filter(g => g.student_id === s.id));

// ✅ از ایندکس استفاده کنید
const gi = idxGradesByStudent();
students.forEach(s => gi.get(s.id) || []);
```

```js
// ❌ صدها نوشتن پیاپی — رابط چند ثانیه قفل می‌شود
rows.forEach(r => insert('users', r));

// ✅ در یک دسته
batchWrites(() => rows.forEach(r => insert('users', r)));
```

### نمایش

| کار | تابع درست |
|---|---|
| عدد فارسی | `fa(12)` → «۱۲» |
| رشتهٔ حاوی رقم | `faD('1404-05')` |
| مبلغ | `rial(120000)` · `rialShort(...)` برای خلاصه |
| تاریخ شمسی | `jalali('2026-03-15')` |
| کارت آمار | `statCard(icon, value, label, tone)` |
| حالت خالی | `empty(emoji, title, desc)` |

---

## آزمون

```bash
npm test                  # هر دو مجموعه
node tests/run.js         # فقط ایستا — سریع
node tests/smoke.js       # فقط رفتاری — خروجی کامل را ببینید
```

الگوی نوشتن آزمون:
```js
test('توضیح فارسی آنچه بررسی می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.route='grades'");
  const out = W('renderRoute()');
  assert(out.length > 200, 'صفحه رندر نشد');
});
```

سه ابزار در دسترس است: `W(expr)` برای اجرای عبارت در مرورگر مجازی،
`assert(شرط, پیام)` و `test(نام, تابع)`.

> ⚠️ داخل رشتهٔ آزمون، `\n` به خط جدید تبدیل **نمی‌شود**.
> از `String.fromCharCode(10)` استفاده کنید.

> ⚠️ کاربر را با **نام** جستجو نکنید؛ دادهٔ نمونه نام تکراری دارد.
> با شناسه یا کد ملی جستجو کنید.

> ⚠️ **اشتراک به دانش‌آموز تعلق دارد، نه به ولی.** اگر پدر پرداخت کرده،
> مادر هم دسترسی دارد. برای بررسی دسترسی از `effectiveParentAccess`
> استفاده کنید، نه `subOf` مستقیم.

> ⚠️ هنگام ساخت خروجی csv حتماً پیشوند BOM بگذارید و سلول‌هایی را که با
> `=` یا `+` شروع می‌شوند خنثی کنید (تابع `csvCell` این کار را می‌کند).

> ⚠️ فیلد تازه‌ای که وارد می‌کنید باید جایی **دیده** هم بشود. اگر فقط
> ذخیره شود و در هیچ صفحه‌ای نمایش داده نشود، عملاً بی‌فایده است.

> ⚠️ داخل تابع نما متغیر محلی به نام `f` نگذارید — تابع سراسری سازندهٔ
> فیلد فرم را می‌پوشاند و خطای «f is not a function» می‌دهد.

---

## پیش از ارسال تغییر

```bash
node build.js            # بازسازی
npm test                 # هر دو مجموعه سبز
node build.js --check    # یکسانی بیت‌به‌بیت
```

و طبق قاعدهٔ ثابت پروژه: **هر تغییری باید در `docs/AI_PROMPT.md` هم ثبت شود.**

---

## حساب‌های نمایشی

رمز همه: `123456`

| نقش | نام کاربری |
|---|---|
| سوپرادمین | `superadmin` |
| ادارهٔ آموزش | `edu_kurdistan` · `edu_baneh` · `edu_tehran` |
| مدیر | `manager1` · معاون: `deputy1` |
| دبیر | `teacher1_1` |
| دانش‌آموز | `student1` |
| ولی | `parent1` · چندفرزندی: `parent_multi` |
