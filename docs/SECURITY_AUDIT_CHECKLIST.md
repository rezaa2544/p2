# چک‌لیست مرجع ممیزی امنیتی و Red Team

**وضعیت:** baseline قابل استفادهٔ مجدد برای Auditهای آینده  
**Scope:** مخزن `rezaa2544/p2`  
**اصل حاکم:** این سند baseline است، نه جایگزین Penetration Test تخصصی یا اثبات کامل امنیت.

## هدف
این چک‌لیست از یک Security Audit عمومی استخراج و برای Governance زیروتراست پروژه P2 تطبیق داده شده است تا دسته‌های مهم بررسی امنیتی در Auditهای آینده فراموش نشوند و نتایج بین Agentها قابل مقایسه باشند.

## 1. Secret Hygiene
- جست‌وجوی token، password، API key، private key و credential در کد، config، log و artifact.
- بررسی اینکه secret در repository، test output، error message یا telemetry نشت نکند.
- بررسی rotation/revocation و handling امن credentialها در صورت ارتباط.

## 2. Authentication و Session/Token
- اعتبارسنجی JWT/token و expiration.
- بررسی cookie flags مانند HttpOnly، Secure و SameSite در صورت استفاده.
- بررسی session lifecycle، logout/revocation و replay در صورت ارتباط.
- بررسی رفتار missing/invalid/expired credential.

## 3. Authorization / RBAC / Tenant Isolation
- IDOR/BOLA: آیا کاربر می‌تواند resource کاربر/tenant دیگر را بخواند یا تغییر دهد؟
- بررسی role boundaries و privilege escalation.
- بررسی tenant identity از source-of-truth مجاز.
- تست unauthorized، cross-tenant و malformed tenant identifiers.

## 4. Input Validation و Injection
- SQL/NoSQL injection.
- XSS در ورودی/خروجی مرتبط.
- Command injection.
- Path traversal.
- Unsafe deserialization.
- بررسی validation در مرز API و قبل از عملیات حساس.

## 5. SSRF و Outbound Network Access
- شناسایی URL/fetch/proxy ورودی‌پذیر.
- بررسی دسترسی به localhost، metadata endpoints و شبکه داخلی در صورت ارتباط.
- بررسی allowlist، scheme/host validation و redirect behavior.

## 6. Rate Limiting و Abuse Controls
- rate limit برای auth و endpointهای حساس.
- burst، retry storm و repeated invalid requests.
- بررسی bypass با identity/IP/header variation در صورت ارتباط.

## 7. File Upload / File Handling
- type/size validation.
- path traversal و filename handling.
- executable/content-type abuse.
- storage isolation و دسترسی پس از upload.

## 8. Dependency / Supply Chain
- dependencyهای آسیب‌پذیر یا غیرضروری.
- lockfile consistency.
- install/build scripts و package lifecycle risks در صورت ارتباط.
- تفاوت dependencyهای local و CI.

## 9. Error Disclosure / Information Leakage
- stack trace، SQL error، internal path، secret، credential یا topology leakage.
- تفاوت رفتار production و development.
- بررسی logging امن در failure pathها.

## 10. Infrastructure / Storage / IAM / Database Exposure
- exposure ناخواسته database، Redis، object storage یا admin endpoints.
- access boundary و least privilege.
- TLS/network exposure در صورت قابل بررسی.
- configurationهای default ناامن.

## 11. Adversarial Verification Contract
برای موارد مرتبط، Audit فقط با checklist static تمام نمی‌شود. حداقل این ابعاد بررسی شوند:
1. Functional / normal
2. Boundary / malformed / truncated
3. Negative / unauthorized / dependency failure
4. Concurrency / replay / duplicate / retry
5. Independent regression / alternate validation path

اگر بُعدی قابل اعمال نیست، دلیل فنی ثبت شود.

## 12. Finding Evidence Contract
هر Finding باید تا حد امکان شامل این موارد باشد:
- ID
- Current HEAD SHA
- Category
- File path / code section
- Threat / failure scenario
- Reproduction command or exact scenario
- Expected
- Actual
- Run count
- Impact
- Severity
- Evidence level: static / E3 / E4
- Root cause (اگر قابل اثبات)
- Recommended remediation
- Regression test requirement

## 13. Governance Constraints
- Current HEAD حقیقت است؛ historical reports فقط lead/evidence تاریخی‌اند.
- VERIFIED بدون evidence قابل ردیابی روی Current HEAD مجاز نیست.
- E3 ≠ E4.
- تست سبز منفرد کافی نیست.
- Fake-green، حذف/ضعیف‌کردن assertion یا swallow کردن failure ممنوع است.
- این baseline نباید بدون evidence به Production Readiness یا Penetration Test certification تعبیر شود.

## 14. قرارداد ثبت وضعیت برای Auditهای آینده

برای هر control/finding مرتبط، Agent باید یکی از این وضعیت‌ها را ثبت کند:

- **Tested** — آزمون اجرا شده و Evidence قابل ردیابی وجود دارد.
- **N/A** — از نظر فنی قابل اعمال نیست؛ دلیل فنی باید ثبت شود.
- **Not Tested** — بررسی هنوز اجرا نشده است.
- **Evidence Missing** — بررسی/ادعا وجود دارد، اما Evidence کافی برای نتیجه‌گیری فعلی در دسترس نیست.
- **Finding** — defect/risk با reproduction یا شواهد کافی ثبت شده است.

هر رکورد باید تا حد امکان شامل این provenance باشد: **Current HEAD SHA + command/scenario + run ID یا run count + environment + expected + actual + evidence level (E3/E4)**. اگر run ID وجود ندارد، صریحاً `N/A` یا `Evidence Missing` ثبت شود؛ هرگز شناسه ساخته نشود.

## 15. استفاده در Auditهای آینده
Security Agent باید این سند را قبل از شروع Audit بررسی کند، موارد applicable را انتخاب کند و در گزارش نهایی برای هر مورد یکی از وضعیت‌های **Tested / N/A / Not Tested / Evidence Missing / Finding** را با Evidence Contract ثبت کند.

هر Finding جدیدی که ارزش reusable شدن دارد باید به این baseline یا یک سند تخصصی مرتبط پیشنهاد شود؛ تغییر baseline باید مستقل، مستند و قابل بازبینی باشد.
