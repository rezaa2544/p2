# ساختار فنی و معماری کامل سیستم «پایش»

> سند مرجع برای شناخت اجزای فنی، کاربرد هر جزء، ارتباط آن با لایه‌های معماری و جریان وابستگی بین اجزای سیستم.

## 1. هدف سند

سیستم «پایش» فقط از Frontend، Backend و Database تشکیل نمی‌شود. یک سامانه قابل اتکا مجموعه‌ای از اجزای اجرایی، امنیتی، داده‌ای، زیرساختی، عملیاتی، آزمایشی و حاکمیتی است.

در این سند دو دیدگاه از هم تفکیک شده‌اند:

- **لایه معماری:** مسئولیت منطقی سیستم را مشخص می‌کند.
- **جزء فنی:** فناوری، سرویس، ماژول یا قابلیت واقعی است که آن مسئولیت را اجرا می‌کند.

### لایه‌های اصلی معماری

1. Presentation / Client
2. API / Application
3. Domain / Business Logic
4. Security & Authority
5. Data / Persistence
6. Integration & Infrastructure
7. Observability / Operations

**Control Plane / Governance** یک محور حاکمیتی و cross-cutting است و الزاماً یک لایه اجرایی مستقل نیست.

---

# 2. نقشه ارتباط کلی

```text
                    ┌──────────────────────────────┐
                    │ Control Plane / Governance   │
                    │ State • Missions • Gates     │
                    │ Evidence • Supervisor       │
                    └──────────────┬───────────────┘
                                   │ governs
                                   ▼
┌────────────────┐      ┌────────────────────┐
│ Frontend       │ ───► │ API / Application  │
│ Presentation   │ ◄─── │ Services           │
└────────────────┘      └─────────┬──────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ Domain / Logic  │
                         └───────┬─────────┘
                                 │
                  ┌──────────────┼──────────────┐
                  ▼              ▼              ▼
          ┌─────────────┐ ┌─────────────┐ ┌──────────────┐
          │ Security &  │ │ Data / DB   │ │ Cache /      │
          │ Authority   │ │ PostgreSQL  │ │ Messaging    │
          └─────────────┘ └─────────────┘ └──────────────┘
                  │              │              │
                  └──────────────┼──────────────┘
                                 ▼
                    ┌────────────────────────┐
                    │ Infrastructure         │
                    │ Docker • Proxy • TLS   │
                    │ Network • Deployment   │
                    └───────────┬────────────┘
                                ▼
                    ┌────────────────────────┐
                    │ Observability / Ops    │
                    │ Logs • Metrics • Audit  │
                    │ Health • Alerts • DR    │
                    └────────────────────────┘

Testing / Verification و DevOps تمام مسیر را به‌صورت
cross-cutting کنترل و اعتبارسنجی می‌کنند.
```

---

# 3. Frontend / Client

## کاربرد

Frontend همان بخشی است که کاربر مستقیماً می‌بیند و با آن تعامل می‌کند. وظیفه آن نمایش داده، دریافت ورودی، اجرای تعاملات UI و ارسال درخواست به Backend است.

## اجزا

### 3.1 UI
رابط بصری شامل صفحات، فرم‌ها، جداول، پنل‌ها، اعلان‌ها و کنترل‌های کاربر.

**کاربرد:** تبدیل قابلیت‌های سیستم به تجربه قابل استفاده برای کاربر.

**ارتباط:** Presentation، API/Application، Security برای نمایش دسترسی‌ها، Observability برای خطاها.

### 3.2 Pages & Components
صفحات، کامپوننت‌های reusable، modalها، tableها و widgetها.

**کاربرد:** شکستن رابط کاربری به قطعات قابل نگهداری.

**ارتباط:** Presentation و Domain از طریق قراردادهای API؛ Testing برای تست رفتار.

### 3.3 State Management
نگهداری state محلی یا سراسری مانند کاربر جاری، tenant، تنظیمات، داده‌های cache شده و وضعیت UI.

**کاربرد:** جلوگیری از ناسازگاری داده بین اجزای UI.

**ارتباط:** Presentation، API، Security/Authority و Cache.

### 3.4 Routing
مدیریت مسیرهای صفحات و navigation.

**کاربرد:** تعیین اینکه کاربر به چه viewهایی دسترسی دارد.

**ارتباط:** Presentation و Security/Authorization.

### 3.5 API Client
کدی که درخواست‌های HTTP/API را از Frontend به Backend ارسال می‌کند.

**کاربرد:** ایجاد قرارداد مشخص برای ارتباط Client و Server.

**ارتباط:** Presentation ↔ API/Application.

---

# 4. Backend

Backend ستون اجرایی سامانه است و برخلاف تصور رایج یک لایه واحد نیست؛ چند مسئولیت معماری را پوشش می‌دهد.

## 4.1 API

Endpointها، HTTP handlers، request/response schema و status codeها.

**کاربرد:** ارائه قابلیت‌های Backend به Frontend یا کلاینت‌های دیگر.

**ارتباط:** API/Application، Security، Domain، Observability.

## 4.2 Application Services

Use caseها و orchestration عملیات.

**کاربرد:** مشخص می‌کند برای انجام یک عملیات تجاری چه سرویس‌هایی و با چه ترتیبی اجرا شوند.

**ارتباط:** API → Application → Domain/Data/Integration.

## 4.3 Business Logic

قواعد عملیاتی سیستم.

**کاربرد:** تضمین اینکه سیستم فقط درخواست معتبر و مجاز را اجرا کند.

**ارتباط:** Domain، Security، Database و Testing.

## 4.4 Domain Logic

قوانین اصلی و مستقل از UI و زیرساخت.

**کاربرد:** نگهداری حقیقت کسب‌وکار در یک محل قابل تست و قابل استفاده مجدد.

**ارتباط:** Application، Data و Security؛ ولی نباید به جزئیات Presentation وابسته شود.

## 4.5 Validation

اعتبارسنجی ورودی، schema، invariant و قواعد داده.

**کاربرد:** جلوگیری از ورود داده خراب یا ناسازگار.

**ارتباط:** API، Domain، Database و Security.

## 4.6 Authentication / Authorization

Authentication مشخص می‌کند «کاربر چه کسی است» و Authorization مشخص می‌کند «چه کاری اجازه دارد».

**ارتباط:** Security & Authority، API، Frontend، Domain و Database.

## 4.7 Tenant Isolation

جدا نگه داشتن داده و عملیات tenantهای مختلف.

**کاربرد:** جلوگیری از نشت داده بین سازمان‌ها/مشتریان.

**ارتباط:** Security، Application، Domain و Database.

---

# 5. Database / Data Layer

## 5.1 PostgreSQL

پایگاه داده اصلی تراکنشی.

**کاربرد:** نگهداری durable و transactional داده‌های سیستم.

**ارتباط:** Domain/Application، Migration، Backup، Observability و Security.

## 5.2 Schema / Tables

ساختار منطقی داده.

**کاربرد:** تعریف entityها، رابطه‌ها و محدودیت‌های داده.

**ارتباط:** Domain و Application.

## 5.3 Migrations

نسخه‌بندی تغییرات schema.

**کاربرد:** امکان ساخت و ارتقای قابل تکرار database در محیط‌های مختلف.

**ارتباط:** DevOps، Testing، Database و Deployment.

## 5.4 Indexes

ساختارهای بهینه‌سازی query.

**کاربرد:** کاهش زمان جست‌وجو و بار database.

**ارتباط:** Database و Performance.

## 5.5 Transactions

اجرای چند عملیات داده‌ای به‌صورت atomic.

**کاربرد:** جلوگیری از وضعیت نیمه‌کاره.

**ارتباط:** Domain/Application و Database.

## 5.6 Constraints

Primary key، foreign key، unique، check و سایر محدودیت‌ها.

**کاربرد:** enforce کردن بخشی از حقیقت داده در خود Database.

**ارتباط:** Data، Domain و Security.

## 5.7 Database Authority

Database در موارد حساس باید آخرین مرجع صحت داده باشد، نه صرفاً یک storage ساده.

**کاربرد:** جلوگیری از bypass شدن قواعد حساس توسط مسیرهای دیگر.

**ارتباط:** Domain، Security، Migration و Verification.

---

# 6. Cache & Messaging

## 6.1 Redis

ذخیره‌سازی سریع و in-memory.

**کاربرد:** cache، session، state موقت، rate limiting یا داده‌هایی که latency پایین نیاز دارند.

**ارتباط:** Backend، Security، Infrastructure و Observability.

## 6.2 Cache

نگهداری موقت نتیجه عملیات پرهزینه.

**کاربرد:** کاهش latency و فشار Database.

**نکته:** cache نباید بدون طراحی صحیح به منبع حقیقت تبدیل شود.

**ارتباط:** Application، Database و Performance.

## 6.3 Sessions / Revocation

مدیریت وضعیت session و invalidation/revocation توکن‌ها.

**کاربرد:** قطع دسترسی token/session قبل از expiration طبیعی.

**ارتباط:** Security، Redis، Backend و Audit.

## 6.4 Queues / Messaging

اجرای asynchronous jobها و ارتباط بین سرویس‌ها.

**کاربرد:** جدا کردن عملیات سنگین از request اصلی و ایجاد resilience.

**ارتباط:** Application، Infrastructure و Observability.

## 6.5 Outbox

ثبت قابل اتکای event در کنار transaction داده‌ای.

**کاربرد:** جلوگیری از حالتی که database commit شود ولی event ارسال نشود.

**ارتباط:** Database، Messaging و Reliability.

---

# 7. Infrastructure

## 7.1 Docker / Containers

بسته‌بندی application و dependencyها.

**کاربرد:** reproducible بودن محیط اجرا.

**ارتباط:** Backend، Database، CI/CD و Deployment.

## 7.2 Reverse Proxy

ورودی HTTP/TLS و routing به سرویس‌های داخلی.

**کاربرد:** termination TLS، routing، header policy و کنترل ترافیک.

**ارتباط:** Client، Security و Backend.

## 7.3 WAF

Web Application Firewall.

**کاربرد:** فیلتر کردن الگوهای ترافیکی مخرب و ایجاد لایه دفاعی پیش از application.

**ارتباط:** Security، Reverse Proxy و Observability.

## 7.4 Load Balancing

توزیع درخواست میان instanceها.

**کاربرد:** scaling و availability.

**ارتباط:** Infrastructure، Backend و Reliability.

## 7.5 PgBouncer

Connection pooling برای PostgreSQL.

**کاربرد:** کنترل تعداد connectionها و کاهش overhead.

**ارتباط:** Database، Backend و Infrastructure.

## 7.6 Network / TLS

شبکه داخلی، segmentation، HTTPS و encryption in transit.

**کاربرد:** حفاظت مسیر ارتباطی و محدود کردن دسترسی شبکه‌ای.

**ارتباط:** Security و Infrastructure.

## 7.7 Environment Configuration

تنظیمات runtime مانند database URL، feature flags و endpointها.

**کاربرد:** جداسازی configuration از code.

**ارتباط:** Infrastructure، Security و Deployment.

---

# 8. Security

Security یک concern مستقل و در عین حال cross-cutting است.

## 8.1 Identity / Authentication

تشخیص هویت.

**ارتباط:** Frontend، API، Session و Audit.

## 8.2 Authorization / RBAC

تعریف نقش و permission.

**کاربرد:** کنترل عملیات مجاز.

**ارتباط:** Backend، Frontend، Domain و Database.

## 8.3 Secrets

کلیدها، passwordها، tokenها و credentialها.

**کاربرد:** دسترسی امن به سرویس‌ها.

**اصل:** secret نباید داخل source code یا گزارش عمومی ذخیره شود.

**ارتباط:** Infrastructure، DevOps و Runtime.

## 8.4 Token Management

صدور، اعتبارسنجی، expiration و rotation توکن.

**ارتباط:** Authentication، Redis/Revocation و API.

## 8.5 Revocation

لغو فوری دسترسی credentialهای نامعتبر.

**ارتباط:** Redis، Security و Audit.

## 8.6 Security Policies

قواعد امنیتی مانند CORS، CSP، headers، rate limits و session policy.

**ارتباط:** Frontend، API، Reverse Proxy و WAF.

## 8.7 Tenant Isolation

امنیت مرزی tenantها.

**ارتباط:** Authorization، Domain و Database.

---

# 9. Observability

## 9.1 Logging

ثبت رویدادهای مهم runtime.

**کاربرد:** diagnosis و forensic analysis.

**ارتباط:** تمام اجزای Backend، Infrastructure و Security.

## 9.2 Metrics

اندازه‌گیری عددی مانند latency، error rate، throughput و resource usage.

**کاربرد:** تشخیص degradation و ظرفیت.

**ارتباط:** Application، Database، Infrastructure و Performance.

## 9.3 Tracing

ردگیری یک request در چند component.

**کاربرد:** پیدا کردن bottleneck و failure در distributed flow.

**ارتباط:** API، Application، Database و Messaging.

## 9.4 Health Checks

بررسی سلامت سرویس و dependencyها.

**کاربرد:** load balancer، deployment و monitoring.

**ارتباط:** Infrastructure، Backend و Operations.

## 9.5 Alerts

تبدیل نشانه‌های مشکل به هشدار قابل اقدام.

**ارتباط:** Metrics، Logs، Reliability و Operations.

## 9.6 Audit Logs

ثبت عملیات حساس و امنیتی.

**کاربرد:** پاسخ به اینکه چه کسی، چه زمانی، چه کاری انجام داده است.

**ارتباط:** Security، Domain، Database و Governance.

---

# 10. Testing & Verification

این بخش فقط «تست کد» نیست؛ باید حقیقت سیستم را اثبات کند.

## 10.1 Unit Tests

تست کوچک‌ترین واحدهای منطقی.

**ارتباط:** Domain، Application و Validation.

## 10.2 Integration Tests

تست تعامل چند جزء، مانند Backend با Database.

**ارتباط:** Application، Database، Redis و Infrastructure.

## 10.3 E2E Tests

تست مسیر کامل از Client تا Backend و Data.

**ارتباط:** تمام stack اجرایی.

## 10.4 Security Tests

تست authentication، authorization، isolation، injection و policyها.

**ارتباط:** Security، API، Database و Infrastructure.

## 10.5 Migration Verification

بررسی اینکه migrationها روی database واقعی و از نسخه‌های مختلف درست اجرا می‌شوند.

**ارتباط:** Database، DevOps و Deployment.

## 10.6 Production-Truth Gates

Gateهایی که فقط با mock یا assertion ظاهری قبول نمی‌شوند و نیازمند شواهد واقعی هستند.

**ارتباط:** Testing، Database، Infrastructure و Governance.

## 10.7 CI Verification

اجرای خودکار مجموعه gateها در CI.

**ارتباط:** DevOps، GitHub Actions، Testing و Release.

---

# 11. DevOps / Delivery

## 11.1 Git

کنترل نسخه و تاریخچه تغییرات.

**ارتباط:** تمام اجزای کد و Governance.

## 11.2 GitHub

Remote source of truth، collaboration، review و CI.

**ارتباط:** Git، CI/CD و Governance.

## 11.3 GitHub Actions / CI

اجرای خودکار build، test، security و verification.

**ارتباط:** Testing، Build و Deployment.

## 11.4 Build

تبدیل source به artifact قابل اجرا یا deploy.

**ارتباط:** Frontend، Backend، CI و Release.

## 11.5 Release

تعیین نسخه قابل انتشار و artifactهای مربوط.

**ارتباط:** Git، CI و Deployment.

## 11.6 Deployment

انتقال نسخه تأییدشده به محیط اجرا.

**ارتباط:** Infrastructure، Operations و Verification.

## 11.7 Versioning

قابل شناسایی کردن نسخه code، schema و artifact.

**ارتباط:** Git، Database، Release و Observability.

---

# 12. Operations / Reliability

## 12.1 Backup

نسخه پشتیبان از داده و configurationهای ضروری.

**کاربرد:** بازیابی پس از خرابی یا حذف.

**ارتباط:** Database، Infrastructure و DR.

## 12.2 Disaster Recovery

طرح و آزمایش بازیابی سرویس پس از حادثه.

**ارتباط:** Backup، Infrastructure، Database و Operations.

## 12.3 Failover

انتقال سرویس از component خراب به component سالم.

**ارتباط:** Load Balancer، Database و Infrastructure.

## 12.4 Chaos Testing

ایجاد failure کنترل‌شده برای بررسی resilience.

**ارتباط:** Reliability، Infrastructure و E2E.

## 12.5 Performance Testing

اندازه‌گیری latency، throughput، concurrency و resource usage.

**ارتباط:** Backend، Database، Redis و Infrastructure.

## 12.6 Scaling

افزایش ظرفیت با vertical یا horizontal scaling.

**ارتباط:** Application، Database، Cache و Infrastructure.

---

# 13. Control Plane / Governance

این بخش مغز مدیریتی پروژه است و با runtime application یکی نیست.

## 13.1 Project State

ثبت وضعیت واقعی پروژه، فاز، gateها و blockers.

**ارتباط:** همه اجزا، به‌خصوص DevOps و Verification.

## 13.2 Configuration Authority

تعیین اینکه کدام configuration منبع حقیقت است.

**ارتباط:** Security، Infrastructure و Governance.

## 13.3 Mission Management

تعریف، تخصیص و پیگیری missionهای اجرایی.

**ارتباط:** Atria، Engineer Supervisor و Repository.

## 13.4 Gates

شرایط عبور از مراحل.

**ارتباط:** Testing، CI، Release و Governance.

## 13.5 Engineer Supervisor

لایه کنترل و نظارت بر اجرای فنی پروژه.

**کاربرد:** جلوگیری از اجرای کورکورانه، ثبت شواهد و کنترل وضعیت.

## 13.6 Atria

Agent اجرایی برای انجام کارهای محلی مانند بررسی repository، تغییر فایل، اجرای command، تست و گزارش‌دهی؛ دامنه دقیق کنترل آن باید مطابق قابلیت‌های محیط Zed تعیین شود.

**ارتباط:** Governance، DevOps، Testing و کل workspace.

## 13.7 Evidence / Reports

ثبت شواهد قابل بررسی به جای ادعا.

**ارتباط:** Testing، CI، Git و Governance.

## 13.8 Project Memory

حفظ context، تصمیم‌ها، missionها و وضعیت.

**ارتباط:** Governance و تمام فرآیند توسعه.

---

# 14. رابطه Frontend، Backend و Database با لایه‌های معماری

### Frontend
عمدتاً در **Presentation / Client** قرار دارد، ولی با API، Security، Observability و Testing در ارتباط است.

### Backend
یک «لایه» واحد نیست؛ عمدتاً این بخش‌ها را پوشش می‌دهد:

- API → API / Application
- Application Services → Application
- Business / Domain Logic → Domain
- Authentication / Authorization → Security
- Data Access → Data
- Integrations → Infrastructure / Integration

### Database
عمدتاً در **Data / Persistence** قرار می‌گیرد و با Domain، Security، Infrastructure، Testing و Operations ارتباط دارد.

---

# 15. جریان یک درخواست واقعی

برای مثال کاربر وارد سیستم می‌شود و یک عملیات حساس انجام می‌دهد:

1. Frontend درخواست را ایجاد می‌کند.
2. API درخواست را دریافت می‌کند.
3. Authentication هویت را بررسی می‌کند.
4. Authorization/RBAC اجازه عملیات را بررسی می‌کند.
5. Application Service use case را اجرا می‌کند.
6. Domain Logic قواعد کسب‌وکار را اعمال می‌کند.
7. Database transaction داده را تغییر می‌دهد.
8. در صورت نیاز Outbox/Queue event را ثبت می‌کند.
9. Redis یا Cache برای state/caching استفاده می‌شود.
10. Audit Log عملیات حساس را ثبت می‌کند.
11. Metrics/Logs/Tracing اجرای request را ثبت می‌کنند.
12. API پاسخ را به Frontend برمی‌گرداند.
13. Testing و CI در چرخه توسعه ثابت می‌کنند که این مسیر همچنان معتبر است.
14. Governance وضعیت، evidence و gate عبور را ثبت می‌کند.

---

# 16. ارتباط اجزا به‌صورت ماتریس

| جزء | Presentation | Application | Domain | Security | Data | Infrastructure | Observability | Testing | DevOps | Governance |
|---|---|---|---|---|---|---|---|---|---|---|
| Frontend | اصلی | ● | ○ | ● | ○ | ○ | ● | ● | ● | ○ |
| Backend API | ○ | اصلی | ● | ● | ● | ● | ● | ● | ● | ○ |
| PostgreSQL | - | ● | ● | ● | اصلی | ● | ● | ● | ● | ○ |
| Redis | - | ● | ○ | ● | ○ | ● | ● | ● | ● | ○ |
| Reverse Proxy | ● | ○ | - | ● | - | اصلی | ● | ● | ● | ○ |
| WAF | ● | ○ | - | اصلی | - | ● | ● | ● | ● | ○ |
| Logging | - | ● | ● | ● | ● | ● | اصلی | ● | ● | ● |
| CI | - | ● | ● | ● | ● | ● | ● | اصلی | اصلی | ● |
| Git/GitHub | - | - | - | ● | - | ● | - | ● | اصلی | اصلی |
| Atria/Supervisor | - | - | - | ● | - | ● | ● | ● | ● | اصلی |

**راهنما:**  
`اصلی` = محل مسئولیت اصلی  
`●` = ارتباط مستقیم مهم  
`○` = ارتباط غیرمستقیم/شرطی  
`-` = ارتباط معمولاً مستقیم ندارد

---

# 17. اصل مهم طراحی

هیچ جزء مهمی نباید بدون تعریف مرز مسئولیت، منبع حقیقت، مسیر ارتباط و روش verification وارد سیستم شود.

برای هر component باید بتوان به چهار سؤال پاسخ داد:

1. **چه کاری انجام می‌دهد؟**
2. **چه داده یا authorityای را کنترل می‌کند؟**
3. **با چه اجزایی ارتباط دارد؟**
4. **چطور ثابت می‌کنیم که درست کار می‌کند؟**

این چهار سؤال مبنای بررسی معماری، توسعه، تست و certification پروژه هستند.

---

# 18. جمع‌بندی نهایی

سیستم «پایش» را می‌توان به این شکل ذهنی دید:

**Client → API → Application → Domain → Security/Data → Infrastructure → Observability**

و دو محور کل سیستم را کنترل می‌کنند:

- **Testing / Verification:** آیا واقعاً درست کار می‌کند؟
- **Control Plane / Governance:** آیا طبق نقشه، وضعیت، شواهد و gateهای پروژه جلو می‌رود؟

بنابراین Frontend، Backend و Database فقط هسته اجرایی قابل مشاهده‌اند؛ برای تبدیل آن‌ها به یک سیستم production-grade باید Security، Cache/Messaging، Infrastructure، Observability، Testing، DevOps، Reliability و Governance نیز به‌صورت منسجم طراحی و کنترل شوند.

---
