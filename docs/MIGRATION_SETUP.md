# مدیریتِ نسخهٔ پایگاه‌داده (Migration)

> ابزار: **node-pg-migrate** + فایل‌هایِ SQL نسخه‌دار در `migrations/`.
> جدولِ رهگیری: `pgmigrations`. رانتایمِ سرور بدونِ تغییر، بدونِ وابستگیِ تازه می‌ماند
> (node-pg-migrate در devDependencies است؛ migration از ایستگاهِ استقرار/CI اجرا می‌شود).

## ۱. فایل‌ها

| فایل | نقش |
|---|---|
| `migrations/001_initial.sql` | اکستنشن‌ها + جدول‌هایِ internal + هر ۸۱ جدولِ `model.json` (schools اول — وگرنه FK می‌شکند) |
| `migrations/002_indexes.sql` | ۱۹۰ ایندکسِ تک‌جدولی + کامپوزیت (Tenant Isolation رویِ `school_id`) |
| `scripts/migrate.js` | لفافِ fail-closed: گاردِ DATABASE_URL، ماسکِ رمز در لاگ، قفلِ down در production |

هر فایل دو بخش دارد (`-- Up Migration` / `-- Down Migration`) و **پس از اعمال، فریز است**:
تغییرِ تازه = فایلِ تازه (`npm run migrate:create <name>`).

## ۲. دستورها

```bash
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DBNAME'

npm run migrate:status     # applied/pending + هشدارِ بازنویسیِ تاریخچه
npm run migrate:up         # اعمالِ همهٔ درانتظارها (هر فایل در تراکنش)
npm run migrate:down       # برگرداندنِ ۱ قدم (پیش‌فرضِ امن)
npm run migrate:create add_users_email   # ساختِ 003_add_users_email.sql
```

قواعدِ امن:
- بدونِ `DATABASE_URL` هیچ دستوری اجرا نمی‌شود (حتی `status`).
- `down` در `NODE_ENV=production` فقط با `--force` صریح.
- پیش از `down` در تولید: بکاپ (`server8`).

## ۳. استقرارِ دومرحله‌ای (schema، بعد data)

1. `npm run migrate:status` → `npm run migrate:up` (اسکیما).
2. بارِ داده از استورِ JSON (یک‌بار، idempotent با `ON CONFLICT`):
   ```bash
   DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DBNAME' node tools/migrate-to-pg.js --execute
   ```
3. راستی‌آزمایی: شمارشِ جدول‌ها (`users` و `schools` باید با `server/data/payesh.json` بخوانند).

## ۴. تست (بدونِ نیاز به سرورِ PG)

```bash
node tests/migration.js            # ۸ تست: مارکر/پوششِ مدل + up/down واقعی روی PGlite
node tests/migration-mutations.js  # ۳ جهش (گاردِ URL، ماسکِ رمز، مارکرِ Down)
```

نکته‌هایِ فنیِ ثبت‌شده هنگامِ پیاده‌سازی:
- اکستنشن‌ها (`uuid-ossp`/`btree_gist`) فقط در PG واقعی اعمال می‌شوند؛ PGlite آن‌ها را ندارد
  (تست بودنشان در فایل را می‌سنجد و بقیه را اجرا می‌کند).
- ایندکسِ `sync_conflicts` عمداً حذف شد: این کالکشن هنوز در `authz/model.json` رسمی نشده
  (follow-up: رسمی‌سازیِ مدل + migration تازه).
- باگِ نهفتهٔ ابزارِ قدیمی رفع شد: ترتیبِ ساختِ جدول‌ها schools-first شد (وگرنه FKها می‌شکستند).
