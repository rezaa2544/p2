# PAYESH — برنامه اجرایی یکپارچه پایش، رفع عیب و اعتبارسنجی نهایی

**وضعیت:** ACTIVE / CANONICAL EXECUTION PLAN  
**تاریخ:** 2026-09-24  
**مخزن:** `rezaa2544/p2`  
**شاخه مرجع:** `main`  
**HEAD مبنا در زمان ثبت:** `ac7150e5414efc81d029839524bca8dce3023f57`

## 1. هدف این سند

این سند ترتیب اجرایی فعلی پروژه را تثبیت می‌کند و بر برنامه‌های قدیمی‌تر که فقط بخشی از مسیر را پوشش می‌دهند اولویت اجرایی دارد. اسناد معماری، الزامات و شواهد تاریخی حذف نمی‌شوند؛ این سند فقط ترتیب اجرای کار از این نقطه را مشخص می‌کند.

اصل حاکم:

> ابتدا خطرناک‌ترین عیب‌ها، سپس عیب‌های متوسط، سپس عیب‌های کوچک؛ بعد از آن یک کمپین مستقل و سراسری برای اثبات صحت قابلیت‌ها، نقش‌ها، امنیت، داده، کارایی و رفتار کل سامانه.

هیچ موردی فقط با تغییر کد «رفع‌شده» محسوب نمی‌شود. Definition of Done برای عیب‌ها:

`Finding → Reproduce → Root Cause → Fix → Regression Test → Execute → Evidence → Review`

---

## 2. فازهای اجرایی جدید

### Phase A — Atria Critical / High Zero-Trust Sweep
**مالک اصلی: Atria**

Atria باید کل `main` فعلی را به‌عنوان baseline بررسی کند و ابتدا موارد **Critical / P0** و **High / P1** را پیدا، بازتولید و اصلاح کند.

دامنه حداقلی:

- Authentication / Session / Credential lifecycle
- Authorization / RBAC / ABAC
- Tenant isolation / IDOR / object ownership
- data leakage و cross-role access
- transaction atomicity / OCC / race conditions
- PostgreSQL / Redis / queue / worker failure modes
- migrations / ledger / recovery safety
- API و routeهای حساس
- WAF / rate limiting / public endpoints
- sync / offline / conflict handling
- intelligence / analytics / educational engines
- data integrity / corruption / duplicate processing
- caching و stale authority
- resource exhaustion
- observability و failure detection
- production boot / shutdown / recovery
- CI/test integrity و fake-green paths

**قاعده:** finding باید روی HEAD جاری reproduce شود یا صریحاً به‌عنوان historical/unverified ثبت شود.

### Phase B — Atria Medium Sweep
پس از بسته‌شدن Critical/High:

- منطق ناقص و edge caseها
- validation و error handling
- ناسازگاری backend/frontend
- integration defects
- maintainabilityهایی که روی رفتار اثر دارند
- test gaps مربوط به قابلیت‌های موجود
- operational defects غیرحیاتی
- technical debt با اثر عملکردی/رفتاری

### Phase C — Atria Low Sweep
پس از بسته‌شدن Medium:

- cleanup و dead code
- inconsistencies
- UX/error-message defects
- refactorهای کم‌ریسک
- مستندسازی عقب‌افتاده
- technical debt کم‌خطر

در Phase C تغییر معماری عمده بدون Architecture Review ممنوع است.

---

## 3. Gate بین Atria Sweep و Validation Campaign

شروع Phase D فقط وقتی مجاز است که برای هر یافته مهم یکی از این وضعیت‌ها ثبت شده باشد:

- FIXED + regression evidence
- VERIFIED NOT A DEFECT
- ACCEPTED RISK با مالک و دلیل
- BLOCKED با dependency مشخص
- HISTORICAL / REPRODUCTION REQUIRED

گزارش Atria به‌تنهایی certification نیست.

---

## 4. Phase D — Full Multi-AI Validation Campaign

پس از پایان Sweep آتریا، تمام گروه وارد می‌شود:

### ChatGPT × 5
- معماری، roadmap و ground truth
- Security / Zero-Trust
- Backend / Database / Infrastructure
- Frontend / Intelligence / UX
- QA / Release / Evidence

### Arena × 11
هر عامل یک workstream مستقل و non-overlapping می‌گیرد؛ اجرای موازی فقط در صورتی مجاز است که دو عامل هم‌زمان یک ناحیه کد را تغییر ندهند.

### Atria
از fixer به **adversarial reviewer** تبدیل می‌شود و اصلاحات قبلی خودش را نیز دوباره به چالش می‌کشد.

---

## 5. Phase E — Capability Matrix

تمام قابلیت‌های موجود پروژه باید inventory شوند و برای هر قابلیت این زنجیره بررسی شود:

`Requirement → Backend → DB → Auth/AuthZ → API → Frontend → Role → Tenant → Audit → Error/Failure → Recovery`

هیچ قابلیت مهمی صرفاً با unit test تأییدشده تلقی نمی‌شود.

---

## 6. Phase F — Role Matrix

تمام Roleهای واقعی تعریف‌شده در پروژه از source of truth پروژه استخراج و برای هر قابلیت آزمون می‌شوند.

برای هر ترکیب:

- مجاز → باید موفق شود.
- غیرمجاز → باید رد شود.
- tenant اشتباه → باید رد شود.
- object متعلق به کاربر/tenant دیگر → باید رد شود.
- رابطه parent/student یا سایر ownershipها → باید صحیح enforce شود.
- session منقضی → باید رد شود.
- credential/token revoked → باید طبق قرارداد fail-closed عمل کند.

این ماتریس نباید roleهای فرضی ایجاد کند؛ فقط roleهای واقعی repository ملاک هستند.

---

## 7. Phase G — End-to-End Business Flows

مسیرهای واقعی و زنجیره‌ای بررسی شوند، نه فقط endpointهای منفرد.

نمونه:

`School → Student → Teacher → Assessment → Attendance → Intervention → Intelligence → Dashboard → Parent → Report`

تمام جریان‌های اصلی مشابه نیز باید از ابتدا تا انتها اجرا شوند و state، permission، tenant boundary و داده در طول زنجیره بررسی شود.

---

## 8. Phase H — Failure / Recovery Campaign

حداقل این failureها:

- PostgreSQL unavailable
- Redis unavailable / restart
- worker crash
- queue backlog / duplicate event / retry / DLQ
- transaction rollback
- migration failure
- network timeout/latency
- session expiration/revocation
- cold cache
- service restart
- concurrent writes
- resource exhaustion
- deployment failure

برای هر failure:

`Detect → Alert → Contain → Recover → Verify Data Integrity`

---

## 9. Phase I — Performance / Scale Validation

پس از functional correctness:

- load
- stress
- spike
- soak
- concurrency
- memory / CPU / event loop
- DB / Redis / queue capacity
- API latency
- p50 / p95 / p99
- throughput
- resource exhaustion

تمام اعداد باید measured باشند؛ extrapolation یا مقدار صرفاً مستنداتی به‌عنوان capacity evidence پذیرفته نیست.

---

## 10. Phase J — Final Certification / Ground Truth

در پایان یک ماتریس واحد صادر می‌شود:

| حوزه | وضعیت | Evidence |
|---|---|---|
| Security | PASS / FAIL / UNVERIFIED | command + SHA + run |
| Tenant Isolation | PASS / FAIL / UNVERIFIED | evidence |
| Authentication | PASS / FAIL / UNVERIFIED | evidence |
| Authorization | PASS / FAIL / UNVERIFIED | evidence |
| Backend | PASS / FAIL / UNVERIFIED | evidence |
| Database | PASS / FAIL / UNVERIFIED | evidence |
| Redis / Queue | PASS / FAIL / UNVERIFIED | evidence |
| Frontend | PASS / FAIL / UNVERIFIED | evidence |
| Intelligence | PASS / FAIL / UNVERIFIED | evidence |
| All Roles | PASS / FAIL / UNVERIFIED | matrix |
| Core Capabilities | PASS / FAIL / UNVERIFIED | matrix |
| E2E | PASS / FAIL / UNVERIFIED | scenarios |
| Failure / Recovery | PASS / FAIL / UNVERIFIED | drill |
| Performance | PASS / FAIL / UNVERIFIED | measured results |
| Observability | PASS / FAIL / UNVERIFIED | evidence |
| Production Readiness | PASS / FAIL / UNVERIFIED | gate |

هیچ «GO» یا «Production Ready» بدون evidence معتبر صادر نمی‌شود.

---

## 11. مدیریت هم‌زمانی عامل‌ها

تا پایان Phase C:

- Arenaها روی همان ناحیه‌ای که Atria در حال اصلاح آن است وارد کدنویسی نشوند.
- duplicate fixing ممنوع.
- force push، history rewrite و حذف تغییرات نامرتبط ممنوع.
- `git add -A` و تغییرات خارج از scope ممنوع.
- هر تغییر باید commit و evidence مستقل داشته باشد.

از Phase D به بعد، workstreamها با مالکیت صریح تقسیم می‌شوند.

---

## 12. قرارداد گزارش هر عامل

هر تحویل:

```
TASK:
SCOPE:
FINDINGS:
SEVERITY:
REPRODUCTION:
ROOT CAUSE:
FILES CHANGED:
FIX:
REGRESSION TEST:
TEST RESULTS:
SECURITY IMPACT:
DATA IMPACT:
PERFORMANCE IMPACT:
KNOWN LIMITATIONS:
UNVERIFIED ITEMS:
COMMIT:
CI / RUNTIME EVIDENCE:
```

---

## 13. اصل Ground Truth

در تعارض بین برنامه و واقعیت:

1. اجرای واقعی E3/E4 و GitHub Actions
2. کد و تست HEAD فعلی
3. گزارش ممیزی دارای SHA و evidence
4. برنامه و ادعاهای تاریخی

بنابراین اسناد قدیمی حذف نمی‌شوند؛ status آنها باید با HEAD فعلی خوانده شود.

---

## 14. وضعیت آغاز این برنامه

این برنامه از `main` در SHA `ac7150e5414efc81d029839524bca8dce3023f57` آغاز می‌شود.

**ترتیب قطعی فعلی:**

`Atria Critical/High → Atria Medium → Atria Low → Full Multi-AI Validation → Capability Matrix → Role Matrix → E2E → Failure/Recovery → Performance → Final Certification`

این ترتیب تا Architecture Review صریح تغییر نمی‌کند.
