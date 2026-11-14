# M15-13 — پشتیبان‌گیری/بازیابی: مانورِ شبانهٔ خودکار (DR §۳.۱)

**تاریخ:** 2026-11-14 · **کامیتِ evidence:** see registry · **سوئیت:** tests/drill-cron-contract.js (۱۴/۱۴)

## تحویل

زنجیرهٔ «پشتیبان → راستی‌آزماییِ شبانهٔ خودکار» بسته شد:

| بخش | فایل | نقش |
|---|---|---|
| زمان‌بندی | `infra/cron/backup-verify.cron` | هر شب ۰۳:۰۰: `pitr-restore.sh --latest` در محیطِ ایزولهٔ سنجش + لاگ |
| ابزارِ بازیابی | `tools/pitr-restore.sh` | restore از مخزن pgbackrest (S3/MinIO) + بوتِ ایزوله + promote |
| ابزارِ راستی‌آزمایی | `tools/pitr-verify.sh` | جداولِ حیاتی + سقفِ زمانیِ TIMESTAMPTZ + checksum نمونه |
| قرارداد | `tests/drill-cron-contract.js` | ۱۴ چک + اثباتِ منفیِ درون‌آزمون |

## قانونِ سبزِ کاذب — اثباتِ منفی

قرارداد، الگوهایش را روی **نسخهٔ جهش‌یافتهٔ** خطِ cron هم می‌سنجد:

- **M1:** حذفِ `--latest` ⇒ الگو رد می‌کند ✓
- **M2:** حذفِ هدایتِ لاگ `2>&1` ⇒ الگو رد می‌کند ✓
- **M3:** جهشِ verify-off + پورتِ تولیدی (5432) ⇒ الگوها رد می‌کنند ✓

چکِ C6 (`بدونِ --no-verify`) مانعِ حذفِ خاموشِ راستی‌آزمایی است — مانور بدونِ verify
«سبزِ کاذب» است و قرارداد آن را می‌بندد.

## زمان‌بندی و محیط

- `0 3 * * *` (DR §۳.۱: هر شب ۰۳:۰۰) + الگویِ env-fileِ موجود (`set -a && . .env && set +a`).
- محیطِ سنجش: `PBR_DEST_ROOT` (پیش‌فرض `/var/backups/payesh-pitr`) + پورتِ `54329` — خطِ تولید لمس نمی‌شود (fail-closed).
- گزارش: `/var/log/payesh/pitr-drill.log` + کدِ خروج ۱ در هر شکست (restore/بوت/verify).

## سند

`docs/RELIABILITY_DR_PLAN.md` §۳.۱ — پیاده‌سازی و مسیرِ فایل‌ها + اشاره به قرارداد (C10/C11).

## تأیید

- `node tests/drill-cron-contract.js` → ۱۴ passed, 0 failed (exit 0)
- Cross-platform (بدون bash/exec) — در گیتِ محلیِ Windows هم اجرا می‌شود.
- CI: runِ بعد از push — هر دو لاینِ 22/24.
