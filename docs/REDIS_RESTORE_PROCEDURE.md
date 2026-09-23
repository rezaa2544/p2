> **قرارداد به‌روز:** [DR_EVIDENCE_CONTRACT](DR_EVIDENCE_CONTRACT.md). فقط manifest/checksums همان run تکمیل‌شده معتبر است. AOF چندفایلی نیازمند تمام فایل‌های referenced و manifest است. RDB و AOF دو snapshot مستقل‌اند.

# رویهٔ بازیابی ردیس — پایش (فاز ۲.۱)

> هدف: بازگرداندن ردیس از نسخه‌های پشتیبان (RDB یا AOF) با کمترین
> زیان داده، و تمرین دوره‌ای بازیابی در محیط جدا پیش از هر مهاجرت.
>
> پیش‌نیاز: پشتیبان‌ها توسط `tools/redis-backup.sh` هر ۶ ساعت ساخته
> می‌شوند (فایل‌های `dump-<TS>.rdb` و `appendonly-<TS>.aof` + مانیفست
> `last-backup.txt` در مقصد پشتیبان).

---

## ۰) انتخاب نقطهٔ بازیابی

1. `cat <مقصد پشتیبان>/last-backup.txt` — آخرین پشتیبان موفق و زمانش.
2. اگر زیانِ بیش از ۶ ساعت پذیرفتنی نیست، از مقصد ثانویه/فضای شیئی
   (`BACKUP_S3`) فهرست بگیرید و تازه‌ترین فایل سالم را انتخاب کنید.
3. **تصمیم کلیدی:**
   - **AOF** = وضعیت snapshot انتخاب‌شده؛ everysec تضمین RPO بکاپ شش‌ساعته نیست. سن آخرین backup قابل بازیابی باید جدا اندازه‌گیری شود.
   - **RDB** = عکس فوری؛ ساده‌تر و سریع‌تر برای بارگذاری، اما قدیمی‌تر.
   - هر دو موجودند؟ **AOF را ترجیح بدهید**؛ ردیس هم همین اولویت را دارد.

---

## ۱) بازیابی از AOF

```bash
# ۱. سرویس ردیس را روی نود هدف متوقف کنید
systemctl stop redis                # یا: redis-cli SHUTDOWN NOSAVE

# ۲. فایل‌های فعلی را کنار بگذارید (هرگز مستقیم پاک نکنید)
cd /var/lib/redis/node-1
mkdir -p restore-quarantine
mv appendonly.aof appendonlydir restore-quarantine/ 2>/dev/null || true

# ۳. پشتیبان را در جای خود بگذارید
cp /var/backups/payesh-redis/appendonly-<TS>.aof appendonly.aof
# (ردیس ۷ با ساختار چندفایلی: دایرکتوری appendonlydir-<TS> را به
#  نام appendonlydir کپی کنید)
chown redis:redis appendonly.aof && chmod 640 appendonly.aof

# ۴. روشن کنید و لاگ بارگذاری را ببینید
systemctl start redis
journalctl -u redis -f | grep -i 'aof\|DB loaded'
```

لاگ کافی نیست: readback کلیدهای موردانتظار و checksum مستقل الزامی است. نشانهٔ بوت در لاگ، `DB loaded from append only file` و سپس
`INFO persistence` ⇒ `aof_last_bgrewrite_status:ok`.

اگر فایل در لحظهٔ کرش بریده باشد، ردیس با `aof-load-truncated yes`
(پیکربندی پیش‌فرض پایش) همان بخش سالم را بارگذاری می‌کند؛ برای تعمیر
بکاپ، auto-truncation و تعمیر معیار موفقیت نیستند. پیش از کپی فقط اعتبارسنجی بدون تعمیر اجرا شود:

```bash
redis-check-aof appendonly.aof # بدون --fix؛ خرابی باید مانور را مردود کند
```

---

## ۲) بازیابی از RDB

```bash
systemctl stop redis
cd /var/lib/redis/node-1
mkdir -p restore-quarantine
mv dump.rdb restore-quarantine/ 2>/dev/null || true

# ⚠️ اگر AOF فعال باشد، ردیس از AOF بارگذاری می‌کند نه RDB —
# برای بازیابی خالص از RDB، موقتاً AOF را خاموش کنید:
# در پیکربندی: appendonly no   (بعد از بازیابی دوباره yes کنید)

cp /var/backups/payesh-redis/dump-<TS>.rdb dump.rdb
chown redis:redis dump.rdb && chmod 640 dump.rdb
systemctl start redis
```

نشانهٔ موفقیت: `DB loaded from disk` + `INFO persistence` ⇒
`rdb_last_bgsave_status:ok` و `DBSIZE` با تعداد کلیدهای موردانتظار.

---

## ۳) بازیابی توپولوژی سنیتنل (۳ نود)

ترتیب ایمن — اول مسترِ جدید، بعد تکثیرها و سنیتنل‌ها:

1. روی میزبانِ نودِ آسیب‌دیده، بازیابی را طبق بخش ۱ یا ۲ انجام دهید.
2. اگر قرار است این نود مستر شود: پیش از روشن‌کردن، بقیهٔ نودها را
   پایین نگه دارید تا اجماع سنیتنل آن را به‌عنوان تنها مستر ببیند؛
   سپس بقیه را روشن کنید تا به‌صورت تکثیر بازپیوند شوند.
3. وضعیت نهایی را تأیید کنید:

```bash
redis-cli -h <سنیتنل> -p 26379 SENTINEL master payesh-master | head
redis-cli -h <سنیتنل> -p 26379 SENTINEL replicas payesh-master
```

باید دقیقاً یک مستر و (در حالت سالم) دو تکثیرِ متصل گزارش شود.

---

## ۴) آزمون بازیابی در محیط جدا (الزامی — پیش از هر مهاجرت)

> هرگز بازیابی را اول روی تولید امتحان نکنید. این درْس هر فصل و قبل
> از مهاجرت به کلاستر تکرار می‌شود.

```bash
# ۱. محیط جدا: ردیس روی پورت متفاوت و دایرکتوری مستقل
mkdir -p /tmp/restore-drill && cd /tmp/restore-drill
redis-server --port 7777 --dir /tmp/restore-drill \
  --appendonly yes --daemonize yes

# ۲. یک کلید شاهد بسازید و پشتیبان بگیرید (شبیه‌سازی)
redis-cli -p 7777 SET payesh:drill "ok"
redis-cli -p 7777 SAVE

# ۳. «خرابی» را شبیه‌سازی کنید: کلید را پاک کنید
redis-cli -p 7777 DEL payesh:drill

# ۴. بازیابی از پشتیبانِ همان محیط
redis-cli -p 7777 SHUTDOWN NOSAVE
cp /tmp/restore-drill/dump.rdb.bak dump.rdb 2>/dev/null || cp dump.rdb.bak dump.rdb
redis-server --port 7777 --dir /tmp/restore-drill --appendonly no --daemonize yes

# ۵. تأیید: کلید شاهد باید برگشته باشد
redis-cli -p 7777 GET payesh:drill      # انتظار: "ok"
```

**معیار پذیرش:** کلید شاهد بازیابی شد، `PING` پاسخ `PONG` داد و هیچ
خطای `Can't load` در لاگ نبود. نتیجه را در دفترچهٔ عملیات ثبت کنید.

---

## ۵) چک‌لیست پس از بازیابی (تولید)

- [ ] `PING` = `PONG` روی هر سه نود
- [ ] `INFO persistence`: `rdb_last_bgsave_status:ok` و `aof_last_write_status:ok`
- [ ] `SENTINEL get-master-addr-by-name payesh-master` از دید هر سه سنیتنل یکسان
- [ ] شمارنده‌های نرخ (کلیدهای `rate:*`) و کش با `node tests/redis-cluster.js` (متغیرهای محیط زنده) سبز
- [ ] پشتیبان‌گیری تازه بلافاصله پس از بازیابی: `tools/redis-backup.sh`
- [ ] ثبت رویداد در دفترچهٔ عملیات: زمان خرابی، نقطهٔ بازیابی، زیان تخمینی
