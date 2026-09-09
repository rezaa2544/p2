# چک‌لیستِ نهاییِ Go-Live ملی

- **تاریخ:** ۱۹/۰۶/۱۴۰۵ (2026-09-09) — شاخهٔ `arena/01a0827b-p2`
- **قاعدهٔ استفاده:** هیچ آیتمی بدونِ اجرایِ ستونِ «راستی‌آزمایی» ✅ نمی‌گیرد؛
  مالکِ هر ردیف تا سبز شدن، مسئولِ آن است.
- **راهنمایِ وضعیت:** ✅ = آماده (سند/کد موجود و راستی‌آزمایی‌شده) ·
  ◐ = جزئی (موجود ولی ناقص، با جایگزینِ مشخص) ·
  ⏳ = در حالِ اجرا در چتِ دیگر · ⏸️ = متوقف (در انتظارِ تصمیم/چت)

---

## ۱.۱. الزاماتِ فنی (Technical Requirements)

| # | آیتم | وضعیت | مستندات | راستی‌آزمایی در روزِ Go-Live |
|---|------|--------|---------|-------------------------------|
| ۱ | PostgreSQL Source of Truth | ✅ | `docs/POSTGRESQL_MIGRATION_PLAN.md` | `npm run migrate:status` سبز + شمارشِ users/schools برابرِ JSON (§۶ DEPLOY) |
| ۲ | Read Replica + Connection Pooling | ◐ | بدونِ سندِ مستقل؛ پوشش در `docs/MULTI_INSTANCE_READINESS.md` | اتصالِ خوانش به replica + مشاهدهٔ pooling در کانفیگ؛ سندِ مستقل بعداً |
| ۳ | Redis Clustering + Persistence | ⏳ | `docs/REDIS_HA_FAILOVER.md` (چت ۴، در حالِ اجرا) | پس از اتمامِ چت ۴: kill یک نود + عدمِ قطعیِ نشست/کش |
| ۴ | CDN Integration | ✅ | `docs/CDN_INTEGRATION_SETUP.md` | `node build.js --check` سبز + هیتِ CDN رویِ استاتیک |
| ۵ | Auto-Scaling (K8s) | ✅ | `docs/AUTO_SCALING_SETUP.md` (+ POC در `k8s/hpa-*.yaml`) | `kubectl get hpa` + تستِ بارِ کوتاه و مشاهدهٔ scale-out |
| ۶ | Load Testing (k6) | ✅ | `docs/LOAD_TESTING_PLAN.md` (سناریوها در `tests/performance/`) | اجرایِ سناریوهایِ k6 و ثبتِ p95/خطا در گزارشِ انتشار |

## ۱.۲. الزاماتِ امنیتی (Security Requirements)

| # | آیتم | وضعیت | مستندات | راستی‌آزمایی در روزِ Go-Live |
|---|------|--------|---------|-------------------------------|
| ۱ | JWT + OTP + کد ملی | ✅ | `docs/SECURITY_SUMMARY.md` §۱.۱ | `PAYESH_DEMO_CODE=0`؛ یک ورودِ واقعی + `security2`/`otp-ratelimit` سبز («شاهکار» فقط شبیه‌سازیِ دمویِ پنلِ پیامک است) |
| ۲ | CSRF Protection | ✅ | `docs/SECURITY_SUMMARY.md` §۱.۱ | `tests/csrf.js` ‏12/12‏ + جهشِ بی‌سرآیند → 403 |
| ۳ | Rate Limiting توزیع‌شده | ✅ | پیاده‌سازی + تست (سندِ طراحیِ مستقل ندارد؛ پوشش در `CACHE_STRATEGY_DESIGN.md` و `SECURITY_SUMMARY.md`) | `otp-ratelimit` ‏49/0‏؛ ۵ سقفِ OTP رویِ مقادیرِ تولید (نه تست) |
| ۴ | Session Revocation | ✅/⏳ | امروز: `__revoked_jti` فایل‌محور ✅؛ Denylist رویِ Redis (چت ۲) ⏳ | logout → نشست می‌میرد؛ پس از چت ۲: ابطالِ سراسری از Redis |
| ۵ | Security Headers (CSP/HSTS) | ✅/⏸️ | خطِ پایه در `server/index.js:261-271` ✅؛ سخت‌سازیِ بیشتر (چت ۳) ⏸️ متوقف | `curl -sI` → CSP با nonce، DENY، nosniff، HSTS رویِ https |
| ۶ | Body Size Limiting | ✅ | پیاده‌سازی در کد (۱۸ جایگاهِ `readBody`)؛ ثبت در `docs/SECURITY_SUMMARY.md` §۱.۱ | بدنهٔ 5KB به restore → ‏413 `body_too_large` |

## ۱.۳. الزاماتِ عملیاتی (Operational Requirements)

| # | آیتم | وضعیت | مستندات | راستی‌آزمایی در روزِ Go-Live |
|---|------|--------|---------|-------------------------------|
| ۱ | Backup & PITR | ✅ | `docs/RELIABILITY_DR_PLAN.md` (RTO/RPO) + `docs/REPORT_2026-09-06_BACKUP_RESTORE.md` + `RUNBOOKS.md` §۱-۳ + `DEPLOY.md` §۶ | بکاپِ دستی + یک restoreِ آزمایشی رویِ محیطِ جدا + شمارشِ برابر |
| ۲ | Observability | ◐ | جزئی: `audit.log` + `/api/health` + `journalctl` (تریاژ در `RUNBOOKS.md` §۱-۲)؛ لاگِ متمرکز/تریسینگ/داشبوردِ SLO سندِ مستقل ندارند | health سبز + `tail` آدیت؛ توصیه: کرونِ ۵دقیقه‌ایِ `grep` رویِ ایونت‌ها (§۱.۳ سندِ IRP) |
| ۳ | Runbooks | ✅ | `docs/RUNBOOKS.md` (استقرار/عیب‌یابی/بازیابی) | خشک‌اجرایِ (dry-run) یک rollback رویِ محیطِ جدا |
| ۴ | Incident Response Plan | ✅ | `docs/SECURITY_INCIDENT_RESPONSE.md` | فراخوانِ آزمایشیِ IRT (بدونِ اعلامِ عمومی) + ساختِ نمونهٔ IR |
| ۵ | Onboarding Docs | ✅ | `docs/PILOT_ONBOARDING.md` + `docs/PILOT_KICKOFF.md` + راهنماهایِ کاربر/سوپرادمین | اجرایِ کاملِ چک‌لیستِ پایلوت رویِ یک مدرسهٔ آزمایشی |
| ۶ | Canary Deployment | ✅ | `docs/CANARY_DEPLOYMENT.md` (+ `scripts/canary-deploy.sh`) | استقرارِ canary با abortِ خودکار در گیتِ قرمز |

---

## ۱.۴. تصمیماتِ باز (Open Decisions)

| # | تصمیم | وضعیت | مسئول | اثر بر Go-Live |
|---|-------|--------|-------|-----------------|
| ۱ | انتخابِ مدارسِ پایلوت | ⏳ | کارفرما | بدونِ آن، بستهٔ ۱۴روزهٔ `PILOT_KICKOFF` شروع نمی‌شود |
| ۲ | قراردادِ درگاهِ پیامکِ تولید | ⏳ | کارفرما | امروز provider رویِ mock/شبیه‌سازی است (`PLAN_SMS_GATEWAY.md`)؛ OTP واقعی بدونِ قرارداد ناممکن |
| ۳ | هاست و دامنهٔ نهایی | ⏳ | کارفرما | TLS (`fullchain/privkey`)، `PAYESH_TRUSTED_PROXIES` و HSTS به آن گره خورده‌اند |

---

## ۱.۵. توصیه‌هایِ نهایی

### ترتیبِ اجرا (الزامی، آبشاری)
1. **تصمیم‌ها (§۱.۴):** دامنه/هاست → قراردادِ پیامک → مدارسِ پایلوت. تا ردیفِ ۳ بسته نشود، TLS و انتخابِ مدرسه قفل نمی‌شود.
2. **زیرساخت:** PG cutover (ردیفِ ۱.۱-۱) → اتمامِ Redis HA (چت ۴) → CDN + HPA روشن → k6 نهایی با p95 ثبت‌شده.
3. **امنیت:** `PAYESH_DEMO_CODE=0` + چرخشِ نهاییِ `PAYESH_JWT_SECRET` → اجرایِ هر ۴ گیت (smoke، authz، secret-scan، lint) → ادغامِ خروجیِ چت ۲ (P4) پس از اتمام.
4. **عملیات:** restoreِ آزمایشی + dry-runِ rollback + فراخوانِ آزمایشیِ IRT → استقرارِ canary → پایلوت (بستهٔ ۱۴روزه) → ملیِ مرحله‌ای.

### ریسک‌هایِ باقی‌مانده (پیش از ملی باید پذیرفته یا بسته شوند)
- ۱۲ یافتهٔ پایینِ بازِ ممیزی (`SECURITY_SUMMARY.md` §۱.۲) — حداقل F-FILE-01/F-SQL-01/F-XSS-01 بسته شود (هر سه یک‌خطی).
- چت ۳ ⏸️ متوقف: خطِ پایهٔ سرآیندها کافیِ Go-Live است ولی سخت‌سازیِ P5 عقب افتاده — تصمیم بگیرید: پذیرشِ ریسک یا فعال‌سازیِ دوباره.
- Observability جزئی (◐): بدونِ هشداردهندهٔ خودکار، تشخیصِ حادثه دستی است — کرونِ پیشنهادیِ IRP حداقلِ قابلِ قبول.
- PII در استراحت رمزنگاری نشده (F-STORE-01 + ⬜ سروری) — تصمیمِ آگاهانه ثبت شود.

### جدولِ زمانیِ پیشنهادی
| فاز | مدت | خروجی |
|---|---|---|
| تصمیم‌ها + زیرساخت (۱.۱، ۱.۴) | ۱–۲ هفته | دامنه/TLS، PG cutover، Redis HA، k6 سبز |
| امنیت + عملیات (۱.۲، ۱.۳) | ۱ هفته | ۴ گیت سبز، restore/rollback آزموده، IRT آماده |
| پایلوت (۱–۳ مدرسه) | ۲ هفته (بستهٔ ۱۴روزه) | باگ‌هایِ میدانی + آستانه‌هایِ واقعیِ هشدار |
| ملیِ مرحله‌ای (canary) | ۲–۴ هفته | استان‌به‌استان با گیتِ توقف در هر موج |
