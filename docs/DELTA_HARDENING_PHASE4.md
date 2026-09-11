# دلتا سینک — فاز ۴ (Backpressure · Compression · Warmup · Metrics · Region)

> **شاخه:** `feat/delta-phase4` (پایه: `main @ 6dbef89` — PR #68)
> **تاریخ:** ۲۰۲۶-۰۹-۱۱ (تهران) · **سند از نوعِ:** توصیفِ وضعیتِ واقعیِ کد
> **تست‌های نگه‌دارندهٔ سند:** `tests/delta-phase4.js` (۲۳/۲۳) + `tests/delta-phase4-mutations.js` (۲۰/۲۰)

پنج شکافِ آماده‌سازیِ مسیرِ دلتا برای مقیاسِ چند-سرویس/چند-منطقه‌ای، هرکدام یک کامیتِ مستقل
با تستِ جهشی (لازمِ کشته‌شدنِ جهش = تستِ کافی):

| گپ | کامیت | تست‌ها | جهش‌ها |
|---|---|---|---|
| ۱ — Backpressure | `3b262c7` | BP1–BP6 | M1–M5 |
| ۲ — Delta Compression | `d936511` | CM1–CM6 | M6–M8 |
| ۳ — Cursor Warmup | `424afc3` | CW1–CW3 | M9–M11 |
| ۴ — Sync Metrics | `412eaa1` | MX1–MX4 | M12–M15 |
| ۵ — Multi-Region | `fe9ac26` | MR1–MR4 | M16–M19 |
| (اصلاح gitignore) | `0c86c97` | — | — |

---

## گپ ۱ — Sync Backpressure (فشارِ معکوس)

**مشکل:** هیچ‌چیز سقفِ سرعتِ push کلاینت‌ها را نبندست؛ برستِ دسته‌های بزرگ می‌توانست
حلقهٔ اعمال را تصاحب کند و بقیهٔ کاربران را قفل کند.

**طرح:**
- **پنجرهٔ ثابتِ وزن‌دار per-session** (نه per-IP): `rateLimit({prefix:'sync:ops',
  identifier:'u'+user_id, limit, windowSeconds:60, weight: ops.length})` — یک درخواست با
  N عملیات، **N واحد** از پنجره مصرف می‌کند نه ۱.
- سقف: `PAYESH_SYNC_OPS_PER_MIN` (پیش‌فرض **۵۰۰۰**، clamp ‏100..1,000,000) از طریقِ
  `syncOpsPerMinute()`.
- جای گیت: **بعد از** اعتبارسنجیِ شکل (ترتیبِ 400/413 حفظ شده — `batch_too_large` مقدم
  است) و **قبل از** اعمالِ هر op.
- رد: `429 {ok:false, code:'sync_backpressure', retry_after_s, message}` + سرآیندِ
  `Retry-After`. `retry_after_s` = TTL واقعیِ پنجره (clamp 1..60) — هم در JSON هم در
  سرآیند.
- **هیچ op از دستهٔ ردشده اعمال نمی‌شود** — ردِ 429 گذرا (transient) است، نه per-op.
- **fail-open:** خطای موتورِ نرخ (ردیس مرده در dev) ⇒ مجاز — همان قراردادِ
  `rate-limit.js`؛ لبهٔ سختِ نرخ همچنان nginx/Cloudflare.

**زیرساخت:** `redis.js` تابعِ `incrByWithTtl(key, ttl, amount)` گرفت (اسکریپتِ Luaی
اتمیکِ `INCRBY + EXPIRE`؛ دوقلویِ حالتِ حافظه) و `checkRateLimit` پارامترِ اختیاریِ
`weight` (پیش‌فرض 1 — فراخوان‌های auth.js دست‌نخورده).

**کلاینت (`27-sync.js`):**
- `sendBatch` خطای 429/sync_backpressure را به خطای برچسب‌دار (`.code`, `.retryAfterS`
  از بدنهٔ JSON — سرآیند در `Api.request` در دسترس نیست) تبدیل می‌کند؛
- `sendChunked` این خطا را **کامل re-throw** می‌کند (تکه‌تکه‌کردن برایِ بودجهٔ تعداد-op
  بی‌فایده است — پیش از فاز ۴ این خطا به مسیرِ per-op-rejection می‌رفت و DLQ را
  می‌سوزاند)؛
- `syncNow`: همهٔ opها **pending می‌مانند** (بدونِ `noteOpFailed` ⇒ بدونِ DLQ)،
  `attempts+=1`، زمان‌بندیِ دوباره باِ `wait = max(retry_after_s×1000, backoffDelay())`
  که `backoffDelay()=min(2000×2^min(attempts,8), 300000)`؛ toast فقط برایِ syncِ دستی.
- بهبود: چرخهٔ بعدی با پاسخِ ۲۰۰ صف را خالی می‌کند (BP6 این را می‌سنجد).

**متریک:** `payesh_sync_backpressure_rejections_total`.

---

## گپ ۲ — Delta Compression (فشرده‌سازیِ پاسخِ دلتا)

**مشکل:** پاسخِ pull یک JSONِ بزرگِ پرتکرار است؛ برایِ فیکسچرِ ۹۲۳k ردیفیِ فاز ۲
(پاسخِ کاملِ چند-ده-مگابایتی) یعنی پهنای‌باند و TLS بی‌دستاورد.

**طرح — `server/compress.js` (جدید):**
- `sendJsonCompressed(res, req, status, obj, sendJson)`: یک `JSON.stringify`، بعد
  مذاکره از `Accept-Encoding` — **gzip ارجح** (سطح ۶)؛ **brotli فقط وقتی کلاینت gzip
  نمی‌فهمد ولی br می‌فهمد** (کیفیت ۵ — نه ۱۱ پیش‌فرضِ zlib که برایِ درخواستِ زنده کند است).
- آستانه: بدنه‌های کوچک‌تر از `PAYESH_DELTA_COMPRESS_MIN_BYTES` (پیش‌فرض **۱۰۲۴**)
  نافشرده می‌مانند — سربارِ سرآیندها از صرفه‌جویی بیشتر می‌شود.
- **سازگاری:** `res` بدونِ `writeHead/end` (هارنس‌های تستِ قدیمی) ⇒ عیناً همان
  `sendJson` تزریقی؛ و **مقدارِ بازگشتیِ sendJson** از `apiPull` به فراخوان برمی‌گردد
  (قراردادِ pull-bootstrap).
- **ایمنی:** هر خطای zlib ⇒ سقوط به مسیرِ نافشرده — پاسخ هرگز به‌خاطرِ فشرده‌سازی نمی‌میرد.
- `Vary: Accept-Encoding` روی پاسخ‌های مذاکره‌شده (کشِ مشترکِ downstream سالم می‌ماند)؛
  `Cache-Control: no-store`.

**نتایجِ اندازه‌گیری (تست CM1/CM2):** فیکسچر ۳۰۰۰ ردیفِ نمره = **868.9KB خام → 51.8KB
gzip (۶٪) / 31.2KB brotli**؛ parse برمی‌گردد به JSONِ بایت‌به‌بایت یکسان (8.7ms).

**متریک:** `payesh_sync_delta_size_bytes` (خام) · `payesh_sync_delta_wire_bytes` (روی
سیم) · `payesh_sync_delta_compressions_total{encoding=gzip|br}` — همه روی پاسخِ ۲۰۰ِ
pull مشاهده می‌شوند.

---

## گپ ۳ — Cursor Warmup (کلیدِ پایدارِ بینِ restart)

**یافتهٔ ممیزی:** کلیدِ امضای کرسر **از پیش پایدار بود** — `PAYESH_CURSOR_SECRET` (≥۳۲
بایت) وگرنه اشتقاقِ domain-separated از کلیدِ JWT که خودش از keyfileِ دیسک
(`server/data/jwt.key`، read-or-create با mode 600) یا env می‌آید. کلیدِ تصادفیِ per-boot
**هرگز رخ نمی‌دهد** (بدونِ کلید ⇒ کرسر fail-closed خاموش است، pull باِ sinceِ legacy
کار می‌کند). آنچه غایب بود، **دیدن و اعتمادکردنِ اپراتور** به این پایداری بود.

**تحویل:**
- `resolveKey()` (جدید) منبعِ برنده را گزارش می‌کند:
  `explicit | env_cursor | env_jwt | none` — روی instance به‌صورتِ `cursor.keySource`.
- `PAYESH_CURSOR_SECRET` کوتاه‌تر از ۳۲ بایت ⇒ **هشدارِ بلند** (قبلاً بی‌صدا به کلیدِ
  JWT سقوط می‌کرد — رفتار همان، misconfig دیگر نامرئی نیست).
- لاگِ بوت: `cursor : enabled — key=keyfile (signed cursors survive restarts, ttl=3600s)`
  یا دلیلِ خاموشی.
- `/api/health` ⇒ `cursor: {enabled, persistent, key_source}`.

**شاهدِ تستی (CW1/CW3):** توکنی که در boot 1 امضا شده در boot 2 (همان keyfile)
verify می‌شود و توکنِ منقضی همچنان رد می‌شود؛ بوتِ واقعیِ فرآیند ×۲ با همان keyfile —
بلوکِ سلامتِ کرسر هر دو بار یکسان.

---

## گپ ۴ — Sync Metrics (پالسِ sync در سلامت)

`/api/health` ⇒ `sync: {…}` از `metrics.syncHealthStats(metrics.snapshot())` — تابعِ
محضِ top-level در metrics.js (جمعِ سری‌های برچسب‌دار + میانگینِ sum/count هیستوگرام‌ها +
صفر/null ایمن برایِ مشاهده‌نشده‌ها؛ قاعدهٔ Q3: فقط عدد، بدونِ دادهٔ session/tenant):

```
pulls_total · pulls_delta · pulls_full · pushes_total · conflicts_total
backpressure_rejections_total · cursor_expired_total · cursor_region_mismatch_total
delta_size_bytes_avg · delta_wire_bytes_avg · compressions_total
```

نقاطِ شمارش: `pulls{mode}` روی ۲۰۰ِ pull (از گپ ۲) · `pushes_total` فقط روی دستهٔ
**غیرخالیِ** موفق (200 زودهنگامِ دستهٔ خالی شمرده نمی‌شود) · `cursor_expired_total` روی
401ِ منقضی · `region_mismatch_total` روی 401ِ منطقه (گپ ۵).

---

## گپ ۵ — Multi-Region Ready (کرسرِ region-aware v2)

**مشکل:** در استقرارِ چندمنطقه‌ای (یا جفتِ HA با رازِ امضای مشترک)، کرسرِ صادرشده در
منطقهٔ A خطِ زمانیِ دادهِ منطقهٔ B را می‌پیمود اگر در آن‌جا replay شود — و LB بدونِ
stickiness این را بی‌صدا و روتین انجام می‌داد.

**طرح:**
- payload ‏**v2**: `{v:2, since, iat, exp, jti, rg}` — `rg` از `PAYESH_REGION`
  (trim، سقفِ ۳۲ نویسه، پیش‌فرض `'default'`).
- `verify`: v2 سالم از منطقهٔ دیگر ⇒ `{ok:false, code:'region_mismatch'}`؛ v2
  **بدونِ rg** (دست‌کاری‌شده ولی امضاشده) ⇒ `cursor_invalid` (fail-closed)؛ **v1 تا
  TTL خودش قبول** (دورهٔ گذار — توکن‌های پیش از ارتقا در rollout همه‌گیرانه full-pull
  نمی‌شوند).
- pull: `region_mismatch` از همان مسیرِ 401 + `cursor_renewal:'full_pull'` می‌گذرد ⇒
  کلاینتِ `29-pull.js` با مسیرِ تجدیدِ عمومی‌اش (دقیقاً یک pull کامل) آن را می‌خواباند —
  **بدونِ هیچ تغییرِ کلاینت**.
- متریک: `payesh_cursor_region_mismatch_total`.

**یادداشتِ استقرار:**
1. **LB را sticky نگه دارید** (به منطقه) — region_mismatch دفاع است، نه جایگزینِ
   stickiness.
2. `PAYESH_REGION` را در **هر instance** تنظیم کنید (خودِ token این را حمل می‌کند؛
   دو instance با یک مقدار = یک منطقهٔ منطقی).
3. رازِ امضای مشترک + برچسبِ rg یعنی توکنِ لو رفته بین‌منطقه‌ای فقط تا TTL خودش و فقط
   در خانهٔ خودش کار می‌کند.
4. ساعت‌های منطقه‌ای باید در همان کرانهٔ skew موجود (300s) بمانند — `iat` آینده ⇒
   `cursor_invalid` (قاعدهٔ موجود).

---

## گیت‌های نهاییِ فاز

smoke **547/547** · check-authz **0** · secret-scan **11/11** · `build --check` ✅ ·
delta-sync-hardening **19/19** · wave4-sync-all **13/13** · wave10 **14/14** ·
pull-bootstrap **12/12** · pull-rest-delete ✓ · pull-to-refresh ✓ · contract-layers
**18/18** · delta-schema-gaps **12/12** · sync-chunk ✓ · sync-atomic-batch **22/22** ·
**delta-phase4 23/23** · **delta-phase4-mutations 20/20** ✅

## حوادثِ این فاز

- **موجی‌بیکِ `.gitignore`** (کامیت `0c86c97`): دنبالهٔ UTF-16/NUL از کامیت قدیمیِ
  `9a08ac5` توسطِ git به‌عنوانِ قاعدهٔ تنها `*` خوانده می‌شد و **همهٔ فایل‌های جدید را
  بی‌صدا ignore می‌کرد** — تست‌های گپ ۱ و compress.js از کامیت‌های خودشان جا مانده بودند.
  تاریخچه با reset/rebuild تمیز بازسازی شد (هر گپ تست‌های خودش را دارد) و tail با
  الگوهای سالم (`*.bundle`, `*.tar.gz`, `*work.patch`) بازنویسی شد.
