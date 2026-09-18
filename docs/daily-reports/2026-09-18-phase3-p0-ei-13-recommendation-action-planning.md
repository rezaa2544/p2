# گزارش تحویل مأموریت: موتور پیشنهاددهنده و برنامه‌ریزی اقدام آموزشی (P0-EI-13)
## Educational Intelligence Recommendation & Action Planning Delivery Report

**پروژه:** سامانه ملی پایش مدارس (`rezaa2544/p2`)  
**فاز / گام:** Phase 3 — P0-EI-13  
**شاخهٔ اجرایی:** `feat/phase3-step13-recommendation-action-planning`  
**مبنای کامیت (Base Commit):** آخرین کامیت گام P0-EI-12 به شناسه `1e3d3ed51d148962bdb119b6d1cdf9c33d35e659`  
**تاریخ گزارش:** ۲۰۲۶-۰۹-۱۸  

---

## ۱. ممیزی معماری و دستاوردهای راهبردی (Architecture & Strategy Audit)

سند ممیزی جامع در `docs/RECOMMENDATION_ACTION_PLANNING_AUDIT.md` ثبت شد. اهم دستاوردها:
1. **معماری سه‌لایه تبدیل سیگنال به اقدام مصوب انسانی (Three-Tier Architecture):**
   - پیوند قطعی میان لایه کشف داده‌ها (`Detection Layer`)، لایه بینش‌های تفسیری (`Insight Layer`) و لایه اقدام عملیاتی (`Action Layer`).
   - تبدیل هشدارهای ایزوله به برنامه‌های اقدام عملیاتی دارای مسئول، مهلت زمانی و شواهد متقن.
2. **اصل غیرقابل مذاکره نظارت و تأیید انسانی (Human-in-the-Loop Guard):**
   - تحریم مطلق هرگونه تصمیم‌گیری خودکار الگوریتمی درباره دانش‌آموز، معلم، یا مدرسه (`automated_decision: false`).
   - تمامی پیشنهادها در وضعیت `REVIEW_PENDING` قرار گرفته و اجرای آن‌ها منوط به تأیید کاربر انسانی مجاز است (`requires_human_confirmation: true`).
3. **ماشین چرخه حیات اقدام آموزشی (Action Lifecycle Machine):**
   - پیاده‌سازی ماشین وضعیت قطعی:  
     `GENERATED -> REVIEW_PENDING -> APPROVED -> IN_PROGRESS -> EVALUATING -> COMPLETED` (یا `CANCELLED`)
   - ثبت تاریخچه کامل، شناسه اقدام‌کننده و یادداشت‌های مستدل در هر ترنزیشن.
4. **الگوریتم اولویت‌بندی عینی جبری بدون رتبه‌بندی رقابتی (`prioritizeActions`):**
   - محاسبه امتیاز اولویت بر مبنای ضرب سه‌گانه عوامل عینی:
     $$\text{Priority Score} = \frac{\text{Impact} \times \text{Urgency} \times \text{EvidenceStrength}}{75} \times 100$$
   - تضمین مطلق منع رتبه‌بندی، League Table، و برچسب‌های بهترین/بدترین مدارس. اولویت‌بندی صرفاً درون همان واحد آموزشی انجام می‌شود.
5. **ماتریس تخصیص نقش متولی اقدام (`assignActionOwner`):**
   - تخصیص ساختاریافته وظایف:
     - `ATTENDANCE_SUPPORT` $\rightarrow$ مشاور (`counselor`)
     - `ACADEMIC_REMEDIAL` $\rightarrow$ معلم (`teacher`)
     - `TEACHER_DEVELOPMENT` $\rightarrow$ مدیر مدرسه (`manager`)
     - `REGIONAL_RESOURCE` $\rightarrow$ کارشناس اداره منطقه (`edu_office`)
     - `PARENT_COLLABORATION` $\rightarrow$ مشاور / مدیر
6. **سنجش اثربخشی چرخه بسته (`evaluateActionEffectiveness`):**
   - ارزیابی تغییرات قبل و بعد از اقدام بر متغیرهای $\Delta \text{Attendance}$، $\Delta \text{GPA}$، و $\Delta \text{Engagement}$.
   - طبقه‌بندی چهارگانه پیامد: `HIGHLY_EFFECTIVE`، `PARTIALLY_EFFECTIVE`، `INEFFECTIVE`، یا `REQUIRES_ESCALATION`.
7. **تابلوی اقدامات تفکیک‌شده مدیر مدرسه (`generatePrincipalActionBoard`):**
   - تفکیک افق‌های زمانی به اقدامات فوری ۲۴ ساعته، اقدامات هفتگی و اقدامات نیازمند پشتیبانی منطقه بدون هیچ‌گونه فیلد رقابتی.
8. **امنیت و ایزولاسیون چندمستأجری (`enforceRecommendationAccessGuard`):**
   - مهار قطعی آسیب‌پذیری IDOR و تفکیک سخت‌گیرانه دسترسی‌های مدیر و کارشناس منطقه با شکست ایمن (`Fail-Closed`) و پرتاب خطای `RECOMMENDATION_TENANT_ISOLATION_VIOLATION`.
9. **وب‌سرویس RESTful API:**
   - عرضه اندپوینت `GET /api/v1/analytics/action-recommendations?school_id=&region_id=&academic_year=`.

---

## ۲. پرونده‌های تغییریافته و ایجادشده (Changed Files)

| ردیف | مسیر فایل | نوع تغییر | شرح وظیفه |
|:---:|---|:---:|---|
| ۱ | `server/analytics/recommendation-action-planning.js` | ایجاد جدید | موتور اصلی پیشنهاددهنده، ماشین چرخه حیات، اولویت‌بندی، ارزیابی اثربخشی و تابلوی مدیر |
| ۲ | `server/routes/analytics.js` | ویرایش | افزودن هندلر وب‌سرویس RESTful `actionRecommendationsReport` |
| ۳ | `server/index.js` | ویرایش | اتصال مسیر `/api/v1/analytics/action-recommendations` به سرور |
| ۴ | `docs/RECOMMENDATION_ACTION_PLANNING_AUDIT.md` | ایجاد جدید | ممیزی معماری سه‌لایه، رفع شکاف‌های تصمیم‌گیری و الزامات نظارت انسانی |
| ۵ | `docs/RECOMMENDATION_ACTION_PLANNING_MODEL.md` | ایجاد جدید | سند مشخصات داده‌ای و قرارداد رسمی نسخه ۱.۰.۰ |
| ۶ | `tests/semantic-layer/recommendation-action-planning/recommendation-generation.test.js` | ایجاد جدید | آزمون تولید پیشنهادهای عملیاتی متناظر با سیگنال‌ها |
| ۷ | `tests/semantic-layer/recommendation-action-planning/priority-scoring.test.js` | ایجاد جدید | آزمون اولویت‌بندی عینی Impact × Urgency × EvidenceStrength |
| ۸ | `tests/semantic-layer/recommendation-action-planning/owner-assignment.test.js` | ایجاد جدید | آزمون تخصیص هوشمند نقش متولی مسئول بر مبنای نوع اقدام |
| ۹ | `tests/semantic-layer/recommendation-action-planning/action-lifecycle.test.js` | ایجاد جدید | آزمون ماشین چرخه حیات اقدام و ترنزیشن‌های مجاز |
| ۱۰ | `tests/semantic-layer/recommendation-action-planning/effectiveness-evaluation.test.js` | ایجاد جدید | آزمون سنجش اثربخشی و مقایسه متغیرهای قبل و بعد |
| ۱۱ | `tests/semantic-layer/recommendation-action-planning/human-in-loop.test.js` | ایجاد جدید | آزمون الزام نظارت انسانی و منع تصمیم‌گیری خودکار |
| ۱۲ | `tests/semantic-layer/recommendation-action-planning/no-ranking.test.js` | ایجاد جدید | آزمون تضمین منع مطلق رتبه‌بندی رقابتی و لیگ مدارس |
| ۱۳ | `tests/semantic-layer/recommendation-action-planning/deterministic.test.js` | ایجاد جدید | آزمون قطعیت و بازتولیدپذیری بیت‌به‌بیت در ۱۰ اجرای متوالی |
| ۱۴ | `tests/semantic-layer/recommendation-action-planning/mutation-safety.test.js` | ایجاد جدید | آزمون ایمنی در برابر جهش داده‌ها با اشیای منجمد عمیق (`deepFreeze`) |
| ۱۵ | `tests/semantic-layer/recommendation-action-planning/tenant-isolation.test.js` | ایجاد جدید | آزمون تفکیک چندمستأجری و سقط قاطع خطای تفکیک (Fail-Closed) |
| ۱۶ | `tests/semantic-layer/recommendation-action-planning/index.test.js` | ایجاد جدید | رانر تجمیعی آزمون‌های ۱۰‌گانه موتور پیشنهاددهنده |
| ۱۷ | `tests/semantic-layer/runner.js` | ویرایش | ثبت سوئیت جدید و ارتقای رانر لایه معنایی به ۲۵ سوئیت فعال |
| ۱۸ | `tests/api/recommendation-action-planning.test.js` | ایجاد جدید | تست ادغام اندپوینت HTTP با احراز هویت کوکی و کنترل نقش‌ها |
| ۱۹ | `tests/api/runner.js` | ویرایش | ثبت تست جدید و ارتقای رانر API Backend به ۱۰ سوئیت فعال |
| ۲۰ | `docs/DOCS_INDEX.md` | ویرایش | ثبت اسناد ممیزی و مدل در جدول مستندات مرجع |
| ۲۱ | `docs/daily-reports/2026-09-18-phase3-p0-ei-13-recommendation-action-planning.md` | ایجاد جدید | گزارش رسمی تحویل مأموریت |

---

## ۳. نتایج اعتبارسنجی دروازه‌های کیفیت (Quality Gates Execution)

### ۳.۱. رانر آزمون‌های لایه معنایی آموزشی (`tests/semantic-layer/runner.js`)
```
───────────────────────────────────────────────────────────────────
نتیجه کلی لایه معنایی: 25/25 سوئیت موفق
✅ تمامی تست‌های لایه معنایی و آزمون‌های جهش با موفقیت ۱۰۰٪ پاس شدند.
```

### ۳.۲. رانر آزمون‌های بک‌اند RESTful API (`tests/api/runner.js`)
```
────────────────────────────────────────────────────
نتیجه کلی RESTful API Tests: 10/10 سوئیت موفق — بدون خطا ✅
────────────────────────────────────────────────────
```

### ۳.۳. تست‌های جامع سامانه (`npm test` / `tests/run.js`)
```
────────────────────────────────────────────────────
نتیجه: 35/35 تست موفق  —  بدون خطا ✅
────────────────────────────────────────────────────
```

---

## ۴. جمع‌بندی و گام بعدی (Next Steps)

مأموریت **P0-EI-13: موتور پیشنهاددهنده و برنامه‌ریزی اقدام آموزشی با تأیید انسانی** با تحقق کلیه شروط معماری، رعایت کامل ایزولاسیون چندمستأجری، پوشش جامع تست‌های قطعی، جهش و REST API، با موفقیت آماده ثبت کامیت محلی گردید.
گام بعدی: اجرای کامل دروازه‌های کیفی ریپازیتوری و ثبت کامیت تمیز محلی.
