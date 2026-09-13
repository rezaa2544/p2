# 🚌 رجیستری باز-فکتور — Bus Factor Registry

**نسخه:** ۱.۰.۰ | **تاریخ:** ۲۰۲۶-۰۹-۱۳ | **مالک:** چت ۱۰ (آرنا ۱۰)
**وضعیت:** owner/bbackup به‌تفکیک زیرسیستم حیاتی — انتساب انسانی نهایی **NOT-RUN** (نیازمند ناظر)
**مرجع‌ها:** [آمادگی عملیاتی](OPERATIONAL_READINESS.md) · [برنامهٔ آن‌کال](ONCALL_SCHEDULE.md) · [پلی‌بوک حادثه](INCIDENT_PLAYBOOK.md) · [ثبت ریسک](RISK_REGISTER.md)

> **نامتغیر (invariant):** هیچ زیرسیستم حیاتی نباید تک‌مالکه باشد — هر ردیف باید owner + backup + runbook زنده داشته باشد.
> ردیفِ بدون بکاپِ فعال = ریسک باز در [RISK_REGISTER](RISK_REGISTER.md). بازبینی این جدول: ماهانه.

---

## ۱) جدول زیرسیستم‌ها

| زیرسیستم حیاتی | Owner (تیم/چت) | Backup | Runbook | آخرین drill/اثبات |
|---|---|---|---|---|
| PostgreSQL (HA + PITR) | چت ۱ (داده) | چت ۲ | [DR_RUNBOOK §۱/§۴](DR_RUNBOOK.md) | drill در WAVE16 — تاریخ در [WAVE16_DISASTER_RECOVERY](WAVE16_DISASTER_RECOVERY.md) |
| Redis / کش و صف | چت ۴ (ظرفیت) | چت ۱ | [DR_RUNBOOK §۲](DR_RUNBOOK.md) + [HA_REDIS](HA_REDIS.md) | chaos ردیس در Wave 19 ([WAVE19_CHAOS_LIVE_REPORT](WAVE19_CHAOS_LIVE_REPORT.md)) |
| پروتکل sync / تعارض‌ها | چت ۳ (sync) | چت ۵ | شواهد: `tests/sync-conflict-storm-drill.js` + `tests/offline-e2e.js` | ۲۰۲۶-۰۹-۱۳ (storm-drill ‏18/18، دور جاری) |
| ظرفیت/بار ملی | چت ۴ (ظرفیت) | چت ۱ | [CAPACITY_MODEL](CAPACITY_MODEL.md) | اثبات بار واقعی: **NOT-RUN** (Wave 18) |
| امنیت / مدل مجوز | چت ۲ (امنیت) | ناظر (تا تعیین backup انسانی) | [THREAT_MODEL](THREAT_MODEL.md) + [AUTHORIZATION_MODEL](AUTHORIZATION_MODEL.md) | گیت‌های امنیتی سبز؛ drill امنیتی: **NOT-RUN** |
| رصد/آلارم (Prometheus/Grafana/Loki) | چت ۴ | چت ۱۰ | [OBSERVABILITY_DEPLOYMENT](OBSERVABILITY_DEPLOYMENT.md) | استقرار زنده مستند؛ drill سکوت‌آلارم: **NOT-RUN** |
| حاکمیت اسناد / انتشار | چت ۶ | چت ۸ | [DOCUMENTATION_HANDOVER](DOCUMENTATION_HANDOVER.md) | قفل rc40 فعال (‏2026-09-13) |
| عملیات حادثه / آن‌کال | چت ۱۰ | چت ۵ | [INCIDENT_PLAYBOOK](INCIDENT_PLAYBOOK.md) | این دور (مستندات)؛ tabletop اول: **NOT-RUN** |

**هشدارهای باز (bus factor = ۱):**
1. امنیت: backup انسانی ندارد (موقت: ناظر) → اقدام: تعیین backup انسانی تا ۱ هفته پس از ACCEPT تیم.
2. ظرفیت: اثبات بار واقعی نشده → backup (چت ۱) تا Wave 18 روی مدلِ اثبات‌نشده تکیه دارد → اقدام: drill مشترک چت ۱+۴ در Wave 18.
3. رصد: drill «سکوت آلارم‌ها» هرگز اجرا نشده → اقدام: اولین tabletop چت ۱۰ روی همین سناریو.

---

## ۲) ماتریس پوشش مرخصی (Vacation Coverage)

| اگر غایب باشد… | پوشش می‌دهد… | شرط |
|---|---|---|
| Owner هر زیرسیستم | Backup همان ردیف | بکاپ باید آخرین drill آن زیرسیستم را دیده/خوانده باشد |
| Owner + Backup هم‌زمان | نزدیک‌ترین مالک همسایه (به تشخیص IC کشیک) + تشدید به ناظر | فقط برای P0/P1؛ P2/P3 تا بازگشت صبر می‌کنند |
| تیم آن‌کال (هر دو) | مالک تقویم از همین جدول نزدیک‌ترین بکاپ را فرا می‌خواند | [ONCALL_SCHEDULE §۴](ONCALL_SCHEDULE.md) |

قاعده: owner و backup یک زیرسیستم حیاتی **هم‌زمان به مرخصی نمی‌روند** (مگر با جانشین کتبی تأییدشده).

---

## ۳) چک‌لیست انتقال دانش (Knowledge Transfer)

برای ارتقای هر backup به «فعال» (قادر به اجرای runbook بدون کمک):

- [ ] خواندن runbook آن ردیف + اجرای یک drill سایه (shadow) کنار owner
- [ ] اجرای مستقل یک drill در staging (شاهد: گزارش drill با نام مجری)
- [ ] آشنایی با داشبورد/آلارم‌های مرتبط (لینک مستقیم در runbook)
- [ ] ثبت نام در جدول §۱ + تاریخ فعال‌سازی
- [ ] مرور ۳ ماهه: اگر backup در ۳ ماه هیچ drill/حادثه‌ای ندیده، وضعیت به «غیرفعال» برمی‌گردد تا drill جبرانی

---

## ۴) NOT-RUN صادقانه

- انتساب **انسانی** owner/backup (نام واقعی) — امروز مالکیت در سطح چت/تیم است؛ نگاشت به افراد نیازمند ACCEPT ناظر.
- تاریخ‌های drill آینده (tabletop ماهانه، chaos فصلی، restore سالانه) — برنامه در [OPERATIONAL_READINESS §۷](OPERATIONAL_READINESS.md)، اجرا NOT-RUN.

---

## ۵) تاریخچهٔ نسخه

| نسخه | تاریخ | تغییر |
|---|---|---|
| ۱.۰.۰ | ۲۰۲۶-۰۹-۱۳ | نسخهٔ اولیه — چت ۱۰، دور ۱ |
