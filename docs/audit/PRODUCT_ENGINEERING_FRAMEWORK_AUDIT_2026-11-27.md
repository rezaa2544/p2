# ممیزی تطبیقیِ فریم‌ورک product-engineering با p2 — ردیف ۴۷ (۲۰۲۶-۱۱-۲۷)

> **تسک:** خروجی = جدول تطبیق «موجود/خلأ/تعارض»، نه نصب کور. فریم‌ورک: `phuryn/product-engineering` (MIT) — ۶ پک، **۳۷ فایل SKILL.md** (شرحِ ردیف «۳۸» گفته بود — شمارشِ واقعیِ ریپو = ۳۷؛ اختلاف ثبت شد).
> **روش:** کلونِ shallow از HEAD فریم‌ورک، استخراجِ name/description هر skill، تطبیق با دارایی‌های واقعیِ p2 روی HEAD `d878e624` (گیت strict = VERIFIED 32/32، CI سبز).
> **قانونِ توزیع:** هر جا p2 قانونِ قوی‌تری دارد، «تعارض» = برنده p2 است؛ هیچ گیت یا الگوی p2 با نصبِ فریم‌ورک جایگزین/تضعیف نمی‌شود.

## جدول تطبیق

| # | پک | Skill | وضعیت در p2 | مرجع/شاهد | حکم |
|---|---|---|---|---|---|
| 1 | agent-harness | agent-instructions | **موجود** | AGENTS.md/CLAUDE.md + قانون طلایی + Rule 15 | — |
| 2 | agent-harness | flight-deck | **موجود** | CURRENT_WORK_EXECUTION_PLAN + CURRENT_PROJECT_INTELLIGENCE + چک‌پوینت‌ها | — |
| 3 | agent-harness | guardrail-hooks | **موجود (شکلِ گیت)** | strict gate + parity + secret-scan + docs-freeze | خلأ جزئی: pre-commit محلی نداریم (کم‌ارزش؛ CI مرجع است) |
| 4 | agent-harness | handover | **موجود** | docs/HANDOFF.md + آیین چک‌پوینت | — |
| 5 | agent-harness | retro | **موجود** | skill-observations/log.md + experience-store | — |
| 6 | agent-harness | windows-agent-shell | **جزئی-خلأ** | درس‌های MSYS/quoting در HANDOFF پراکنده | کاندید: سندِ یکپارچهٔ «قوانین شل ویندوزی» (کم‌هزینه) |
| 7 | agent-teams | delegation | **موجود** | Atria Operating Model + Hermes + شبکهٔ 16-view | — |
| 8 | ai-shipping | code-review | **موجود** | CodeRabbit + قراردادِ رفع عیب ۸-مرحله‌ای | — |
| 9 | ai-shipping | derive-tests | **موجود** | test-coverage-report-coverage (33/33) + parity P-سوئیت‌ها | — |
| 10 | ai-shipping | document-app | **موجود** | docs/ + REPOSITORY_MAP + DOCS_INDEX (۶۱۶+ سطر) | — |
| 11 | ai-shipping | independent-review | **موجود** | M15_GOVERNANCE_ACCEPTANCE (reviewer = Hermes با تفویض مکتوب) | — |
| 12 | ai-shipping | intended-vs-implemented | **موجود** | auditهای wave/سند شکاف ۲۰۲۶-۱۰-۰۵ | — |
| 13 | ai-shipping | release-gate | **موجود (قوی‌تر)** | RELEASE_GATE_EVIDENCE + strict gate 32/32 با اثبات منفی | تعارض: رویهٔ فریم‌ورک ساده‌تر است — p2 برنده |
| 14 | ai-shipping | ship-check | **موجود (قوی‌تر)** | بستهٔ closure M15-01 (مستند ۶۲۷-تستی + artifact-audit) | — |
| 15 | ai-shipping | shipping-artifacts | **موجود** | docs/verification/evidence/** + ZIPهای artifact-audit | — |
| 16 | ai-shipping | static-audit | **موجود** | SAST/WAF + آدیت‌های perf (RELIABILITY_GAP_AUDIT) | — |
| 17 | ai-shipping | test-harness | **موجود (قوی‌تر)** | رانر canonical + parity contract 47/47 | — |
| 18 | app-stack | app-lifecycle | **موجود** | ROADMAP + Master Schedule + done-when هر M15 | — |
| 19 | app-stack | clerk-production | **تعارض-ابزاری** | p2 احرازِ خودش را دارد (248 تست authz-model) | n/a — نصب ممنوع |
| 20 | app-stack | embedded-agents | خارج از scope | p2 محصولِ پایش است؛ ایجنتِ درون‌اپ نداریم | تصمیمِ مالک (نیاز محصولی ثبت نشده) |
| 21 | app-stack | environments | **موجود** | env-flags coverage ~۸۰٪ + CONFIGURATION_REFERENCE | — |
| 22 | app-stack | legal-pages | **خلأ (مشروط)** | p2 داخلی/مدرسه‌ای است؛ صفحات حقوقی ندارد | فقط اگر عمومی شود — تصمیمِ مالک |
| 23 | app-stack | mcp-server | خارج از scope | هیچ MCP/پلاگینی در محصول نیست | n/a |
| 24 | app-stack | product-analytics | **خلأ (عمدی-محرمانه)** | دادهٔ دانش‌آموز = حساس؛ analytics بیرونی ریسک حریم خصوصی | تصمیمِ مالک؛ به‌طور پیش‌فرض نصب نمی‌شود |
| 25 | app-stack | saas-authorization | **موجود (قوی‌تر)** | ABAC+RBAC + RLS + tombstone + 7 تست اجباری isolation | تعارض: مدلِ فریم‌ورک ساده‌تر — p2 برنده |
| 26 | app-stack | supabase-production | **جزئی-موجود** | RLS روی PG خودِ p2 (m15-03؛ 030_rls) ولی بدون Supabase | n/a ابزار؛ الگوی deny-all RLS = هم‌راستا ✓ |
| 27 | app-stack | transactional-email | **موجود به شکلِ SMS** | sms_log/sms_wallet + notify_queue | ایمیل = تصمیم محصولیِ مالک |
| 28 | app-stack | ui-design | جزئی | a11y-runtime + تست‌های رندر؛ فایلِ رسمی design-system نداریم | خلأ کم‌الویت؛ خارج از این تسک |
| 29 | app-stack | uptime-monitoring | **موجود (قوی‌تر)** | استک observability + ApiDown (dead-man) + کاتالوگ ۱۲ آلارم | — |
| 30 | product | beachhead-segment | خارج از scope مهندسی | — | مالک |
| 31 | product | competitor-analysis | خارج از scope مهندسی | — | مالک |
| 32 | product | growth-loops | خارج از scope مهندسی | — | مالک |
| 33 | product | market-segments | خارج از scope مهندسی | — | مالک |
| 34 | product | propose | خارج از scope مهندسی | — | مالک |
| 35 | product | start-here | خارج از scope مهندسی | — | مالک |
| 36 | product | value-curve | خارج از scope مهندسی | — | مالک |
| 37 | product | value-proposition | خارج از scope مهندسی | — | مالک |
| — | work-humanizer | work-humanizer | n/a | ابزار سبکِ نگارش؛ نیازی در p2 نیست | n/a |

## جمع‌بندی
- **پوشش:** ۱۷/۳۷ کاملاً پوشیده (بیشترِ آن‌ها با گیت‌های **قوی‌تر** از معادلِ فریم‌ورک)؛ ۴ مورد جزئی؛ ۸ مورد خارج از scope/تعارض-ابزاری (نصب ممنوع/مالکی)؛ ۸ مورد product = دامنهٔ مالک.
- **توصیه‌های قابل‌اجرا (بدون نصبِ فریم‌ورک):**
  1. **پیشنهادِ کم‌هزینه:** سندِ یکپارچهٔ «قوانین شلِ ویندوزی برای agentها» (skill 6) — تجمیعِ درس‌های پراکندهٔ MSYS/quoting/CRLF که امشب دوباره ثابت شدند (رفعِ مانعِ مونتِ ZAP با MSYS_NO_PATHCONV).
  2. **پیشنهادِ اختیاری:** الگوی guardrail-hooks به‌شکل pre-commit سبک محلی (skill 3) — ارزش پایین چون CI مرجعِ الزام است.
- **هیچ‌چیز نصب نشد** — مطابقِ خودِ تسک. نصبِ پکیج‌ها یا تغییرِ گیت‌های p2 بر اساس این فریم‌ورک ممنوع است مگر با تسک و تأییدِ جدا.
- **ردیف‌های ۴۸/۴۹:** ۴۸ (دروازهٔ انتشار) = تعویقِ صریحِ مالک؛ ۴۹ (پایلوت Deep Eye) = اجرا در محیط ایزوله با دیتای ساختگی طبق خط قرمزِ ثبت‌شده — جداگانه در نوبت خودش.
