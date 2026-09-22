# Project Intelligence — P2

**Version:** 1.0.0  
**Updated:** 2026-09-22  
**Repository:** `rezaa2544/p2`  
**Branch:** `main`  
**Current HEAD:** `07e5ae2de7a6ad6365f4ff6af5e5e85283147354`

## 1. Purpose

این سند «حافظه عملیاتی پروژه» است: یک نمای فشرده و قابل‌انتقال از وضعیت، قوانین، تصمیم‌ها، شواهد، وابستگی‌ها و قدم بعدی. این سند جایگزین Roadmap، Governance یا Audit نیست؛ آن‌ها منابع مرجع جزئیات هستند.

## 2. Current Truth

- Governance مرجع: `docs/ENGINEERING_EXECUTION_AND_VERIFICATION_POLICY.md` نسخه 1.3.0.
- Rule 30: هیچ Repo-owned defect نباید با PARTIAL/OPEN یا صرفاً گزارش رها شود؛ چرخه تا closure ادامه دارد.
- Rule 31: سازنده تغییر مسئول Clean Merge و Post-Merge Verification است، مشروط به مجوز.
- Roadmap زمانی/اجرایی: `docs/ROADMAP_MASTER_EXECUTION_SCHEDULE.md`.
- Current-state reconciliation: `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md`.
- Final Phase 8.2 evidence: `docs/audit/PHASE_8_2_FINAL_VERIFICATION_REPORT.md`.
- Current main HEAD در زمان این ثبت: `07e5ae2de7a6ad6365f4ff6af5e5e85283147354`.
- آخرین تغییرات reconciliation مشاهده‌شده شامل hardening در observability و ثبت gate نهایی است.

## 3. Project State

### Engineering / Repository
- Repo-owned defect queue در آخرین reconciliation ثبت‌شده: **ZERO**.
- Fixهای اخیر شامل migration parser hardening، حذف security false-green، hardening گیت‌های observability و اصلاح documentation drift بوده‌اند.
- این «ZERO» فقط برای عیوب Repo-owned شناسایی‌شده در reconciliation مربوطه است و به معنی Production GO نیست.

### Verification Boundary
- Current-head completed GitHub Actions evidence باید برای ادعای runtime PASS روی همان SHA وجود داشته باشد.
- E3 و E4 مستقل‌اند؛ E3 هرگز به‌طور خودکار E4 محسوب نمی‌شود.
- Historical evidence فقط historical است و به current HEAD منتقل نمی‌شود.

### Phase / Gate
- Phase 8.2 Exit: **NOT VERIFIED** تا تکمیل evidence لازم.
- Phase 8.3: **BLOCKED** به دلیل dependency روی 8.2 Exit.
- Production GO: **NOT DECLARED**.
- E4 PostgreSQL DR، Redis DR، S3/off-site، alert→on-call→ack→recovery و national-scale load/soak نیازمند evidence محیط خارجی/production-equivalent هستند.

## 4. Known External Dependencies

1. Completed current-head GitHub Actions/runtime execution.
2. E4 multi-host PostgreSQL/Redis + S3/off-site backup environment.
3. Real alert receiver, on-call and human acknowledgement path.
4. Production-equivalent 10M/load/soak environment.

برای هر مورد باید owner، dependency و evidence دقیق ثبت شود؛ External blocker نباید برای defect Repo-owned استفاده شود.

## 5. Execution Loop

هر تغییر مهم:

`Current HEAD → Understand → Plan → Reproduce → Root Cause → Fix → Regression → 5-Pass Verification → Independent Verification → Commit → Push → Merge → Post-Merge Reconcile`

Five-pass dimensions:
1. Functional
2. Boundary
3. Negative / Failure
4. Concurrency / Replay / Resilience
5. Independent Regression / Environment Re-run

## 6. Decision Rules

- Current HEAD حقیقت نهایی است.
- Evidence قبل از Status.
- No Fake Green.
- Repo-owned defect تا صفر شدن queue بسته می‌شود.
- External/E4 evidence جعل یا شبیه‌سازی نمی‌شود.
- Merge برای «بعداً اصلاح می‌کنیم» ممنوع است.
- تغییرات باید حداقلی، قابل rollback و دارای regression باشند.
- هر Chat باید context قابل انتقال تولید کند.

## 7. Next Action

1. Current main و open PR/branchها دوباره reconcile شوند.
2. Current-head CI/runtime evidence تکمیل شود.
3. هر Failure جدید Repo-owned همان چرخه closure را طی کند.
4. سپس E3/E4، DR، alerting و capacity evidence جداگانه تکمیل شوند.
5. Phase 8.2 فقط با evidence کامل exit شود؛ سپس Phase 8.3 باز شود.

## 8. Source Priority

در تعارض اطلاعات:
1. Current repository state / current HEAD
2. Current CI/runtime evidence on exact SHA
3. Current governance
4. Current roadmap ground truth
5. Historical audit/report

این سند باید با هر تغییر مهم پروژه به‌روزرسانی و با SHA جدید قابل ردیابی باشد.
