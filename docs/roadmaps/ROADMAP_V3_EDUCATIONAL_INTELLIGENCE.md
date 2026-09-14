# نقشه راه توسعه آموزشی و اطمینان خانواده در پایش — V3

**Status:** Proposed / Roadmap Extension
**Purpose:** تبدیل پایش از «سامانه مدیریت و ثبت اطلاعات مدرسه» به «سامانه تصمیم‌یار آموزشی و مدیریت کیفیت مدرسه» با تمرکز بر یادگیری، کیفیت تدریس، کشف زودهنگام مسئله، ارتباط مؤثر با خانواده و تصمیم‌گیری مبتنی بر داده.

> این سند مکمل نقشه‌راه فعلی است و نباید وضعیت پیاده‌سازی را سبز فرض کند. هر قابلیت قبل از اعلام Complete باید در کد، تست و شواهد عملیاتی احراز شود.

## 1. یافته‌های جدیدی که باید به نقشه راه اضافه شوند

### A. موتور سنجش پیشرفت یادگیری
- Student Learning Profile در طول زمان، نه فقط کارنامه سالانه.
- تحلیل روند هر دانش‌آموز در درس/مهارت، پایه، نوبت و سال‌های تحصیلی.
- تشخیص افت، توقف رشد، جهش و شکاف یادگیری.
- مقایسه منصفانه با کلاس/مدرسه/منطقه با کنترل پایه، درس، نوع مدرسه و شرایط زمینه‌ای.
- شاخص‌های cohort، retention و progression.
- نمایش confidence/data-quality برای هر شاخص؛ عدد بدون کیفیت داده معتبر تلقی نشود.

### B. تحلیل دقیق آموزشی و آماری
- Semantic Layer مشترک برای KPIهای مدرسه، منطقه، استان و ملی.
- Drill-down از ملی → استان → منطقه → مدرسه → کلاس → درس → دانش‌آموز، مطابق مجوز.
- تحلیل توزیع نمرات، میانگین/میانه، پراکندگی، روند و outlier.
- تحلیل رشد درون‌فردی و cohort؛ از رتبه‌بندی خام دانش‌آموزان و معلمان به‌عنوان معیار کیفیت اجتناب شود.
- شاخص‌های participation، attendance، assessment coverage، completion و timeliness.
- Data Quality Score برای هر شاخص: completeness, validity, consistency, freshness.
- امکان بازتولید هر KPI از داده خام و تعریف نسخه‌دار KPI.

### C. کنترل کمی و کیفی کیفیت تدریس
- Teacher Activity/Workload Profile: کلاس‌ها، ساعات، حضور، ارزشیابی، تکالیف/فعالیت‌های ثبت‌شده و زمان‌بندی.
- Teaching Evidence Portfolio: شواهد قابل ممیزی از فرآیند آموزشی، نه صرفاً تعداد ثبت‌ها.
- Teaching Quality Review با معیارهای از پیش تعریف‌شده و قابل ممیزی.
- Classroom/lesson observation workflow با فرم استاندارد، نقش مجاز، زمان، شواهد و بازخورد.
- Peer/mentor review در صورت مجاز بودن مقررات.
- Professional Development tracker: نیاز آموزشی، دوره، مشارکت و follow-up.
- Teacher quality dashboard باید «ابزار بهبود» باشد، نه رتبه‌بندی خودکار یا تنبیه خودکار.
- هر شاخص عملکرد معلم باید denominator، بازه زمانی، منبع داده و محدودیت تفسیر داشته باشد.

### D. تحلیل نقاط قوت و ضعف مدرسه
- School Health / Educational Quality Profile.
- تفکیک حداقل این ابعاد: یادگیری، حضور، پوشش ارزشیابی، کیفیت فرآیند آموزشی، نیروی انسانی، ارتباط خانواده، انضباط/پرورش، داده و عملیات.
- Trend + benchmark + exception + root-cause candidates.
- نمایش «قوت‌های پایدار»، «مسئله‌های نوظهور» و «مسئله‌های بحرانی» جداگانه.
- جلوگیری از یک امتیاز واحد که تفاوت ابعاد را پنهان کند.

### E. Early Warning & Intervention
- Early Warning برای افت تحصیلی، غیبت مزمن، افت مشارکت و خطر ترک تحصیل.
- Rule-based alerts قبل از AI؛ سپس مدل‌های آماری/ML پس از ایجاد داده طولی معتبر.
- Case Management: هشدار → بررسی → مداخله → مسئول → موعد → نتیجه → follow-up.
- ثبت اثر مداخله برای سنجش اینکه چه اقداماتی واقعاً مؤثر بوده‌اند.
- AI فقط پیشنهاددهنده؛ تصمیم حساس درباره دانش‌آموز با انسان مجاز و قابل توضیح.

### F. تجربه و اطمینان اولیا
- Parent 360 ساده و قابل فهم.
- صفحه «وضعیت فرزند من» با خلاصه قابل فهم از حضور، پیشرفت، ارزیابی، برنامه و اقدامات لازم.
- پیام، task، approval، alert و deadline به‌صورت مستقل مدل شوند.
- Personalized but permission-safe notifications.
- Parent acknowledgement برای موارد مهم، با ثبت زمان و وضعیت.
- دوطرفه بودن ارتباط: سؤال/درخواست → مسئول → SLA → پاسخ → closure.
- خلاصه هفتگی/ماهانه آموزشی قابل فهم برای خانواده، بدون بمباران اعلان.
- توضیح «چرا این هشدار/پیشنهاد صادر شده؟» برای افزایش اعتماد.
- دسترسی والد فقط بر اساس رابطه معتبر والد-دانش‌آموز و سطح حساسیت داده.

### G. داشبورد مدیر: از گزارش به اقدام
- Daily School Command Center.
- «امروز چه چیزی نیاز به اقدام دارد؟» به‌جای نمایش انبوه نمودار.
- Top exceptions، overdue workflows، attendance anomalies، assessment gaps، staffing issues و parent actions.
- هر KPI باید به لیست رکورد/استثنا و اقدام بعدی drill-down شود.
- Action tracking و closure rate.

### H. عدالت و تفسیر منصفانه
- شاخص‌های مقایسه‌ای باید context-aware باشند.
- تحلیل جداگانه برای مدارس روستایی، چندپایه، عشایری، فنی/حرفه‌ای و استثنایی در صورت کفایت داده و مقررات.
- مدل‌ها و رتبه‌بندی‌ها نباید به‌دلیل missingness یا تفاوت زمینه‌ای، مدرسه/معلم/دانش‌آموز را ناعادلانه penalize کنند.
- Fairness audit برای قابلیت‌های predictive/AI.

### I. پژوهش و سیاست‌گذاری آموزشی
- Longitudinal Education Warehouse پس از تثبیت Source of Truth.
- Cohort analysis، transition analysis و outcome analysis.
- Scenario planning برای ظرفیت، نیروی انسانی و افت تحصیلی.
- National education digital twin در مرحله بلندمدت.

## 2. اولویت‌بندی اجرایی

### P0 — قبل از هوشمندسازی
1. **P0-EI-01 — Educational Semantic Layer**: تعریف رسمی KPI، فرمول، denominator، source، owner، version و scope.
2. **P0-EI-02 — Longitudinal Student Timeline**: اتصال امن داده‌های چندسال.
3. **P0-EI-03 — Assessment Analytics Foundation**: پوشش، روند، توزیع و کیفیت داده نمرات.
4. **P0-EI-04 — Attendance Analytics Foundation**: روند حضور/تاخیر و شاخص‌های قابل بازتولید.
5. **P0-EI-05 — School Educational Health Dashboard**: داشبورد اقدام‌محور مدرسه.
6. **P0-EI-06 — Parent 360 + Action Center**: تجربه ساده، permission-safe و دوطرفه.
7. **P0-EI-07 — Teacher Evidence & Quality Framework**: مدل شواهد و بازخورد؛ بدون رتبه‌بندی خودکار.
8. **P0-EI-08 — Intervention Case Management**: هشدار تا مداخله و پیگیری.

### P1 — تحلیل پیشرفته و مدیریت کیفیت
9. **P1-EI-09 — District/Province/National Education Intelligence**.
10. **P1-EI-10 — Teacher Professional Development & Mentoring**.
11. **P1-EI-11 — School Strength/Weakness Analysis**.
12. **P1-EI-12 — Cohort & Progression Analytics**.
13. **P1-EI-13 — Parent Engagement Analytics**.
14. **P1-EI-14 — Operational SLA/Exception Analytics**.

### P2 — هوش مصنوعی و پیش‌بینی
15. **P2-EI-15 — Dropout/Attendance/Academic Risk Models**.
16. **P2-EI-16 — Personalized Intervention Suggestions** با Human-in-the-loop.
17. **P2-EI-17 — Natural Language BI**.
18. **P2-EI-18 — Workforce/Capacity Forecasting**.
19. **P2-EI-19 — Fairness & Model Monitoring**.
20. **P2-EI-20 — National Scenario Simulation / Digital Twin**.

## 3. ترتیب وابستگی

```text
Source of Truth + Data Quality
        ↓
Longitudinal Student Record
        ↓
Semantic KPI Layer
        ↓
Attendance + Assessment Analytics
        ↓
School/Teacher/Parent Dashboards
        ↓
Intervention Case Management
        ↓
Cohort / Benchmark / Outcome Analytics
        ↓
Predictive Models
        ↓
AI Decision Support
        ↓
National Simulation
```

## 4. معیارهای آماری اجباری

هر شاخص آموزشی باید همراه با این metadata ذخیره/ارائه شود:

- تعریف شاخص
- population / denominator
- بازه زمانی
- سطح تحلیل
- source of truth
- نسخه KPI
- data freshness
- completeness
- confidence/uncertainty در موارد لازم
- فیلترها و exclusion rules
- مسئول شاخص
- timestamp محاسبه

### اصول تحلیلی
- میانگین به‌تنهایی معیار کافی نیست.
- trend و distribution باید در کنار level دیده شوند.
- sample size کوچک نباید رتبه‌بندی قطعی تولید کند.
- missing data نباید بدون علامت به‌عنوان عملکرد واقعی تفسیر شود.
- correlation به‌عنوان causation نمایش داده نشود.
- مقایسه مدارس/معلمان باید context و cohort را در نظر بگیرد.

## 5. تجربه کاربری — اصل «کمترین کار، بیشترین اطمینان»

### معلم
- ثبت سریع با کمترین کلیک.
- مشاهده فوری کارهای امروز.
- ثبت یک‌باره و استفاده مجدد از داده.
- هشدار خطا در همان لحظه.
- offline برای عملیات حیاتی.

### مدیر
- صفحه اول = اقدام‌های ضروری، نه گزارش‌های طولانی.
- drill-down مستقیم از KPI به علت/رکورد.
- پیشنهاد اقدام فقط همراه با دلیل و شواهد.

### والد
- یک صفحه واضح برای وضعیت فرزند.
- اعلان فقط وقتی action یا اهمیت واقعی دارد.
- زبان غیرتخصصی برای تفسیر آموزشی.
- مسیر روشن برای ارتباط با مدرسه و پیگیری درخواست.

## 6. کنترل کیفیت و حاکمیت

هیچ شاخص یا مدل آموزشی نباید برای ارزیابی رسمی افراد استفاده شود مگر اینکه:

1. تعریف و منبع آن رسمی و versioned باشد.
2. کیفیت و محدودیت داده مشخص باشد.
3. bias/fairness بررسی شده باشد.
4. امکان audit و reproduction وجود داشته باشد.
5. فرآیند اعتراض/بازبینی انسانی وجود داشته باشد.
6. اثر unintended consequences بررسی شده باشد.

## 7. برنامه تبدیل به Missionهای آینده

هر Epic بالا باید به Missionهای 1/20 شکسته شود؛ هر Mission فقط یک scope محدود داشته باشد.

### ترتیب پیشنهادی Mission Families
1. KPI/semantic definitions
2. longitudinal data model
3. assessment analytics
4. attendance analytics
5. school health dashboard
6. parent action center
7. teacher evidence framework
8. intervention workflow
9. district/national BI
10. predictive/AI بعد از اثبات کیفیت داده

## 8. Definition of Done برای قابلیت‌های آموزشی

قابلیت فقط زمانی Complete است که:

- business owner مشخص باشد؛
- source of truth مشخص باشد؛
- permission model مشخص باشد؛
- audit trail وجود داشته باشد؛
- data-quality checks وجود داشته باشد؛
- formula/KPI versioned باشد؛
- unit/integration/E2E tests متناسب وجود داشته باشد؛
- negative/edge cases پوشش داده شود؛
- offline/sync در صورت نیاز بررسی شود؛
- performance در workload هدف سنجیده شود؛
- UI برای نقش مربوطه قابل استفاده باشد؛
- evidence قابل بازتولید ثبت شود؛
- documentation به‌روز شود.

## 9. نکته مهم درباره وضعیت فعلی

این موارد به‌عنوان **نیاز و مسیر توسعه** اضافه شده‌اند، نه ادعای وجود قابلیت در نسخه فعلی. وجود سند، گزارش یک Arena یا تست منفرد به‌تنهایی اثبات پیاده‌سازی کامل نیست.

## 10. ارتباط با نقشه راه موجود

این سند باید به‌عنوان extension دامنه آموزشی/تحلیلی در کنار Waves موجود اجرا شود. ابتدا شکاف‌های P0 و Data Foundation تکمیل شوند؛ سپس Parent/Teacher/School Intelligence؛ و در نهایت AI/Forecasting.
