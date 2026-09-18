# 🗺️ DOCUMENTATION MAP — نقشه و کاتالوگ جستجوی کتابخانهٔ مستندات

**نسخه:** ۱.۰.۰ | **تاریخ:** ۲۰۲۶-۰۹-۱۱ | **مالک سند:** چت ۶ (مستندساز و مهندس انتشار) | **بازبینی:** با هر بامپ قفل
**منبع داده:** خروجی زندهٔ `tools/docs-metadata.js` (متادیتا در `docs/_metadata.json` و نمایهٔ جستجو در `docs/_search-index.json` — هر دو تولیدی و خارج از گیت)

> با کتابخانه‌ای در این اندازه، «پیدا کردن سند درست» خودش یک کار مهندسی است. این سند نمای
> انسان‌خوان است؛ برای جستجوی ماشین‌خوان، `node tools/docs-metadata.js` را اجرا کنید و
> `_search-index.json` را بپرسید. اعداد این نقشه در لحظهٔ قفل `rc26` نهایی‌اند.

---

## بخش ۱: نمای کلی

| سنجه | مقدار |
|---|---:|
| کل اسناد (لحظهٔ قفل `rc44`) | **۴۵۸** |
| اسناد ریشهٔ `docs/*.md` (با خود نقشه و قفل) | ۴۳۷ |
| اسناد زیرپوشه‌ها (`RUNBOOK_CARDS/` + `user-guides/` + `pilot/` + `roadmaps/`) | ۲۱ |
| توکن در نمایهٔ جستجو | ۲۳۲۳ |

**به تفکیک وضعیت:**

| وضعیت | شمار |
|---|---:|
| فعال (در حال استفاده) | ۳۹۱ |
| زنده (ماشینی/رخدادی، مستثنی از بامپ) | ۳ |
| منجمد (قفل‌های تاریخی) | ۴۴ |
| آرشیو (بایگانی نمایه) | ۲۰ |
| **جمع** | **۴۵۸** |

> **تعریف C6-02 (۲۰۲۶-۰۹-۱۷):** جمع‌های این جدول‌ها = **درخت پایدار** — زیرپوشه‌های
> `daily-*` (`daily-audits/` + `daily-reports/`) سوابقِ عملیاتیِ متغیرند و خارج از
> شمار‌اند (هم‌ساز با `tools/docs-stats-sync.js`). شمارِ لحظه‌ای:
> `node tools/docs-stats-sync.js --json`. اسناد روزانه همچنین از پایشِ یتیم خارج‌اند
> (قلم ۷) — محافظت از گزارش‌های روزانهٔ **آتی**؛ یتیم‌های روزِ `d262b4e` (پنج daily-audits
> + یک roadmap) پیش‌تر در C7-07 (`3f8a2d2`) در `DOCS_INDEX` ثبت شده‌اند.

**به تفکیک مالک (صریح در سربرگ یا نقشهٔ مالکیت نمایه):**

| مالک | شمار |
|---|---:|
| سیستمی/نامشخص | ۲۰۱ |
| چت ۶ | ۶۷ |
| چت ۴ | ۷ |
| چت ۱ | ۶ |
| چت ۲ | ۶ |
| ناظر | ۳ |
| چت ۳ | ۳ |
| چت ۵ | ۴ |

> **یافتهٔ صداقت:** بیشترین سطر «سیستمی/نامشخص» است — اسناد فازهای اولیه سربرگ مالک ندارند.
> قاعدهٔ جدید (این مأموریت): هر سند تازه باید فیلد «مالک سند» داشته باشد؛ مالکیت قدیمی‌ها با
> هر ویرایش، اصلاح تدریجی می‌شود.

---

## بخش ۲: نقشهٔ حرارتی دسته‌ها

| دسته | تعداد | حجم کل | آخرین به‌روزرسانی |
|---|---:|---:|---|
| عمومی/بدون طبقه در نمایه | ۱۱۵ | 1.6 مگابایت | 2026-09-11 |
| ۲.۱۰ مستندات توسعه‌دهندگان | ۴۱ | 1.0 مگابایت | 2026-09-11 |
| ۲.۱۱ بایگانی و تاریخچه (⚪ منجمد — مرجع فنی نیستند) | ۲۱ | 409 کیلوبایت | 2026-09-11 |
| ۲.۱ استراتژی و برنامه‌ریزی | ۱۳ | 224 کیلوبایت | 2026-09-11 |
| ۲.۸ گزارش موج‌ها (Per-Wave Reports) | ۱۳ | 126 کیلوبایت | 2026-09-11 |
| ۲.۵ بهره‌برداری و انتشار | ۱۲ | 190 کیلوبایت | 2026-09-11 |
| ۲.۲ معماری | ۱۱ | 147 کیلوبایت | 2026-09-11 |
| ۲.۳ امنیت | ۱۱ | 156 کیلوبایت | 2026-09-11 |
| زیرپوشه: کارت‌های ران‌بورد | ۱۰ | 30 کیلوبایت | 2026-09-11 |
| ۲.۹ هماهنگی و تحویل | ۱۰ | 294 کیلوبایت | 2026-09-11 |
| ۲.۴ پایایی | ۹ | 123 کیلوبایت | 2026-09-11 |
| ۲.۱۲ راهنمای کاربران نهایی (`docs/user-guides/`) | ۵ | 29 کیلوبایت | 2026-09-11 |
| ۲.۶ انتشار و نتایج | ۵ | 79 کیلوبایت | 2026-09-11 |
| ۲.۱۱ اسناد ویژگی‌ها (بستهٔ هفت‌گانهٔ مرج — 2026-09-10) | ۴ | 47 کیلوبایت | 2026-09-11 |
| پیش‌نویس و صورت‌جلسهٔ اولیه | ۳ | 14 کیلوبایت | 2026-09-10 |
| زیرپوشه: اسناد پایلوت | ۲ | 5 کیلوبایت | 2026-09-10 |
| ۲.۷ خط پایه (Baseline) | ۱ | 7 کیلوبایت | 2026-09-10 |


---

## بخش ۳: نمایهٔ کلیدواژه

بیشترین بسامد توکن‌ها در عنوان/تیترهای کتابخانه (حداقل ۴ سند در هر توکن):

| کلیدواژه | اسناد | نمونه‌ها |
|---|---:|---|
| REPORT | ۶۲ | [`DOCS_CONSISTENCY_REPORT.md`](DOCS_CONSISTENCY_REPORT.md) · [`DOCS_HEALTH_REPORT.md`](DOCS_HEALTH_REPORT.md) · [`POST_RESET_INTEGRITY_REPORT.md`](POST_RESET_INTEGRITY_REPORT.md) |
| پایش | ۵۷ | [`EXECUTIVE_SLIDES_OUTLINE.md`](EXECUTIVE_SLIDES_OUTLINE.md) · [`PRODUCTION_RUNBOOK.md`](PRODUCTION_RUNBOOK.md) · [`REDIS_CLUSTER_SETUP.md`](REDIS_CLUSTER_SETUP.md) |
| گزارش | ۵۵ | [`REPORT_2026-09-05_SECURITY.md`](REPORT_2026-09-05_SECURITY.md) · [`A01_PULL_BOOTSTRAP_REPORT.md`](A01_PULL_BOOTSTRAP_REPORT.md) · [`ANDROID_BUILD_REPORT.md`](ANDROID_BUILD_REPORT.md) |
| مستندات | ۴۴ | [`DOCS_INDEX.md`](DOCS_INDEX.md) · [`DOCUMENTATION_MAINTENANCE.md`](DOCUMENTATION_MAINTENANCE.md) · [`REPORT_2026-09-06_ROUND80.md`](REPORT_2026-09-06_ROUND80.md) |
| معماری | ۳۶ | [`ARCHITECTURE_DECISIONS.md`](ARCHITECTURE_DECISIONS.md) · [`ARCHITECTURE_REVIEW.md`](ARCHITECTURE_REVIEW.md) · [`MULTI_INSTANCE_ARCHITECTURE.md`](MULTI_INSTANCE_ARCHITECTURE.md) |
| جامع | ۲۹ | [`RECOVERY_INSTRUCTIONS.md`](RECOVERY_INSTRUCTIONS.md) · [`راهنمای_سوپر_ادمین.md`](راهنمای_سوپر_ادمین.md) · [`راهنمای_کاربر.md`](راهنمای_کاربر.md) |
| اسناد | ۲۸ | [`README.md`](pilot/README.md) · [`DOCS_FREEZE_v1.0.0-rc1.md`](DOCS_FREEZE_v1.0.0-rc1.md) · [`DOCS_FREEZE_v1.0.0-rc10.md`](DOCS_FREEZE_v1.0.0-rc10.md) |
| Wave | ۲۷ | [`DATABASE_ARCHITECTURE.md`](DATABASE_ARCHITECTURE.md) · [`WAVE1_WRITES_INVENTORY.md`](WAVE1_WRITES_INVENTORY.md) · [`AUTH_FLOW.md`](AUTH_FLOW.md) |
| داده | ۲۷ | [`DATA_SAFETY.md`](DATA_SAFETY.md) · [`REPORT_2026-09-06_ROUND76_DROPOUT_READINESS.md`](REPORT_2026-09-06_ROUND76_DROPOUT_READINESS.md) · [`DATABASE_ARCHITECTURE.md`](DATABASE_ARCHITECTURE.md) |
| FREEZE | ۲۵ | [`DOCS_FREEZE_v1.0.0-rc1.md`](DOCS_FREEZE_v1.0.0-rc1.md) · [`DOCS_FREEZE_v1.0.0-rc10.md`](DOCS_FREEZE_v1.0.0-rc10.md) · [`DOCS_FREEZE_v1.0.0-rc11.md`](DOCS_FREEZE_v1.0.0-rc11.md) |
| سامانه | ۲۴ | [`توضیح_کامل_برنامه.md`](توضیح_کامل_برنامه.md) · [`راهنمای_کاربر.md`](راهنمای_کاربر.md) · [`A01_PULL_BOOTSTRAP_REPORT.md`](A01_PULL_BOOTSTRAP_REPORT.md) |
| سرور | ۲۴ | [`REPORT_2026-09-06_SERVER1.md`](REPORT_2026-09-06_SERVER1.md) · [`SERVER_SECURITY_CONTRACT.md`](SERVER_SECURITY_CONTRACT.md) · [`BACKEND_PRODUCTION_ARCHITECTURE.md`](BACKEND_PRODUCTION_ARCHITECTURE.md) |
| PLAN | ۲۳ | [`LOAD_TEST_PLAN.md`](LOAD_TEST_PLAN.md) · [`PILOT_ROLLOUT_PLAN.md`](PILOT_ROLLOUT_PLAN.md) · [`ANDROID_BUILD_PLAN.md`](ANDROID_BUILD_PLAN.md) |
| تجمیعی | ۲۲ | [`REPORT_2026-09-06_ROUND70.md`](REPORT_2026-09-06_ROUND70.md) · [`FARNAZ_PHASE1_FINAL_REPORT.md`](FARNAZ_PHASE1_FINAL_REPORT.md) · [`PERFORMANCE_BENCHMARKS.md`](PERFORMANCE_BENCHMARKS.md) |
| خلاصه | ۲۱ | [`A01_PULL_BOOTSTRAP_REPORT.md`](A01_PULL_BOOTSTRAP_REPORT.md) · [`ANDROID_BUILD_REPORT.md`](ANDROID_BUILD_REPORT.md) · [`BOTTLENECK_MAP.md`](BOTTLENECK_MAP.md) |
| ریشه | ۲۰ | [`DOCS_FREEZE_v1.0.0-rc10.md`](DOCS_FREEZE_v1.0.0-rc10.md) · [`DOCS_FREEZE_v1.0.0-rc11.md`](DOCS_FREEZE_v1.0.0-rc11.md) · [`DOCS_FREEZE_v1.0.0-rc12.md`](DOCS_FREEZE_v1.0.0-rc12.md) |
| مدرسه | ۱۹ | [`G1_HEALTH_INDEX_DESIGN.md`](G1_HEALTH_INDEX_DESIGN.md) · [`HEALTH_INDEX_MODULE.md`](HEALTH_INDEX_MODULE.md) · [`PLAN_CALENDAR_TIME.md`](PLAN_CALENDAR_TIME.md) |
| کاربر | ۱۹ | [`CAPACITY_SIM.md`](CAPACITY_SIM.md) · [`SCALE_10M.md`](SCALE_10M.md) · [`WAVE18_LOAD_TEST_PLAN.md`](WAVE18_LOAD_TEST_PLAN.md) |
| ورود | ۱۷ | [`PLAN_PHONE_AUTH.md`](PLAN_PHONE_AUTH.md) · [`ONBOARDING_CHECKLIST.md`](ONBOARDING_CHECKLIST.md) · [`AI_PROMPT.md`](AI_PROMPT.md) |
| Redis | ۱۵ | [`HA_REDIS.md`](HA_REDIS.md) · [`PHASE_4_REDIS_CACHING_REPORT.md`](PHASE_4_REDIS_CACHING_REPORT.md) · [`RATE_LIMITING_DESIGN.md`](RATE_LIMITING_DESIGN.md) |
| server | ۱۵ | [`A01_PULL_BOOTSTRAP_REPORT.md`](A01_PULL_BOOTSTRAP_REPORT.md) · [`AUTHORIZATION_MODEL.md`](AUTHORIZATION_MODEL.md) · [`DATA_DICTIONARY.md`](DATA_DICTIONARY.md) |
| طراحی | ۱۵ | [`CONFLICT_MODEL_DESIGN.md`](CONFLICT_MODEL_DESIGN.md) · [`PULL_BOOTSTRAP_DESIGN.md`](PULL_BOOTSTRAP_DESIGN.md) · [`SYNC_PROTOCOL.md`](SYNC_PROTOCOL.md) |
| مدیریت | ۱۵ | [`راهنمای_کاربر.md`](راهنمای_کاربر.md) · [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md) · [`SECRETS_MANAGEMENT.md`](SECRETS_MANAGEMENT.md) |
| Architecture | ۱۴ | [`ARCHITECTURE_REVIEW.md`](ARCHITECTURE_REVIEW.md) · [`AUTH_FLOW.md`](AUTH_FLOW.md) · [`BACKEND_PRODUCTION_ARCHITECTURE.md`](BACKEND_PRODUCTION_ARCHITECTURE.md) |
| کلاینت | ۱۴ | [`CLIENT_OFFLINE_ARCHITECTURE.md`](CLIENT_OFFLINE_ARCHITECTURE.md) · [`CLIENT_CAPACITY.md`](CLIENT_CAPACITY.md) · [`PHASE4_COMPLETION_REPORT.md`](PHASE4_COMPLETION_REPORT.md) |
| GUIDE | ۱۳ | [`DOCS_EXPORT_GUIDE.md`](DOCS_EXPORT_GUIDE.md) · [`G3_USER_GUIDE_REVIEW.md`](G3_USER_GUIDE_REVIEW.md) · [`MIGRATION_GUIDE.md`](MIGRATION_GUIDE.md) |
| جدولِ | ۱۳ | [`COMPLETE_REPORT_FOR_CLOUD.md`](COMPLETE_REPORT_FOR_CLOUD.md) · [`DR_RUNBOOK.md`](DR_RUNBOOK.md) · [`REPORT_2026-09-05_ROUND65.md`](REPORT_2026-09-05_ROUND65.md) |
| ARCHITECTURE | ۱۲ | [`NATIONAL_ARCHITECTURE.md`](NATIONAL_ARCHITECTURE.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`ARCHITECTURE_DECISIONS.md`](ARCHITECTURE_DECISIONS.md) |
| Part | ۱۲ | [`AUTH_FLOW.md`](AUTH_FLOW.md) · [`BOTTLENECK_MAP.md`](BOTTLENECK_MAP.md) · [`DATA_FLOW.md`](DATA_FLOW.md) |
| تصمیم | ۱۲ | [`README.md`](RUNBOOK_CARDS/README.md) · [`D_MAPPING_CLARIFICATION.md`](D_MAPPING_CLARIFICATION.md) · [`D4_DRAFT.md`](D4_DRAFT.md) |
| مقیاس | ۱۲ | [`CONFLICT_MODEL_DESIGN.md`](CONFLICT_MODEL_DESIGN.md) · [`SCALE_10M.md`](SCALE_10M.md) · [`NATIONAL_ROADMAP_ARCHITECTURE_ADDENDUM.md`](NATIONAL_ROADMAP_ARCHITECTURE_ADDENDUM.md) |
| وضعیتِ | ۱۲ | [`READY_STATE_2026-09-06.md`](READY_STATE_2026-09-06.md) · [`REPORT_2026-09-06_ROUND70.md`](REPORT_2026-09-06_ROUND70.md) · [`REPORT_OPEN_2026-09-05.md`](REPORT_OPEN_2026-09-05.md) |
| پایلوت | ۱۲ | [`PILOT_OPERATIONS_PLAYBOOK.md`](PILOT_OPERATIONS_PLAYBOOK.md) · [`PILOT_ROLLOUT_PLAN.md`](PILOT_ROLLOUT_PLAN.md) · [`PILOT_KICKOFF.md`](PILOT_KICKOFF.md) |
| کارت | ۱۲ | [`D2_DRAFT.md`](D2_DRAFT.md) · [`BACKUP_RESTORE.md`](RUNBOOK_CARDS/BACKUP_RESTORE.md) · [`DDOS_MITIGATION.md`](RUNBOOK_CARDS/DDOS_MITIGATION.md) |
| Rollback | ۱۱ | [`SERVICE_ROLLBACK.md`](RUNBOOK_CARDS/SERVICE_ROLLBACK.md) · [`GO_LIVE_PACKAGE.md`](GO_LIVE_PACKAGE.md) · [`BACKUP_RESTORE.md`](RUNBOOK_CARDS/BACKUP_RESTORE.md) |
| دادهٔ | ۱۱ | [`DATA_DICTIONARY.md`](DATA_DICTIONARY.md) · [`PLAN_MULTICHILD.md`](PLAN_MULTICHILD.md) · [`REPORT_2026-09-06_ROUND81.md`](REPORT_2026-09-06_ROUND81.md) |
| ران‌بورد | ۱۱ | [`BACKUP_RESTORE.md`](RUNBOOK_CARDS/BACKUP_RESTORE.md) · [`DDOS_MITIGATION.md`](RUNBOOK_CARDS/DDOS_MITIGATION.md) · [`DISK_FULL_EMERGENCY.md`](RUNBOOK_CARDS/DISK_FULL_EMERGENCY.md) |
| پیاده‌سازی | ۱۱ | [`A01_PULL_BOOTSTRAP_REPORT.md`](A01_PULL_BOOTSTRAP_REPORT.md) · [`PHASE_2_MIGRATION_REPORT.md`](PHASE_2_MIGRATION_REPORT.md) · [`PHASE_3_PRODUCTION_API_REPORT.md`](PHASE_3_PRODUCTION_API_REPORT.md) |
| Escalation | ۱۰ | [`BACKUP_RESTORE.md`](RUNBOOK_CARDS/BACKUP_RESTORE.md) · [`DDOS_MITIGATION.md`](RUNBOOK_CARDS/DDOS_MITIGATION.md) · [`DISK_FULL_EMERGENCY.md`](RUNBOOK_CARDS/DISK_FULL_EMERGENCY.md) |
| Performance | ۱۰ | [`ARENA4_PERFORMANCE_INFRA.md`](ARENA4_PERFORMANCE_INFRA.md) · [`DATABASE_PERFORMANCE_OPTIMIZATION.md`](DATABASE_PERFORMANCE_OPTIMIZATION.md) · [`LOAD_TESTING_PLAN.md`](LOAD_TESTING_PLAN.md) |
| اجرا | ۱۰ | [`WAVE14_OBSERVABILITY.md`](WAVE14_OBSERVABILITY.md) · [`WAVE5_AUTHZ.md`](WAVE5_AUTHZ.md) · [`ARENA5_QA_RELIABILITY.md`](ARENA5_QA_RELIABILITY.md) |
| بازیابی | ۱۰ | [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md) · [`RECOVERY_INSTRUCTIONS.md`](RECOVERY_INSTRUCTIONS.md) · [`REDIS_RESTORE_PROCEDURE.md`](REDIS_RESTORE_PROCEDURE.md) |
| چک‌لیست | ۱۰ | [`ONBOARDING_CHECKLIST.md`](ONBOARDING_CHECKLIST.md) · [`PILOT_ONBOARDING.md`](PILOT_ONBOARDING.md) · [`PRODUCTION_READINESS_CHECKLIST.md`](PRODUCTION_READINESS_CHECKLIST.md) |
| Executive | ۹ | [`ANDROID_BUILD_REPORT.md`](ANDROID_BUILD_REPORT.md) · [`IRAN_COMPLIANCE_PACKAGE.md`](IRAN_COMPLIANCE_PACKAGE.md) · [`LESSONS_LEARNED.md`](LESSONS_LEARNED.md) |
| آزمون | ۹ | [`LOAD_TESTING_PLAN.md`](LOAD_TESTING_PLAN.md) · [`LOAD_TEST_PLAN.md`](LOAD_TEST_PLAN.md) · [`LOAD_TEST_RESULTS.md`](LOAD_TEST_RESULTS.md) |
| استقرار | ۹ | [`REDIS_CLUSTER_SETUP.md`](REDIS_CLUSTER_SETUP.md) · [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md) · [`PILOT_ROLLOUT_PLAN.md`](PILOT_ROLLOUT_PLAN.md) |
| بستهٔ | ۹ | [`DOCUMENTATION_HANDOVER.md`](DOCUMENTATION_HANDOVER.md) · [`REPORT_2026-09-06_ROUND80.md`](REPORT_2026-09-06_ROUND80.md) · [`EXECUTIVE_BRIEFING.md`](EXECUTIVE_BRIEFING.md) |
| تأیید | ۹ | [`REPORT_86.md`](REPORT_86.md) · [`D2_DRAFT.md`](D2_DRAFT.md) · [`D3_DRAFT.md`](D3_DRAFT.md) |
| تست‌ها | ۹ | [`TEST_COVERAGE_REPORT.md`](TEST_COVERAGE_REPORT.md) · [`BEHAVIOR_GAMIFICATION.md`](BEHAVIOR_GAMIFICATION.md) · [`FARNAZ_PHASE1_FINAL_REPORT.md`](FARNAZ_PHASE1_FINAL_REPORT.md) |
| درخواست | ۹ | [`BEHAVIOR_GAMIFICATION.md`](BEHAVIOR_GAMIFICATION.md) · [`INTERNSHIP_MODULE.md`](INTERNSHIP_MODULE.md) · [`REPORT_2026-09-06_ROUND72_SIMULATION.md`](REPORT_2026-09-06_ROUND72_SIMULATION.md) |
| سریع | ۹ | [`API_REFERENCE.md`](API_REFERENCE.md) · [`DOCS_INDEX.md`](DOCS_INDEX.md) · [`GLOSSARY.md`](GLOSSARY.md) |
| مدیریتی | ۹ | [`EXECUTIVE_SLIDES_OUTLINE.md`](EXECUTIVE_SLIDES_OUTLINE.md) · [`CAPACITY.md`](CAPACITY.md) · [`IRAN_COMPLIANCE_PACKAGE.md`](IRAN_COMPLIANCE_PACKAGE.md) |
| موجود | ۹ | [`DISCOVERABILITY_R43.md`](DISCOVERABILITY_R43.md) · [`ACADEMIC_YEARS_GUIDE.md`](ACADEMIC_YEARS_GUIDE.md) · [`BEHAVIOR_GAMIFICATION.md`](BEHAVIOR_GAMIFICATION.md) |
| نیست | ۹ | [`GAP_ANALYSIS_R43.md`](GAP_ANALYSIS_R43.md) · [`OPINION_2026-09-05_ROADMAP_REVIEW.md`](OPINION_2026-09-05_ROADMAP_REVIEW.md) · [`PLACEMENT_PLAN.md`](PLACEMENT_PLAN.md) |
| کامیت‌ها | ۹ | [`FARNAZ_PHASE1_FINAL_REPORT.md`](FARNAZ_PHASE1_FINAL_REPORT.md) · [`PHASE2_SUMMARY.md`](PHASE2_SUMMARY.md) · [`PHASE3_SUMMARY.md`](PHASE3_SUMMARY.md) |
| PostgreSQL | ۸ | [`POSTGRESQL_MIGRATION_PLAN.md`](POSTGRESQL_MIGRATION_PLAN.md) · [`HA_POSTGRES.md`](HA_POSTGRES.md) · [`PHASE_2_MIGRATION_REPORT.md`](PHASE_2_MIGRATION_REPORT.md) |
| Summary | ۸ | [`ANDROID_BUILD_REPORT.md`](ANDROID_BUILD_REPORT.md) · [`IRAN_COMPLIANCE_PACKAGE.md`](IRAN_COMPLIANCE_PACKAGE.md) · [`LESSONS_LEARNED.md`](LESSONS_LEARNED.md) |
| آزمون‌ها | ۸ | [`PHASE4_COMPLETION_REPORT.md`](PHASE4_COMPLETION_REPORT.md) · [`REPORT_2026-09-05_ROUND65.md`](REPORT_2026-09-05_ROUND65.md) · [`REPORT_2026-09-06_ROUND80.md`](REPORT_2026-09-06_ROUND80.md) |
| امنیتی | ۸ | [`REPORT_AUDIT_HARDENING.md`](REPORT_AUDIT_HARDENING.md) · [`SECURITY_FINDINGS_REGISTER.md`](SECURITY_FINDINGS_REGISTER.md) · [`SECURITY_INCIDENT_LOG.md`](SECURITY_INCIDENT_LOG.md) |
| انتشار | ۸ | [`GO_LIVE_PACKAGE.md`](GO_LIVE_PACKAGE.md) · [`ANDROID_BUILD_PLAN.md`](ANDROID_BUILD_PLAN.md) · [`RELEASE_GATE_CHECKLIST.md`](RELEASE_GATE_CHECKLIST.md) |


---

## بخش ۴: نمایه بر اساس نقش

| نقش | اسناد ضروری | اسناد تکمیلی |
|---|---|---|
| توسعه‌دهندهٔ جدید | [`ONBOARDING_CHECKLIST.md`](ONBOARDING_CHECKLIST.md) · [`ONBOARDING_NEW_DEVELOPER.md`](ONBOARDING_NEW_DEVELOPER.md) · [`DOCS_INDEX.md`](DOCS_INDEX.md) | [`DOCUMENTATION_HANDOVER.md`](DOCUMENTATION_HANDOVER.md) · [`FAQ.md`](FAQ.md) · [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) |
| مدیر مدرسه | [`user-guides/MANAGER_GUIDE.md`](user-guides/MANAGER_GUIDE.md) | [`user-guides/STAFF_GUIDE.md`](user-guides/STAFF_GUIDE.md) · [`pilot/SCHOOL_INTRO.md`](pilot/SCHOOL_INTRO.md) · [`FAQ.md`](FAQ.md) |
| دبیر | [`user-guides/TEACHER_GUIDE.md`](user-guides/TEACHER_GUIDE.md) | [`FAQ.md`](FAQ.md) · [`user-guides/STUDENT_GUIDE.md`](user-guides/STUDENT_GUIDE.md) |
| ولی/دانش‌آموز | [`user-guides/PARENT_GUIDE.md`](user-guides/PARENT_GUIDE.md) · [`user-guides/STUDENT_GUIDE.md`](user-guides/STUDENT_GUIDE.md) | [`pilot/PARENT_CONSENT_FORM.md`](pilot/PARENT_CONSENT_FORM.md) |
| اس‌آر‌ای / دیواپس | [`PRODUCTION_RUNBOOK.md`](PRODUCTION_RUNBOOK.md) · [`OBSERVABILITY.md`](OBSERVABILITY.md) · [`DR_RUNBOOK.md`](DR_RUNBOOK.md) · [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md) | [`OPERATIONAL_HANDOVER.md`](OPERATIONAL_HANDOVER.md) · [`RUNBOOK_CARDS/README.md`](RUNBOOK_CARDS/README.md) · [`INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md) · [`OBSERVABILITY_DEPLOYMENT.md`](OBSERVABILITY_DEPLOYMENT.md) |
| امنیت | [`SECURITY_MODEL.md`](SECURITY_MODEL.md) · [`THREAT_MODEL.md`](THREAT_MODEL.md) · [`SECURITY_FINDINGS_REGISTER.md`](SECURITY_FINDINGS_REGISTER.md) · [`RISK_REGISTER.md`](RISK_REGISTER.md) | [`PEN_TEST_CHECKLIST.md`](PEN_TEST_CHECKLIST.md) · [`ZERO_TRUST_ARCHITECTURE.md`](ZERO_TRUST_ARCHITECTURE.md) · [`SECRETS_MANAGEMENT.md`](SECRETS_MANAGEMENT.md) |
| کسب‌وکار / حقوقی / ذی‌نفعان تجاری | [`EXECUTIVE_BRIEFING.md`](EXECUTIVE_BRIEFING.md) · [`IRAN_COMPLIANCE_PACKAGE.md`](IRAN_COMPLIANCE_PACKAGE.md) · [`PILOT_ROLLOUT_PLAN.md`](PILOT_ROLLOUT_PLAN.md) · [`GO_LIVE_PACKAGE.md`](GO_LIVE_PACKAGE.md) | [`RISK_REGISTER.md`](RISK_REGISTER.md) · [`RELEASE_NOTES.md`](RELEASE_NOTES.md) · [`EXECUTIVE_SLIDES_OUTLINE.md`](EXECUTIVE_SLIDES_OUTLINE.md) |
| مستندساز (نگه‌دارندهٔ کتابخانه) | [`DOCS_INDEX.md`](DOCS_INDEX.md) · [`DOCUMENTATION_MAINTENANCE.md`](DOCUMENTATION_MAINTENANCE.md) · [`DOCUMENTATION_MAP.md`](DOCUMENTATION_MAP.md) · [`DOCS_METRICS.md`](DOCS_METRICS.md) | [`DOCS_EXPORT_GUIDE.md`](DOCS_EXPORT_GUIDE.md) · [`DOCUMENTATION_HANDOVER.md`](DOCUMENTATION_HANDOVER.md) |
| تیم آینده / نسل بعد | [`LESSONS_LEARNED.md`](LESSONS_LEARNED.md) · [`OPERATIONAL_HANDOVER.md`](OPERATIONAL_HANDOVER.md) | [`DOCS_INDEX.md`](DOCS_INDEX.md) · [`RISK_REGISTER.md`](RISK_REGISTER.md) |

> مسیرهای مطالعهٔ عمیق‌تر: بسته‌های مخاطب‌محور در `docs/DOCUMENTATION_HANDOVER.md`.

---

## بخش ۵: نمایه بر اساس موج (Wave)

| موج | اسناد مرتبط |
|---|---|
| موج ۱ | [`WAVE1_READS_INVENTORY.md`](WAVE1_READS_INVENTORY.md) · [`WAVE1_WRITES_INVENTORY.md`](WAVE1_WRITES_INVENTORY.md) |
| موج ۳ | [`WAVE3_QUERY_PERFORMANCE.md`](WAVE3_QUERY_PERFORMANCE.md) |
| موج ۵ | [`WAVE5_AUTHZ.md`](WAVE5_AUTHZ.md) |
| موج ۶ | [`WAVE6_REDIS_AUDIT.md`](WAVE6_REDIS_AUDIT.md) |
| موج ۷ | [`WAVE7_OFFLINE_QUEUE.md`](WAVE7_OFFLINE_QUEUE.md) |
| موج ۹ | [`WAVE9_PERFORMANCE.md`](WAVE9_PERFORMANCE.md) |
| موج ۱۰ | [`WAVE10_DB_SCALE.md`](WAVE10_DB_SCALE.md) |
| موج ۱۱ | [`WAVE11_CACHE_STRATEGY.md`](WAVE11_CACHE_STRATEGY.md) |
| موج ۱۲ | [`WAVE12_NETWORK_EDGE.md`](WAVE12_NETWORK_EDGE.md) |
| موج ۱۳ | [`WAVE13_ASVS_AUDIT.md`](WAVE13_ASVS_AUDIT.md) |
| موج ۱۴ | [`WAVE14_OBSERVABILITY.md`](WAVE14_OBSERVABILITY.md) |
| موج ۱۸ | [`WAVE18_LOAD_TEST_PLAN.md`](WAVE18_LOAD_TEST_PLAN.md) |
| موج ۱۹ | [`WAVE19_CHAOS_PLAN.md`](WAVE19_CHAOS_PLAN.md) |

> موج‌هایی که سند مستقل ندارند (۲/۴/۸/۱۵/۱۶/۱۷ و…) در گزارش‌های تجمیعی
> «`NATIONAL_ROADMAP_PROGRESS.md`» و «`PERFORMANCE_BENCHMARKS.md`» پوشش داده شده‌اند.

---

## بخش ۶: نمایه بر اساس مأموریت (چت ۶)

| مأموریت | اسناد تولیدشده |
|---|---|
| مأموریت‌های نخست (بازیابی و یکپارچگی) | بازیابی درخت کاری پس از ریست سندباکس — بدون سند تازه |
| ممیزی یکپارچگی پس از ریست + مدیریت رازها | «`POST_RESET_INTEGRITY_REPORT.md`» · «`SECRETS_MANAGEMENT.md`» |
| بستهٔ تحویل عملیاتی | «`OPERATIONAL_HANDOVER.md`» |
| بنچمارک‌های تجمیعی | «`PERFORMANCE_BENCHMARKS.md`» |
| کارت‌های ران‌بورد | «`RUNBOOK_CARDS/`» (۱۱ سند) |
| راهنماهای کاربران نهایی | «`user-guides/`» (۵ سند) |
| واژه‌نامهٔ جامع | «`GLOSSARY.md`» |
| ثبت یافته‌های امنیتی | «`SECURITY_FINDINGS_REGISTER.md`» |
| گزارش جامع پوشش تست | «`TEST_COVERAGE_REPORT.md`» |
| رجیستر جامع ریسک | «`RISK_REGISTER.md`» |
| راهنمای نگهداری + چک‌لیست آنبوردینگ | «`DOCUMENTATION_MAINTENANCE.md`» · «`ONBOARDING_CHECKLIST.md`» |
| نقشهٔ مستندات و کاتالوگ متادیتا | «`DOCUMENTATION_MAP.md`» + «`tools/docs-metadata.js`» |
| بستهٔ خلاصهٔ مدیریتی | «`EXECUTIVE_BRIEFING.md`» · «`EXECUTIVE_SLIDES_OUTLINE.md`» |
| درس‌آموخته‌ها و بازنگری پروژه | «`LESSONS_LEARNED.md`» |
| به‌روزرسانی یادداشت انتشار به آرسی۱۷ | «`RELEASE_NOTES.md`» |
| مشخصات اوپن‌ای‌پی‌آی و مرجع ای‌پی‌آی | «`API_REFERENCE.md`» + «`openapi.yaml`» |
| مرجع پیکربندی | «`CONFIGURATION_REFERENCE.md`» + «`tools/config-audit.js`» |
| پلی‌بوک عملیات پایلوت | «`PILOT_OPERATIONS_PLAYBOOK.md`» |
| پلی‌بوک ارزیابی و آنبوردینگ وندور | «`VENDOR_PLAYBOOK.md`» |
| مسیر جامع آنبوردینگ | «`MASTER_ONBOARDING_PATH.md`» |
| پلی‌بوک نجات کامیت‌های پوش‌نشده | «`PUSH_RECOVERY_PLAYBOOK.md`» |
| رجیستری مرکزی باندل‌ها | «`BUNDLE_REGISTRY.md`» |
| راهنمای بازیابی باندل جامع (همین مأموریت) | «`RECOVERY_INSTRUCTIONS.md`» |

> جزئیات هر مأموریت در ورودی‌های `HANDOFF.md` و گزارش‌های `/home/user/MISSION_*.md` ثبت است.

---

## بخش ۷: اسناد یتیم (Orphan)

سند یتیم سندی است که **هیچ سند دیگری** به آن ارجاع نمی‌دهد (قاعدهٔ §۱ راهنمای نگهداری).

**وضعیت در لحظهٔ نگارش: صفر سند یتیم.** ✅

حین ساخت این نقشه، ۵ سند یتیم کشف و رفع شد:

| سند یتیم | رفع |
|---|---|
| `RUNBOOK_CARDS/BACKUP_RESTORE.md` · `RUNBOOK_CARDS/SERVICE_ROLLBACK.md` | ارجاع نسبی هم‌پوشه‌ای بود که کاتالوگ نمی‌دید — ابزار پشتیبانی از لینک نسبی گرفت؛ فهرست `RUNBOOK_CARDS/README.md` از قبل برقرار بود |
| `pilot/README.md` · `pilot/SCHOOL_INTRO.md` · `pilot/PARENT_CONSENT_FORM.md` | فقط به پوشه ارجاع می‌شد — ارجاع صریح هر سه فایل به پیش‌شرط‌های §۰ «`PILOT_ROLLOUT_PLAN.md`» افزوده شد |

> پایش: `node tools/docs-metadata.js` در هر اجرا یتیم‌ها را چاپ می‌کند؛ بازبینی هفتگی با مستندساز.

---

## بخش ۸: اسناد قطب (Hub) — پراستفاده‌ترین‌ها

این اسناد بیشترین ارجاع ورودی را دارند؛ **نقاط ثقل کتابخانه**اند و هر ویرایششان باید با
احتیاط مضاعف (بامپ + بازبینی ارجاع‌دهنده‌ها) همراه باشد:

| رتبه | سند | ارجاع ورودی | دسته |
|---:|---|---:|---|
| ۱ | [`CAPACITY_MODEL.md`](CAPACITY_MODEL.md) | ۵۳ | ۲.۱ استراتژی و برنامه‌ریزی |
| ۲ | [`AI_PROMPT.md`](AI_PROMPT.md) | ۴۹ | عمومی/بدون طبقه در نمایه |
| ۳ | [`INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md) | ۴۷ | ۲.۴ پایایی |
| ۴ | [`PRODUCTION_RUNBOOK.md`](PRODUCTION_RUNBOOK.md) | ۴۵ | ۲.۴ پایایی |
| ۵ | [`ARCHITECTURE_DECISIONS.md`](ARCHITECTURE_DECISIONS.md) | ۴۴ | ۲.۱۱ بایگانی و تاریخچه (⚪ منجمد — مرجع فنی نیستند) |
| ۶ | [`DR_RUNBOOK.md`](DR_RUNBOOK.md) | ۴۴ | ۲.۴ پایایی |
| ۷ | [`GO_LIVE_PACKAGE.md`](GO_LIVE_PACKAGE.md) | ۴۳ | ۲.۵ بهره‌برداری و انتشار |
| ۸ | [`PLAN_PHONE_AUTH.md`](PLAN_PHONE_AUTH.md) | ۴۳ | ۲.۱۱ بایگانی و تاریخچه (⚪ منجمد — مرجع فنی نیستند) |
| ۹ | [`DOCS_INDEX.md`](DOCS_INDEX.md) | ۴۲ | عمومی/بدون طبقه در نمایه |
| ۱۰ | [`LOAD_TEST_PLAN.md`](LOAD_TEST_PLAN.md) | ۴۲ | ۲.۱۱ بایگانی و تاریخچه (⚪ منجمد — مرجع فنی نیستند) |

---

## تاریخچهٔ نسخه

| نسخه | تاریخ | تغییر |
|---|---|---|
| ۱.۰.۰ | ۲۰۲۶-۰۹-۱۱ | نسخهٔ اولیه — کاتالوگ زنده + نقشهٔ هشت‌بخشی؛ قفل `rc15` — چت ۶ |
| ۱.۰.۱ | ۲۰۲۶-۰۹-۱۱ | همگام‌سازی با قفل `rc16`: بستهٔ خلاصهٔ مدیریتی + به‌روزرسانی شمارها و نقش «ذی‌نفعان تجاری» — چت ۶ |
| ۱.۰.۲ | ۲۰۲۶-۰۹-۱۱ | همگام‌سازی با قفل `rc17`: درس‌آموخته‌ها + نقش «تیم آینده» + بازتولید حرارتی/کلیدواژه/قطب‌ها — چت ۶ |
| ۱.۰.۳ | ۲۰۲۶-۰۹-۱۱ | همگام‌سازی با قفل `rc18`: به‌روزرسانی یادداشت انتشار — چت ۶ |
| ۱.۰.۴ | ۲۰۲۶-۰۹-۱۱ | همگام‌سازی با قفل `rc19`: مشخصات اوپن‌ای‌پی‌آی + مرجع ای‌پی‌آی — چت ۶ |
| ۱.۰.۵ | ۲۰۲۶-۰۹-۱۱ | همگام‌سازی با قفل `rc20`: مرجع پیکربندی + ابزار ممیزی آن — چت ۶ |
| ۱.۰.۶ | ۲۰۲۶-۰۹-۱۱ | همگام‌سازی با قفل `rc21`: پلی‌بوک عملیات پایلوت — چت ۶ |
| ۱.۰.۷ | ۲۰۲۶-۰۹-۱۱ | همگام‌سازی با قفل `rc22`: پلی‌بوک ارزیابی و آنبوردینگ وندور — چت ۶ |
| ۱.۰.۸ | ۲۰۲۶-۰۹-۱۱ | همگام‌سازی با قفل `rc23`: مسیر جامع آنبوردینگ — چت ۶ |
| ۱.۰.۹ | ۲۰۲۶-۰۹-۱۱ | همگام‌سازی با قفل `rc24`: پلی‌بوک نجات کامیت‌های پوش‌نشده — چت ۶ |
| ۱.۰.۱۰ | ۲۰۲۶-۰۹-۱۱ | همگام‌سازی با قفل `rc25`: رجیستری مرکزی باندل‌ها — چت ۶ |
| ۱.۰.۱۱ | ۲۰۲۶-۰۹-۱۱ | همگام‌سازی با قفل `rc26`: راهنمای بازیابی باندل جامع — چت ۶ |
