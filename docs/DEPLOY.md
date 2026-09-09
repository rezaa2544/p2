# استقرارِ تولید — دستورِ کار (DEPLOY)

> **برای چه:** وقتی سرور + دامنه + حسابِ ارگان خرید/انتخاب شد، این دستورِ کار
> همهٔ قدم‌ها تا «کاربرِ واقعی روی https» را می‌گوید. **تصمیمِ قفل‌شدهٔ
> فایل‌نگهداری:** آروان‌کلاود Object Storage (ضمیمهٔ حِ AD) — در §۶ استفاده می‌شود.
>
> **ساختارِ چیزی که استقرار می‌شود:** یک پروسهٔ Node — هم وب (فایلِ
> تک‌فایلیِ ساخته‌شده)، هم API (`/api/*`)، هم استورِ JSON، هم بکاپِ خودکارِ
> درون‌پروسه. وابستگیِ خارجی **صفر** است (فقط Node stdlib) — نه Express،
> نه دیتابیس، نه پکیجِ سوم.

---

## ۱. سخت‌افزار و پیش‌نیاز

| مورد | حداقل | پیشنهاد |
|---|---|---|
| Node.js | ۱۸ | **۲۰ LTS** (نسخه‌ای که با آن تست‌ها سبز است) |
| CPU | ۲ هسته | ۲ هسته |
| RAM | ۲ گیگابایت | ۴ گیگابایت (سقفِ حجمِ دیتا ~۵ مگابایت + margin) |
| دیسک | ۱۰ گیگ SSD | ۲۰ گیگ SSD (بکاپ‌ها: ۱۰ نسخه × ~۵ مگابایت) |
| سیستم‌عامل | — | Ubuntu ۲۲.۰۴/۲۴.۰۴ LTS |
| دامنه | — | ثبت‌شده + DNS فعال (A record به IP سرور) |

**چک‌زنجیرهٔ پیش‌شروع (روی سرور تازه):**
```bash
node -v                                  # باید v20 یا بالاتر باشد
systemctl status systemd-timesyncd       # ⚠️ ساعت باید دقیق باشد (expِ JWT + چکِ clock_skew در آدیت)
```

---

## ۲. نصبِ اولیه (یک بار)

```bash
# کاربرِ غیر-rootِ مخصوص
sudo useradd -m -s /bin/bash payesh
sudo -iu payesh

# کد
git clone https://github.com/rezaa2544/p2.git /home/payesh/p2
cd /home/payesh/p2
node build.js                            # خروجی: index.html (تک‌فایلی، آفلاین)

# پوشهٔ داده (خارج از ریپازیتوری)
mkdir -p /home/payesh/data /home/payesh/backups
```

**⚠️ توکن:** توکنِ گیت (یا هر اعتباری) **هرگز** در فایل‌هایِ پروژه نباشد؛
کلیدهایِ SSH یا توکنِ کاربرِ سرور به کار رود (قاعدهٔ پروژه).

---

## ۳. متغیرهایِ محیطی (فایل `/home/payesh/p2/.env.deploy`)

همهٔ متغیرهایی که `server/index.js` می‌خواند — **دقیقاً همین‌ها** (از کد):

| متغیر | مقدارِ تولید | چرا |
|---|---|---|
| `PORT` | `3000` | پورتِ سرو |
| `HOST` | `0.0.0.0` | پذیرش از بیرون |
| `PAYESH_STORE` | `/home/payesh/data/payesh.json` | استورِ داده (خارج از ریپازیتوری) |
| `PAYESH_AUDIT` | `/home/payesh/data/audit.log` | آدیتِ append-only |
| `PAYESH_JWT_SECRET` | `(۶۴+ کاراکترِ تصادفی — `openssl rand -hex 32` دو بار)` | امضایِ توکن (یا `PAYESH_KEY` = مسیر فایلِ کلید) |
| `PAYESH_DEMO_CODE` | **`0`** | ⚠️ **مهم‌ترین:** بازتابِ کدِ دمو خاموش — بدونِ این، ورودِ تولید معنادار نیست |
| `PAYESH_HTTPS` | `1` (اگر TLS درون‌پروسه) | سرو روی https |
| `PAYESH_TLS_CERT` | `/home/payesh/tls/fullchain.pem` | فقط با `PAYESH_HTTPS=1` |
| `PAYESH_TLS_KEY` | `/home/payesh/tls/privkey.pem` | فقط با `PAYESH_HTTPS=1` |
| `PAYESH_BACKUP_EVERY_HOURS` | `24` | بکاپِ خودکارِ درون‌پروسه (۱۰ نسخه نگه می‌ماند) |

ساختنِ سرّ:
```bash
openssl rand -hex 32 > /home/payesh/data/.jwt
# مقدار PAYESH_JWT_SECRET را در فایلِ .env.deploy بگذارید و:
chmod 600 /home/payesh/data/.jwt /home/payesh/p2/.env.deploy
```

---

## ۴. TLS — دو راه (تصمیمِ ما: راهِ الف)

**الف) درون‌پروسه (ساده‌تر، پیش‌فرضِ این سند):**
```bash
# با certbot (Let's Encrypt) فقط گواهی بگیر — پروکسی نذار:
sudo apt install -y certbot
sudo certbot certonly --standalone -d payesh.example \
  --pre-hook 'sudo systemctl stop payesh' \
  --post-hook 'true'
sudo cp -r /etc/letsencrypt/live/payesh.example /home/payesh/tls-src
sudo cp /etc/letsencrypt/live/payesh.example/fullchain.pem /home/payesh/tls/
sudo cp /etc/letsencrypt/live/payesh.example/privkey.pem /home/payesh/tls/
sudo chown -R payesh:payesh /home/payesh/tls
# تمدیدِ خودکار:
sudo certbot renew --webroot -w /var/www/le --deploy-hook "cp -f /etc/letsencrypt/live/payesh.example/fullchain.pem /home/payesh/tls/ && cp -f /etc/letsencrypt/live/payesh.example/privkey.pem /home/payesh/tls/ && sudo -u payesh systemctl restart payesh"
```

**ب) پروکسی معکوس (nginx/caddy):** اگر بعداً پروکسی لازم شد، `PAYESH_HTTPS` را
`0` کنید و پروکسی را به `127.0.0.1:3000` وصل کنید — API و وب هر دو از همان
پورت می‌آیند؛ فقط `X-Forwarded-Proto` را به سرور بفرستید (کوکیِ Secure).

---

## ۵. سرویسِ systemd (`/etc/systemd/system/payesh.service`)

```ini
[Unit]
Description=Payesh server (web + api + json store)
After=network-online.target
Wants=network-online.target

[Service]
User=payesh
WorkingDirectory=/home/payesh/p2
EnvironmentFile=/home/payesh/p2/.env.deploy
ExecStart=/usr/bin/node /home/payesh/p2/server/index.js
Restart=always
RestartSec=3
# منابع
MemoryMax=1G
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/home/payesh/data /home/payesh/backups

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now payesh
```

**چکِ سلامت:**
```bash
curl -fsS https://payesh.example/api/health && echo " ✅"
journalctl -u payesh -n 20 --no-pager
```

**آتش‌بند:** فقط `22` (با کلید) + `443` باز.

---

## ۶. داده، بکاپ و استورِ بیرونی (آروان‌کلاود — قفل‌شده)

1. **استورِ اصلی:** `/home/payesh/data/payesh.json` (فقط داده — بدونِ کد).
2. **بکاپِ خودکار:** درون‌پروسه، هر ۲۴ ساعت، ۱۰ نسخه (تنظیم: `PAYESH_BACKUP_EVERY_HOURS`).
3. **کپیِ بیرونی (مطلوب پیش از کاربرانِ واقعی):** یک کپیِ هفتگی از تازه‌ترین
   بکاپ به سطلِ خصوصیِ آروان‌کلاود (بستهٔ ۵ گیگِ رایگان کافی است — قفلِ
   ضمیمهٔ حِ AD). رابطِ S3 با کلیدِ API؛ اسکریپتِ کوچکِ ۱۰ سطره با `aws
   cp` یا SDK سِرشین — **پشتیبانِ سِرورِ اصلی را جایگزین نمی‌کند** (حلقهٔ
   بازگشتی: بکاپ از استورِ اصلی می‌رود، نه از سطل).
4. **بازیابی (drill — حداقل یک بار پیش از go-live):**
```bash
# روی سرورِ جدا/تست:
PAYESH_STORE=/tmp/restore.json node server/admin.js --restore /path/to/backup.json
# یا از پنلِ سرور: POST /api/admin/restore (فقط superadmin + قراردادِ server8)
```
   بعد از بازیابی: `curl /api/health` + یک ورودِ تستی + شمارشِ رکوردها.

---

## ۶-ب. مسیرِ PostgreSQL (مقیاسِ ملی — اختیاری)

استقرارِ پیش‌فرض همین JSON-استور است؛ وقتی مدرسه‌ها زیاد شدند، دو مرحله:
۱) اسکیما: `npm run migrate:status` و بعد `npm run migrate:up` (جزئیات: `docs/MIGRATION_SETUP.md`)؛
۲) بارِ داده: `node tools/migrate-to-pg.js --execute` با همانِ `DATABASE_URL`.
پیش از هر `migrate:down` در تولید، بکاپ (§۶) اجباری است.

---

## ۷. بروزرسانی (هر بار که کد جدید می‌آید)

```bash
sudo -iu payesh
cd /home/payesh/p2
git pull
node build.js
sudo systemctl restart payesh
curl -fsS https://payesh.example/api/health
```
بروزرسانی **پایه‌داده را دست نمی‌زند** (استور جداست)؛ اگر قراردادِ رکورد
تغییر کرده، `server/sync.js` + `server/seed.js` را بخوانید و در **کپیِ
بکاپ** تست کنید (هرگز مستقیم روی استورِ اصلی).

---

## ۸. چک‌لیستِ go-live (همه باید سبز باشند)

| # | مورد | چک |
|---|---|---|
| ۱ | `PAYESH_DEMO_CODE=0` | `curl` ورود: بدونِ کدِ دمو، کدِ اشتباه باید رد شود |
| ۲ | HTTPS معتبر (مرورگر سبز) + HSTS | سرآیندها (قرارداد: HSTS روی https) |
| ۳ | `/api/health` سبز + آدیت می‌چرخد | `tail -f audit.log` هنگامِ یک ورود |
| ۴ | بکاپِ خودکار کار می‌کند | بعد از ۱ ساعت: فایلِ تازه در `/home/payesh/backups` |
| ۵ | بازیابیِ drill انجام‌شده (§۶-۴) | شمارشِ رکوردها برابر است |
| ۶ | کپیِ بیرونیِ هفتگی تنظیم‌شده | آروان‌کلاود: یک شیءِ تازه |
| ۷ | بسته آزمونِ کامل روی بیلدِ استقرار یافته سبز | `server1-10` + `sim_full2/3` در سرور |
| ۸ | شمارهٔ تماسِ سیاستِ حریم خصوصی (بخشِ ۹) رسمی‌شده | `docs/PRIVACY_POLICY.md` + صفحهٔ وب |
| ۹ | حسابِ بررسی‌گرِ گوگل (برای اپ) آماده است | بخشِ «دسترسیِ بررسی‌گر» در `PLAY_STORE_CHECKLIST.md` |
| ۱۰ | مانیتورینگِ حداقلی: `Restart=always` + یک پینگِ خارجیِ ساعتی به `/api/health` (upptime یا همان curl در cron + پیام به اپراتور) | یک خطایِ شبانه بدونِ بیدارشدنِ اپراتور نمی‌ماند |
| ۱۱ | (فقط مسیرِ PG) `migrate:status` سبز + شمارشِ جدول‌هایِ PG برابرِ استور | `node tests/migration.js` سبز در ایستگاهِ استقرار |

---

## ۹. چیزی که هنوز خارج است (وابسته به خرید/انتخاب)

- **سرور/VPS + دامنه** — انتخابِ کاربر (اروپا/ایران + هزینه).
- **حسابِ آروان‌کلاود** (برایِ سطلِ بیرونی) — فقط وقتی کپیِ بیرونی لازم شد (پیش از کاربرانِ واقعی).
- **درگاهِ پیامک + استعلامِ کد ملی** — تا آن‌وقت، ورودِ تولید بدونِ درگاهِ واقعی معنادار نیست (`PAYESH_DEMO_CODE=0` یعنی کد از کجا بیاید؟ ← درگاه). **این، پیش‌نیازِ واقعیِ go-live است**، نه TLS.

> ترتیبِ منطقی: ۱) درگاهِ پیامک ← ۲) سرور + دامنه + این سند ← ۳) go-live.
