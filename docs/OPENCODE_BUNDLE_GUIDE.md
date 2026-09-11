# 📦 OpenCode Bundle Guide — دستورالعمل گرفتن و پردازش باندل

**نسخه:** 1.0.0 | **تاریخ:** 2026-09-11 | **مالک:** OpenCode
**هم‌خانواده:** `docs/PUSH_RECOVERY_PLAYBOOK.md` · `docs/BUNDLE_REGISTRY.md` · `docs/DOCS_FREEZE_v1.0.0-rc24.md`

---

## ۱) چطور bundle از Arena بگیریم؟

### مراحل دستی

1. **Arena sandbox را باز کنید**
   - Arena → Choose Sandbox → Select chat (1-7)
   - یا Arena session آنلاین از `arena/01a08xxx-p2`

2. **فایل `.bundle` را دانلود کنید**
   - در تنظیمات نشست، فایل `/home/user/<name>.bundle` را پیدا کنید
   - یا از گزارش مأموریت مسیر باندل را بگیرید
   - مسیرها رایج:
     - `/home/user/p0-2-close-v5.bundle` (چت ۱)
     - `/home/user/chat7-final.bundle` (چت ۷)
     - `/home/user/wave19-chaos-live.bundle` (چت ۴)
     - `/home/user/delta-driver-scope.bundle` (چت ۲)

3. **در ویندوز `C:\bundles\` ذخیره کنید**
   - پوشه `C:\bundles\` از قبل ساخته شده است
   - فایل `.bundle` را مستقیماً در این پوشه قرار دهید

4. **واتچر خودکار push می‌کند**
   - اجرای `watch-bundles.ps1` باندهای جدید را تشخیص می‌دهد
   - راستی‌آزمایی + merge + گیت‌ها + push انجام می‌دهد

---

## ۲) Priority لیست باندل‌ها

| رتبه | باندل | سندباکس | کامیت | مسیر |
|---|---|---|---|---|
| **۱** | `chat7-final.bundle` | چت ۷ | **۳۸** | `C:\bundles\chat7-final.bundle` |
| **۲** | `p0-2-close-v5.bundle` | چت ۱ (P0-2) | — | `C:\bundles\p0-2-close-v5.bundle` |
| **۳** | `wave19-chaos-live.bundle` | چت ۴ | ۱۳ | `C:\bundles\wave19-chaos-live.bundle` |
| **۴** | `delta-driver-scope.bundle` | چت ۲ | — | `C:\bundles\delta-driver-scope.bundle` |
| **۵** | `feedback-widget.bundle` | چت ۳ | ۶ | `C:\bundles\feedback-widget.bundle` |
| **۶** | `a11y-rebuild.bundle` | چت ۳ | — | `C:\bundles\a11y-rebuild.bundle` |
| **۷** | `master-onboarding.bundle` | چت ۶ | ۵ | `C:\bundles\master-onboarding.bundle` |
| **۸** | `vendor-playbook.bundle` | چت ۶ | — | `C:\bundles\vendor-playbook.bundle` |

> **توجه:** چت ۵ هنوز باندل ندارد (باگ‌هانت نشست ۷). باندل بعد از اتمام مأموریت چت ۵ ساخته می‌شود.

---

## ۳) پروتکل راستی‌آزمایی

قبل از هر push، باید چهار گیت اجرا شوند:

```bash
node tests/smoke.js          # ۵۴۷/۵۴۷ ✅
node tools/check-authz.js    # ۰ ✅
node tests/secret-scan.js    # ۱۱/۱۱ ✅
node build.js --check        # exit 0 ✅
```

اگر هر کدام فشل کرد:
- **مرج انجام نشود**
- **باندل به `C:\bundles\failed\` منتقل شود**
- **گزارش به اپراتور صادر شود**

---

## ۴) قواعد Push

| قاعده | توضیح |
|-------|-------|
| هر باندل = یک merge-commit | بدون fast-forward، همیشه `--no-ff` |
| گیت‌های اجباری | smoke/547 · authz/0 · secret-scan/11 · build/0 |
| تعارض → keep-both | هیچ فایلی حذف نشود؛ ورودی‌های دو طرف بمانند |
| فشل → گزارش | به کاربر، نه سکوت |
| توکن دستی | هرگز در اسکریپت یا چت ذخیره نشود |

---

## ۵) استفاده از Watcher

```powershell
# اجرا:
powershell -ExecutionPolicy Bypass -File C:\p2\tools\watch-bundles.ps1

# خروجی نمونه:
# [14:30:00] Processing: chat7-final.bundle
# [14:30:01]   -> verify OK
# [14:30:02]   -> smoke PASSED
# [14:30:03]   -> authz PASSED
# [14:30:04]   -> secret-scan PASSED
# [14:30:05]   -> build PASSED
# [14:30:06]   -> push SUCCESS: a555174...
# [14:30:06]   -> moved to done
```

---

## ۶) بررسی وضعیت

```powershell
# باندل‌های در حال انتظار:
Get-ChildItem C:\bundles\*.bundle

# باندل‌های موفق:
Get-ChildItem C:\bundles\done\*.bundle

# باندل‌های ناموفق:
Get-ChildItem C:\bundles\failed\*.bundle
```

---

## ۷) پشتیبانی و استقرار

اگر ریست شد:
1. `C:\bundles\` محفوظ است (بیرون از ریپو)
2. `C:\p2\tools\watch-bundles.ps1` را کپی کنید
3. `C:\p2\docs\OPENCODE_BUNDLE_GUIDE.md` را کپی کنید
4. با `C:\p2` همانندسازی کنید

---

_OpenCode — مأموریت PR Creation + Bundle Collection · 2026-09-11_
