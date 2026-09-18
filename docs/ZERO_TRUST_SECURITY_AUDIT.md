# ممیزی معماری لایه امنیت Zero Trust و انطباق زمان اجرا (P1-SC-06)
## Zero Trust Runtime Security & Compliance Enforcement Layer Audit

**تاریخ سند:** ۲۰۲۶-۰۹-۱۸  
**نگارش:** ۱.۰.۰  
**وضعیت:** مصوب (Approved)  
**ماژول‌های مرجع:**  
- `server/security/zero-trust-runtime.js`  
- `server/security/security-audit-engine.js`  
- `server/security/compliance-enforcement.js`  
**گام مهندسی:** فاز ۴ — گام ۶ (P1-SC-06)  

---

## ۱. تبیین معماری لایه امنیت Zero Trust

در چارچوب تکمیل فاز ۴ (مقیاس‌پذیری، پایداری و امنیت محیط تولید)، گام **P1-SC-06** با تمرکز بر امنیت سخت‌گیرانه زمان اجرا و زیرساخت اعتماد صفر (Zero Trust Architecture) طراحی و پیاده‌سازی گردید. در این مدل، هیچ درخواستی صرفاً به دلیل قرار داشتن در شبکه داخلی یا دارا بودن نشست پیشین قابل‌اعتماد تلقی نمی‌شود؛ بلکه کلیه تعاملات طبق زنجیره راهبردی زیر ارزیابی می‌گردند:

$$\textbf{ZERO TRUST} \longrightarrow \textbf{RUNTIME PROTECTION} \longrightarrow \textbf{ACCESS GOVERNANCE} \longrightarrow \textbf{COMPLIANCE ENFORCEMENT} \longrightarrow \textbf{AUDITABILITY}$$

---

## ۲. ارکان پنج‌گانه معماری امنیت زمان اجرا

### ۲.۱. اعتبارسنجی جامع هویت (Identity Verification)
بررسی پیوسته و همزمان پنج رکن هویتی در هر تراکنش:
- **هویت کاربر (User Identity):** بررسی شناسه مثبت و یکتای کاربر.
- **هویت مستأجر (Tenant Identity):** تطابق قطعی شناسه مدرسه کاربر با شناسه مدرسه هدف.
- **صلاحیت نقش (Role Validity):** بررسی نقش در فهرست مجاز ۷ نقش کاربری سامانه.
- **اعتبار نشست (Session Validity):** بررسی عدم انقضا و عدم ابطال در مخزن نشست‌ها.
- **تازگی توکن (Token Freshness):** اطمینان از کهنه نبودن امضای رمزی (حداکثر طول عمر ۲۴ ساعت).

### ۲.۲. موتور ارزیابی خط‌مشی‌های امنیتی (Policy Decision Engine)
تابع `evaluateSecurityPolicy({ user, tenant, resource, action, context })` با ارائه خروجی سه‌حالته:
1. **`ALLOW`:** انطباق کامل هویت، نقش و مرز مستأجر.
2. **`DENY`:** مغایرت در نقش، غیبت شناسه مدرسه یا تلاش برای دسترسی به مدرسه دیگر.
3. **`REVIEW`:** تشخیص عملیات با ریسک بحرانی (نظیر خروجی انبوه داده‌ها، تغییر خط‌مشی‌ها، رول‌بک دیتابیس یا ارتقای دسترسی) که طبق اصل حاکمیت انسانی نیازمند تایید صریح مدیر ارشد است.

### ۲.۳. محافظت زمان اجرای نشست‌ها (Session Protection)
- کشف نشست‌های منقضی یا باطل‌شده.
- تشخیص تغییر نامتعارف IP یا User-Agent کلاینت (Suspicious Hijack/Shift Detection).
- کشف بازپخش توکن (Token Replay Detection) با تطابق شناسه تراکنش و Nonce.
- پایش همزمانی نشست‌های فعال کلاینت جهت مهار ورودهای غیرمجاز.

### ۲.۴. موتور ممیزی امنیتی و سانسور اطلاعات حساس (Security Audit Engine)
- ثبت ساخت‌یافته و Append-Only رویدادهای احراز هویت، ارزیابی سیاست‌ها، دسترسی‌های ردشده و هشدارهای امنیتی.
- **پالایش و سانسور صددرصدی (Redaction):** حذف مطلق `password`، `token`، `secret`، `credential`، `jwt`، `authorization` و `otp` از تمامی لاگ‌ها.
- **ماسک خودکار:** شماره همراه (`0912***4567`) و کد ملی (`012****789`).

### ۲.۵. لایه انطباق‌پذیری و کشف نشت (Compliance Enforcement)
- **کشف نشت کلید (Secret Exposure):** اسکن الگوهای توکن‌های PAT، کلیدهای خصوصی PEM و رمزهای خام.
- **امنیت پیکربندی (Configuration Security):** مسدودسازی `ALLOW_MEMORY_FALLBACK=1` در تولید، اجباری‌سازی `HttpOnly` برای کوکی‌ها و منع Wildcard CORS.
- **جامعیت مجوزها (Authorization Completeness):** اطمینان از پوشش ۱۰۰٪ نقش‌ها روی کلیه اکشن‌های سامانه.
- **پایش ایمنی زمان اجرا (Unsafe Runtime State):** پایش نرخ خطای اپلیکیشن (سقف ۵٪) و فشار حافظه هیپ (سقف ۹۰٪).

---

## ۳. پاسداری صلب از ارکان غیرقابل‌مذاکره

1. **حاکمیت تصمیم انسانی در تمام لایه‌ها (Human Decision Sovereignty):**
   - هیچ اقدام مسدودسازی خودکار کاربر، تغییر خودکار سطح دسترسی یا اصلاح خودکار (Remediation) توسط ماشین انجام نمی‌شود.
   - کلیه رفتارها بر مدار گردش‌کار:  
     $$\textbf{DETECT} \longrightarrow \textbf{REPORT} \longrightarrow \textbf{HUMAN APPROVAL} \longrightarrow \textbf{EXECUTE}$$
   - تثبیت پرچم‌های:
     ```json
     {
       "automated_decision": false,
       "automated_execution": false,
       "requires_human_approval": true
     }
     ```
2. **تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی (Zero-Ranking Guarantee):**
   - اسکن عمیق و بازگشتی تمامی ساختارها جهت اطمینان از عدم حضور کلیدواژه‌های تحریم‌شده:  
     `rank`, `ranking_score`, `league_table`, `best_school`, `worst_school`, `compare_school`, `top_school`.
   - پرتاب فوری خطای صلب: `ZERO_RANKING_VIOLATION`.
3. **تفکیک چندمستأجری شکست‌ایمن (Fail-Closed Multi-Tenancy):**
   - مسدودسازی قطعی هرگونه نشت اطلاعات بین مدارس با کدهای خطای رسمی:
     - `ZERO_TRUST_TENANT_ISOLATION_VIOLATION`
     - `ZERO_TRUST_ROLE_ACCESS_DENIED`
     - `ZERO_TRUST_CONTEXT_INVALID`
     - `ZERO_TRUST_POLICY_REQUIRED`
