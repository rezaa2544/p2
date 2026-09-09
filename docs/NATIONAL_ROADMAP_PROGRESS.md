# پیگیری پیشرفت نقشه راه ملی پایش

**مرجع:** `docs/ROADMAP.md` — National Scale Master Roadmap

**قاعده:** این فایل با تکمیل هر Wave به‌روزرسانی می‌شود؛ وضعیت اولیه همه Waves در انتظار شروع است.

| Wave | عنوان | وضعیت | توضیح کوتاه |
|---:|---|---|---|
| 0 | Baseline و Freeze | 🟡 | شروع شد — بخش ۱ انجام شد: tag، تست‌های فعلی و سند کلی baseline؛ منتظر Partهای ۲ تا ۴ |
| 1 | PostgreSQL Source of Truth [P0] | ⏳ | در انتظار شروع — انتقال مسیرهای production به PostgreSQL و حذف store از منبع حقیقت |
| 2 | Database Engineering | ✅ | کامل شد — migrations نسخه‌دار، rollback، Identity IDs، constraints، transaction در سه مسیر حیاتی و OCC SQL با 409 |
| 3 | Query و Performance [P0] | ⏳ | در انتظار شروع — DB-native کردن endpointهای پرترافیک، pagination و index بر اساس plan |
| 4 | Sync / A01 | ⏳ | در انتظار شروع — database-native کردن Pull/Push، tombstone، cursor و OCC/transaction |
| 5 | Authorization و Tenant Isolation [P0] | ⏳ | در انتظار شروع — یکپارچه‌سازی policy برای REST/Sync و scope چندسطحی |
| 6 | Redis و Distributed State [P0] | ⏳ | در انتظار شروع — OTP، rate-limit، revocation، idempotency و cache توزیع‌شده |
| 7 | Offline-first | ⏳ | در انتظار شروع — حفظ offline-first با cache محدود، queue bounded و DLQ/conflict |
| 8 | Async Architecture | ⏳ | در انتظار شروع — خروج SMS/report/analytics از request path با outbox و worker |
| 9 | Application Performance | ⏳ | در انتظار شروع — حذف full-store stringify، I/O sync و کارهای سنگین از request path |
| 10 | Database Scale | ⏳ | در انتظار شروع — Primary، ایندکس، pool، backup، سپس replica/partitioning بر اساس benchmark |
| 11 | Cache | ⏳ | در انتظار شروع — سلسله‌مراتب Browser/CDN/Redis/PostgreSQL با TTL و invalidation |
| 12 | Network / Edge | ⏳ | در انتظار شروع — DNS/CDN/WAF/LB/TLS و hardening لبه شبکه |
| 13 | Security Program | ⏳ | در انتظار شروع — برنامه امنیتی کامل، ASVS، CI security و supply-chain |
| 14 | Observability | ⏳ | در انتظار شروع — metrics/logs/traces، داشبورد و alerting |
| 15 | Health / Deployment | ⏳ | در انتظار شروع — liveness/readiness/health، graceful shutdown و deployment امن |
| 16 | Disaster Recovery | ⏳ | در انتظار شروع — RPO/RTO، backup، PITR، restore/failover drill و runbook |
| 17 | Testing Pyramid | ⏳ | در انتظار شروع — واحد، یکپارچه، contract، E2E، امنیت، load، chaos و recovery |
| 18 | National Load Testing | ⏳ | در انتظار شروع — دیتاست ۱۰M و سنجش load/stress/spike/soak واقعی |
| 19 | Chaos / Failure Testing | ⏳ | در انتظار شروع — تزریق failureهای واقعی و اثبات detect/contain/recover |
| 20 | چهار Arena | ⏳ | در انتظار شروع — تقسیم مالکیت Database/Core، Security، Sync/Offline و Performance/Infra |

## راهنمای وضعیت

- ⏳ در انتظار شروع
- 🟡 در حال انجام
- ✅ کامل
- 🔴 مسدود/نیازمند تصمیم

## قرارداد به‌روزرسانی

پس از هر task مرتبط با یک Wave، همین فایل باید با وضعیت جدید، خلاصه اثر معماری/دیتابیس/امنیت/کارایی و لینک commit/PR به‌روز شود.
