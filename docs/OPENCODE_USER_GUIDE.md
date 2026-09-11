# راهنمای کاربر — تحویل باندل به OpenCode (Push Collector)

**وضعیت:** `C:\p2` روی `main` است و OpenCode پوش را تأیید کرده. صف PR خالی است (۰ باز). باندل‌های محلی چت‌ها (که در سندباکس آرنا گیر کرده‌اند) از این مسیر وارد مخزن می‌شوند.

## مسیرها

| چیز | مسیر |
|---|---|
| مخزن | `C:\p2` (بدون space — عمداً) |
| پوشه تحویل باندل | `C:\bundles\` |
| لاگ واچر | `C:\bundles\push-log.txt` |
| سوابق پردازش‌شده | `C:\bundles\processed.txt` |
| اسکریپت واچر | `C:\p2\tools\push-bundles.ps1` |

## چطور باندل را از Arena دانلود کنم؟ (قدم‌به‌قدم)

> **نکته مهم:** OpenCode به سندباکس‌های آرنا دسترسی ندارد. فقط شما (کاربر) می‌توانید فایل را بیرون بیاورید.

1. به سشن/چت مورد نظر در Arena برگردید (همان چتی که باندل را ساخته).
2. در ترمینال همان سندباکس، باندل را بسازید (اگر نساخته‌اید):
   ```bash
   cd /home/user/p2
   git bundle create /home/user/<name>.bundle <branch> --not origin/main
   git bundle verify /home/user/<name>.bundle
   ```
3. فایل `/home/user/<name>.bundle` را از طریق رابط Arena **دانلود** کنید.
4. در ویندوز آن را داخل **`C:\bundles\`** کپی کنید (تغییر نام ندهید).
5. تمام. واچر (هر ۵ دقیقه) یا اجرای دستی، آن را می‌گیرد:
   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\p2\tools\push-bundles.ps1 -Once
   ```
6. نتیجه را در `C:\bundles\push-log.txt` ببینید. پس از موفقیت، کامیت مرج روی `origin/main` است و سوابق در `HANDOFF.md` ثبت می‌شود.

## لیست باندل‌های اولویت‌دار (به همین ترتیب تحویل دهید)

| # | نام فایل | محتوا |
|---|----------|-------|
| 1 | `chat7-final.bundle` | ۳۸ کامیت، Wave 8 audit (چت ۷) |
| 2 | `p0-2-close-v5.bundle` | بستن کامل P0-2 |
| 3 | `wave19-chaos-live.bundle` | سناریوهای C1–C7 chaos |
| 4 | `delta-driver-scope.bundle` | دامنه delta |
| 5 | `feedback-widget.bundle` | ویجت بازخورد |
| 6 | `a11y-rebuild.bundle` | بازسازی a11y کامل |
| 7 | `master-onboarding.bundle` | مستندات آنبوردینگ |
| 8 | `vendor-playbook.bundle` | مستندات vendor |

> اگر sandbox یک چت **بسته شده** باشد، باندل آن از دست رفته است؛ آن کار باید از روی `main` فعلی دوباره انجام شود (چیز دیگری را تحویل ندهید).

## قوانین واچر (خلاصه — جزئیات در خود اسکریپت)

- هر باندل = **یک merge-commit جدا** (`merge: integrate <name>`)، به ترتیب الفبا.
- قبل از هر push: گیت‌ها (`build --check`، `check-authz`، `secret-scan`، و `smoke` اگر `jsdom` موجود باشد). **تست قرمز = توقف، بدون push.**
- کانفلیکت به‌صورت خودکار keep-both نمی‌شود (نیازمند قضاوت معنایی است): اسکریپت مرج را abort می‌کند، در لاگ `STOP` می‌نویسد و منتظر رسیدگی می‌ماند.
- اگر `main` محلی از `origin/main` جلوتر باشد، ابتدا `origin/main` مرج می‌شود.
- هر push موفق در `HANDOFF.md` ثبت و جداگانه پوش می‌شود.
- باندلِ پردازش‌شده دوباره پردازش نمی‌شود (`processed.txt`).

## اجرای خودکار هر ۵ دقیقه (اختیاری)

```powershell
schtasks /create /tn "PayeshBundleCollector" /tr "powershell -ExecutionPolicy Bypass -File C:\p2\tools\push-bundles.ps1 -Once" /sc minute /mo 5
```

## عیب‌یابی

| علامت | معنا |
|---|---|
| `no pending bundles` در لاگ | چیزی برای تحویل نیست — فایل را در `C:\bundles\` بگذارید |
| `STOP: bundle verify failed` | فایل خراب/ناقص دانلود شده — دوباره دانلود کنید |
| `STOP: gates red` | تست قرمز — لاگ گیت مربوطه را بفرستید، push نشده |
| `STOP: conflict merging` | کانفلیکت — نیازمند مرج دستی keep-both |
| `STOP: fetch origin failed` | اینترنت/DNS لحظه‌ای قطع است — خودش در دور بعد retry می‌شود |
