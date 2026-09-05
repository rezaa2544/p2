# راهنمای توسعه

## راه‌اندازی

```bash
cd payesh
npm run dev     # http://localhost:3000 — با بازسازی خودکار
```

هیچ `npm install` لازم نیست؛ پروژه صفر وابستگی دارد.

## گردش کار

```bash
npm run dev          # توسعه با بازسازی خودکار
npm run build        # ساخت dist/payesh.html + به‌روزرسانی index.html
npm run build:check  # تأیید یکسانی بیت‌به‌بیت خروجی
npm test             # اجرای همه‌ی تست‌ها
```

> ⚠️ **هرگز `index.html` را مستقیم ویرایش نکنید.** آن فایل خروجی build است و با اجرای بعدی بازنویسی می‌شود. همیشه در `src/` تغییر دهید.

## افزودن ماژول جدید

**۱. فایل را بسازید** با شماره‌ی ترتیبی مناسب:

```bash
touch src/js/25-my-feature.js
```

**۲. در `_order.json` ثبت کنید** — جای درست در ترتیب مهم است:

```json
[
  "…",
  "24-phase-9-edu-office.js",
  "25-my-feature.js"
]
```

**۳. کد را بنویسید:**

```js
/* ============================ قابلیت من ============================ */

function viewMyFeature(){
  return `
    <div class="card">
      <h3>عنوان</h3>
      ${db.items.map(i=>`<div>${esc(i.name)}</div>`).join('')}
    </div>`;
}
```

**۴. اگر صفحه‌ی جدید است، route اضافه کنید** در `src/js/05-router.js`:

```js
case 'myfeature': return viewMyFeature();
```

و در `NAV` و `TITLES` (فایل `07-shell.js`) ثبتش کنید.

**۵. تست بگیرید:**

```bash
npm test
```

## قراردادهای کدنویسی

### امنیت خروجی
همیشه ورودی کاربر را با `esc()` فرار دهید:

```js
`<div>${esc(user.name)}</div>`   // ✅
`<div>${user.name}</div>`        // ❌ آسیب‌پذیر به XSS
```

### رویدادها
از event delegation استفاده کنید، نه `onclick`:

```js
`<button class="btn" data-act="save-user" data-id="${u.id}">ذخیره</button>`
```

و در `19-actions.js` مدیریتش کنید.

### تاریخ
همیشه ISO میلادی ذخیره کنید، شمسی فقط برای نمایش:

```js
const iso = jalaliToIso(input.value);   // ورودی کاربر → ذخیره
el.textContent = isoToJalali(rec.date); // ذخیره → نمایش
```

### تغییر داده
مستقیم `db` را دستکاری نکنید؛ از `applyOp` استفاده کنید تا در لاگ ثبت شود:

```js
applyOp({ type:'add', coll:'grades', obj:{…} });   // ✅
db.grades.push({…});                               // ❌ ذخیره نمی‌شود
```

### استایل
از متغیرهای CSS موجود استفاده کنید:

```css
color: var(--primary);      /* نه #1668f0 */
background: var(--surface); /* نه #fff */
```

پالت کامل در ابتدای `src/styles/base.css` تعریف شده است.

### ریسپانسیو
هر صفحه‌ی جدید باید در سه عرض تست شود: **۳۲۰px، ۳۷۵px، ۴۱۴px**.
قواعد موبایل در `src/styles/mobile.css` است.

## ساختار داده

دسترسی به مجموعه‌ها:

```js
db.users, db.schools, db.classes, db.subjects, db.enrollments,
db.attendance, db.grades, db.discipline, db.schedule,
db.announcements, db.notifications, db.leaves, db.messages,
db.tuitions, db.installments, db.transactions,
db.exams, db.exam_terms, db.exam_duties, db.corrections,
db.teacher_schools, db.parent_links, db.parent_subscriptions,
db.parent_verifications, db.subscription_payments,
db.provinces, db.counties, db.districts, db.offices, db.app_settings
```

توابع کمکی:

```js
byId('users', 5)        // یافتن رکورد
add('grades', {…})      // افزودن با id خودکار
nextId('grades')        // id بعدی
visibleClasses()        // کلاس‌های قابل‌مشاهده برای کاربر فعلی
```

## اشکال‌زدایی

**بازنشانی داده به حالت اولیه:**
```js
resetAll()   // در کنسول مرورگر
```

**دیدن لاگ تغییرات:**
```js
JSON.parse(localStorage.getItem(LOG_KEY))
```

**ورود سریع:** در صفحه‌ی ورود روی حساب‌های نمونه کلیک کنید (رمز همه: `123456`).

## تست

`tests/run.js` این موارد را بررسی می‌کند:

- وجود همه‌ی فایل‌ها و پوشه‌های ساختاری
- ثبت بودن همه‌ی ماژول‌ها در `_order.json`
- یکسانی بیت‌به‌بیت خروجی build
- **آفلاین بودن** — نبود هر ارجاع خارجی
- تعریف بودن تابع متناظر هر route
- سلامت نحوی کل جاوااسکریپت

`tests/simulation.js` (jsdom) یک شبیه‌سازی جامع است: ۳۵ سناریو روی
باندل واقعی — چند مدرسه، چند نقش، حالت‌های زنگ و چالش‌های
غیرمنتظره. بعد از تغییرات بزرگ، کنار smoke اجرا شود:
`node tests/simulation.js`.

تست جدید را در گروه مناسب اضافه کنید:

```js
test('توضیح تست', () => {
  assert(شرط, 'پیام خطا');
});
```

## چک‌لیست پیش از انتشار

- [ ] `npm test` بدون خطا
- [ ] `npm run build:check` موفق
- [ ] در سه عرض موبایل تست شد
- [ ] با هر ۶ نقش کاربری بررسی شد
- [ ] کنسول مرورگر بدون خطا
- [ ] `PROJECT_NOTES.md` به‌روز شد
