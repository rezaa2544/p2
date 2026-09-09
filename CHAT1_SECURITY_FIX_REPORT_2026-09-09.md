# گزارشِ چت ۱ — رفعِ ۲ یافتهٔ متوسطِ ممیزیِ امنیتی (F-AUTH-01 و F-CSRF-01)

- **تاریخ:** ۱۹/۰۶/۱۴۰۵ (2026-09-09)
- **شاخه:** `arena/01a0827b-p2` — رویِ گیت‌هاب به‌روز شد (push شد)
- **کامیت:** `37494e5` با پیامِ `fix(security): address F-AUTH-01 and F-CSRF-01`
- **مبنا:** `docs/SECURITY_AUDIT_REPORT.md` (یافته‌هایِ MEDIUM)

---

## ۱. جدولِ کامیت‌ها

| # | کامیت | پیام | محتوا |
|---|--------|------|-------|
| ۱ | `37494e5` | `fix(security): address F-AUTH-01 and F-CSRF-01` | ۴۶ فایل (۸۰۱+/۹۵−): ماژولِ `server/client-ip.js` + سیم‌کشی در `auth.js`/`audit.js`/`index.js`؛ توکنِ CSRF (claim نشست + کوکی + نگهبانِ مرکزی + اتصال در کلاینت)؛ احرازِ مجدّدِ OTP برایِ حذفِ حساب؛ `tests/ip-trust.js` و `tests/csrf.js`؛ مهاجرتِ ۷ سوئیتِ API و ۲۴ سوئیتِ قدیمی به هارنسِ CSRF؛ بیلدِ تازه؛ به‌روزرسانیِ `docs/DEPLOY.md` و `HANDOFF.md` |

---

## ۲. چه چیزی رفع شد

### F-AUTH-01 — اعتمادِ بی‌قیدِ X-Forwarded-For (MEDIUM → رفع شد)

**مشکل:** هر دو `clientIp` (در `server/auth.js` و `server/audit.js`) اولین خانهٔ `X-Forwarded-For`
را کورکورانه قبول می‌کردند؛ مهاجمِ مستقیم می‌توانست IP دلخواه جا بزند و سقف‌هایِ نرخیِ
IP-محور و لاگِ حسابرسی را مسموم کند.

**رفع:**
- `server/client-ip.js` (تازه): `normalizeIp` (اعتبارسنجی با `net.isIP`، حذفِ `::ffff:`،
  lowercase)، `parseTrustedProxies` (خوانشِ `PAYESH_TRUSTED_PROXIES`)، `getClientIp`
  (پیمایشِ زنجیرهٔ `[xff..., peer]` از راست به چپ تا اولینِ غیرقابل‌اعتماد؛ خانهٔ
  نامعتبر نادیده گرفته می‌شود — fail-closed به‌سمت peer).
- **پیش‌فرضِ امن:** اگر env تنظیم نشده باشد فقط loopback (`127.0.0.1` و `::1`) مورداعتماد
  است — یعنی استقرارِ استانداردِ تک‌میزبانه با reverse-proxy رویِ همان ماشین بدونِ هیچ
  تنظیمی امن است، و اتصالِ مستقیمِ مهاجم هرگز XFF را معتبر نمی‌کند.
- `index.js` مجموعه را یک‌بار در بوت می‌سازد و به `createAuth`/`createAudit` تزریق می‌کند.

### F-CSRF-01 — نبودِ توکنِ CSRF + حذفِ حسابِ تک‌مرحله‌ای (MEDIUM → رفع شد)

**رفع (۴ لایه):**
1. **صدور:** در login، توکنِ ۶۴hex هم claim داخلِ JWT می‌شود هم کوکیِ قابل‌خواندنِ
   `csrf_token` (SameSite=Lax، بدونِ HttpOnly تا JS بخواند).
2. **نگهبانِ مرکزی** در `server/index.js`: هر جهشِ `/api` (POST/PUT/PATCH/DELETE) با نشستِ
   معتبر — به‌جز `send-code`/`login` که پیش‌احراز‌اند — باید `X-CSRF-Token` برابرِ claim
   داشته باشد وگرنه **403** (`csrf_required`/`csrf_mismatch` + ایونتِ `csrf_denied` در آدیت).
   بدونِ نشست، تصمیم با روتِ مقصد است (کدهایِ 401 موجود دست‌نخورده ماندند).
3. **کلاینت:** `Api.request` (تک‌گذرگاهِ همهٔ جهش‌ها) رویِ متدهایِ غیرِ GET توکن را از کوکی
   می‌خواند و در سرآیند می‌نشاند.
4. **حذفِ حساب:** بدنه حالا فقط `{code}` می‌پذیرد — کدِ OTPِ همان شمارهٔ نشست (یک‌بارمصرف،
   tries محدود، `account_delete_denied` در آدیت). مودالِ ورودِ کد در `58-privacy.js` عمداً
   **بدونِ data-act تازه** ساخته شد (سیم‌کشی با id) تا نقشهٔ مجوزها دست‌نخورده بماند؛ صفحهٔ
   مستقلِ `/account-deletion` هم کد را می‌فرستد و سرآیند را می‌نشاند.

**سازگاریِ آگاهانه:** نشست‌هایِ قدیمیِ بی‌claim تا ورودِ دوباره رویِ جهش‌ها 403 می‌گیرند
(fail-closed)؛ در `DEPLOY.md` و HANDOFF مستند شد.

---

## ۳. تست‌ها

| سوئیت | نتیجه |
|---|---|
| `tests/ip-trust.js` (تازه، ۱۵ بررسیِ خالص) | 15/15 ✅ |
| `tests/csrf.js` (تازه، ۱۲ بررسیِ یکپارچه) | 12/12 ✅ |
| `tests/api/runner.js` (۷ سوئیتِ REST) | 7/7 ✅ |
| سوئیت‌هایِ قدیمیِ مهاجرت‌شده (server1..18، scopeها، security2، integration، server3، dropout، policy، iep3، sim_full3، ...) | همه سبز ✅ |
| `tests/otp-ratelimit.js` (بدونِ هیچ تغییری — اثباتِ سازگاریِ XFF) | 49/0 ✅ |

**گیت‌هایِ الزامی (همه سبز):**

| گیت | نتیجه |
|---|---|
| smoke | 547/547 ✅ |
| check-authz | ۰ (تطبیق کامل) ✅ |
| secret-scan | 11/11 ✅ |
| lint | ۰ خطا (۵۹ هشدارِ پایه، بدونِ افزایش — LRMهایِ تازه پاک شدند) ✅ |

**نکته‌هایِ محیطی (نه مشکلِ کد):** server3 وسطِ اجرایِ پشت‌سرهم S2 را از دست داد (sleep
ثابت + لود) ولی تکی 19/19 سبز است؛ خرابیِ گذرایِ A0b در server9 اثرِ سرورِ یتیمِ
security2 رویِ پورتِ 8995 بود (پس از kill: ‏10/10‏ ✅).

---

## ۴. فایل‌هایِ کلیدی

- پیاده‌سازی: `server/client-ip.js` (تازه)، `server/auth.js`، `server/audit.js`،
  `server/index.js`، `src/js/00-data-layer.js`، `src/js/58-privacy.js`، `account-deletion.html`
- تستِ تازه: `tests/ip-trust.js`، `tests/csrf.js`
- مستندات: `docs/DEPLOY.md` (ردیفِ `PAYESH_TRUSTED_PROXIES` + نکتهٔ پروکسی)، `HANDOFF.md`
- بیلدِ تازه: `index.html` (مهرِ `1aa9f08d0384`)، `USER_GUIDE.html`، `cdn-manifest.json`

**وضعیتِ گیت:** همه‌چیز در کامیتِ `37494e5` رویِ `arena/01a0827b-p2` پوش شد؛ درخت تمیز.
