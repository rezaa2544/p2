# گزارشِ نهاییِ چت ۱ — هر ۳ وظیفهٔ زیرساخت (۱۹/۰۶/۱۴۰۵ / 2026-09-09)

> شاخه: `arena/01a0827b-p2` · هر ۳ کامیت پوش شده · درخت تمیز.
> مبنا: `6529d4e` (رفعِ jsdom 30) → رأس: `7dc01f2`.

## ۱. جدولِ کامیت‌ها

| # | وظیفه | کامیت | پیام |
|---|---|---|---|
| ۱ | Migration Tool | `bab7f3a` | `feat(migrations): versioned PG migration tool with PGlite-tested up/down` |
| ۲ | Static Analysis + Secret Scan | `9754c48` | `feat(ci): wire secret-scan into CI via tools wrapper + scan:secrets` |
| ۳ | Canary Deployment Plan | `7dc01f2` | `docs: add canary deployment plan` |

## ۲. وظیفهٔ ۱ — ابزارِ migration نسخه‌دار ✅

- **انتخاب:** `node-pg-migrate@9` (تأیید با CHANGELOG/مستنداتِ رسمی: فایلِ تکیِ `.sql`
  با مارکرهایِ `-- Up/Down Migration` از v4 پشتیبانی می‌شود) + `@electric-sql/pglite`
  برایِ تستِ بدونِ سرور. رانتایمِ سرور دست‌نخورده (فقط devDep).
- **فایل‌ها:** `migrations/001_initial.sql` (اکستنشن‌ها + ۳ جدولِ internal + هر ۸۱ جدولِ
  `model.json`، فریز) + `migrations/002_indexes.sql` (۱۹۰ ایندکس، فریز)؛
  `scripts/migrate.js` (گاردِ fail-closedِ `DATABASE_URL`، ماسکِ `***` برایِ رمز در لاگ،
  قفلِ `down` در production با `--force`، هشدارِ بازنویسیِ تاریخچه) + ۴ اسکریپتِ `migrate:*`.
- **دو باگِ نهفتهٔ ابزارِ قدیمی (پیدا و رفع شد):** ‏(۱)‏ جدولِ `schools` پنجاه‌وهفتم بود و
  FKهایِ inline رویِ PG واقعی می‌شکستند ← schools-first؛ ‏(۲)‏ ایندکسِ `sync_conflicts` به
  جدولی اشاره می‌کرد که در `model.json` نیست ← حذف با NOTE (follow-up: رسمی‌سازیِ مدل).
- **تست:** `tests/migration.js` ‏۸/۸‏ (مارکر/پوششِ مدل + up/down واقعی رویِ PGlite:
  ۸۴ جدول، ۲۷۴ ایندکس، ۶۱ FK، برگشتِ کامل به صفر) + `tests/migration-mutations.js` ‏۳/۳‏ کشته.
- **مستندات:** `docs/MIGRATION_SETUP.md` (تازه) + `docs/DEPLOY.md` §۶-ب و ردیفِ ۱۱ چک‌لیست.
- **گیت‌ها:** smoke ‏۵۴۷/۵۴۷‏ · authz ‏۰‏ · build:check سبز · secret-scan ‏۱۱/۱۱‏.

## ۳. وظیفهٔ ۲ — تحلیلِ ایستا (secret-scan در CI) ✅

- **یافته:** مسیرِ `tools/secret-scan.js` در پرامپت وجود نداشت؛ منطق فقط در
  `tests/secret-scan.js` (۱۱ چکِ R96) بود و CI اصلاً اسکن نمی‌کرد.
- **کار:** لفافِ نازکِ `tools/secret-scan.js` (بدونِ تکثیرِ منطق: واگذاری + پاسِ
  دست‌نخوردهٔ کدِ خروج) + اسکریپتِ `npm run scan:secrets` + گامِ تازه در
  `.github/workflows/node.js.yml` پس از `npm test`.
- **تست:** `tests/scanwrap.js` ‏۲/۲‏ (هم‌ارزیِ خروجِ ۰؛ انتشارِ شکست با فیکسچرِ برنامه‌ای‌ساخته‌شده
  + پاک‌سازیِ تضمینی) + `tests/scanwrap-mutations.js` ‏۲/۲‏ کشته. سئوت خودکار در رانر کشف می‌شود.
- **گیت‌ها:** smoke ‏۵۴۷/۵۴۷‏ · authz ‏۰‏ · scan:secrets سبز.

## ۴. وظیفهٔ ۳ — طرحِ استقرارِ مرحله‌ای ✅ (صفر تغییر در `src`/`server`/`tests`)

- **سند:** `docs/CANARY_DEPLOYMENT.md` (تازه: قیدها، استراتژی، هلث، SLO، رولبک، اسکیل،
  ران‌بوکِ گام‌به‌گام، مرجعِ اسکریپت‌ها، چک‌لیست، «آنچه ادعا نمی‌کند») + اشاره در `DEPLOY.md` §۷.
- **صادق‌سازی‌هایِ معماری** (انحرافِ عمدی از پرامپت به نفعِ واقعیتِ کد):
  هلث فقط `GET /api/health` است (liveness/readiness/startup رویش نگاشت شد)؛ استورِ JSON
  تک‌نویسنده است ← شکافِ درصدی فقط در مسیرِ PG، رویِ JSON فقط cutover؛ Redis وجود ندارد؛
  آروان در مسیرِ درخواست نیست؛ Rollback هرگز `migrate:down` نمی‌زند؛ HPA نداریم
  (هشدار + scale-out دستی + نگهبان‌هایِ systemd).
- **اسکریپت‌هایِ توصیه‌شده** (هر دو `+x`، ‏`bash -n`‏ سبز): `scripts/canary-deploy.sh`
  (canary مرحله‌ای با گیتِ SLO از لاگِ nginx + cutover امن با symlinkِ `.env.active` +
  abort خودکار) و `scripts/rollback.sh` (= ‏`npm run rollback`‏). قرارداد: `set -euo pipefail`،
  گیتِ `nginx -t` پیش از هر reload، حالتِ `DRY_RUN=1`.
- **راستی‌آزمایی:** rollback در DRY_RUN کلِ مسیر را با exit ‏۰‏ طی کرد؛ canary در DRY_RUN
  رویِ غیبتِ Green با abortِ fail-closed ایستاد (پس از رفعِ آلودگیِ stdout در `snapshot()`).
- **گیت‌ها (راستی‌آزمایی):** smoke ‏۵۴۷/۵۴۷‏ · authz ‏۰‏ · secret-scan ‏۱۱/۱۱‏.

## ۵. راستی‌آزماییِ نهایی (رویِ رأسِ `7dc01f2`)

| گیت | نتیجه |
|---|---|
| `node tests/smoke.js` | ‏۵۴۷/۵۴۷‏ ✅ |
| `node tools/check-authz.js` | ‏۰‏ (تطبیقِ کامل) ✅ |
| `node tools/secret-scan.js` | ‏۱۱/۱۱‏ ✅ |
| `npm run build --check` (وظیفهٔ ۱) | سبز ✅ |
| `git status` | تمیز ✅ |
| قانونِ «وظیفهٔ ۳ بدونِ دست‌زدن به `src`/`server`/`tests`» | برقرار ✅ (گاردِ grep) |

## ۶. Follow-upهایِ ثبت‌شده (خارج از دامنهٔ این چت)

1. رسمی‌سازیِ کالکشنِ `sync_conflicts` در `authz/model.json` + migration تازه (یادداشت در `002_indexes.sql`).
2. پیش‌نیازهایِ فیزیکیِ canary رویِ باکسِ تولید: nginx با `split_clients`، یونیت‌هایِ `payesh-blue/green`،
   فایل‌هایِ `.env.smoke/.env.live` + symlinkِ `.env.active`، فرمتِ لاگِ §۱-۳ سند.
3. drillِ ماهانهٔ `DRY_RUN` پس از آماده‌شدنِ باکس (چک‌لیستِ §۳ سند).
