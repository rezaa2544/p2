# گزارشِ چت ۱ — سخت‌سازیِ سرآیندهایِ امنیتی (P5، جایگزینِ چت ۳)

- **تاریخ:** ۱۹/۰۶/۱۴۰۵ (2026-09-09)
- **شاخه:** `arena/01a0827b-p2` — رویِ گیت‌هاب به‌روز شد (push شد)
- **کامیتِ کار:** `ea88b89` با پیامِ `feat(security): implement security headers hardening`
- **سندِ تحویلی:** `docs/SECURITY_HEADERS.md`

---

## ۱. جدولِ کامیت‌ها

| # | کامیت | پیام | محتوا |
|---|--------|------|-------|
| ۱ | `ea88b89` | `feat(security): implement security headers hardening` | ۵ فایل (۲۷۸+/۷−): `buildCsp` + سرآیندهایِ سخت‌شده در `server/index.js`؛ `tests/security-headers.js` و `tests/csp-nonce.js`؛ `docs/SECURITY_HEADERS.md`؛ ورودیِ HANDOFF |

---

## ۲. چه چیزی پیاده شد

- **HSTS:** `max-age=31536000; includeSubDomains; preload` — فقط رویِ https؛ در production
  همیشه صادر می‌شود چون production بدونِ TLS (مستقیم یا `PAYESH_BEHIND_PROXY=1`) بوت
  نمی‌شود (fail-fast موجود).
- **CSP با nonceِ هر-درخواست** (`crypto.randomBytes(16)`) رویِ script/style؛ بدونِ
  `unsafe-inline`؛ `unsafe-eval` فقط در غیرِ production (تشخیص با همان `PAYESH_ENV`
  موجود)؛ `buildCsp` خالص و اکسپورت‌شده برایِ تستِ هر دو شاخه.
- **`Permissions-Policy`** هم‌ترازِ تمپلیت؛ `DENY` و `nosniff` و سرآیندها رویِ همهٔ
  پاسخ‌ها (حتی JSON) حفظ شدند.

**۴ انحرافِ آگاهانه از تمپلیت (اصل: سخت‌سازی، نه تضعیف — هر ۴ در §۴ سند با دلیل):**
`same-origin` نگه داشته شد (سخت‌گیرانه‌تر + پین‌شده در S3)، `style-src` با nonce ماند،
`font-src`/`base-uri`/`form-action` حذف نشدند، و `api.payesh.ir` (صفر ارجاع در کد) به
`connect-src` اضافه نشد.

**تست:** `security-headers.js` ‏6/6‏، `csp-nonce.js` ‏4/4‏؛ رگرسیون: server1 ‏31/31‏،
server4 ‏16/16‏، security2 ‏25/0‏. بدونِ نیاز به بیلد (صفر تغییر در `src/`).

---

## ۳. گیت‌هایِ الزامی (همه سبز)

| گیت | نتیجه |
|---|---|
| `node tests/smoke.js` | 547/547 ✅ |
| `node tools/check-authz.js` | خروجیِ ۰ ✅ |
| `node tests/secret-scan.js` | 11/11 ✅ |
| HSTS در production | فعال (fail-fast تضمین می‌کند + تستِ H4) ✅ |

**وضعیتِ گیت:** کامیتِ `ea88b89` رویِ `arena/01a0827b-p2` پوش شد؛ درخت تمیز.
چت ۱ برایِ کارِ بعدی آماده است. ✅
