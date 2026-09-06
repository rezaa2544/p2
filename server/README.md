# نسخهٔ سرور — **ساخته‌شده و آزمایش‌شده**

> به‌روزرسانیِ ۲۰۲۶-۰۹-۰۶ (دور ۸۱): این پوشه دیگر «رزرو» نیست —
> سرورِ واقعی با **صفرِ وابستگیِ خارجی** (فقط Node stdlib) پیاده و
> قفل‌شده با آزمون است. قراردادِ فنی: `docs/SERVER_SECURITY_CONTRACT.md`،
> استقرارِ تولید: `docs/DEPLOY.md`.

## اجرا

```bash
node build.js          # یک‌بار: ساختِ index.html (وب)
node server/index.js   # وب + API + استورِ JSON + بکاپِ خودکار
```

متغیرهایِ محیطی: `PORT`، `HOST`، `PAYESH_STORE`، `PAYESH_AUDIT`،
`PAYESH_JWT_SECRET` (یا `PAYESH_KEY`)، `PAYESH_HTTPS` + `PAYESH_TLS_CERT`/
`PAYESH_TLS_KEY`، `PAYESH_BACKUP_EVERY_HOURS`، `PAYESH_DEMO_CODE`
(در تولید حتماً `0`). جدولِ کامل با «چرا»ها: `docs/DEPLOY.md` §۳.

## سرویس‌ها

- `/` و `/USER_GUIDE.html` — فایل‌هایِ وب (ساخته‌شده)
- `/api/health` — سلامت
- `/api/auth/*` — ورود (شماره + کد + کد ملی)، JWT HS256 سفت‌وسخت
- `/api/sync` — همگام‌سازی (fail-closed + دامنهٔ نقش + سقف ۵۰۰ عملیات)
- `/api/students/:id`، `/api/bell/now`
- `/api/admin/{backup,restore}` — فقط superadmin

## تست

`tests/server1.js` تا `tests/server10.js` (۱۵۴ بررسی) +
`tests/sim_full3.js` (شبیه‌سازیِ سرور، ۲۴ بررسی).
