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

## سرور (مرحلهٔ ۱ — ۲۰۲-۰۹-۶)

سرورِ مرحلهٔ ۱ فقط با کتابخانهٔ استانداردِ نود نوشته شده است — صفر وابستگی.
قراردادِ الزام‌آورِ آن `docs/SERVER_SECURITY_CONTRACT.md` است.

```bash
node server/seed.js    # ساختِ server/data/payesh.json از دنیای دمو (یک‌بار)
node server/index.js   # http://0.0.0.0:3000
```

### TLS واقعی (مرحلهٔ ۲ — ۲۰۲۶-۰۹-۰۶)

گواهیِ self-signed **فقط با stdlib** ساخته می‌شود (بدون openssl — همان DER دست‌ساز که `tests/server4.js` با `X509Certificate` می‌خواند):

```bash
node server/tls-cert.js /tmp/payesh-tls payesh-local   # → tls.crt + tls.key (CN دلخواه)
export PAYESH_TLS_CERT=/tmp/payesh-tls/tls.crt
export PAYESH_TLS_KEY=/tmp/payesh-tls/tls.key
node server/index.js   # https://0.0.0.0:3000 — HSTS + کوکیِ Secure خودکار
```

- یکی‌شان بدونِ دیگری، یا فایلِ غایب = راه‌اندازی **شکسته** با پیامِ روشن (خروج از فرآیند).
- گواهیِ production (رسمی) بعداً — این گواهی فقط برای مرحلهٔ محلی/تست است و مرورگرها آن را نامعتبر می‌دانند (در تست‌ها `rejectUnauthorized:false`).
- endpointِ تازه: `GET /api/bell/now` (پُلِ دوره‌ای ۱۳.۴ — scope فقط از نشست).
- حذفِ حساب (قفل ۹.۵): `POST /api/auth/delete-account` (با نشست) + صفحهٔ وبِ جداگانهٔ خودکفا `/account-deletion` (فرمِ شماره+کد ملی+کد → حذف).

متغیرهای محیطی:

| متغیر | پیش‌فرض | کاربرد |
|---|---|---|
| `PORT` | `3000` | پورت گوش‌دهی |
| `HOST` | `0.0.0.0` | هاست گوش‌دهی |
| `PAYESH_STORE` | `server/data/payesh.json` | فایلِ پایگاه (گیت‌ایگنور) |
| `PAYESH_AUDIT` | `server/data/audit.log` | لاگِ آدیتِ append-only |
| `PAYESH_KEY` | `server/data/jwt.key` | کلیدِ JWT (خود ساخته می‌شود) |
| `PAYESH_JWT_SECRET` | — | اگر خورده شود، به‌جای کلیدِ فایل |
| `PAYESH_DEMO_CODE` | `1` | `1`: کدِ ارسال‌شده در پاسخِ دمو بازتاب می‌یابد (فقط فازِ دمو) · `0`: کد مخفی می‌ماند |
| `PAYESH_HTTPS` | `0` | `1`: کوکیِ نشست `Secure` می‌شود (پشت TLS واقعی) |
| `PAYESH_TLS_CERT` | — | مسیرِ گواهیِ PEM — با `PAYESH_TLS_KEY` سرور واقعاً `https` می‌شود (مرحلهٔ ۲) |
| `PAYESH_TLS_KEY` | — | مسیرِ کلیدِ خصوصیِ PEM (همراهِ `PAYESH_TLS_CERT`) |

نکته‌ها:

- **کلاینت فقط وقتی «سروری» می‌شود که خودِ برنامه از سرور سرو شده باشد.**
  با `file://` یا `about:blank` هیچ درخواستی نمی‌رود و رفتار عین دموِ آفلاین
  است (گاردها: `tests/server2.js` بخش‌های A/C).
- `server/data/` در `.gitignore` است — پایگاه، آدیت و کلید هرگز در گیت نیستند.
- آزمون‌ها: `node tests/server1.js` (۳۰ تستِ سمت سرور) ·
  `node tests/server2.js` (۲۵ تستِ کلاینت با fetch استاب) ·
`node tests/server-mutations.js` (۱۵ جهش — همه باید بکشند).
  `node tests/server3.js` (۱۹ تستِ سر به سر: سرورِ واقعی + کلاینتِ واقعی با HTTP واقعی —
  برای این تست فقط jsdom لازم است، نه سرور جدا) ·
  `node tests/server4.js` (۱۶ تستِ TLS واقعی: گواهی، https، HSTS، CSP، کوکی‌ها) ·
  `node tests/server5.js` (۱۴ تستِ پُلِ دوره‌ای: scope سرور + تیکِ کلاینت) ·
  `node tests/server6.js` (۹ تستِ گاردِ روزِ غیرحضوریِ سمتِ سرور — بند ۱۳.۱) ·
  `node tests/server7.js` (۱۵ تستِ حذفِ حساب — قفل ۹.۵: سرور + کلاینت + صفحهٔ وب)

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

`tests/diag2.js` موتور خودتعمیر دیاگ را می‌سنجد: برای هر عیب، مشکل را واقعی می‌سازد، تشخیص/تعمیر/بازگردانی را روی داده راستی‌آزمایی می‌کند (۱۰ سناریو).

`tests/security.js` پنتست است: سطح بیرونی (فرم ورود، نشست، احراز)، fuzz سیاه‌باکسِ XSS ذخیره‌شده روی ۷ میدان آزاد، و نشت داده از کانال‌های خروجی (فایل پشتیبان). قرمزهای دستهٔ `server` بلوک‌کننده‌های شناخته‌شدهٔ پیش‌از-سرورند با exploit زنده — کد خروج فقط قرمزهای `client` را می‌شکند.

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
