# Pen-test Checklist (Wave 13)

> موج ۱۳ (چت ۲) — تاریخ: ۲۰۲۶-۰۹-۰۹ · شاخه: `arena/01a085ca-p2` · PR #39
>
> چک‌لیستِ آمادگیِ تستِ نفوذ برای سامانهٔ payesh (کلاینتِ آفلاین-اولِ تک‌فایلی +
> سرورِ Node). هر سناریو: هدف، روشِ اجرا، ابزار، و نشانیِ نگهبانِ موجود در ریپو
> (اگر هست). این سند آمادگیِ پنتست را مستند می‌کند؛ اجرایِ زنده علیه محیطِ
> استیجینگ = pending (در سندباکس سرورِ زنده/استورِ سیدشده در دسترس نیست).

---

## ۰) پیش‌نیازها و راه‌اندازیِ هدف

- محیطِ هدف: یک **استیجینگ** با استورِ سیدشدهٔ واقعی
  (`node server/seed.js` → `server/data/payesh.json`) و Redis زنده.
- کلاینت ساخته‌شده: `node build.js` (یا `build:check`).
- ابزارها: Burp Suite Community/Pro · OWASP ZAP · curl/jq · یک حسابِ هر ۷ نقش
  (superadmin/manager/teacher/student/parent/counselor/…).
- قبل از تست در محیطِ production: توکنِ TLS معتبر و هدِرهایِ امنیتی را تأیید کنید.

---

## ۱) سناریوهای تست نفوذ

### ۱.۱ Authentication Bypass / Session
| تست | روش | نگهبانِ موجود |
|---|---|---|
| حدسِ کدِ OTP / تکرارِ لاگین | تلاشِ لاگینِ مکرر با کدهایِ اشتباه | `otp-store`, `rate-limit`, سقفِ OTP (`otp-ratelimit.js`) |
| Enumeration (کد ملی/شماره) | شمارشِ ردها و تأخیر/ابطالِ مرحله‌ای | نگهبانِ R97 (`index.js`: enum warn/slow/revoke) |
| دستکاریِ JWT / الگوریتم | رمزگشایی و تغییرِ payload | HS256 کلیدِ ≥۲۵۶ بیت + rotation (`PAYESH_JWT_SECRET_PREV`) |
| کوکیِ نشست | برداشتنِ `HttpOnly`/`Secure` | ست‌شدن بر اساسِ TLS/پروکسی (`isHttps`) |

### ۱.۲ IDOR / Authorization (Tenant isolation)
| تست | روش | نگهبانِ موجود |
|---|---|---|
| خواندن/نوشتن رکوردِ مدرسهٔ دیگر | واکشیِ `/api/students/:id` با id خارجِ محدوده | `idor.js`, scope در sync (`out_of_scope`/`school_mismatch`) |
| ارتقایِ نقش (role escalation) | ادعایِ اکشن/نقشِ بالاتر در صف | `ACTION_ROLES` ⇄ `WRITE_PERMS` + `tools/check-authz.js` (پارتی) |
| جعلِ هویت (forged_by) | ارسالِ op با `by`/`user_id` جعلی | `sync.js`: `forged_by`, `user_mismatch` |
| دسترسیِ مشاور/دبیر به دادهٔ محدود | بازکردنِ صفحهٔ حساس | scope لایهٔ پروجکشن (`middleware/projection`) + smoke role tests |

### ۱.۳ XSS (Client)
| تست | روش | نگهبانِ موجود |
|---|---|---|
| استیجِ شده در innerHTML | تزریقِ `<img onerror>` در نام/متن | `esc`/`escAttr`, CSP nonce |
| XSS در چت/صندوق/نظرات | payload در بدنه | `xss-guard.js` (suites: شِل، چت، attribute) |
| شکستنِ CSP | تزریقِ `<script>` | CSP strict + nonce در `index.js` |
| XSS ذخیره‌شده (صفِ مدیر/پیامک) | نامِ مخربِ دانش‌آموز | smoke: «نام مخرب اجرا نمی‌شود» |

### ۱.۴ SQL Injection / NoSQL (Server)
| تست | روش | نگهبانِ موجود |
|---|---|---|
| تزریق در پارامتر | `' OR 1=1` در query/filter | کوئری‌هایِ پارامتری (`$n`) در `db.js`/`dbquery.js`/`syncdelta.js` |
| تزریقِ نامِ جدول/ستون | دستکاریِ `c`/کلیدها | allowlist در `dbquery`/`syncdelta`؛ ردِ `unknown_collection` |
| NoSQL/injection در Store | کلیدِ `__` | isPgReadableTable، ردِ کلیدهایِ داخلی |

### ۱.۵ CSRF
- توکن/سمانتیک: مسیرهایِ مخصوص (سرور HTTP). بررسی کنید که فرمت‌هایِ تغییر
  (POST/PATCH/DELETE) به CSRF-mechanism مجهزند یا فقط در اپِ SPA با fetch
  هم‌منشأ صدا زده می‌شوند (SameSite؛ `connect-src 'self'`).

### ۱.۶ SSRF / Request smuggling
- همهٔ فراخوانی‌هایِ خارجی (SMS/اعلان) به‌سمت دروازهٔ کنترل‌شده می‌روند؛
  اطمینان از نبودِ URL بازِ کاربر-قابل در fetch سمتِ سرور.

---

## ۲) ابزارهای مورد نیاز

- **OWASP ZAP** — DAST baseline در CI (`zaproxy/actions-baseline@v0.12.0`،
  best-effort؛ به `SECURITY_TARGET_URL` نیاز دارد) و اسکنِ تعاملیِ محلی.
- **Burp Suite** — پروکسی + Repeater برایِ تستِ دستیِ IDOR/XSS/auth.
- **npm audit / npm sbom** — SCA و SBOM.
- **repo tools** — `tests/secret-scan.js`, `tests/run.js`, `tools/check-authz.js`,
  `tests/waf-ddos.js --unit-only`, `nginx -t`.

---

## ۳) دستورالعمل اجرا

```bash
# دروازه‌هایِ محلی (قبل از هر پنتست)
node tests/run.js
node tools/check-authz.js
node tests/secret-scan.js
node build.js --check

# DAST local (ZAP CLI یا baseline) — نیاز به سرورِ زنده
#   zap-baseline.py -t https://staging.example.com -r report.html

# پنتستِ دستی با Burp: یک جلسه در هر نقش + سناریوهایِ جدولِ بالا
```

**روشِ گزارش:** هر یافته با شدت (Info/Low/Medium/High/Critical)، نقشِ واکشی، و
نشانهٔ بازتولید (PoC). روی خروجیِ CI (SAST/SCA/Secret) آپلود شود.

---

## ۴) قیدِ صداقت

اجرایِ زندهٔ پنتست به محیطِ استیجینگ/سیدشده و ابزارِ خارجی نیاز دارد که در
سندباکسِ این موج در دسترس نیست؛ این سند «آمادگی» (readiness) را فراهم می‌کند و
اجرایِ واقعی + نتایج، pending است.
