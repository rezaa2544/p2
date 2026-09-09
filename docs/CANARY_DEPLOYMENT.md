# طرحِ استقرارِ مرحله‌ای — Blue-Green و Canary

> **هدف:** کاهشِ ریسکِ استقرار در مقیاسِ ملی + Rollbackِ سریع.
> این سند رویِ معماریِ واقعیِ پایش سوار است (تک‌پروسهٔ Node، استورِ JSON یا
> مسیرِ اختیاریِ PG از `docs/MIGRATION_SETUP.md`) — نه رویِ فرض‌هایِ k8s.
> هرجا پرامپتِ اولیه با واقعیت فرق داشت، **واقعیت مبناست** و تفاوت صریحاً ثبت شده.

## ۰. قیدهایِ معماری (پیش از هر چیز بخوانید)

| # | قید | نتیجه |
|---|---|---|
| C1 | استورِ JSON **تک‌نویسنده** است (دو پروسهٔ هم‌زمان رویِ یک فایل = گم‌شدنِ نوشته‌ها) | شکافِ درصدیِ ترافیک (۱٪/۱۰٪/۵۰٪) **فقط در مسیرِ PG** مجاز است؛ رویِ JSON فقط Blue-Green با cutover ‏(§۱-۶-ب)‏ |
| C2 | سروِ پیش‌فرض مستقیم رویِ پورت است (`DEPLOY.md` §۴-الف) | پیش‌نیازِ هر دو الگو: پروکسیِ معکوسِ nginx (§۴-ب همان سند) با دو upstream |
| C3 | هلث‌چکِ واقعی فقط `GET /api/health` است (`{ok:true,…}` در `server/index.js`) | معنایِ liveness/readiness/startup رویِ همین اندپوینت نگاشت می‌شود (§۱-۲)؛ مسیرهایِ جدا وجود ندارند |
| C4 | در این معماری **Redis نیست** و Object Storage (آروان) در مسیرِ درخواست نیست | گیتِ آمادگی، اتصالِ Redis/آروان را چک نمی‌کند (علتش در §۱-۲) |
| C5 | migration برگشتی (`down`) در تولید خطرناک است | Rollbackِ ترافیک **هرگز** `migrate:down` نمی‌زند (§۱-۴) |

## ۱-۱. استراتژیِ استقرار

### توپولوژی (هر دو الگو)

```
کاربران ──https──▶ nginx (‏split_clients‏) ──┬──▶ blue  (‏127.0.0.1:3001‏، ‏payesh-blue‏)
                                            └──▶ green (‏127.0.0.1:3002‏، ‏payesh-green‏)
```

- دو دایرکتوریِ کد: `/home/payesh/p2-blue` و `/home/payesh/p2-green` (هر دو از همین ریپو).
- دو یونیتِ systemd (کپیِ `payesh.service` از `DEPLOY.md` §۵ با `PORT` و `WorkingDirectory` متفاوت).
- **Blue = نسخهٔ فعلیِ سرویس‌دهنده**، **Green = نسخهٔ تازه**.
- تصمیمِ شکاف در فایلِ `/etc/nginx/payesh-split.conf` است که اسکریپت‌ها می‌سازند:

```nginx
upstream payesh_blue  { server 127.0.0.1:3001 max_fails=2 fail_timeout=10s; }
upstream payesh_green { server 127.0.0.1:3002 max_fails=2 fail_timeout=10s; }
# نمونه: مرحلهٔ ۱۰٪ (اسکریپت این فایل را بازنویسی + nginx -t + reload می‌کند)
split_clients $remote_addr $payesh_backend {
  10%   payesh_green;
  *     payesh_blue;
}
```

### الف) Blue-Green (پیش‌فرض، رویِ JSON هم امن)

۱. Green بالا می‌آید ولی **ترافیک نمی‌گیرد** (۰٪).
۲. Smoke رویِ Green (§۱-۶).
۳. Cutover: توقفِ Blue، اتصالِ Green به استورِ واقعی، سوئیچِ ۱۰۰٪ به Green.
۴. Blue **متوقف ولی آماده** می‌ماند (fallbackِ Rollback).

> چرا cutover و نه شکاف؟ قیدِ C1: رویِ JSON هرگز دو نویسندهٔ هم‌زمان نداریم.
> ترتیبِ توقف/اتصال در §۱-۶-ب دقیق آمده؛ جابه‌جاییِ ترتیب = ریسکِ فسادِ داده.

### ب) Canary (فقط مسیرِ PG — قیدِ C1)

۱٪ → ۱۰٪ → ۵۰٪ → ۱۰۰٪؛ هر مرحله ۵ دقیقه پایش + گیتِ SLO (§۱-۳).
پیش‌نیازها علاوه بر nginx:

- هر دو رنگ به **یک `DATABASE_URL`** وصل‌اند (PG نویسندهٔ هم‌زمان را مدیریت می‌کند).
- migrationهایِ نسخهٔ تازه باید **backward-compatible** باشند (فقط expand تا پایانِ cutover؛
  ستون/جدولِ تازه nullable یا با پیش‌فرض؛ هیچ rename/drop در میانهٔ canary).
- ترتیبِ الزامی: `migrate:up` **قبل** از بالا آمدنِ Green (وگرنه Green با اسکیمایِ کهنه بالا می‌آید).

## ۱-۲. Health Checks (نگاشتِ معناها رویِ `/api/health`)

| پروب | معنا | پیاده‌سازیِ واقعی |
|---|---|---|
| Liveness | پروسه زنده است؟ | `GET /api/health` → ‏۲۰۰‏ + ‏`ok:true`‏؛ خرابیِ پیاپی = `systemctl restart` (همان `Restart=always`) |
| Readiness | آمادهٔ گرفتنِ ترافیک است؟ | liveness **+** گیتِ داده: مسیرِ JSON = فایلِ استور خواندنی/نوشتنی است؛ مسیرِ PG = ‏`pg_isready`‏ ‏+ `npm run migrate:status` سبز |
| Startup | راه‌اندازی کامل شد؟ | حلقهٔ انتظارِ اسکریپت تا نخستین ۲۰۰ (سقف ۶۰ ثانیه)؛ timeout = abort |

```bash
# liveness (هر دو رنگ، هر ۱۰ ثانیه از cron یا مانیتورِ خارجی)
curl -fsS http://127.0.0.1:3002/api/health | grep -q '"ok":true'
# readinessِ داده — مسیرِ JSON
test -r /home/payesh/data/payesh.json -a -w /home/payesh/data/payesh.json
# readinessِ داده — مسیرِ PG
pg_isready -h HOST -p 5432 >/dev/null && npm run migrate:status --prefix /home/payesh/p2-green
```

**چرا Redis/آروان در گیت نیستند (C4):** در این معماری Redis وجود ندارد که چک شود؛
کپیِ آروان هم ناهمگام و هفتگی است — خرابی‌اش نباید ترافیک را بخواباند (هشدار جدا می‌گیرد، نه گیت).

## ۱-۳. معیارهایِ موفقیت (SLO) برایِ هر مرحله

| مرحله | ترافیکِ Green | گیتِ عبور |
|---|---|---|
| ۱ | ۱٪ | Error Rate ‏< ۰٫۱٪‏، Latency ‏p95 < 200ms‏ |
| ۲ | ۱۰٪ | Error Rate ‏< ۰٫۱٪‏، Latency ‏p95 < 200ms‏ |
| ۳ | ۵۰٪ | Error Rate ‏< ۰٫۵٪‏، Latency ‏p95 < 300ms‏ |
| ۴ | ۱۰۰٪ | Error Rate ‏< ۰٫۵٪‏، Latency ‏p95 < 300ms‏ |

**روشِ اندازه‌گیری (بدونِ APM، از لاگِ nginx):** فرمتِ لاگ باید `$status` و `$request_time`
و `$upstream_addr` داشته باشد؛ گیتِ اسکریپت رویِ پنجرهٔ ۵ دقیقه‌ای حساب می‌کند:

```nginx
log_format payesh '$remote_addr - $upstream_addr [$time_local] "$request" '
                  '$status $request_time "$http_user_agent"';
```

- `Error Rate` = پاسخ‌هایِ ‏5xx‏ ÷ کلِ پاسخ‌ها (در پنجره).
- `p95` = صدکِ ۹۵اُمِ `request_time` (همان پنجره).
- اگر نمونه کمتر از `MIN_REQUESTS` (پیش‌فرض ۱۰) بود، گیت **نامشخص** است و مرحله
  جلو نمی‌رود (fail-closed: ترافیکِ کم ≠ موفقیت).

## ۱-۴. Rollback Strategy

### شرایطِ Rollback (هرکدام = توقفِ فوریِ پیشروی)

- Error Rate ‏> ۱٪‏ در هر پنجرهٔ ۵ دقیقه‌ای، یا
- Latency ‏p95 > 500ms‏ در همان پنجره، یا
- هر الگویِ غیرعادیِ ‏5xx‏ (مثلاً سه ‏502/504‏ پیاپی از Green — نشانهٔ مرگِ upstream).

### Rollback خودکار

`scripts/canary-deploy.sh` پس از هر مرحله گیت می‌زند؛ **رد شدنِ هر گیت = abort
خودکار**: شکاف به ۱۰۰٪ Blue برمی‌گردد، Green متوقف می‌شود، دلیل در خروجی ثبت می‌شود.
(در مسیرِ JSON که شکافی نیست، abort یعنی cutover انجام نمی‌شود و Blue دست‌نخورده می‌ماند.)

### Rollback دستی

```bash
npm run rollback            # = bash scripts/rollback.sh
```

کارهایِ اسکریپت (به همین ترتیب): اسنپ‌شاتِ فایلِ استور → توقفِ Green →
روشن/سالم‌بودنِ Blue → هلث‌چکِ Blue → برگرداندنِ nginx به ۱۰۰٪ Blue → راستی‌آزماییِ عمومی.
هر قدم که شکست بخورد، اسکریپت با exit غیرصفر می‌ایستد **قبل** از دست‌زدن به nginx (C5).

> ⚠️ **قاعدهٔ migration در Rollback:** برگرداندنِ ترافیک، `migrate:down` نمی‌زند.
> اسکیمایِ expandشده با کدِ قدیمی سازگار می‌ماند (شرطِ §۱-۱-ب)؛ `down` فقط تصمیمِ
> انسانیِ جدا، با بکاپ، خارج از مسیرِ اضطراری است (`MIGRATION_SETUP.md` §۲).

## ۱-۵. Auto-Scaling Rules

صادقانه: در این معماری (تک‌باکس + systemd، بدونِ k8s) **HPA خودکار نداریم**.
آنچه هست، سه لایه است:

1. **نگهبان‌هایِ درون‌باکس (خودکار، از قبل):** `Restart=always` + ‏`MemoryMax=1G`‏
   در یونیتِ systemd (`DEPLOY.md` §۵) — مرگ/نشت = ری‌استارت، نه خوابیدنِ سرویس.
2. **آستانه‌هایِ هشدار → اقدامِ دستی** (اعدادِ پرامپت، به‌عنوانِ هشدار نه اسکیلر):
   - CPU ‏> ۷۰٪‏ به مدت ۵ دقیقه → بررسی + آماده‌باش برایِ scale-out.
   - Memory ‏> ۸۰٪‏ → بررسیِ نشت + ری‌استارتِ برنامه‌ریزی‌شده در پنجرهٔ کم‌ترافیک.
   - صفِ درخواست (custom metric = ‏`Active connections`‏ در `stub_status` یا رشدِ ‏p95‏)
     → اگر با CPU/حافظه همراه بود، scale-out.
3. **Scale-out دستی (افقِ ملی):** باکسِ دوم با همین دو رنگ + اضافه‌شدن به upstreamهایِ nginx؛
   نشست‌ها JWT-statelessاند پس چسبندگی (sticky) لازم نیست — ولی **استورِ JSON تک‌باکسی است**:
   scale-outِ واقعیِ چندباکسی پیش‌نیازش مسیرِ PG است (همان تصمیمِ `MIGRATION_SETUP.md` §۳).

> اگر روزی به k8s مهاجرت شد، آستانه‌هایِ بالا مستقیم به HPA تبدیل می‌شوند
> (`targetCPUUtilizationPercentage: 70` و مشابه) — ولی امروز ادعایِ HPA نداریم.

## ۱-۶. مراحلِ اجرایی (گام‌به‌گام)

### الف) Canary کامل (فقط مسیرِ PG)

```bash
# ۰) پیش‌نیازها: nginx با split + هر دو یونیت + DATABASE_URL یکسان + postgresql-client
sudo bash scripts/canary-deploy.sh        # با تأییدِ اپراتور بینِ مرحله‌ها
sudo bash scripts/canary-deploy.sh --yes  # بدونِ توقف (فقط drill یا پنجرهٔ توافق‌شده)
```

ترتیبِ داخلِ اسکریپت (همان ۸ قدمِ پرامپت، اجراشده):

1. Build و Deploy در Green (`git pull` + ‏`node build.js`‏ + ‏`migrate:status`‏).
2. Smoke رویِ Green (هلث + صفحهٔ ورود + یک API خواندنی — جزئیات در §۲).
3. شکافِ ۱٪ → پایشِ ۵ دقیقه → گیتِ SLO.
4. شکافِ ۱۰٪ → پایش → گیت.
5. شکافِ ۵۰٪ → پایش → گیت.
6. شکافِ ۱۰۰٪ → پایشِ نهایی.
7. توقفِ Blue (نگه‌داشتنِ کد/دیتا برایِ fallback) — پایانِ موفق.
8. هر گیتِ قرمز در هر قدم = abort خودکار (§۱-۴).

### ب) Blue-Green با cutover (مسیرِ JSON — پیش‌فرضِ امروز)

```bash
sudo bash scripts/canary-deploy.sh --cutover
```

1. اسنپ‌شاتِ `payesh.json` → ‏`/home/payesh/backups/`‏.
2. Green با **کپیِ** استور بالا می‌آید (نه استورِ واقعی — قیدِ C1) + smoke.
3. Cutover به همین ترتیبِ دقیق: **توقفِ Blue ← اتصالِ Green به استورِ واقعی
   (تغییرِ symlinkِ ‏`.env.active`‏ ← §۲) ← ری‌استارتِ Green ← گیتِ هلث ← nginx به ۱۰۰٪ Green**.
4. Blue متوقف ولی آماده می‌ماند (fallback).
5. Rollback = ‏`npm run rollback`‏ (توقفِ Green، روشن‌کردنِ Blue رویِ همان استور، برگرداندنِ nginx).

### ج) Drill (تمرینِ بدونِ ریسک — ماهی یک‌بار)

```bash
DRY_RUN=1 bash scripts/canary-deploy.sh --cutover   # فقط چاپِ قدم‌ها، صفر اثر
DRY_RUN=1 bash scripts/rollback.sh                  # همین برایِ rollback
```

## ۲. اسکریپت‌ها — مرجع

| اسکریپت | نقش | فراخوانی |
|---|---|---|
| `scripts/canary-deploy.sh` | استقرارِ مرحله‌ای (canary در PG، cutover در JSON) | ‏`sudo bash scripts/canary-deploy.sh [--yes] [--cutover]`‏ |
| `scripts/rollback.sh` | بازگشتِ دستی به Blue | ‏`npm run rollback`‏ (یا مستقیم با sudo) |

متغیرهایِ محیطی (با پیش‌فرضِ `DEPLOY.md`؛ با `VAR=x` قابلِ بازنویسی):

| متغیر | پیش‌فرض | معنی |
|---|---|---|
| `BLUE_PORT` / `GREEN_PORT` | `3001` / `3002` | پورتِ دو رنگ |
| `BLUE_UNIT` / `GREEN_UNIT` | `payesh-blue` / `payesh-green` | نامِ یونیت‌ها |
| `NGINX_SPLIT_CONF` | `/etc/nginx/payesh-split.conf` | فایلِ شکاف (بازنویسی + ‏`nginx -t`‏ + reload) |
| `NGINX_LOG` | `/var/log/nginx/payesh-access.log` | لاگِ گیتِ SLO |
| `PUBLIC_URL` | `https://payesh.example` | راستی‌آزماییِ نهایی |
| `MONITOR_SECS` | `300` | پنجرهٔ پایشِ هر مرحله (پرامپت: ۵ دقیقه) |
| `MIN_REQUESTS` | `10` | کمینهٔ نمونهٔ گیت (کمتر = نامشخص = توقف) |
| `DRY_RUN` | `0` | ‏`1`‏ = فقط چاپ، بدونِ هیچ اثری |

قراردادهایِ مشترکِ هر دو اسکریپت: `set -euo pipefail`؛ هر تغییرِ nginx با
`nginx -t` اعتبارسنجی می‌شود وگرنه reload انجام نمی‌شود؛ هیچ `migrate:down`
خودکاری وجود ندارد؛ smoke یعنی: هلثِ ‏۲۰۰‏ + ‏`ok:true`‏، صفحهٔ `/` ‏۲۰۰‏، و
یک `GET /api/health` از مسیرِ عمومی پس از هر سوئیچ.

> نکتهٔ symlinkِ ‏`.env.active`‏ (قدمِ ۳ مسیرِ JSON): یونیتِ Green به‌جایِ فایلِ ثابت،
> `EnvironmentFile=/home/payesh/p2-green/.env.active` می‌خواند که symlink است؛
> smoke با `.env.smoke` (کپیِ استور) و سرویسِ واقعی با `.env.live` (استورِ واقعی).
> سوئیچ = ‏`ln -sfn`‏ + ری‌استارت — بدونِ ویرایشِ دستیِ فایلِ env در لحظهٔ cutover.

## ۳. چک‌لیستِ پیشِ‌استقرار (هر بار)

- [ ] بکاپِ تازه (§۶ ‏DEPLOY‏) + فضایِ دیسکِ کافی برایِ اسنپ‌شات.
- [ ] `node tests/smoke.js` ‏۵۴۷/۵۴۷‏ و `node tools/check-authz.js` ‏۰‏ رویِ کدی که قرار است برود.
- [ ] مسیرِ PG؟ → ‏`migrate:status`‏ سبز + سازگاریِ روبه‌عقبِ migrationها بازبینی شده.
- [ ] هر دو رنگ هلثِ ‏۲۰۰‏ می‌دهند؛ `nginx -t` سبز.
- [ ] drillِ ‏DRY_RUN‏ این ماه انجام شده.

## ۴. آنچه این سند ادعا **نمی‌کند**

- k8s/Helm/Argo، HPA، Service Mesh نداریم و سند وانمود نمی‌کند که داریم.
- Redis نداریم؛ «چکِ Redis» در هیچ گیتی نیست.
- p95/error-rate از لاگِ nginx حساب می‌شود، نه از APM — دقتش به فرمتِ لاگ (§۱-۳) وابسته است.
- Blue-Green جایِ بکاپ را نمی‌گیرد (§۶ ‏DEPLOY‏ همچنان اجباری است).
