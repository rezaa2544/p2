# PAYESH — هوش پروژه / Project Intelligence Snapshot

**Status:** CANONICAL / ACTIVE  
**Date:** 2026-09-24  
**Repository:** `rezaa2544/p2`  
**Branch:** `main`  
**Documentation baseline before this synchronization:** `f74ec223874cd8bbd44dcfbf7365a98100ecb549`

## 1. Ground truth فعلی
این سند خلاصهٔ واحدِ وضعیت جاری پروژه است و برای هم‌راستاسازی ChatGPT، Arena و Atria ایجاد شده است. در تعارض، اجرای واقعی/E3-E4 و GitHub Actions بر کد و گزارش‌ها مقدم‌اند.

### تغییرات قطعی تا این لحظه
- PR #401 با merge commit `e264932419335ce42da53f2700e362bce31670b9` لایهٔ هوشمندی آموزشی را اصلاح کرد.
- هفت defect هوشمندی D1–D7 ثبت و remediation شدند.
- پوشش اتصال موتورهای هوشمندی به **21/21** رسید و orphan runtime engine برابر **0** شد.
- F-EI-01 بسته شد: هشت موتور یتیم به مسیرهای HTTP زنده متصل شدند.
- گیت‌های no-data-masking، timestamp/fingerprint، wiring E2E، non-circular certification و client rendering اضافه و در branch کار مربوطه سبز ثبت شدند.
- `generate-write-perms --check` یک failure پیش‌موجود است؛ بازسازی آن نباید commit شود چون فایل مجوزهای موجود را از 199 writer-action به 0 کاهش می‌دهد. `tools/check-authz.js` گیت واقعی مجوزهاست.
- اصلاحات Phase 7 verifier تا PRهای #382/#383/#386 و اصلاحات محیط Redis/Auth در #390/#391/#392 در main reconcile شده‌اند.
- اسناد اجرایی جدید در main ثبت شده‌اند: `docs/CURRENT_WORK_EXECUTION_PLAN.md` و alignmentهای roadmap/P0/production-readiness.

## 2. ترتیب اجرایی حاکم
`Atria Critical/High → Phase A Carry-over Closure → Atria Medium → Atria Low → Full Multi-AI Validation → Capability Matrix → Role Matrix → E2E → Failure/Recovery → Performance → Final Certification`

### Phase A carry-over (mandatory)
گزارش نخست Atria، ۲۲ مورد Medium/Low را شناسایی و عمداً خارج از P0/P1 remediation گذاشت. این موارد اکنون به‌صورت queue رسمی در `docs/audit/ATRIA_PHASE_A_CARRYOVER.md` ثبت شده‌اند و قبل از عبور از sweep Medium باید تعیین‌تکلیف شوند. «Deferred» یا «خارج از scope قبلی» به معنی حل‌شده نیست.
تا پایان sweep آتریا، Arenaها نباید هم‌زمان روی همان ناحیه‌ای که Atria در حال remediation آن است تغییر کدنویسی دهند. بعد از آن، workstreamها مستقل و non-overlapping می‌شوند.

## 3. قرارداد رفع عیب
`Finding → Reproduce → Root Cause → Fix → Regression Test → Execute → Evidence → Review`
هیچ موردی فقط به دلیل وجود کد، تست محلی، گزارش یا عنوان «fixed» certified نیست.

## 4. Intelligence layer — وضعیت جاری
- کل موتورهای شناخته‌شده: **21**
- موتورهای runtime-wired: **21**
- orphan engines: **0**
- orphan API paths اضافه‌شده: **8**
- client intelligence dashboard: **فعال برای 3 نقش**
- F-EI-01: **closed at code/remediation level**
- certification: باید در current-head validation campaign دوباره مستقل verify شود.

## 5. Evidence boundary
- GitHub documentation commits ≠ runtime certification.
- historical PASS/VERIFIED ≠ current-head PASS مگر exact-SHA evidence موجود باشد.
- current production readiness هنوز باید با Capability/Role/E2E/Failure-Recovery/Performance evidence تکمیل شود.
- هیچ national-scale capacity number بدون اندازه‌گیری واقعی معتبر نیست.

## 6. نقش عامل‌ها
### Atria
Adversarial defect hunter/fixer: ابتدا Critical/High، سپس Medium، سپس Low. پس از sweep به reviewer مستقل تبدیل می‌شود.
### ChatGPT × 5
1. Architecture / roadmap / ground truth
2. Security / zero-trust
3. Backend / DB / infra
4. Frontend / intelligence / UX
5. QA / release / evidence
### Arena × 11
Workstreamهای مستقل و non-overlapping؛ هر تحویل باید scope، reproduction، root cause، fix، regression، test result، evidence و SHA داشته باشد.

## 7. Gate نهایی
برای هر حوزه فقط این وضعیت‌ها معتبرند: `PASS / FAIL / UNVERIFIED`
گواهی نهایی باید شامل Security، Tenant Isolation، Authentication، Authorization، Backend، Database، Redis/Queue، Frontend، Intelligence، Roles، Capabilities، E2E، Failure/Recovery، Performance، Observability و Production Readiness باشد.

## 8. قوانین مدیریت تغییر
- force-push/history rewrite ممنوع.
- `git add -A` بدون بررسی ممنوع.
- secret/token داخل repository یا prompt ممنوع.
- duplicate fixing ممنوع.
- هر claim باید با evidence قابل بازتولید همراه باشد.
- گزارش تاریخی باید از current HEAD جدا نگه داشته شود.

**مرجع اصلی اجرا:** `docs/CURRENT_WORK_EXECUTION_PLAN.md`  
**مرجع roadmap:** `docs/ROADMAP.md` و `docs/ROADMAP_MASTER_EXECUTION_SCHEDULE.md`  
**مرجع current truth:** `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md`

## Architecture Evolution Ground Truth — 2026-09-24

Canonical detail: docs/ARCHITECTURE_EVOLUTION_ROADMAP.md

The 12 architecture patterns are now part of project intelligence as a prioritized evolution backlog:
- P0: Modular Monolith/Vertical Slices; Event-Driven; Transactional Outbox; OpenTelemetry; Policy-as-Code.
- P1: Selective CQRS; Workflow/Saga.
- Conditional research: Event Sourcing; Microservices; Kubernetes; Service Mesh.
- Cross-cutting: Zero-Trust Service Boundaries.

This registration is not a claim of implementation. Existing architecture remains the baseline until evidence-backed Architecture Review decisions are made.
