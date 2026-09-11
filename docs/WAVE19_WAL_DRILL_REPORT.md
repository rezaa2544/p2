# Wave 19 — WAL Disk-Full Drill Report

**تاریخ:** ۲۰۲۶-۰۹-۱۱ · **شاخه:** `feat/wave19-wal-drill` · **اجراکننده:** Arena
**هدف:** شبیه‌سازی پرشدن دیسک WAL در PostgreSQL، مشاهدهٔ PANIC، و اندازه‌گیری RTO/RPO.
**ابزار:** `tests/wal-disk-full.js` · زیرساخت: `tools/wal-drill/setup-pg.sh`

---

## ۱) این دریل «زنده» است، نه شبیه‌سازی

برخلاف `docs/WAVE19_CHAOS_LIVE_REPORT.md` که این سناریو را `NOT TESTED` ثبت کرده بود
(به دلیل نبودِ PostgreSQL)، این بار روی یک **PostgreSQL 17.10 واقعی** اجرا شد:

| جزء | مقدار واقعیِ مشاهده‌شده |
|---|---|
| نسخهٔ PostgreSQL | `postgres (PostgreSQL) 17.10 (Debian 17.10-0+deb13u1)` |
| پورت primary | `55432` |
| `pg_wal` | tmpfs واقعی با سقف **100MB** روی `/home/user/pgdrill/wal` |
| اندازهٔ سگمنت WAL | `1MB` (`--wal-segsize=1`) |
| بودجهٔ WAL | `min_wal_size=2MB` · `max_wal_size=8MB` |
| `synchronous_commit` | `on` (شرط لازم برای ادعای RPO=0) |
| schema | migrations 001–006 → **۹۰ جدول** در دیتابیس `payesh` |
| standby | `pg_basebackup -X stream` روی پورت `55433` با اسلات `drill_standby` |

**مکانیزم پرشدن WAL:** یک اسلات فیزیکیِ **غیرفعال** (`drill_pin`) سگمنت‌ها را پین
می‌کند — همان سناریوی واقعیِ «رپلیکای رهاشده» که در عمل pg_wal را پر می‌کند.

> `pg_wal IS a mountpoint` در setup یک **assert** است: اگر pg_wal روی همان tmpfsِ
> سقف‌دار نباشد، setup با خطا متوقف می‌شود؛ چون در آن صورت هر «پرشدن دیسکی»
> نمایش است، نه شاهد.

---

## ۲) جدول نتایج W1–W5

| سناریو | نتیجه | RTO | RPO |
|---|---|---|---|
| **W1** WAL به ۸۰٪ → هشدار | ✅ PASS — `46.0MB → 82.0MB` (۸۲٪) در ۱۴ بچ / ۳۰۹ms؛ ۶۳ سگمنت معادل ۶۲MB از داخل PG قابل مشاهده (`pg_ls_waldir`) | — | — |
| **W2** WAL به ۱۰۰٪ → PANIC + خاموشی | ✅ PASS — `PANIC: could not write to file "pg_wal/xlogtemp.9228": No space left on device`؛ postmaster پس از **۱۱۶ms** از دسترس خارج شد؛ WAL روی ۹۹٪ | — | — |
| **W3** بازیابی پس از آزادسازی WAL | ✅ PASS — سرور برگشت و WAL از `99.0MB → 46.0MB` بازپس گرفته شد | **۱۶۲ms** (اولین کوئری موفق در +۱۶۵ms) | — |
| **W4** بازیابی از replica | ✅ PASS — standby پس از PANICِ primary زنده ماند و خواند: `in_recovery=true`, ۳۰٬۰۰۰ ردیف | — | — |
| **W5** تأیید RPO=0 | ✅ PASS — کامیت‌شده پیش از کرش: **۳۰٬۰۰۰** / موجود پس از بازیابی: **۳۰٬۰۰۰** → اتلاف **۰**؛ دنبالهٔ `bigserial` بدون حفره | — | **۰** |

**جمع:** `17/17 green, 0 failed, 1 skipped` — کد خروج `0`
(خروجی ماشین‌خوان: `tests/chaos-output/wal-drill.json`)

---

## ۳) دو نکتهٔ صادقانه دربارهٔ کیفیت شواهد

### ۳-۱) پیام PANIC در این اجرا از سمت **کلاینت** ثبت شد، نه لاگ سرور

در اجرای نهایی، پرچم‌های `panic`/`enospc` در JSON برابر `false` هستند، چون تست آن‌ها
را از *فایل لاگ سرور* استخراج می‌کند و آن فایل در لحظهٔ کرش نوشته نشد. پیام واقعی از
خطای کلاینت گرفته شده است:

```
could not write to file "pg_wal/xlogtemp.9228": No space left on device
```

**چرا؟** در یک نسخهٔ میانی، `logging_collector = on` بود و خروجی نشان داد که PANIC
**هرگز** به دیسک نرسید (۰ occurrence در لاگ) — چون collector بافر دارد و همراهِ
postmaster می‌میرد. بنابراین `logging_collector = off` شد و stderr با `pg_ctl -l`
به فایل می‌رود. در اجرای `16:46:17` همین پیام **در لاگ سرور** هم ثبت شد:

```
2026-09-11 16:46:17.748 UTC [8008] PANIC:  could not write to file "pg_wal/xlogtemp.8008": No space left on device
```

تست هر دو منبع را می‌پذیرد ولی **منبع را صریح اعلام می‌کند** (`server log:` در برابر
`client-observed (server log lost on crash):`) تا شاهد مبهم نشود.

### ۳-۲) بررسیِ redo در W3 در این اجرا SKIP شد

`W3 crash recovery replayed WAL` در اجرای نهایی skip شد (`no redo lines`). دلیلش
این است که پنجرهٔ لاگِ W3 از لحظهٔ شروع خودش خوانده می‌شود و در این اجرا خطوط redo
بیرونِ آن پنجره افتادند. در اجرای `16:46` همان بررسی **PASS** بود:

```
2026-09-11 16:46:17 ... LOG:  redo starts at 0/ACD39A8 ; redo done at 0/B0FFDF0
```

---

## ۴) دو رفتارِ واقعی که در حین دریل کشف شد (و در طراحی تست اثر گذاشت)

### ۴-۱) PostgreSQL پس از PANIC **خودش** بازیابی می‌کند

انتظار اولیه «PANIC → خاموشی ماندگار» بود. رفتار واقعی: postmaster پس از PANIC
بلافاصله restart می‌شود و در همان ثانیه `database system is ready to accept
connections` را ثبت می‌کند. به همین دلیل `pg_ctl start` در مرحلهٔ بازیابی با
`postmaster.pid already exists` شکست می‌خورد — که **شکست نیست**، بلکه بازیابیِ
ازقبل‌انجام‌شده است. تست اکنون بر اساس «زنده بودن» قضاوت می‌کند نه خروجی `pg_ctl`.

### ۴-۲) پرشدنِ `archive_command` به‌تنهایی دیتابیس را متوقف نمی‌کند

وقتی مقصد آرشیو روی همان tmpfs بود، اولین ENOSPC از مسیر `cp` در `archive_command`
آمد:

```
cp: error copying 'pg_wal/000000010000000000000073' to '.../wal/archive/...': No space left on device
```

در این حالت PostgreSQL **زنده می‌ماند** و فقط آرشیو مختل می‌شود. برای رسیدن به PANIC
باید خودِ walwriter در تخصیص فضا شکست بخورد. تفکیک این دو حالت مهم است: یکی «هشدارِ
قابل‌ادامه» است و دیگری «توقف سرویس».

---

## ۵) نحوهٔ بازتولید

```bash
# ۱. زیرساخت (idempotent — پس از ری‌استارت ساندباکس هم قابل اجراست)
sudo -n bash tools/wal-drill/setup-pg.sh              # یا --force-reinit

# ۲. دریل کامل با standby واقعی
node tests/wal-disk-full.js --with-standby

# سناریوی تکی / تنظیم دقیق
node tests/wal-disk-full.js --scenario W2
PGDRILL_SLACK_MB=2 PGDRILL_FILL_PCT=100 node tests/wal-disk-full.js
```

**پیش‌نیازها:** دسترسی root برای `mount -t tmpfs` (در این ساندباکس `sudo -n` بدون
رمز فعال است)، و یک کاربر غیرprivileged برای اجرای PostgreSQL — چون PostgreSQL از
اجرا با root سر باز می‌زند.

**رفتار Fail-Closed:** اگر زیرساخت زنده نباشد، تست با کد خروج `2` متوقف می‌شود و
پیام `refusing to report fake results` می‌دهد. همچنین W5 در نبودِ baselineِ کرش،
به‌جای پاس‌شدنِ بدیهی، **SKIP** می‌شود — تا «RPO=0» هرگز بدون اندازه‌گیری ادعا نشود.

---

## ۶) محدودیت‌های این دریل

- روی یک میزبانِ تک‌گره اجرا شد؛ سناریوی قطعیِ منطقه‌ای (AZ partition) پوشش داده نشد.
- سقف tmpfs به‌جای یک دیسک واقعیِ کوچک است؛ رفتار ENOSPC یکسان است ولی latency I/O واقعی نیست.
- برای رساندن فضای مؤثر به صفر، از یک فایل filler روی همان tmpfs استفاده شد
  (مدل‌سازیِ «فضای مؤثر کمتر از ظرفیت اسمی»). این بخش در کد مستند شده و PostgreSQL
  همچنان WAL خودش را می‌نویسد و ENOSPC واقعی از کرنل می‌گیرد.
- اندازهٔ دادهٔ دریل (~۶۲MB) کوچک است؛ RTO در حجم‌های بزرگ‌تر باید جداگانه سنجیده شود.
