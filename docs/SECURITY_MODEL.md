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
- WAF دو-حالت (P-WAF): `report` (پیش‌فرض، فقط-تشخیص) / `enforce` (P0 #6: 403 با fail-safe allowlist) + nginx در لبه (اِعمال URI/rate/conn)؛ هدرهایِ امنیتی؛ rate-limit چند لایه (لبه + Redis per-phone/per-IP)؛
  audit لاگِ ضمیمه‌شونده/پاک‌سازی‌شده (بدون PII حساس)؛ بکاپ، OTP خارج از store،
  GC نقشه‌هایِ فقط-رشد.

---

## ۳) Security Program در CI (این موج)

`.github/workflows/security.yml` اکنون چند-جاوبی است:

| جاب | نوع | ابزار (repo-native) | قید |
|---|---|---|---|
| `sast` | SAST | `node tests/run.js` + `tools/check-authz.js` + syntax | سخت (گیت) |
| `secret` | Secret | `node tests/secret-scan.js` | سخت (گیت) |
| `waf` | WAF | `waf-ddos.js --unit-only` + `waf-enforce.js` (P0 #6) + `nginx -t` | سخت (گیت) |
| `sca` | SCA | `npm audit --audit-level=high` | best-effort |
| `sbom` | SBOM | `npm sbom` (SPDX) + آپلود | best-effort |
| `dast` | DAST | OWASP ZAP baseline (staging با `SECURITY_TARGET_URL`؛ local-boot fallback) + `tools/dast-live.sh` (P0 #6) | best-effort؛ artifact: `zap-baseline-reports` |

**نکتهٔ صداقت:** برای SAST از گیت‌هایِ ایستایِ خودِ ریپو استفاده شد (بدون اختراعِ
ESLint). سئوت‌هایِ jsdomِ وابسته به بوتِ سرور (xss-guard/security/waf-full) به
استورِ سیدشده نیاز دارند و در جریانِ محلی/شبانه اجرا می‌شوند، نه گیتِ merge.
اجرایِ واقعیِ SCA/SBOM/DAST نیازمندِ registry زنده و آدرسِ استیجینگ است →
**best-effort/pending** (در CI با `continue-on-error` تا آماده‌شدنِ زیرساخت).

---

## ۴) متدولوژیِ امنیتیِ مرتبط
- ممیزی کنترل‌به‌کنترل ای‌اس‌وی‌اس: `docs/WAVE13_ASVS_AUDIT.md` (۱۵ حوزهٔ کنترل،
  یافته‌ها و رفع‌ها، اقلام در انتظار اجرای زنده).
- نقشهٔ راهِ حملات: `docs/PEN_TEST_CHECKLIST.md` (آمادگیِ پنتست: auth bypass,
  IDOR, XSS, SQLi, CSRF, SSRF + ابزار و اجرا).
- قراردادِ امنیتیِ سرور: `docs/SERVER_SECURITY_CONTRACT.md`.
- گزارش‌هایِ امنیتیِ پیشین: `docs/REPORT_2026-09-05_SECURITY.md`,
  `docs/REPORT_2026-09-06_ROUND73_SECURITY.md`.

---

## ۵) لایهٔ اجرایی (P0 #6 — امنیتِ اجرایی)

تا Wave 13 مدل «آماده» بود؛ از P0 #6 بخش‌هایِ زیر **اجرایِ واقعی** دارند:

### ۵.۱ DAST زنده (staging)
- `tools/dast-live.sh`: استیجینگِ سبک (API + Redis + store با production +
  fail-closed — guardهایِ JWT اشتراکی و TLS-behind-proxy رعایت می‌شوند) +
  ZAP baseline/full (docker `ghcr.io/zaproxy/zaproxy:stable` یا `ZAP_BIN`) +
  artifact (HTML/JSON/summary). پیش‌فرض `--dry-run` (فقط طرح + پیش‌نیاز؛ در
  سندباکس سبز است). خروجی: 0 بدون FAIL · 2 فقط-WARN · 1 FAIL · 3 خطای اسکن.
- CI: lane `dast` با secret `SECURITY_TARGET_URL` مستقیماً staging را اسکن
  می‌کند و artifact آپلود می‌کند؛ بدون secret ⇒ local-boot (best-effort).

### ۵.۲ آمادگیِ پنتست (8 سناریو)
- `docs/PEN_TEST_CHECKLIST.md`: Auth Bypass · IDOR/BOLA · XSS · SQLi · CSRF ·
  Session Fixation · Rate Limit Bypass · Tenant Escape — هرکدام با
  **دستورالعملِ گام‌به‌گام** (curl/sqlmap/nuclei) و **معیارِ پذیرش**.
- اجرایِ زندهٔ sqlmap/nuclei/Burp علیه استیجینگِ دائمی = pending (نیازمندِ
  محیطِ واقعی)؛ اسکریپت‌ها آماده‌اند.

### ۵.۳ WAF حالتِ ENFORCE (in-app)
- `PAYESH_WAF_MODE=enforce`: هر verdict (sqli/xss/traversal/badbot) ⇒
  403 `waf_blocked` + `X-WAF-Action: block` + ممیزیِ throttled (`waf_block`).
- **fail-safe allowlist:** پروب‌هایِ زیرساخت (`/api/health|liveness|readiness`)
  هرگز مسدود نمی‌شوند؛ گسترشِ اپراتوری با `PAYESH_WAF_ALLOW` (پیشوندها).
  خطایِ خودِ enforce = fail-open. پیش‌فرض `report` — تغییرِ رفتار فقط با
  تنظیمِ صریحِ deploy.
- دروازه: `tests/waf-enforce.js` (33 چک: بلاک/allowlist/report/بدونه-echo +
  سوءاستفاده) در CI (lane waf). لبهٔ nginx جدا و مستقل اٌعمال می‌کند
  (403/444/429 — markers `wave12-edge-rules`).

### ۵.۴ حفاظتِ سوءاستفاده (سقف‌هایِ سخت)
| endpoint | سقف‌ها (Redis، توزیع‌شده) |
|---|---|
| `send-code` | cooldown ۶۰s (phone) + **روزانه ۲۰** (phone) + ۵/پنجره (phone) + ۱۰/پنجره (IP) — همه پیش از وجود‌سنجی (equal-shape) |
| `login` | ۱۰/پنجره (IP) + **per-phone** (`PAYESH_LOGIN_PHONE_LIMIT`، پیش‌فرض ۵) + ۵ تلاشِ کد (tombstone) + تأخیرِ تصاعدی (تا ۳۰s) |
| `register` | **وجود ندارد** — ایجادِ کاربر فقط نقشِ مدیر + scope (سطرِ public-self-signup در مدل نیست) |
- لبه: `limit_req 100r/m burst=20` (429) + `limit_conn 10` (429) + bad-bot 444.
- دروازه: `tests/waf-enforce.js` بخش D + `otp-ratelimit-mutations` (11 جهش).

### ۵.۵ چک‌لیستِ Go-Live (امنیتِ اجرایی)
1. `PAYESH_WAF_MODE=enforce` در envِ همهٔ نمونه‌ها.
2. secret `SECURITY_TARGET_URL` در GitHub ⇒ lane DAST روی staging + artifact.
3. `tools/dast-live.sh --live --scan full` پیش از هر release.
4. `PAYESH_LOGIN_PHONE_LIMIT` متناسبِ بارِ واقعی (پیش‌فرض ۵۰).

---

## ۶) قید و کارهایِ باقی‌مانده (pending)
- اجرایِ زندهٔ پنتستِ کامل (sqlmap/nuclei/Burp) علیه استیجینگِ دائمی
  (ابزارِ اسکن در سندباکس نیست؛ اسکریپت‌ها و سناریوها آماده‌اند — §۵).
- فعال‌سازیِ کاملِ tombstone از سمتِ write به PG و push در یک تراکنشِ PG.
- اجرایِ واقعیِ SCA/SBOM/DAST در CI با registry/URL زنده (DAST از P0 #6 با
  `SECURITY_TARGET_URL` فعال می‌شود).

---

## ۷) پایش امنیت زمان اجرا (Runtime Security Monitoring)

- لایهٔ تشخیصِ درون‌فرایندی `server/runtime-monitor.js` روی پنج سطلِ یک‌دقیقه‌ای
  (baseline پنج‌دقیقه‌ای) نرخ درخواست بر پایهٔ نقش، خطاهای 401/403، حجم پاسخ،
  تغییر tenant و عملیات sync را می‌سنجد؛ عبورِ strict از `mean + 3σ` فقط یک‌بار
  در هر سطل هشدار می‌دهد. این لایه **مجوزدهی یا پاسخ را تغییر نمی‌دهد**.
- `server/attack-detector.js` امضاهای شمارش ترتیبی ID/IDOR، شکستِ سریع ورود میان
  کاربران، تلاش میان‌مدرسه‌ای، export انبوه و metadata جعلی sync را به
  `server/abuse-guard.js` می‌دهد. guard برای هر تشخیص auditِ پاک‌سازی‌شده، metric
  محدود، شمارندهٔ health و webhook HTTPS اختیاری را فرا می‌خواند؛ خطای telemetry
  fail-safe است. کنترل‌های WAF/scope/rate-limit همچنان مرز enforcement هستند.
- هیچ IP، token، شماره، شناسهٔ رکورد، tenant، URL یا payload در هشدار/metric/
  health نمی‌رود. state با هش یک‌طرفهٔ داخلی، TTL حداکثر ۲۴ ساعت و سقف mapها
  محدود است. `/api/health`: `anomalies_detected_24h`, `suspicious_sessions`,
  `attack_patterns_blocked`.
- قواعد Prometheus: `AnomalyDetected`, `AttackPatternSignature`,
  `SuspiciousSession`؛ مقصد عملیاتی: [RC-016](RUNBOOK_CARDS/RC-016.md). مرجع:
  [Runtime Security](RUNTIME_SECURITY.md) و [Attack Patterns](ATTACK_PATTERNS.md).
  اجرای زندهٔ مقصد webhook و مانور on-call همچنان پیش‌نیاز Go-Live است.
