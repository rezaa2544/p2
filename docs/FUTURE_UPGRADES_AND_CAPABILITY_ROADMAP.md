# پایش — نقشه جامع ارتقاها و قابلیت‌های آینده

وضعیت: CANONICAL / ACTIVE / FUTURE-ONLY
تاریخ ثبت: 2026-09-25
قانون: هیچ مورد این سند به‌معنای پیاده‌شده یا تأییدشده نیست.

## 1. هدف
این سند فهرست واحد قابلیت‌ها و ارتقاهای آینده است تا قابلیت‌های قبلی گم نشوند، پیشنهادهای معماری جدید کنار backlog قبلی ثبت شوند، و توسعه‌دهنده برای هر قابلیت دامنه، پیش‌نیاز، محل پیاده‌سازی و معیار پذیرش روشن داشته باشد.
مرجع زمان‌بندی اجرای فعلی همچنان docs/ROADMAP_MASTER_EXECUTION_SCHEDULE.md است. این سند مرجع فهرست و ساختار آینده است، نه مجوز شروع کار.

## 2. وضعیت جاری
پروژه در زمان ثبت این سند در HARDENING / ROOT-CAUSE REMEDIATION — NOT VERIFIED است.
- ابتدا یافته‌های Atria-1 با 37 مورد، F1..F5 و A-01..A-39 تطبیق داده می‌شوند.
- این backlog نباید باعث شروع بازنویسی معماری در میانه اصلاحات Atria شود.
- هر قابلیت آینده فقط بعد از تثبیت، تست و evidence مستقل status می‌گیرد.

## 3. قابلیت‌های قبلی ثبت‌شده در نقشه راه
| ID | قابلیت | مرجع |
|---|---|---|
| FUT-CAP-01 | نمره عملی/کارگاهی هنرستان | ROADMAP.md / E.1 |
| FUT-CAP-02 | ثبت ساعت کارآموزی هنرستان | ROADMAP.md / E.2 |
| FUT-CAP-03 | گیمیفیکیشن رفتاری دبستان | ROADMAP.md / E.3 |
| FUT-CAP-04 | مدیریت کتابخانه مدرسه | ROADMAP.md / E.4 |
| FUT-CAP-05 | مدیریت اموال/انبار مدرسه | ROADMAP.md / E.5 |
| FUT-CAP-06 | تولید خودکار برنامه هفتگی | ROADMAP.md / E.6 |
| FUT-CAP-07 | گردش کار امتحانات شهریور/تجدیدی | ROADMAP.md / E.7 |
| FUT-CAP-08 | کلاس‌های تابستانی | ROADMAP.md / E.8 |
| FUT-CAP-09 | مدیریت مراجعین | ROADMAP.md / E.9 |
| FUT-CAP-10 | شاخص سلامت مدرسه | ROADMAP.md / E.10 |
| FUT-CAP-11 | پایگاه دانش کاربر نهایی | ROADMAP.md / E.11 |
| FUT-CAP-12 | صفحه وضعیت عمومی سرویس | ROADMAP.md / E.12 |

وضعیت واقعی هر مورد باید از کد و سند وضعیت جاری خوانده شود؛ این جدول backlog را نگه می‌دارد و ادعای پیاده‌سازی نمی‌کند.


## 3A. شرح کامل قابلیت‌های قبلی و نیاز آینده

این بخش توضیح می‌دهد هر قابلیت چه مسئله‌ای را حل می‌کند و در آینده چه نیازی را پوشش می‌دهد؛ وضعیت اجرای واقعی باید جداگانه از کد و شواهد جاری تعیین شود.

### FUT-CAP-01 — نمره عملی/کارگاهی هنرستان
**چیست؟** ثبت ارزیابی بخش عملی و کارگاهی در کنار نمرات نظری.  
**کاربرد:** ثبت مهارت عملی، پروژه و عملکرد کارآموز.  
**نیاز آینده:** پوشش کامل آموزش مهارتی در کارنامه، معدل و تحلیل عملکرد.

### FUT-CAP-02 — ثبت ساعت کارآموزی هنرستان
**چیست؟** ثبت ساعات و وضعیت دوره کارآموزی.  
**کاربرد:** کنترل میزان حضور و تکمیل ساعات.  
**نیاز آینده:** تبدیل کارآموزی به سابقه آموزشی قابل گزارش و ارزیابی.

### FUT-CAP-03 — گیمیفیکیشن رفتاری دبستان
**چیست؟** امتیاز، نشان و چالش برای رفتار و مشارکت مثبت.  
**کاربرد:** بازخورد انگیزشی و تشویق رفتار مطلوب.  
**نیاز آینده:** توسعه انگیزشی بدون ایجاد منطق تنبیهی یا source of truth دوم.

### FUT-CAP-04 — مدیریت کتابخانه مدرسه
**چیست؟** مدیریت کتاب، موجودی، امانت و بازگشت.  
**کاربرد:** کنترل گردش منابع آموزشی.  
**نیاز آینده:** حذف ثبت دستی و ایجاد سابقه قابل گزارش.

### FUT-CAP-05 — مدیریت اموال/انبار مدرسه
**چیست؟** ثبت دارایی، تجهیزات، موجودی و تحویل.  
**کاربرد:** مشخص شدن محل و مسئول هر دارایی.  
**نیاز آینده:** کاهش مغایرت و ایجاد audit trail اموال.

### FUT-CAP-06 — تولید خودکار برنامه هفتگی
**چیست؟** تولید برنامه با درنظرگرفتن معلم، کلاس، درس، ساعت و قیود.  
**کاربرد:** کاهش برنامه‌ریزی دستی و کشف تعارض.  
**نیاز آینده:** مدیریت مدارس بزرگ‌تر و تولید سناریوهای قابل مقایسه.

### FUT-CAP-07 — امتحانات شهریور/تجدیدی
**چیست؟** گردش کار دانش‌آموزان تجدیدی از شناسایی تا نتیجه.  
**کاربرد:** مدیریت متمرکز امتحانات خارج از دوره عادی.  
**نیاز آینده:** جلوگیری از پراکندگی سوابق و خطای وضعیت تحصیلی.

### FUT-CAP-08 — کلاس‌های تابستانی
**چیست؟** تعریف کلاس، ثبت‌نام، برنامه، حضور و ارزیابی تابستان.  
**کاربرد:** مدیریت دوره‌های تابستانی در همان سامانه.  
**نیاز آینده:** پشتیبانی از چند دوره آموزشی بدون اختلاط داده.

### FUT-CAP-09 — مدیریت مراجعین
**چیست؟** ثبت مراجعه‌کننده، میزبان، ورود، خروج و وضعیت.  
**کاربرد:** مدیریت پذیرش و تردد با audit.  
**نیاز آینده:** نظم و امنیت بیشتر در ورود افراد.

### FUT-CAP-10 — شاخص سلامت مدرسه
**چیست؟** نمای ترکیبی از شاخص‌های آموزشی، حضور، رفتار، مداخله و امنیت.  
**کاربرد:** دید مدیریتی یکپارچه.  
**نیاز آینده:** تبدیل داده‌های پراکنده به شاخص قابل پایش با provenance روشن و بدون داده ساختگی.

### FUT-CAP-11 — پایگاه دانش کاربر نهایی
**چیست؟** راهنما، FAQ و آموزش عملی کاربران.  
**کاربرد:** حل مسائل رایج بدون وابستگی کامل به پشتیبانی.  
**نیاز آینده:** منبع رسمی، قابل جست‌وجو و همگام با نسخه واقعی محصول.

### FUT-CAP-12 — صفحه وضعیت عمومی سرویس
**چیست؟** نمایش وضعیت سرویس‌ها و رخدادهای قابل اعلام عمومی.  
**کاربرد:** اطلاع کاربران از اختلال و بازیابی.  
**نیاز آینده:** شفافیت عملیاتی بدون افشای اطلاعات حساس.

## 4A. شرح کامل قابلیت‌های محصول و معماری آینده

### FUT-PROD-01 — سازمان/مالک مشترک چندمدرسه‌ای
**چیست؟** مدل چندمدرسه‌ای زیر یک سازمان یا مالک با حفظ tenant isolation.  
**کاربرد:** مدیریت مرکزی و گزارش‌گیری بین مدارس.  
**نیاز آینده:** پشتیبانی از زنجیره مدارس و ساختارهای چندواحدی.

### FUT-PROD-02 — پروفایل قابلیت‌های مدرسه
**چیست؟** capability flagهای مشخص‌کننده امکانات مدرسه.  
**کاربرد:** فعال‌سازی ماژول بر اساس قابلیت واقعی.  
**نیاز آینده:** جلوگیری از شرط‌های پراکنده و configurable شدن محصول.

### FUT-PROD-03 — گواهی رسمی قابل استعلام
**چیست؟** گواهی با شناسه یا کد قابل اعتبارسنجی.  
**کاربرد:** بررسی اصالت مدرک.  
**نیاز آینده:** کاهش جعل و استعلام دستی.

### FUT-PROD-04 — اتصال سرویس‌های واقعی
**چیست؟** اتصال providerهای بیرونی مانند پیامک و سرویس‌های هویتی از طریق adapter.  
**کاربرد:** عملیات واقعی با timeout، retry و idempotency.  
**نیاز آینده:** اتصال پایدار به سرویس‌های بیرونی بدون وابستگی هسته به provider.

### FUT-PROD-05 — نقش پذیرش مستقل
**چیست؟** نقش محدود پذیرش برای Visitor Management.  
**کاربرد:** مدیریت مراجعه بدون اعطای اختیار مدیریتی.  
**نیاز آینده:** least privilege در فرایند پذیرش.

### FUT-PROD-06 — گسترش گیمیفیکیشن
**چیست؟** چارچوب قابل توسعه امتیاز، badge و challenge.  
**کاربرد:** سناریوهای انگیزشی متنوع.  
**نیاز آینده:** گسترش بدون منطق پراکنده و متناقض.

### FUT-PROD-07 — Object Storage عملیاتی
**چیست؟** نگهداری فایل‌های حجیم در storage و metadata در PostgreSQL.  
**کاربرد:** اسناد، تصاویر و فایل‌های آموزشی.  
**نیاز آینده:** مقیاس‌پذیری فایل و کنترل دسترسی بهتر.

### FUT-FE-01 — TypeScript
**چیست؟** type checking برای JavaScript.  
**کاربرد:** کشف خطاهای قرارداد داده و refactor پیش از runtime.  
**نیاز آینده:** کاهش خطا و افزایش maintainability به‌صورت تدریجی.

### FUT-FE-02 — React + Next.js
**چیست؟** مسیر frontend مبتنی بر React و قابلیت‌های Next.js.  
**کاربرد:** ساخت vertical sliceهای UI با component architecture منسجم.  
**نیاز آینده:** توسعه بخش‌های جدید بدون بازنویسی یکباره frontend؛ offline/sync باید حفظ شود.

### FUT-FE-03 — Design System
**چیست؟** componentها و قواعد مشترک UI.  
**کاربرد:** UI یکسان، accessibility و توسعه سریع‌تر.  
**نیاز آینده:** جلوگیری از componentهای تکراری و ناسازگار.

### FUT-FE-04 — Three.js
**چیست؟** کتابخانه rendering سه‌بعدی وب.  
**کاربرد:** visualization یا آموزش سه‌بعدی در صورت نیاز واقعی.  
**نیاز آینده:** قابلیت تخصصی سه‌بعدی؛ فناوری پیش‌فرض UI نیست.

### FUT-BE-01 — Modular Monolith + Vertical Slices
**چیست؟** backend واحد با مرزهای داخلی روشن.  
**کاربرد:** توسعه مستقل قابلیت‌ها و کاهش coupling.  
**نیاز آینده:** رشد تیم و امکان استخراج سرویس بدون microservice زودهنگام.

### FUT-BE-02 — Event-Driven Architecture
**چیست؟** انتشار رویدادهای دامنه و مصرف مستقل.  
**کاربرد:** جدا کردن عملیات جانبی مثل notification و analytics.  
**نیاز آینده:** کاهش coupling و پردازش asynchronous.

### FUT-BE-03 — Transactional Outbox
**چیست؟** ثبت تغییر business و event در یک transaction.  
**کاربرد:** جلوگیری از گم‌شدن event پس از commit.  
**نیاز آینده:** قابلیت اطمینان worker، sync و integration.

### FUT-BE-04 — OpenTelemetry / End-to-End Tracing
**چیست؟** tracing استاندارد درخواست در اجزای سیستم.  
**کاربرد:** یافتن latency و failure.  
**نیاز آینده:** observability واقعی در محیط بزرگ‌تر و debugging مبتنی بر evidence.

### FUT-BE-05 — Policy-as-Code
**چیست؟** authorization به‌صورت قرارداد متمرکز و قابل تست.  
**کاربرد:** یکسان‌سازی role، tenant، ownership و field permissions.  
**نیاز آینده:** جلوگیری از bypass در REST، Sync و سرویس‌های آینده.

### FUT-BE-06 — Go برای سرویس‌های منتخب
**چیست؟** استخراج bounded contextهای دارای نیاز اثبات‌شده به Go.  
**کاربرد:** throughput/latency/isolation بهتر در بخش‌های خاص.  
**نیاز آینده:** بهینه‌سازی بخش سنگین بدون rewrite کل backend.

### FUT-BE-07 — Microservices
**چیست؟** سرویس‌های مستقل با deployment و scaling جداگانه.  
**کاربرد:** استقلال عملیاتی دامنه‌های واقعاً مستقل.  
**نیاز آینده:** scale سازمانی در صورت اثبات نیاز.

### FUT-DB-01 — PostgreSQL Source of Truth
**چیست؟** نگهداری داده تراکنشی معتبر در PostgreSQL.  
**کاربرد:** consistency و transaction.  
**نیاز آینده:** جلوگیری از چند منبع حقیقت با اضافه شدن cache/search.

### FUT-DB-02 — Redis
**چیست؟** لایه سریع cache و state موقت توزیع‌شده.  
**کاربرد:** کاهش بار DB و latency.  
**نیاز آینده:** scale بهتر بدون انتقال مالکیت داده اصلی.

### FUT-DB-03 — Elasticsearch
**چیست؟** موتور جست‌وجوی ایندکس‌شده و توزیع‌شده.  
**کاربرد:** full-text و جست‌وجوی حجیم.  
**نیاز آینده:** جست‌وجوی سریع روی داده مشتق‌شده بدون فشار بر تراکنش‌های PostgreSQL.

### FUT-DB-04 — Distributed Database
**چیست؟** دیتابیس توزیع‌شده برای بار یا جغرافیای بسیار بزرگ.  
**کاربرد:** scale/availability جغرافیایی در صورت نیاز واقعی.  
**نیاز آینده:** فقط پس از اثبات محدودیت معماری فعلی.

### FUT-DB-05 — Selective CQRS
**چیست؟** جداسازی مدل read و write فقط در بخش لازم.  
**کاربرد:** read model سریع برای analytics/reporting.  
**نیاز آینده:** کاهش فشار queryهای سنگین بر مدل تراکنشی.

### FUT-SCALE-01 — Horizontal API Scaling
**چیست؟** اجرای چند instance stateless از API.  
**کاربرد:** افزایش ظرفیت با اضافه کردن instance.  
**نیاز آینده:** پاسخ‌گویی به رشد کاربران بدون وابستگی به یک process.

### FUT-SCALE-02 — Capacity Model
**چیست؟** مدل عددی ظرفیت بر اساس DAU، RPS، writes، DB و sync.  
**کاربرد:** تصمیم معماری بر اساس اندازه‌گیری.  
**نیاز آینده:** جلوگیری از scale کردن حدسی.

### FUT-SCALE-03 — Load/Stress/Chaos/Recovery Testing
**چیست؟** آزمایش بار، spike، فشار طولانی، خرابی و recovery.  
**کاربرد:** کشف bottleneck و failure mode قبل از production.  
**نیاز آینده:** اثبات SLA/RTO با شواهد واقعی.

### FUT-SCALE-04 — HA PostgreSQL / PITR / Failover
**چیست؟** دسترس‌پذیری بالا، backup و restore drill واقعی.  
**کاربرد:** بازیابی سرویس و داده پس از خرابی.  
**نیاز آینده:** کاهش ریسک data loss و downtime.

### FUT-SCALE-05 — Kubernetes
**چیست؟** orchestration برای workloadهای containerized متعدد.  
**کاربرد:** scheduling، rolling deployment، self-healing و scaling.  
**نیاز آینده:** فقط وقتی پیچیدگی عملیاتی توجیه داشته باشد.

### FUT-SCALE-06 — Service Mesh
**چیست؟** لایه کنترل ارتباط سرویس‌ها برای mTLS، routing، retry و telemetry.  
**کاربرد:** کنترل شبکه در معماری چندسرویسی.  
**نیاز آینده:** مدیریت topology بزرگ بعد از ایجاد سرویس‌های مستقل.

### FUT-AI-01 — اتصال موتورهای آموزشی orphan
**چیست؟** وصل کردن موتورهای آموزشی فاقد runtime path معتبر.  
**کاربرد:** خروجی موتور واقعاً وارد محصول شود.  
**نیاز آینده:** جلوگیری از قابلیت‌های ظاهری و افزایش پوشش واقعی Intelligence.

### FUT-AI-02 — Semantic/Certification Integrity
**چیست؟** کنترل معنا، provenance و شرایط صدور خروجی هوشمندی.  
**کاربرد:** جلوگیری از معتبر فرض کردن خروجی صرفاً با یک flag.  
**نیاز آینده:** اعتمادپذیری certification و analytics.

### FUT-AI-03 — Independent Read Models
**چیست؟** مدل read مشتق‌شده برای workloadهای سنگین.  
**کاربرد:** query تحلیلی بدون فشار بر transactional tables.  
**نیاز آینده:** scale کردن Intelligence و Reporting.

### FUT-AI-04 — Provenance / Version / Reproducibility
**چیست؟** ثبت منبع داده، نسخه مدل، audit و محدودیت خروجی.  
**کاربرد:** توضیح و بازتولید نتیجه.  
**نیاز آینده:** اعتمادپذیری تحلیل و امکان بررسی مستقل نتایج.

## 4. قابلیت‌های محصول آینده
### FUT-PROD-01 — سازمان/مالک مشترک چندمدرسه‌ای
اتصال چند مدرسه به یک سازمان و گزارش‌گیری مشترک. پیش‌نیاز: authorization و tenant isolation پایدار. نقطه طراحی موجود: organization_id.

### FUT-PROD-02 — پروفایل قابلیت‌های مدرسه
کلیدهایی مانند has_dorm، has_iep و has_workshop باید capability flag باقی بمانند و ماژول‌ها از قرارداد مشترک استفاده کنند، نه شرط‌های پراکنده.

### FUT-PROD-03 — گواهی رسمی قابل استعلام
صدور سمت سرور، شناسه قابل اعتبارسنجی و endpoint استعلام؛ ساختار certificates تا وقتی Architecture Review خلاف آن را ثابت نکرده حفظ شود.

### FUT-PROD-04 — اتصال سرویس‌های واقعی
اتصال درگاه واقعی پیامک و استعلام هویت/کد ملی با provider boundary، timeout، retry، idempotency و audit.

### FUT-PROD-05 — نقش پذیرش مستقل
در صورت نیاز واقعی مدارس، نقش مستقل پذیرش برای Visitor Management اضافه شود بدون شکستن مدل visitors.

### FUT-PROD-06 — گسترش گیمیفیکیشن
مدل امتیازدهی و رفتار توسعه‌پذیر باشد و source of truth دوم برای discipline ایجاد نشود.

### FUT-PROD-07 — Object Storage عملیاتی
برای فایل‌های واقعی: Object Storage، رکورد کسب‌وکاری در PostgreSQL، checksum، دسترسی موقت و audit.

## 5. ارتقای Frontend
### FUT-FE-01 — TypeScript
مهاجرت تدریجی؛ ابتدا shared types، data contracts و ماژول‌های جدید، سپس بخش‌های کم‌ریسک. بازنویسی یک‌باره در hardening ممنوع.

### FUT-FE-02 — React + Next.js
ساخت UI مدرن برای vertical sliceهای جدید یا بخش‌هایی که واقعاً به آن نیاز دارند. مسیر: coexistence محدود، vertical slice جدید، سپس مهاجرت تدریجی. قرارداد PWA/offline/sync باید حفظ شود.

### FUT-FE-03 — Design System
componentهای مشترک، RTL، typography، فرم، جدول، modal، notification و accessibility؛ جلوگیری از ساخت component مشابه در فایل‌های متعدد.

### FUT-FE-04 — Three.js فقط در صورت نیاز واقعی
Three.js فناوری پیش‌فرض نیست؛ فقط برای visualization سه‌بعدی یا تجربه آموزشی سه‌بعدی واقعی وارد شود.

## 6. ارتقای Backend
### FUT-BE-01 — Modular Monolith + Vertical Slices
مرز روشن دامنه‌ها و قابلیت‌ها با یک deployable application. مسیر مفهومی: route → application/service → policy/domain → data.

### FUT-BE-02 — Event-Driven Architecture
رویدادهای دامنه مانند AssessmentCreated، AttendanceUpdated، InterventionCreated و IntelligenceUpdated با قرارداد event و consumer مستقل.

### FUT-BE-03 — Transactional Outbox
تغییر PostgreSQL و ثبت event در یک transaction؛ سپس worker برای publish/retry.

### FUT-BE-04 — OpenTelemetry / End-to-End Tracing
ردگیری API → Auth → Policy → PostgreSQL/Redis → Queue → Worker → Intelligence.

### FUT-BE-05 — Policy-as-Code
role، tenant scope، object ownership، operation و field permission از یک قرارداد سیاستی قابل تست و audit تغذیه شوند.

### FUT-BE-06 — Go برای سرویس‌های منتخب
فقط وقتی bounded context نیاز اثبات‌شده به throughput، latency، isolation یا deployment مستقل داشته باشد. الگو: Modular Monolith → Candidate Service → Go Service، نه Node → Go rewrite.

### FUT-BE-07 — Microservices
فقط وقتی scale مستقل، failure isolation، deployment مستقل یا مرز سازمانی ارزش واقعی ایجاد کند.

## 7. Database / Data Platform
### FUT-DB-01 — PostgreSQL Source of Truth
اصل ثابت است؛ فناوری جدید نباید بی‌دلیل جایگزین آن شود.

### FUT-DB-02 — Redis
برای distributed cache، ephemeral state، rate limiting و coordination/locks در موارد لازم. Redis منبع حقیقت نیست.

### FUT-DB-03 — Elasticsearch
برای full-text search، جست‌وجوی سریع گزارش‌ها و workloadهای مناسب analytics/search؛ نه جایگزین PostgreSQL تراکنشی.

### FUT-DB-04 — Distributed Database
فقط بعد از capacity model، نیاز جغرافیایی/SLA و Architecture Review.

### FUT-DB-05 — Selective CQRS
فقط برای read workloadهای سنگین Analytics/Reporting/Intelligence که مدل read مستقل واقعاً لازم دارد.

## 8. Reliability / Scale
- FUT-SCALE-01: Horizontal API scaling و stateless deployment.
- FUT-SCALE-02: Capacity model بر پایه DAU، peak concurrent، RPS، writes/sec، DB TPS، Redis ops/sec و sync records/sec.
- FUT-SCALE-03: load، stress، spike، soak، chaos و recovery testing.
- FUT-SCALE-04: HA PostgreSQL، PITR، restore drill، failover drill و RPO/RTO واقعی.
- FUT-SCALE-05: Kubernetes فقط با نیاز عملیاتی اثبات‌شده.
- FUT-SCALE-06: Service Mesh فقط پس از topology چندسرویسی واقعی و نیاز به mTLS/traffic policy/observability.

## 9. Intelligence / Analytics
- FUT-AI-01: اتصال واقعی موتورهای آموزشی orphan به runtime.
- FUT-AI-02: semantic/certification integrity برای خروجی‌های هوشمندی.
- FUT-AI-03: read model مستقل فقط برای workloadهایی که مدل تراکنشی PostgreSQL را تحت فشار می‌گذارند.
- FUT-AI-04: هر مدل دارای provenance، version، audit، confidence/limitations و reproducibility.

## 10. کارت اجباری هر قابلیت آینده
```text
ID / TITLE / DOMAIN / USER-ROLE
BUSINESS PROBLEM / CURRENT STATE / TARGET STATE
IN-SCOPE / OUT-OF-SCOPE / DEPENDENCIES
DATA MODEL / API-CONTRACT / AUTHORIZATION
OFFLINE-SYNC / OBSERVABILITY / PERFORMANCE
MIGRATION / ROLLBACK / TESTS / ADVERSARIAL TESTS
ACCEPTANCE EVIDENCE / DOCUMENTATION / OWNER / STATUS / CURRENT HEAD
```

Statusهای مجاز: PLANNED، DESIGNING، BLOCKED، IMPLEMENTING، TESTED، RUNTIME_VERIFIED، INDEPENDENTLY_VERIFIED، CERTIFIED، DEFERRED، REJECTED.

## 11. ترتیب کلان ارتقا
```text
Atria / Root-Cause Hardening
→ Current Architecture Stabilization
→ Codebase Structure Enforcement
→ Modular Monolith + Vertical Slices
→ Event-Driven + Transactional Outbox
→ OpenTelemetry
→ Policy-as-Code
→ TypeScript + Design System
→ Selective CQRS / Search
→ Next.js/React vertical slices
→ Go candidate services
→ Selective Microservices
→ Kubernetes / Service Mesh (conditional)
```

این ترتیب وابستگی معماری است، نه برنامه زمانی قطعی؛ evidence و Architecture Review می‌توانند آن را تغییر دهند.

## 12. Architecture Gate
Problem → Evidence → Architecture Decision → Bounded Design → Implementation → Contract Tests → Regression → Adversarial Tests → Runtime Evidence → Independent Review

مدرن بودن فناوری به‌تنهایی evidence نیست.

## 13. اسناد هم‌خانواده
- docs/ROADMAP.md
- docs/ROADMAP_MASTER_EXECUTION_SCHEDULE.md
- docs/ARCHITECTURE_EVOLUTION_ROADMAP.md
- docs/ARCHITECTURE_DECISIONS.md
- docs/CODEBASE_STRUCTURE_STANDARD.md
- docs/OPEN_WORK.md و docs/OPEN_ITEMS.md
- docs/CURRENT_WORK_EXECUTION_PLAN.md