# SECURITY_MODEL.md — مدل امنیتی نهایی (Wave 13)

> موج ۱۳ (چت ۲) — تاریخ: ۲۰۲۶-۰۹-۰۹ · شاخه: `arena/01a085ca-p2` · PR #39
>
> جمع‌بندیِ مدلِ امنیتیِ سامانهٔ payesh و جایگاهِ «Security Program» (SAST/SCA/
> SBOM/DAST/Secret) در CI. این سند مدلِ موجود را مستند و با سیاستِ
> fail-closed پیوند می‌زند.

---

## ۱) اصولِ حاکم

1. **Fail-closed:** هر عملیاتی که گاردِ نقش/محدودهٔ صریح نداشته باشد رد می‌شود
   (`role_denied`, `out_of_scope`, `forged_by`). کلاینت و سرور مدلِ مجوزِ مشترکی
   دارند و `tools/check-authz.js` یکتاییِ آن را در CI می‌سنجد.
2. **Scope فقط حذف می‌کند (monotonic):** فیلترهایِ نقش/مدرسه فقط ردیف را حذف
   می‌کنند، هرگز اضافه — پس نمی‌تواند دادهٔ خارجِ محدوده را «برگرداند».
3. **Allowlist + پارامتری:** نامِ جدول/ستون همیشه از allowlist، هر مقدارِ کاربر
   پارامترِ مقید (`$n`). هیچ درون‌ریزیِ SQL از ورودی نمی‌سازد.
4. **PostgreSQL = منبعِ حقیقت وقتی زنده است** با fallbackِ شفاف؛ لایهٔ DB تک‌نقطهٔ
   دسترسی است (نوشتن→primary، GET-list سنگین→read-replica).
5. **Offline-first با کنترل:** صفِ آفلاین سقف دارد (تعداد/حجم/سن/تلاش)، قلمِ مسموم
   dead-letter می‌شود؛ حافظهٔ مرورگر هرگز بی‌کنترل پر نمی‌شود.

---

## ۲) لایه‌هایِ مدل

### ۲.۱ احراز هویت (Authentication)
- لاگین: تلفن + کد (OTP) + کد ملی → **JWT (HS256) در کوکیِ HttpOnly**.
  کلید ≥ ۲۵۶ بیت؛ چرخش با `PAYESH_JWT_SECRET_PREV` برای نشست‌هایِ باز.
- OTP با TTL و سقفِ نرخ/تلاش (`otp-store` + rate-limit)؛ شمارشِ رد در پنجرهٔ
  ۱۰ دقیقه با تأخیرِ مرحله‌ای و ابطالِ نشست (نگهبانِ R97).
- نشتِ اجباریِ کدِ دمو فقط با opt-in (`PAYESH_DEMO_CODE=1`).

### ۲.۲ مجوز (Authorization / Tenant isolation)
- نقش‌ها: `superadmin`, `manager`, `teacher`, `student`, `parent`, `counselor`, `driver`.
- کلاینت `ACTION_ROLES` (اکشن→نقش)؛ سرور `WRITE_PERMS` (نقش→مجموعه). پارتیِ
  `tools/check-authz.js` هر اکشنِ نویسنده را با نقش‌هایش تطبیق می‌دهد.
- ردهایِ پایدار سرور (`SYNC_DEAD_CODES` در کلاینت؛ `field_denied`,
  `role_denied`, `out_of_scope`, `forged_by`, `school_mismatch`,
  `conflict_preserved`, `stale_base`, `validation_failed`, `oversized_op`…) →
  dead-letter، دوباره‌ارسالِ بی‌فایده نمی‌شود.
- IDOR: نقطهٔ خوانشِ تک‌رکوردی با scope/audit (`idor.js`, `middleware/projection`).

### ۲.۳ اعتبارسنجی و لایهٔ مقدار
- ورودی از دروازهٔ اعتبارسنجی عبور می‌کند (`validate.js`)؛ مقدارِ نامعتبر
  `validation_failed` → dead-letter.
- هدِرهایِ امنیتی + **CSP strict با nonce** در هر پاسخ (`index.js`)؛
  `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS.

### ۲.۴ همگام‌سازی (sync/push/pull)
- Push: batch + ایدمپوتانس (`uid`), OCC با `base_version`, دلتا با
  `(updated_at,id)` + keyset cursor (بندِ A01/Wave4)؛ scope در JS فقط حذف.
- Pull DB-native وقتی PG زنده (بدون اسکنِ کل جدول)؛ سنگ‌قبر (tombstone) آماده در
  `server_tombstones` (فعال‌شدن pending بر write-side PG).
- Tombstone‌بندی/ایدمپوتانس/ممیزی در یک تراکنش → «push در یک تراکنشِ PG» همچنان
  **pending** (موجِ دارای PG).

### ۲.۵ سمتِ کلاینت (XSS / اسکوپ)
- `esc`/`escAttr` برای هر درجِ متن؛ آزمون‌هایِ XSS (شِل/چت/attribute)؛ CSP +
  `connect-src 'self'` (بدون fetch به دامنهٔ خارجی — تضمینِ offline).
- ذخیرهٔ صفِ آفلاین محدود و مقاوم در برابرِ پرشدنِ حافظه.

### ۲.۶ عملیات و زیرساخت
- WAF فقط-تشخیص (P-WAF) + nginx در لبه؛ هدرهایِ امنیتی؛ rate-limit دو لایه؛
  audit لاگِ ضمیمه‌شونده/پاک‌سازی‌شده (بدون PII حساس)؛ بکاپ، OTP خارج از store،
  GC نقشه‌هایِ فقط-رشد.

---

## ۳) Security Program در CI (این موج)

`.github/workflows/security.yml` اکنون چند-جاوبی است:

| جاب | نوع | ابزار (repo-native) | قید |
|---|---|---|---|
| `sast` | SAST | `node tests/run.js` + `tools/check-authz.js` + syntax | سخت (گیت) |
| `secret` | Secret | `node tests/secret-scan.js` | سخت (گیت) |
| `waf` | WAF | `waf-ddos.js --unit-only` + `nginx -t` | سخت (گیت) |
| `sca` | SCA | `npm audit --audit-level=high` | best-effort |
| `sbom` | SBOM | `npm sbom` (SPDX) + آپلود | best-effort |
| `dast` | DAST | OWASP ZAP baseline | best-effort؛ نیاز به `SECURITY_TARGET_URL` |

**نکتهٔ صداقت:** برای SAST از گیت‌هایِ ایستایِ خودِ ریپو استفاده شد (بدون اختراعِ
ESLint). سئوت‌هایِ jsdomِ وابسته به بوتِ سرور (xss-guard/security/waf-full) به
استورِ سیدشده نیاز دارند و در جریانِ محلی/شبانه اجرا می‌شوند، نه گیتِ merge.
اجرایِ واقعیِ SCA/SBOM/DAST نیازمندِ registry زنده و آدرسِ استیجینگ است →
**best-effort/pending** (در CI با `continue-on-error` تا آماده‌شدنِ زیرساخت).

---

## ۴) متدولوژیِ امنیتیِ مرتبط
- نقشهٔ راهِ حملات: `docs/PEN_TEST_CHECKLIST.md` (آمادگیِ پنتست: auth bypass,
  IDOR, XSS, SQLi, CSRF, SSRF + ابزار و اجرا).
- قراردادِ امنیتیِ سرور: `docs/SERVER_SECURITY_CONTRACT.md`.
- گزارش‌هایِ امنیتیِ پیشین: `docs/REPORT_2026-09-05_SECURITY.md`,
  `docs/REPORT_2026-09-06_ROUND73_SECURITY.md`.

---

## ۵) قید و کارهایِ باقی‌مانده (pending)
- اجرایِ زندهٔ پنتست علیه محیطِ استیجینگ.
- فعال‌سازیِ کاملِ tombstone از سمتِ write به PG و push در یک تراکنشِ PG.
- اجرایِ واقعیِ SCA/SBOM/DAST در CI با registry/URL زنده.
