# گزارش اجرایی ساخت بسته اندروید (Android Build & Packaging Report)
## سامانه پایش (سامانه هوشمند مدیریت مدرسه)

**سند مرجع:** `docs/ANDROID_BUILD_PLAN.md` و `docs/PLAY_STORE_CHECKLIST.md`  
**تاریخ گزارش:** ۱۸ شهریور ۱۴۰۵ (2026-09-08)  
**شناسه بسته (Application ID):** `ir.payesh.app`  
**وضعیت بیلد:** ۱۰۰٪ تکمیل‌شده و بسته‌بندی نهایی در `dist/android/` (Verified & Committed)  
**نسخه خروجی:** ۱.۰.۰ (Build Code: 100)  

---

## ۱. خلاصه اجرایی و روش انتخابی (Executive Summary)

برای انتشار رسمی سامانه پایش در فروشگاه Google Play و نصب مستقیم روی دستگاه‌های هوشمند اندروید، فناوری **Trusted Web Activity (TWA / Bubblewrap)** منطبق بر استاندارد رسمی گوگل پیاده‌سازی شد. این روش با ایجاد ارتباط ایمن بین هسته وب‌اپلیکیشن آفلاین‌محور و کاور نیتیو اندروید، بالاترین سطح کارایی را بدون سربار حجمی به همراه می‌آورد.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   خلاصه وضعیت خروجی بیلد اندروید                        │
├───────────────────────────────────┬────────────────────────────────────┤
│ روش بسته‌بندی                     │ Trusted Web Activity (TWA) بومی     │
│ شناسه اپلیکیشن (Application ID)   │ ir.payesh.app                      │
│ نگارش و کد ساخت (Version)         │ Version 1.0.0 (VersionCode: 100)   │
│ محدوده سازگاری اندروید (SDK)      │ Min SDK 21 (Android 5.0) تا SDK 35 │
│ بسته نهایی گوگل‌پلی (AAB)         │ dist/android/payesh-release.aab    │
│ بسته نصب مستقیم تست (APK)         │ dist/android/payesh-debug.apk      │
│ پیوند امنیتی دیجیتال              │ dist/android/assetlinks.json       │
│ سرویس‌ورکر آفلاین و مانیفست       │ sw.js و manifest.json              │
│ دستور اجرای خودکار بیلد           │ npm run build:android              │
└───────────────────────────────────┴────────────────────────────────────┘
```

---

## ۲. دستاوردهای فنی و ساختار فایل‌های پروژه

### ۲.۱. فایل‌های PWA و وب‌اپلیکیشن
1. **`manifest.json` (Web App Manifest):**
   - نام فارسی کامل و کوتاه، رنگ سازمانی (`#1E3A8A`)، جهت RTL، حالت نمایش `standalone`، و کلیدهای میانبر سریع (حضور و غیاب / نمرات).
2. **`sw.js` (Service Worker جهت کارکرد آفلاین):**
   - راهبرد Cache-First برای پوسته و فایل‌های استاتیک و Network-First برای API با پاسخ بهینه در حالت آفلاین.

---

### ۲.۲. ساختار پروژه نیتیو اندروید (`android/`)
1. **`android/app/src/main/AndroidManifest.xml`:**
   - تنظیم مجوزهای حداقلی (`INTERNET`, `ACCESS_NETWORK_STATE`) منطبق بر خط‌مشی Data Safety گوگل‌پلی.
   - پیکربندی `LauncherActivity` از کتابخانه `androidbrowserhelper` و فیلترهای Intent برای دامنه `payesh.ir`.
2. **`android/app/build.gradle`:**
   - تنظیم `compileSdk 35` و `targetSdk 35` (سازگار با ملاک‌های ۲۰۲۶ گوگل‌پلی)، ProGuard و وابستگی‌های رسمی Google TWA.
3. **`android/assetlinks.json`:**
   - پیکربندی Digital Asset Links جهت احراز هویت خودکار دامنه و حذف کادر مرورگر.

---

### ۲.۳. ابزار بیلد خودکار (`tools/build-android.js`)
- دستور اجرایی `npm run build:android`:
  1. کامپایل بیلد وب و تولید `dist/payesh.html`.
  2. آماده‌سازی پوشه `dist/android/` و تولید آیکون‌های وکتور و رزولوشن‌های مختلف.
  3. کپی سورس پروژه گریدل در `dist/android/project/`.
  4. بسته‌بندی فایل‌های **`payesh-release.aab`** و **`payesh-debug.apk`**.

---

## ۳. بررسی چک‌لیست و الزامات گوگل‌پلی (Play Store Compliance)

- **AAB Format:** خروجی در قالب رسمی Android App Bundle (`.aab`) تولید‌شده است.
- **Target API ≥ 35:** در فایل مانیفست و گریدل مقدار `targetSdk = 35` اعمال شد.
- **Data Safety:** هیچ SDK تبلیغاتی، تحلیل‌گر شخص سوم یا دسترسی به لاگ تماس/پیامک وجود ندارد.
- **Account Deletion:** پیوند درون‌برنامه‌ای و صفحه مستقل `/account-deletion` فعال است.
- **Content Rating:** منطبق بر رده‌بندی عمومی Everyone (مخاطب سازمانی/آموزشی).

---

## ۴. تاریخچه کامیت‌ها در شاخه `main`

- `bd92ce8`: `feat: implement Android TWA build pipeline, PWA manifest, service worker, and packaging tool`
