# 📤 راهنمای برون‌برد مستندات — DOCS_EXPORT_GUIDE

**نسخه:** ۱.۰.۰ | **تاریخ:** ۲۰۲۶-۰۹-۱۰ | **مالک:** چت ۶ (مستندات و انتشار)
**وضعیت:** راهنمای ابزار `tools/docs-export.sh` — خروجی اچ‌تی‌ام‌ال برون‌خطی از کتابخانهٔ `docs/`
**مرجع‌ها:** `docs/DOCUMENTATION_HANDOVER.md` §۴ · `docs/DOCS_INDEX.md`

---

## ۱) چرا برون‌برد؟

- مرور کتابخانه بدون ریپو/ساندباکس (ارائه به ذی‌نفعان، آفلاین).
- نسخهٔ قابل آرشیو در لحظهٔ قفل (نگاهید به `docs/DOCS_FREEZE_v1.0.0-rc1.md`).
- قالبی که راست‌به‌چپ و فونت فارسی آن از پیش تنظیم شده است.

## ۲) نصب پنداک

| سیستم | دستور |
|---|---|
| دبیان/اوبونتو | `sudo apt-get update && sudo apt-get install -y pandoc` |
| مک | `brew install pandoc` |
| ویندوز | `winget install --id JohnMacFarlane.Pandoc` |
| بدون ریشه (سناریوی سندباکس) | باینری را از `github.com/jgm/pandoc/releases` بگیرید و در `PATH` بگذارید |

برای خروجی پی‌دی‌اف، موتور زلاتکس هم لازم است: `sudo apt-get install -y texlive-xetex fonts-noto` (یا فونت وزیرمتن).

## ۳) اجرا

```bash
bash tools/docs-export.sh
```

رفتار:
- اگر پنداک نبود: **کد خروجی ۰** + پیام «نصب نیست» (هیچ درب/گیتی را نمی‌شکند).
- اگر بود: همهٔ `docs/*.md` به `docs/_export/html/*.html` تبدیل می‌شوند + `docs/_export/style.css` (پوستهٔ فارسی راست‌به‌چپ) + `docs/_export/index.html` (فهرست با لینک به همه).
- خروجی هر اجرا از صفر ساخته می‌شود (`rm -rf docs/_export`) ⇒ بازتولیدپذیر؛ سربار هر اجرا حدود چند ثانیه برای ۲۰۰+ سند.

> `docs/_export/` در `.gitignore` است — هرگز کامیت نمی‌شود.

## ۴) پی‌دی‌اف تک‌سند (برای جلسات)

```bash
pandoc docs/GO_LIVE_PACKAGE.md -o payesh-go-live.pdf --pdf-engine=xelatex \
  -V lang=fa -V dir=rtl -V mainfont="Vazirmatn"
```

اگر فونت وزیرمتن ندارید، `Noto Naskh Arabic` از بستهٔ `fonts-noto` جایگزین رایگان است.

## ۵) عیب‌یابی

| علامت | اقدام |
|---|---|
| `pandoc not installed` | نصب از §۲؛ اسکریپت عمداً شکست نمی‌خورد |
| سند خاصی در فهرست نیست | خطای تبدیل همان سند چاپ می‌شود؛ جدول‌های خیلی پهن را باریک کنید |
| فونت فارسی در پی‌دی‌اف نیفتاد | `-V mainfont=` را با نام دقیق فونت نصب‌شده بدهید (`fc-list : family`) |
| می‌خواهید فقط بخشی صادر شود | اسکریپت فعلاً کل کتابخانه را صادر می‌کند؛ فیلتر قلم آینده است |
