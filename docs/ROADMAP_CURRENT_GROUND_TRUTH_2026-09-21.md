# PAYESH — CURRENT ROADMAP GROUND TRUTH
## وضعیت اجرایی و برنامه ادامه کار — 2026-09-21

**Repository:** `rezaa2544/p2`  
**Branch:** `main`  
**Current HEAD:** `fbe178be7c99ddb6c068eee4f7b389a6b9e7aeab`  
**Last verified CI run:** Node.js CI #1093 — successful  
**Purpose:** این سند لایهٔ وضعیت جاری است تا بین Master Schedule، گزارش‌های ممیزی و وضعیت واقعی GitHub اختلاف ایجاد نشود.

---

## 1. قانون مرجع وضعیت

در صورت تعارض اسناد، ترتیب تصمیم‌گیری:

1. اجرای واقعی و خروجی GitHub Actions / E3-E4
2. کد و تست موجود در `main`
3. گزارش ممیزی دارای SHA و شواهد اجرایی
4. برنامه‌ریزی و ادعاهای تاریخی

بنابراین وجود یک فایل یا گزارش با واژهٔ VERIFIED به‌تنهایی برای عبور از Gate کافی نیست؛ Exit Criteria همان فاز نیز باید Evidence داشته باشد.

---

## 2. وضعیت فعلی در یک نگاه

| بخش | وضعیت | نتیجه عملی |
|---|---|---|
| Phase 8 Entry | VERIFIED | ورودی Zero-Trust معتبر است |
| Phase 8.1 | VERIFIED | R5/R15/R16/R20 و باتری اصلی تثبیت شده |
| CI روی HEAD فعلی | VERIFIED | Node.js CI #1093 موفق؛ PG/Redis، ledger، 8.1 batteries و R1/R2/R21 اجرا شدند |
| R1/R2/R21 remediation | VERIFIED در CI فعلی | suiteهای اختصاصی موفق |
| Phase 8.2 S2 | PARTIAL | SLO/تصمیمات/metrics تحویل شده، ولی شواهد تفصیلی S3/S4 ناقص است |
| Phase 8.2 exit gate | NOT VERIFIED | هنوز نباید 8.3 را به‌عنوان شروع‌شده اعلام کنیم |
| Phase 8.3 | PLANNED | پس از بسته‌شدن Gate 8.2 |
| Phase 8.4 | PLANNED | tenant hardening |
| Phase 8.5 | PLANNED | WAF enforce + certification |
| Phase 9.0 | PLANNED | Wiring Gate برای ۸ موتور آموزشی |

---

## 3. کارهایی که واقعاً بسته شده‌اند

### Phase 8.1
- باتری ۱۲۷/۱۲۷ روی PG 17.11 + Redis 8.0.2 در گزارش Phase 8.1.
- truth-gate: 44/44.
- R5 fail-fast boot.
- CI enforcement.
- گزارش: `docs/PHASE_8.1_REMEDIATION_AUDIT_REPORT.md`.

### Current main / CI
Run مربوط به HEAD فعلی:
- Node.js 22
- migration chain و rollback
- live-PG suites
- live-Redis suite
- Redis outage fail-closed
- OCC دو-instance
- Outbox crash/restart + DLQ
- Phase 6.5 RT-01…RT-10
- Production Truth Gate
- Phase 7 verifier
- Phase 8.1 batteries A/B/C/D
- R1/R2/R21 authoritative fail-closed suites
- `npm test`

همهٔ jobها در Node.js CI #1093 با conclusion=success ثبت شده‌اند.

### Remediation commit
`b0b55a13539dc917779d39053bfb8d2277428cc0`:
- C1–C8
- R1
- R2
- R21
- migration ledger
- fake-green migration-009 guard
- structured telemetry failures
- regression/negative suites

---

## 4. Phase 8.2 — وضعیت دقیق

### تحویل‌های موجود
- `docs/PHASE_8.2_ARCHITECTURE_GOVERNANCE_PRE_AUDIT.md`
- `docs/PHASE_8.2_S2_GROUND_TRUTH_RECONCILIATION_AUDIT.md`
- `docs/R6_R7_DECISIONS.md`
- `docs/SLO.md`
- `docs/audit/PHASE_8_2_FINAL_VERIFICATION_REPORT.md`

### تعارضی که باید صریحاً حفظ شود
گزارش `PHASE_8_2_FINAL_VERIFICATION_REPORT.md` در HEAD وضعیت **VERIFIED** دارد؛ اما ممیزی Ground Truth قبلی و خود Exit Criteria Master Schedule صراحتاً شواهدی را برای موارد زیر لازم می‌دانند که در گزارش نهایی کوتاه فعلی جزئیات اجرایی آن‌ها ثبت نشده است:

1. alert → on-call → runbook drill با Evidence سطح E4
2. restore واقعی PostgreSQL + Redis با اثبات هویت DB بازیابی‌شده
3. شواهد عملیاتی MTTA/MTTR و acknowledgement
4. رفع/تعیین تکلیف cold-cache revoke behavior
5. canonical alert configuration و اثبات اینکه همان فایل واقعاً توسط Prometheus/Alertmanager بارگذاری می‌شود

بنابراین برای جلوگیری از Greenwashing، وضعیت برنامه‌ای Phase 8.2 فعلاً **PARTIAL** نگه داشته می‌شود تا این Evidence Gap بسته شود. این به معنی رد گزارش VERIFIED نیست؛ یعنی ادعای آن هنوز با Exit Evidence تفصیلی reconciliation نشده است.

---

## 5. Remaining Work — ترتیب اجرایی

### M0 — Reconcile Phase 8.2 Evidence
**اولین مأموریت فعلی**

- استخراج Evidence موجود برای S2/S3/S4 از GitHub Actions، artifacts و reports.
- مشخص‌کردن دقیق اینکه کدام Exit Criterion واقعاً PASS شده.
- اگر Evidence وجود ندارد، آیتم را دوباره اجرا کنیم؛ نه اینکه فقط سند را اصلاح کنیم.
- خروجی: یک Gate Matrix با PASS/NOT VERIFIED و SHA/run ID.

### M1 — Alert / On-call chain
اگر در M0 اثبات نشد:
- یک canonical alert file.
- owner/team.
- receiver واقعی.
- on-call assignment.
- acknowledgement machine-readable.
- MTTA/MTTR.
- اجرای drill برای PG/Redis/canary/tenant breach.

### M2 — Restore / DR
اگر در M0 اثبات نشد:
- `pg_basebackup` یا معادل صریح مورد تأیید.
- restore isolated.
- ثبت `system_identifier`.
- ثبت port/data_directory موقت.
- checksum `schema_migrations` قبل/بعد.
- Redis backup/restore evidence.
- RPO/RTO measured، نه TARGET.

### M3 — R6/R7 evidence closure
- اجرای Redis واقعی برای تست‌هایی که قبلاً SKIP شده‌اند.
- cold-cache scenario.
- تعیین وضعیت واقعی revoke در FLUSHALL/restart.
- اصلاح هر برچسب MEASURED که پشتوانهٔ runtime ندارد.

### M4 — Phase 8.2 Exit Gate
تنها پس از M0–M3:
- Phase 8.2 → VERIFIED
- سپس Phase 8.3 آزاد می‌شود.

---

## 6. Phase 8.3 — بعد از Gate 8.2

هدف‌ها:
- national load test
- p95/p99 under defined workload
- 20k RPS / 2.5k write TPS / 25k events/s contract
- multi-instance soak
- control-plane divergence quantified
- cold boot <30s
- migration ledger / R21 evidence
- Outbox/Event Bus completion
- R1/R12 consistency proof

**قاعده:** هیچ عدد ظرفیت ملی بدون E3/E4 runtime evidence به‌عنوان VERIFIED ثبت نمی‌شود.

---

## 7. Phase 8.4

- central tenant enforcement
- legacy route coverage
- negative tests روی root بدون annotation
- hostile review
- tenant_policy hardening

Dependency مهم: R3.

---

## 8. Phase 8.5

- WAF enforce
- final zero-trust certification
- independent Red Team re-certification
- G10 / production certification gate

---

## 9. Phase 9.0 — Educational Wiring Gate

هشت موتور آموزشی که در `server/analytics/` هستند ولی در ممیزی قبلی server-ref مؤثر نداشتند، باید به مسیر HTTP واقعی متصل و با E3 تست شوند.

تا قبل از عبور 8.5، این بخش **PLANNED** باقی می‌ماند مگر Dependency Graph به‌صورت رسمی تغییر کند.

---

## 10. مواردی که نباید دوباره گم شوند

- 10M-user national load هنوز Evidence ملی E4 محسوب نمی‌شود.
- DR/restore را صرف وجود script یا runbook نباید VERIFIED کرد.
- SLO TARGET با MEASURED یکی نیست.
- Redis-only tests اگر SKIP شوند، PASS محسوب نمی‌شوند.
- چهار مسیر/فایل alert موازی باید قبل از ادعای operational alerting reconcile شوند.
- Phase 8.3 تا تعیین تکلیف واقعی Exit Gate 8.2 شروع‌شده اعلام نمی‌شود.
- هر status جدید باید به SHA، command/test و خروجی قابل بازتولید متصل باشد.

---

## 11. وضعیت تصمیم‌گیری امروز

**Current Phase:** Phase 8.2 — Evidence Reconciliation / Exit Gate  
**Next concrete mission:** M0 — استخراج و تطبیق Evidence S3/S4 و تعیین دقیق PASS/NOT VERIFIED  
**After Gate:** Phase 8.3 Scale & Performance Hardening  
**No Production GO is declared by this document.**
