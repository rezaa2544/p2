# Pen-test Checklist (Wave 13 + P0 #6)

> **ورودی پنتست:** فهرست یافته‌های شناخته‌شده (که نباید دوباره گزارش شوند) و حوزه‌های باز در `docs/SECURITY_FINDINGS_REGISTER.md` §۷ ثبت شده است.

> **سطح حملهٔ ای‌پی‌آی:** مشخصات کامل ۳۱ عملیات سرور در `docs/openapi.yaml` (OpenAPI 3.0.3) با خلاصهٔ انسانی در `docs/API_REFERENCE.md` — ممیزی هر اندپوینت (احراز، ریت‌لیمیت، اسکوپ، او‌سی‌سی) از این اسپک شروع شود؛ همگامی اسپک با کد را `node tools/openapi-drift.js` تضمین می‌کند.

> موج ۱۳ (چت ۲) — تاریخ: ۲۰۲۶-۰۹-۰۹ · شاخه: `arena/01a085ca-p2` · PR #39
> **P0 #6 (چت ۳) — به‌روزرسانی: ۲۰۲۶-۰۹-۱۰** · شاخه: `arena/01a08545-p2` · PR #47
>
> چک‌لیستِ آمادگیِ تستِ نفوذ برای سامانهٔ payesh (کلاینتِ آفلاین-اولِ تک‌فایلی +
> سرورِ Node). هر سناریو: هدف، روشِ اجرا، ابزار، و نشانیِ نگهبانِ موجود در ریپو
> (اگر هست). از P0 #6: برای هر ۸ سناریو **دستورالعملِ گام‌به‌گام** + **معیارِ
> پذیرش** (§۳)، و زیرساختِ استیجینگِ سبک (`tools/dast-live.sh`) برای اجرایِ
> زنده آماده است.

---

## ۰) پیش‌نیازها و راه‌اندازیِ هدف

- محیطِ هدف: یک **استیجینگ** با استورِ سیدشدهٔ واقعی
  (`node server/seed.js` → `server/data/payesh.json`) و Redis زنده.
  **P0 #6:** `tools/dast-live.sh --live` همین استیجینگِ سبک
  (API + Redis + store، production + fail-closed) را می‌سازد؛
  `--dry-run` طرح را بدونِ هیچ استارتی چاپ می‌کند.
- کلاینت ساخته‌شده: `node build.js` (یا `build:check`).
- ابزارها: Burp Suite Community/Pro · OWASP ZAP · sqlmap · nuclei ·
  curl/jq · یک حسابِ هر ۷ نقش
  (superadmin/manager/teacher/student/parent/counselor/…).
- قبل از تست در محیطِ production: توکنِ TLS معتبر و هدِرهایِ امنیتی را تأیید کنید.
- **P0 #6 — حالتِ WAF:** استیجینگ را با `PAYESH_WAF_MODE=enforce` بالا
  بیاورید تا رفتارِ مسدودکننده (403 `waf_blocked`) هم پنتست شود؛ با
  `PAYESH_WAF_ALLOW` می‌توان مسیرهایِ ضروری را allowlist کرد.

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

### ۱.۷ Session Fixation (P0 #6)
| تست | روش | نگهبانِ موجود |
|---|---|---|
| تثبیتِ نشست پیشِ لاگین | گرفتنِ JWT/نشستِ پیشِ احراز و استفاده از آن پسِ لاگین | JWT بعد از لاگین **باز-صدور** می‌شود (`/api/auth/login` → توکنِ تازه)؛ نشستِ پیشین معنی‌دار نیست تا وقتی token را login جایگزین کند |
| دستکاریِ fieldهایِ JWT (exp/iat/iss) | ویرایشِ payload با همان امضا | امضایِ HS256 → هر ویرایش = `invalid_token` (401) |
| بازنشانیِ نشست از چند نمونه | لاگین در نمونه A، خروج در B | `logout` distributed: ابطالِ توکن در Redis (wave18w19: H2) |

**معیارِ پذیرش:** هیچ tokenِ پیشِ-لاگین پسِ لاگینِ دیگر کاربر معتبر نباشد؛
ویرایشِ هر field = 401؛ و `logout` در هر نمونه ⇒ `GET /me` در همهٔ نمونه‌ها 401.

### ۱.۸ Rate Limit Bypass (P0 #6)
| تست | روش | نگهبانِ موجود |
|---|---|---|
| دور زدنِ با خراب‌کردنِ X-Forwarded-For | ارسالِ XFFهایِ مختلف در هر درخواست | `clientIp` فقط اولین entry را می‌گیرد و سقف‌ها در **Redis** (توزیع‌شده، اتمیک) — تغییرِ IP ظاهری در هر نمونه یکسان اعمال می‌شود |
| دور زدنِ با چند IP (rotating) | لاگین/ارسالِ کد از آی‌پی‌هایِ مختلف | سقفِ **per-phone** (login: `PAYESH_LOGIN_PHONE_LIMIT`؛ send: ۵/پنجره + روزانه ۲۰) + تأخیرِ تصاعدی |
| دور زدنِ با سیل کوتاه | حملۀِ burst | `limit_req` لبه (100r/m burst=20 → 429) + سقف‌هایِ endpoint در Redis |
| ریستِ شمارنده با restart | کشتنِ instance | شمارنده‌ها در Redis (نه حافظه) — restart/kill اثر ندارد (W6/P0-2) |

**معیارِ پذیرش:** بعد از سقف (برای هر phone/IP) فقط 429 `rate_limited`؛
هیچ 200/401ِ «موفق» فراتر از سقف؛ رفتار در همهٔ نمونه‌ها یکسان (Redis مشترک).

### ۱.۹ Tenant Escape (P0 #6)
| تست | روش | نگهبانِ موجود |
|---|---|---|
| فرار از مدرسهٔ خود در sync | ارسالِ op با `school_id`/`tenant`ِ دیگر در صف | `sync.js`: `out_of_scope`/`school_mismatch` — op رد و reject با دلیل |
| خوانشِ مستقیمِ رکوردِ tenant دیگر | `/api/students/:id` با id خارجی | `idor.js` + scope-check (404 یکشکل — بدون leak) |
| ادعایِ school_id در body | تغییرِ `school_id` در opها | opها فقط fieldهایِ allowlist؛ `unknown_collection`/`school_mismatch` |
| superadmin/manager بین مدرسه‌ها | اکسپلویِ دسترسیِ چند-مدرسه‌ای | scope در `projection` + `check-authz.js` (پارتیِ کامل) |

**معیارِ پذیرش:** هیچ رکوردی از tenant دیگر خوانده/نوشته/پاک نشود؛
ردّها **یکشکل** (404/403 بدون leakِ وجود)؛ rejectها در outbox با دلیل ثبت می‌شوند.

---

## ۲) ابزارهای مورد نیاز

- **OWASP ZAP** — DAST baseline در CI (`zaproxy/actions-baseline@v0.12.0`،
  best-effort؛ به `SECURITY_TARGET_URL` نیاز دارد) و اسکنِ تعاملیِ محلی.
  **P0 #6:** `tools/dast-live.sh --live [--scan full]` — استیجینگِ سبک +
  ZAP (docker `ghcr.io/zaproxy/zaproxy:stable` یا `ZAP_BIN` محلی) + artifact.
- **Burp Suite** — پروکسی + Repeater برایِ تستِ دستیِ IDOR/XSS/auth.
- **sqlmap** — اسکنِ خودکارِ تزریق (§۳.۴).
- **nuclei** — تِک‌استِک‌هایِ CVE/misconfig روی لبه (§۳.۸).
- **npm audit / npm sbom** — SCA و SBOM.
- **repo tools** — `tests/secret-scan.js`, `tests/run.js`, `tools/check-authz.js`,
  `tests/waf-ddos.js --unit-only`, `tests/waf-enforce.js` (P0 #6), `nginx -t`.

---

## ۳) دستورالعملِ گام‌به‌گامِ هر سناریو + معیارِ پذیرش

> پیش‌فرض: استیجینگ روی `https://STAGE` (یا `http://127.0.0.1:8090` از
> `tools/dast-live.sh --live`) با `PAYESH_WAF_MODE=enforce`.
> دو حساب: `A` (مدرسِ مدرسهٔ ۱) و `B` (والد/مدرسِ مدرسهٔ ۲) — توکن‌ها: `$TA`, `$TB`.

### ۳.۱ Auth Bypass
```bash
# 1) brute-force کد (سقف ۵ تلاش + تأخیرِ تصاعدی + سقف‌هایِ per-phone/IP)
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST $STAGE/api/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"phone\":\"$PHONE_A\",\"code\":\"$i$i$i$i$i$i\",\"national_id\":\"$NID_A\"}"
done
# 2) دستکاریِ JWT: exp را بزرگ کنید / role را تغییر دهید (امضا را حفظ نکنید)
#    → باید 401 invalid_token باشد
# 3) لاگینِ موفق با کدِ واقعی (demo echo در staging) → توکنِ تازه؛ توکنِ کهنه بی‌اثر
```
**معیارِ پذیرش:** بعد از ۵ تلاشِ ناموفق، کد «می‌میرد» (tombstone) و لاگینِ بعدی
حتی با کدِ درست 401 است؛ از سقف (12 تلاش) فقط 429/401؛ JWTِ دستکاری‌شده = 401؛
هیچ 200 با `role`/`school_id` غیرمنتظره.

### ۳.۲ IDOR / BOLA
```bash
# 1) فهرستِ دانش‌آموزانِ مدرسهٔ خود (با $TA) → idهایِ معتبرِ tenant خود
IDS=$(curl -s $STAGE/api/v1/sync ... | jq -r '.students[].id')
# 2) واکشیِ مستقیم: هر id + idهایِ خارجِ محدوده (مثل منفی/بزرگ)
for id in $IDS; do curl -s -o /dev/null -w "$id %{http_code}\n" $STAGE/api/students/$id -H "Authorization: Bearer $TA"; done
# 3) همان با $TB (tenant دیگر) → باید 404 یکشکل
# 4) نوشتن: op sync با `by`=کاربرِ A از نشستِ B → forged_by
```
**معیارِ پذیرش:** همهٔ رکوردهایِ tenant دیگر = 404 (نه 403 با جزئیات، نه 200)؛
opهایِ جعلی = reject با `forged_by`/`user_mismatch` و ثبتِ reject در outbox.

### ۳.۳ XSS
```bash
# 1) payload در فیلدهایِ متنی (نام، چت، پیامک) — از نشستِ مدیر
#    <img src=x onerror=alert(1)> · <svg onload=...> · javascript:alert(1)
# 2) مشاهدهٔ رندر: هیچ اجرایِ اسکریپتی؛ console: فقط CSP violation (در صورتِ عبور)
# 3) WAF (enforce): payload در URL → 403 waf_blocked (rule=xss)
curl -s -o /dev/null -w "%{http_code}\n" "$STAGE/api/public-report?m=%3Cscript%3Ealert(1)%3C%2Fscript%3E"
```
**معیارِ پذیرش:** هیچ payload ذخیره‌شده‌ای اجرا نشود (DOM خالی از اسکریپت)؛
CSP + nonce intact؛ URL با الگوی XSS در enforce = 403 و در report = verdict
در `X-WAF-Verdict` (روتینگ ادامه دارد).

### ۳.۴ SQLi (sqlmap)
```bash
# 1) با sqlmap (اگر مسیرِ پارامترِ query وجود داشت):
sqlmap -u "$STAGE/api/students/1?f=test" --batch --level=3 --risk=2 \
  --technique=BEUSTQ --output-dir=/tmp/sqlmap
# 2) دستی: `' OR 1=1--`، `UNION SELECT`، `; DROP`، `sleep(5)` در هر پارامترِ URL/body
# 3) با enforce: هرکدام = 403 waf_blocked (rule=sqli) — sqlmap «مسدود» گزارش می‌کند
# 4) بدونِ enforce (report): verdict=sqli در سرآیند + کوئری‌هایِ پارامتری = هیچ تغییری در نتیجه
```
**معیارِ پذیرش:** sqlmap: `not vulnerable` (یا فقط WAF block — بدونِ data retrieval)؛
هیچ timing anomaly (sleep)؛ هیچ خطایِ DB در پاسخ (stack/error leak ممنوع).

### ۳.۵ CSRF
```bash
# 1) یک صفحهٔ HTML خارجی که POST /api/auth/logout (و opهایِ نوشتاری) بزند
# 2) با بودنِ نشستِ معتبر، صفحه را در مرورگر باز کنید
# 3) بررسی: Content-Type: application/json (نه form) → browser cross-origin نمی‌زند
#    و/یا SameSite cookie policy
```
**معیارِ پذیرش:** هیچ تغییرِ حالتی از درخواستِ cross-origin شکل‌بندی‌شده اعمال
ننشود؛ یا درخواستِ cross-origin با 415/403 رد شود. (اپِ SPA با fetch هم‌منشأ
+ CSP `connect-src 'self'`.)

### ۳.۶ Session Fixation
```bash
# 1) دریافتِ یک نشستِ پیشِ-لاگین (اگر وجود دارد) یا ساختِ JWTِ فرضی
# 2) لاگینِ واقعی → توکنِ تازه ($T_new)؛ امتحانِ استفاده از توکنِ قدیمی ($T_old)
curl -s -o /dev/null -w "%{http_code}\n" $STAGE/api/me -H "Authorization: Bearer $T_old"
# 3) logout در نمونهٔ A → GET /me در نمونهٔ B (با $T_new)
```
**معیارِ پذیرش:** $T_old پسِ لاگین بی‌اثر (401)؛ هر ویرایشِ field = 401؛
logout ⇒ 401 در **همهٔ** نمونه‌ها (ابطالِ distributed).

### ۳.۷ Rate Limit Bypass
```bash
# 1) خراب‌کردنِ XFF: هر درخواست با X-Forwarded-For متفاوت
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST $STAGE/api/auth/send-code \
    -H "X-Forwarded-For: 10.0.$i.1" -H 'Content-Type: application/json' \
    -d "{\"phone\":\"$PHONE_A\"}"
done
# 2) rotating IP واقعی (اگر زیرساخت دارد) — سقفِ per-phone باید بگیرد
# 3) burst 150 درخواست → limit_req لبه (429)
# 4) restart instance میانی → شمارنده ریست نمی‌شود (Redis)
```
**معیارِ پذیرش:** فراتر از سقفِ phone (send: ۵/پنجره؛ login: `PAYESH_LOGIN_PHONE_LIMIT`)
فقط 429؛ XFF spoofing کارساز نیست (شمارندهِ per-phone در Redis)؛ burst → 429 لبه؛
restart ⇒ سقف زنده.

### ۳.۸ Tenant Escape + nuclei
```bash
# 1) op sync با school_idِ tenant دیگر (از $TA):
#    {"c":"students","op":"upsert","id":999,"school_id":<tenant B>, ...}
#    → expect: reject با school_mismatch/out_of_scope
# 2) nuclei روی لبه (misconfig/CVE):
nuclei -u $STAGE -t http/misconfiguration/ -t http/exposures/ -json -o /tmp/nuclei.json
# 3) direct-read با idهایِ tenant دیگر (§۳.۲) — تکرار با نقشهایِ متفاوت
```
**معیارِ پذیرش:** opهایِ cross-tenant = reject (و نه apply) + ثبتِ دلیل؛
nuclei: هیچ exposure/secret/redirect خطرناکی؛ direct-read cross-tenant = 404 یکشکل.

---

## ۴) دروازه‌هایِ محلی (قبل از هر پنتست)

```bash
node tests/run.js            # smoke 547/547
node tools/check-authz.js    # 0 (پارتیِ کاملِ AUTHZ)
node tests/secret-scan.js    # 11/11
node build.js --check        # bit-exact
node tests/waf-ddos.js --unit-only
node tests/waf-enforce.js    # P0 #6: enforce + abuse (33 چک)
tools/dast-live.sh --dry-run # P0 #6: طرحِ DAST زنده (بدون استارت)
```

**DAST زنده (P0 #6):**
```bash
tools/dast-live.sh --live                       # استیجینگِ خودِ اسکریپت + ZAP baseline
tools/dast-live.sh --live --target https://STAGE   # استیجینگِ موجود
tools/dast-live.sh --live --scan full --timeout 1800
# exit: 0 بدون FAIL · 2 فقط-WARN · 1 FAIL finding · 3 خطای اسکن
# CI: secret SECURITY_TARGET_URL ⇒ lane DAST مستقیماً staging (artifact: zap-baseline-reports)
```

**روشِ گزارش:** هر یافته با شدت (Info/Low/Medium/High/Critical)، نقشِ واکشی، و
نشانهٔ بازتولید (PoC). روی خروجیِ CI (SAST/SCA/Secret) آپلود شود.

---

## ۵) قیدِ صداقت (به‌روزشده در P0 #6)

- **آماده و در CI:** دروازه‌هایِ آفلاین (smoke/check-authz/secret-scan/WAF
  enforce + abuse 33 چک/جهش‌مندی‌ها)، DAST ZAP (best-effort با
  `SECURITY_TARGET_URL` یا local-boot)، SAST/SCA/SBOM.
- **آماده برای محیطِ واقعی (P0 #6):** `tools/dast-live.sh` (استیجینگِ سبک +
  ZAP — DRY_RUN در سندباکس سبز است؛ بخشِ اسکن ZAP در سندباکس به‌درستی
  exit 3 می‌دهد چون docker/ZAP نیست) و اسکریپت‌هایِ sqlmap/nuclei بالا.
- **هنوز pending:** اجرایِ زندهٔ sqlmap/nuclei/Burp علیه استیجینگِ واقعی
  (نیازمندِ زیرساختِ واقعی) — سناریوها و معیارهایِ پذیرش آماده‌اند (§۱–۳)؛
  نتایجِ اجرایِ واقعی ثبت نمی‌شوند تا زمانی که استیجینگِ دائمی فعال باشد.
