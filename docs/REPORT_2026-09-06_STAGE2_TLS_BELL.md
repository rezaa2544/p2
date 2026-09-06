# گزارشِ مرحلهٔ ۲ِ سرور — TLS واقعی + پُلِ دوره‌ای ۱۳.۴ (۲۰۲۶-۰۹-۰۶)

## ۱) چه شد

دو بندِ «اتصال به سرور — مرحلهٔ ۲» که بدون وابستگیِ خارجی قابلِ اجرا بودند، به **کدِ واقعی** رسیدند:

### ۱.۱ TLS واقعی (بندِ تازهٔ ۱۴.۲ در ARCHITECTURE_DECISIONS)

- `server/tls-cert.js` — سازندهٔ گواهیِ self-signedِ X.509 v3 (RSA-2048/SHA-256) **فقط با کتابخانهٔ استاندارد** (`crypto`):
  DER به‌صورت دست‌ساز (TBS → SPKI → امضای SHA-256/RSA)، نامِ موضوع دلخواه (پیش‌فرض `payesh-local`)،
  بازهٔ اعتبار −۱ روز تا +۸۲۵ روز، serial تصادفی ۱۵ بایت، `basicConstraints CA:TRUE`.
  خروجی: `tls.crt` + `tls.key` (PEM). بدون openssl، بدون وابستگی.
- `server/index.js` — با `PAYESH_TLS_CERT`/`PAYESH_TLS_KEY` سرور واقعاً با `https.createServer` بالا می‌آید؛
  HSTS و کوکیِ `Secure` خودکار فعال می‌شوند (`isHttps`). یکی‌شان بدونِ دیگری، یا فایلِ غایب =
  راه‌اندازیِ **شکسته** با پیامِ روشن و خروج از فرآیند. `PAYESH_HTTPS=1` معنایِ قبلی را نگه داشته
  (پشتِ TLS reverse-proxy).
- پاسخِ `/api/health` حالا `pid` فرآیند را هم می‌دهد — برای guard تست‌ها (بخش ۲).

**مرزِ صریح:** این گواهی گواهیِ **مرحلهٔ محلی/تست** است. مرورگرها آن را نامعتبر می‌دانند و
در تست‌ها با `rejectUnauthorized:false` خوانده می‌شود. گواهیِ production (رسمی/پروکسی) باقی است —
همان بندِ زمانیِ ۱۴.۱.

### ۱.۲ پُلِ دوره‌ای ۱۳.۴ (قفلِ معماری → پیاده‌سازی)

- `server/bell.js` — endpoint خُردِ `GET /api/bell/now`:
  - scope **فقط از JWT** (نه از بدنه): ولی → فقط `parent_links` خودش؛ دانش‌آموز → فقط خودش؛ دبیر → `teacher.schoolId` (بدون family).
  - بدون نشست: `401 {code:'no_session'}`.
  - payload خُرد: `{ok:true, ts, date, family:[{studentId, att}], teacher:{schoolId}|null}` —
    `att` = حضورِ امروز از storeٔ سرور (برای مرورِ چنددستگاهی)؛ برچسبِ نمایشی سمتِ کلاینت است.
  - هر فراخوانی رویدادِ `bell_now` در آدیتِ append-only می‌نویسد.
- کلاینت (`46-bell-now.js`) — تیکِ زنده حالا دو شاخه است:
  - حالتِ محلی (عینِ قبل): رندر از دادهٔ مرورگر.
  - حالتِ سروری (`DATA_MODE==='server'`): fetch به `/api/bell/now`؛ **گاردِ سخت**:
    `ok===true` و `ts` عدد و `family` آرایه — وگرنه **پس‌رویِ محلی** (نشستِ مرده، سرورِ خاموش،
    بدنِ دست‌کم‌به‌هم — همه یک رفتار امن دارند). در موفقیت: `ts` به `SERVER_TIME_KEY` می‌نشیند
    (لایهٔ ۳ِ clockSanity)، حضورِ سرور روی دادهٔ محلی **overlay** می‌شود، رندر با ساعتِ سرور.
  - dedupe: دو تیکِ هم‌زمان فقط یک fetch می‌سازند (`bellLiveInFlight`).
  - `bellLiveCache` آخرین پاسخِ معتبر را نگه می‌دارد (تست/عیب‌یابی).

### ۱.۳ جدولِ کامیت‌ها

| کامیت | بند | محتوا |
|---|---|---|
| `49ef5f3` | TLS واقعی | `tls-cert.js` + TLS در `index.js` + `tests/server4.js` |
| `609ad23` | پُلِ دوره‌ای ۱۳.۴ | `bell.js` + route + کلاینت + `tests/server5.js` + جهش‌ها + بیلد + حلِ conflictِ راهنما |
| (کامیتِ این گزارش) | مستندات | AD ۱۳.۴/۱۴.۱/۱۴.۲ · DEVELOPMENT · AI_PROMPT · CONTRIBUTING · HANDOFF · این گزارش |

## ۲) سنجشِ واقعی (نه ادعا)

| آزمایش | نتیجه |
|---|---|
| `tests/server4.js` (TLS واقعی) | **۱۶/۱۶ ✅** — گواهی با `X509Certificate` (CN، notAfter > +۳۶۵ روز) · https واقعی · HSTS · CSP با nonce روی https · send-code (`demo_code`) · login · کوکی `HttpOnly; SameSite=Lax; Secure` · `/me` · گواهیِ غایب = فرآیند نمی‌ماند + پیامِ «TLS file missing» |
| `tests/server5.js` (پُلِ دوره‌ای) | **۱۴/۱۴ ✅** — A: 401 بدون نشست · ولی = دقیقاً `parent_links` خودش · att از storeٔ سرور · دانش‌آموز = فقط خودش · دبیر = `teacher.schoolId` · `ts` در بازهٔ ۵ دقیقه · `bell_now` در آدیت. B (jsdom + index.htmlِ واقعی): تیکِ سروری (fetch + cache + `SERVER_TIME_KEY`) · overlay (سبز روی قرمزِ محلی) · پس‌رویِ محلی با cache دست‌نخورده · dedupe (۲ تیک = ۱ fetch) · حالتِ محلی صفر fetch |
| `tests/server-mutations.js` | **۱۲/۱۲ جهشِ کشته** — M9 فیلترِ scope · M10 پرچمِ Secure · M11 گاردِ بدن · M12 اولویتِ overlay (+ M1–M8 دورِ قبل) |
| بازگشت‌آزمون | server1 ۳۰/۳۰ · server2 ۲۵/۲۵ · server3 ۱۹/۱۹ · run ۳۳/۳۳ · bell2 ۸/۸ — **همه سبز** |

## ۳) چه چیزهایی پیدا شد (دام‌های ثبت‌شده)

1. **portِ دست‌سپار:** سرورِ ماندهٔ دورِ شکسته port تست را نگه داشته بود و با کدِ کهنه پاسخ می‌داد؛
   تست «با کدِ تازه» شکستِ مبهم می‌داد. راه‌حل: `pid` در health + تطبیق در boot-wait.
   قانون: هر سرورِ spawn‌شده‌ای که test kill نکند، با `ss -tlnp` پیدا و kill شود.
2. **catch-allِ fetch:** اگر تابعِ `finish` در زنجیرهٔ promise پرت کند، `.catch` همان
   `finish(false,null)` را صدا می‌زند — پس «حذفِ گاردِ بدن» با بدنی که `family` ندارد **پیدایی
   نمی‌شود**. جهشِ M11 با بدنی بدونِ `ok` ولی با `ts`/`family` معتبر کشته شد (دنیایِ بدونِ گارد
   آن را در cache ذخیره و اعمال می‌کند؛ دنیایِ درست ردش می‌کند).
3. **DERِ X.509:** `openssl asn1parse` گواهیِ خراب را هم پارس می‌کند (پارسِ شل) — سه باگِ
   ساخت (SPKI دو‌بار پیچیده، RDN باید SET باشد، نسخهٔ v3) فقط با `X509Certificate`/`openssl x509`
   پیدا شدند. ثبت شد در CONTRIBUTING.
4. **`sessionFrom`** کاربرِ **ادغام‌شده** برمی‌گرداند (`{jti,token}` + user با `id`، بدون `sub`) —
   endpoint‌ها باید مستقیم از آن استفاده کنند؛ lookup دوم = `401` مبهم.
5. **conflictِ متعهدشده:** `USER_GUIDE.html` markerهای merge (`<<<<<<<`) از دورِ قبل داشت —
   حل شد؛ حالا یک مُهرِ واحد با `index.html` (`88a301dece50`).

## ۴) باقی‌مانده (مرحلهٔ ۲ — وابسته به درگاه/تصمیمِ کاربر)

- درگاه‌های واقعیِ پیامک و استعلامِ کد ملی (امروز: کد در حافٔهٔ سرور + بازتابِ اختیاریِ دمو).
- استورِ آبجکت (قفل ۱۳.۳ — ON HOLD).
- گواهیِ production (رسمی) + پروکسیِ TLS.
