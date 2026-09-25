# پایش — استاندارد ساختار کد و توسعه قابل نگهداری

وضعیت: CANONICAL / ACTIVE
تاریخ: 2026-09-25
اصل: توسعه‌دهنده باید بتواند برای هر قابلیت، محل UI، route، policy، service، data access، test و documentation را بدون جست‌وجوی تصادفی پیدا کند.

## 1. وضعیت فعلی
ساختار فعلی پایش تفکیک لایه‌ها را دارد، اما frontend شماره‌گذاری‌شده و backend ماژولار هنوز در همه بخش‌ها الگوی واحد vertical-slice ندارند.
در زمان HARDENING جابه‌جایی گسترده فایل‌ها ممنوع است؛ ابتدا قرارداد ساختار تثبیت می‌شود و migration ساختاری بعد از گیت hardening انجام می‌گیرد.

## 2. قرارداد معماری
```text
Frontend: UI/View → Feature/Application → Data Contract → Sync/REST Contract
Backend: Route → Application/Service → Policy/Authorization → Repository/Data → PostgreSQL/Redis/Outbox
```
هیچ لایه‌ای نباید مسیر تعریف‌شده را دور بزند.

## 3. Frontend
ساختار موجود src/js شماره‌گذاری‌شده است و build.js آن را به artifact نهایی می‌سازد. تا زمان migration:
- هر فایل یک مسئولیت روشن داشته باشد.
- شماره فایل فقط load order باشد، نه مالکیت business logic.
- business logic جدید در فایل تصادفی موجود قرار نگیرد.
- قابلیت جدید یک module owner مشخص داشته باشد.
- قرارداد load order در src/js/_order.json ثبت شود.
- route/menu/title در محل canonical خود ثبت شود.
- دسترسی داده از 00-data-layer.js و قراردادهای تعریف‌شده عبور کند.
- fetch، localStorage، IndexedDB و network access مستقیم در feature جدید فقط با قرارداد معماری مجاز باشد.
- state مشترک global بدون قرارداد ممنوع باشد.
- تعریف دوباره function نام‌دار در scope سراسری ممنوع باشد.

Feature جدید از نظر مفهومی این اجزا را دارد:
```text
Feature
├── UI / render
├── actions / event handlers
├── domain rules
├── data contract
├── authorization hooks
├── tests
└── documentation
```

## 4. Backend
کد جدید باید از نظر مفهومی vertical slice داشته باشد:
```text
server/
  routes/
  domain/
  application/
  policy/
  data/
  infrastructure/
  workers/
  analytics/
```
اگر ایجاد این directoryها نیازمند refactor legacy است، ابتدا Architecture Review و migration plan ثبت شود؛ فایل‌ها صرفاً برای زیبایی جابه‌جا نشوند.

قوانین backend:
1. route فقط HTTP parsing/response و orchestration سطح بالا.
2. business rule در route نوشته نشود.
3. authorization تکثیر نشود؛ policy canonical استفاده شود.
4. query مستقیم خارج از data/repository boundary فقط با تصمیم مستند.
5. schema فقط از مسیر migration تغییر کند.
6. event و outbox contract مستقل و قابل تست باشند.
7. worker نباید business rule موازی و متفاوت از application service بسازد.
8. خطا با catch بی‌صدا بلعیده نشود.
9. هر endpoint جدید positive + negative + cross-tenant + alternate-path test داشته باشد.

## 5. Database
```text
migrations/ → immutable versioned migrations
PostgreSQL → source of truth
Redis → cache / ephemeral distributed state
Search index → derived read/search model
```
Elasticsearch یا search store جدید باید derived باشد مگر Architecture Review تصمیم دیگری ثبت کند.

## 6. Naming
- نام قابلیت/دامنه در UI، API، policy، test و documentation یکسان باشد.
- نام فایل بر اساس مسئولیت باشد، نه شخص توسعه‌دهنده.
- functionهای عمومی namespace/export مشخص داشته باشند.
- نام عمومی تکراری در scope مشترک ممنوع.
- migrationها immutable و شماره‌دار باشند.
- نام test دامنه و رفتار را مشخص کند.

## 7. قرارداد تست
```text
Unit → Integration → Contract → Positive → Negative
→ Authorization/Tenant Isolation → Concurrency/Replay
→ Regression → Runtime evidence when applicable
```
سبز شدن یک test به‌تنهایی VERIFIED نیست.

## 8. قرارداد Documentation
هر قابلیت جدید حداقل این موارد را به‌روز می‌کند:
1. roadmap / capability registry
2. developer-facing module documentation
3. user guide اگر رفتار قابل مشاهده کاربر تغییر کرده است.
تغییر معماری باید در ARCHITECTURE_DECISIONS.md یا سند معماری تخصصی ثبت شود.

## 9. Feature checklist
```text
[ ] Domain owner
[ ] UI location
[ ] API/Sync contract
[ ] Authorization
[ ] Data model
[ ] Migration review
[ ] Tests
[ ] Negative/adversarial tests
[ ] Observability
[ ] Performance impact
[ ] User guide
[ ] Roadmap status
[ ] Current HEAD
```

## 10. ممنوع‌ها
- بزرگ‌تر کردن فایل فقط چون جای دیگری تعریف نشده است.
- business logic تکراری.
- authorization موازی.
- source of truth دوم.
- query/HTTP مستقیم در UI feature.
- schema change بدون migration.
- تغییر test برای سبز شدن بدون اصلاح invariant.
- refactor گسترده هم‌زمان با defect remediation بدون Architecture Review.

## 11. Migration strategy
پس از عبور از hardening:
1. inventory واقعی فایل‌ها و وابستگی‌ها.
2. module ownership map.
3. استخراج shared contracts.
4. انتقال یک vertical slice کم‌ریسک.
5. contract/regression tests.
6. مقایسه رفتار قبل/بعد.
7. ادامه migration slice-by-slice.
8. حذف legacy فقط بعد از نبود reference و evidence.

هدف «مرتب کردن ظاهری» نیست؛ هدف کاهش coupling و افزایش قابلیت توسعه بدون تغییر ناخواسته رفتار است.