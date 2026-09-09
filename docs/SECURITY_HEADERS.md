# سرآیندهایِ امنیتی (Security Headers — کنترلِ P5)

- **تاریخ:** ۱۹/۰۶/۱۴۰۵ (2026-09-09) — شاخهٔ `arena/01a0827b-p2`
- **پیاده‌سازی:** `securityHeaders()` + `buildCsp()` در `server/index.js:261-278`
- **تست:** `tests/security-headers.js` (۶ بررسی) + `tests/csp-nonce.js` (۴ بررسی)

---

## ۱. فهرستِ سرآیندها (رویِ همهٔ پاسخ‌ها، از جمله JSON)

| سرآیند | مقدار | چرا |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'nonce-{N}'[ 'unsafe-eval' در dev]؛ style-src 'self' 'nonce-{N}'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` | مهارِ XSS (اسکریپت/استایل فقط با nonceِ همان درخواست)؛ بدونِ `unsafe-inline`؛ فرم و base محدود به خود |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` — فقط رویِ https | ضدِ MITM/SSL-strip؛ preload یعنی قابلِ ثبت در فهرستِ مرورگرها |
| `X-Frame-Options` | `DENY` | ضدِ Clickjacking (لایهٔ دوم کنارِ `frame-ancestors`) |
| `X-Content-Type-Options` | `nosniff` | ضدِ MIME-sniffing |
| `Referrer-Policy` | `same-origin` | هیچ ارجاعی به بیرون درز نمی‌کند (سخت‌گیرانه‌تر از پیش‌فرض‌ها) |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` | بستنِ APIهایِ حساسِ مرورگر |

## ۲. تولیدِ nonce

- هر درخواست: `crypto.randomBytes(16).toString('base64')` (۱۲۸ بیت، §۵.۶.۲ قرارداد)
  در `server/index.js:324` ساخته می‌شود؛ هم در سرآیندِ CSP می‌نشیند هم جایِ
  `__PAYESH_NONCE__` در HTML (رویِ `<script>` و `<style>` یکتایِ باندل — `build.js:46-49`).
- تازگی: دو درخواستِ پشتِ سر هم nonce متفاوت می‌گیرند (تستِ N2)؛ بازپخشِ nonce بی‌اثر است.

## ۳. تفاوتِ development و production

| محیط | تشخیص | CSP |
|---|---|---|
| production | `PAYESH_ENV=production` (با fail-fast: بدونِ TLS مستقیم یا `PAYESH_BEHIND_PROXY=1` بالا نمی‌آید) | بدونِ `unsafe-eval` |
| development | هر چه غیرِ production | `script-src` شاملِ `'unsafe-eval'` برایِ دیباگ (sourcemap/eval ابزارها) |

HSTS در production همیشه صادر می‌شود چون production بدونِ TLS (مستقیم یا پشتِ پروکسیِ
اعلام‌شده با `PAYESH_HTTPS=1`) اصلاً بوت نمی‌شود؛ تصمیمِ https با همان الگویِ S-73-4
(`isHttps`) گرفته می‌شود تا `X-Forwarded-Proto`یِ جعلی HSTS/Secure را فعال نکند.

## ۴. انحراف‌هایِ آگاهانه از تمپلیتِ اولیه (با دلیل)

| تمپلیت می‌گفت | پیاده‌سازی | دلیل |
|---|---|---|
| `Referrer-Policy: strict-origin-when-cross-origin` | نگه‌داشتنِ `same-origin` | سخت‌گیرانه‌تر است (صفر درز به بیرون) و تستِ S3 در `server1.js:148` آن را پین کرده؛ شل‌کردن بدونِ نیازِ کارکردی، خلافِ جهتِ «سخت‌سازی» |
| `style-src 'unsafe-inline'` | نگه‌داشتنِ nonce | سخت‌گیرانه‌تر است و باندل از قبل `nonce` رویِ `<style>` دارد؛ شل‌کردن هیچ سودی ندارد |
| حذفِ `font-src`/`base-uri`/`form-action` | نگه‌داشتنِ هر سه | حذف = تضعیف؛ این دستورها از قبل فعال‌اند |
| `connect-src ... https://api.payesh.ir` | فقط `'self'` | صفر ارجاع به `api.payesh.ir` در کلِ کد (اپ same-origin است)؛ افزودنِ originِ بی‌استفاده سطحِ حمله را بی‌دلیل باز می‌کند |

## ۵. راستی‌آزماییِ دستی

```bash
curl -sI http://127.0.0.1:3000/ | grep -iE "content-security-policy|x-frame|nosniff|referrer|permissions"
PAYESH_HTTPS=1 curl -sI http://127.0.0.1:3000/ | grep -i "strict-transport"  # باید preload داشته باشد
node tests/security-headers.js   # 6/6
node tests/csp-nonce.js          # 4/4
```
