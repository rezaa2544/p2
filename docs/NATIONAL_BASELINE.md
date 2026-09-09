# National Baseline — Wave 0 / Part 1

**موضوع:** Wave 0 — Baseline و Freeze، بخش ۱: Tag + تست‌های فعلی + سند کلی  
**تاریخ اجرا:** ۱۸/۰۶/۱۴۰۵ — 2026-09-09  
**شاخه کاری Arena:** `arena/01a085da-p2`  
**محدوده:** مستندات و ثبت مبنا؛ بدون تغییر کد runtime، schema یا تست‌ها.

---

## 1. مبنای نسخه و Tag

| مورد | مقدار |
|---|---|
| Baseline tag | `national-baseline-start` |
| Commit مبنا | `0be0bb5c6e7640cdf6a5ab0503a6c8948206492c` |
| Commit message مبنا | `docs: replace roadmap with national scale master roadmap and add progress tracker` |
| زمان commit مبنا | `2026-09-09T11:16:52+00:00` |
| نسخه package | `@rezaa2544/payesh@1.0.0` |
| Node.js | `v22.22.3` |
| lockfileVersion | `3` |

### تأییدیه tag روی GitHub

```text
b452c252a52557c55e1f09ccf5f43e3fdeeaf560	refs/tags/national-baseline-start
0be0bb5c6e7640cdf6a5ab0503a6c8948206492c	refs/tags/national-baseline-start^{}
```

---

## 2. نتایج تست‌های فعلی

| دستور | نتیجه | یادداشت |
|---|---:|---|
| `node tests/run.js` | ✅ `35/35` | ساختار پروژه، build، offline بودن، route/viewها، syntax و نگهبان‌ها سبز |
| `node --expose-gc --max-old-space-size=2048 tests/smoke.js` | ✅ `547/547` | تست دودی کامل jsdom؛ بدون خطای تست |
| `node tools/check-authz.js` | ✅ تطبیق کامل | `376` اکشن، `183` اکشن نویسنده؛ عدم تطابق با WRITE_PERMS: صفر |
| `node tests/secret-scan.js` | ✅ `11/11` | اسکن `675` فایل غیر skip؛ secret شناخته‌شده یافت نشد |

### هشدار غیرمسدودکننده smoke

```text
Not implemented: Window's scrollTo() method
```

این هشدار از محدودیت jsdom است و باعث شکست تست نشده است.

---

## 3. وضعیت مخزن در زمان Baseline

| مورد | مقدار |
|---|---:|
| فایل‌های track شده در git | `696` |
| فایل‌های docs track شده | `145` |
| فایل‌های tests track شده | `255` |
| وابستگی‌های runtime در `package.json` | `9` |
| وابستگی‌های dev در `package.json` | `1` |

---

## 4. Endpointهای اصلی شناخته‌شده

این فهرست از `server/index.js` و `server/routes/*` برداشت شده است. اندازه‌گیری دقیق latency/size طبق تقسیم کار Wave 0 در Part 2 انجام می‌شود.

| گروه | Endpoint | وضعیت اندازه‌گیری latency در Part 1 |
|---|---|---|
| Health | `GET /api/health` | اندازه‌گیری نشده — واگذار به Part 2 |
| Auth | `POST /api/auth/send-code` | اندازه‌گیری نشده — واگذار به Part 2 |
| Auth | `POST /api/auth/login` | اندازه‌گیری نشده — واگذار به Part 2 |
| Auth | `GET /api/auth/me` | اندازه‌گیری نشده — واگذار به Part 2 |
| Auth | `POST /api/auth/logout` | اندازه‌گیری نشده — واگذار به Part 2 |
| Auth/GDPR | `POST /api/auth/delete-account` | اندازه‌گیری نشده — واگذار به Part 2 |
| Sync | `POST /api/sync` | اندازه‌گیری نشده — واگذار به Part 2/3 |
| Sync conflicts | `GET /api/sync/conflicts` | اندازه‌گیری نشده — واگذار به Part 2 |
| Sync conflicts | `POST /api/sync/resolve-conflict` | اندازه‌گیری نشده — واگذار به Part 2 |
| Bell | `GET /api/bell/now` | اندازه‌گیری نشده — واگذار به Part 2 |
| Public report | `GET /api/public-report` | اندازه‌گیری نشده — واگذار به Part 2 |
| Admin | `POST /api/admin/backup` | اندازه‌گیری نشده — واگذار به Part 2/4 |
| Admin | `POST /api/admin/restore` | اندازه‌گیری نشده — واگذار به Part 2/4 |
| SMS | `POST /api/sms/send` | اندازه‌گیری نشده — واگذار به Part 2 |
| REST v1 | `GET /api/v1/bootstrap` | اندازه‌گیری نشده — واگذار به Part 2 |
| REST v1 | `GET /api/v1/pull` | اندازه‌گیری نشده — واگذار به Part 2/3 |
| REST v1 | `GET /api/v1/students` | اندازه‌گیری نشده — واگذار به Part 2/3 |
| REST v1 | `POST /api/v1/students` | اندازه‌گیری نشده — واگذار به Part 2/3 |
| REST v1 | `GET /api/v1/classes` | اندازه‌گیری نشده — واگذار به Part 2/3 |
| REST v1 | `POST /api/v1/classes` | اندازه‌گیری نشده — واگذار به Part 2/3 |
| REST v1 | `GET /api/v1/attendance` | اندازه‌گیری نشده — واگذار به Part 2/3 |
| REST v1 | `POST /api/v1/attendance` | اندازه‌گیری نشده — واگذار به Part 2/3 |
| REST v1 | `GET /api/v1/grades` | اندازه‌گیری نشده — واگذار به Part 2/3 |
| REST v1 | `POST /api/v1/grades` | اندازه‌گیری نشده — واگذار به Part 2/3 |
| REST v1 | `GET /api/v1/users` | اندازه‌گیری نشده — واگذار به Part 2/3 |
| REST v1 | `POST /api/v1/users` | اندازه‌گیری نشده — واگذار به Part 2/3 |

---

## 5. محدودیت‌های شناخته‌شده در Baseline

| حوزه | محدودیت/مشاهده | اثر روی Waveهای بعدی |
|---|---|---|
| Source of Truth | Production هدف باید PostgreSQL-only باشد؛ در baseline هنوز JSON/memory fallback در کد وجود دارد. | Wave 1 blocker اصلی است. |
| اندازه‌گیری latency | در Part 1 latency endpointها اندازه‌گیری نشد؛ طبق تقسیم کار به Part 2 سپرده شده است. | پیش از تیک نهایی Wave 0 باید Part 2 تجمیع شود. |
| DB/cache metrics | `EXPLAIN ANALYZE`، cache hit/miss و sync throughput در Part 1 اندازه‌گیری نشدند. | پیش از تیک نهایی Wave 0 باید Part 3 تجمیع شود. |
| Inventory زیرساخت | dependency/deployment/documentation inventory تفصیلی در Part 1 کامل نشده است. | پیش از تیک نهایی Wave 0 باید Part 4 تجمیع شود. |
| PR/branch policy در Arena | این سشن به `arena/01a085da-p2` قفل است؛ شاخه‌های پیشنهادی `feat/baseline-chat*` در این محیط قابل استفاده نیستند. | کار این Part روی شاخه ثابت Arena انجام و به PR موجود افزوده می‌شود. |

---

## 6. اثر معماری، دیتابیس، امنیت و کارایی

| محور | اثر |
|---|---|
| معماری | فقط ثبت baseline و شروع Wave 0؛ بدون تغییر runtime architecture |
| دیتابیس | بدون تغییر schema/migration/query |
| امنیت | بدون تغییر کد امنیتی؛ `secret-scan` و `check-authz` سبز ثبت شدند |
| کارایی | بدون تغییر کد؛ اندازه‌گیری‌های performance به Part 2/3 واگذار شد |
| مهاجرت | مهاجرت لازم ندارد |
| Rollback | حذف این سند و tag، یا revert commit مستنداتی کافی است؛ داده/کد runtime تغییر نکرده است |

---

## 7. وضعیت Wave 0 پس از Part 1

Wave 0 هنوز کامل نیست؛ فقط بخش ۱ انجام شد. وضعیت در `docs/NATIONAL_ROADMAP_PROGRESS.md` باید `🟡` بماند تا Partهای ۲، ۳ و ۴ و سپس سند تجمیعی نهایی تکمیل شوند.
