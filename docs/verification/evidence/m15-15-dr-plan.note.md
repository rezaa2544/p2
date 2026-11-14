# M15-15 — برنامهٔ بازیابی فاجعه (DR Plan): راستی‌آزماییِ روی HEAD

**تاریخ:** 2026-11-14 · **سوئیت‌ها:** spot-check ۳/۳ سبز + CI کامل سبز · **کد:** بدونِ تغییر (تحویلِ کاملِ موجود)

## نقشهٔ تحویلِ موجود (همه روی HEAD)

| لایه | فایل/ابزار | نقش |
|---|---|---|
| برنامه | `docs/RELIABILITY_DR_PLAN.md` (۲۵۶ خط) | RPO/RTO، طبقه‌بندیِ پشتیبان، §۳.۱ مانورِ شبانه (امروز وصل شد)، §۴ مانورهای دوره‌ای |
| موتورِ DR | `server/dr.js` (28KB) | createDR + MAGIC/MANIFEST + DEFAULT_RPO_S/RTO_S — نسخه‌برداری/رمزگذاری |
| runbook | `tests/dr-runbook.js` | ۳۸/۳۸ — گام‌های عملیاتی و پیش‌نیازها |
| مانورها | ۹ سوئیت `chaos-drill-*` + `chaos-drill-lib` | pg-outage، redis-outage، disk-pressure، network-degradation، api-kill، queue-outage + بوت‌استرپِ WAL |
| HA config | `tests/ha-config.js` + mutations | ۱۰۴+ چک بر compose/entrypoint/failover (CI-gated — ویندوز-محلی به دلیل WSL-bash path + CRLF قرمزِ محیطی) |
| پشتیبان | `backup-snap.js` ۱۸/۱۸ + mutations، `redis-backup.js`، `phase-c-backup-pg-noop.js` ۸/۸، `pitr-restore-args.js` | snapshot/restore/args |
| مانورِ sync | `offline-sync-drill.js`، `queue-outage-drill.js`، `sync-conflict-storm-drill.js`، `dropout*.js` + mutations | قطعی/صف/طوفانِ تعارض |

## راستی‌آزماییِ روی HEAD (2026-11-14)

- dr-runbook ۳۸/۳۸ ✓ · drills2 exit 0 ✓ · backup-snap ۱۸/۱۸ ✓ (محلی)
- ha-config: در CI سبز (رانِ cebd7136)؛ محلیِ ویندوز فقط برایِ دو چکِ محیطیِ bash -n/CRLF قرمز — همین الگوی platform-gatedِ pitr-restore-args
- امروز (M15-13): زنجیرهٔ §۳.۱ با cron + قرارداد بسته شد → `m15-13-backup-verify-drill.note.md`

## نتیجه

برنامهٔ DR فقط سند نیست: موتورِ کد (dr.js)، ابزارهای restore/verify، زمان‌بندیِ
شبانه، و ۹+ سوئیتِ مانورِ آشوب — همه روی HEAD با CI سبز.
