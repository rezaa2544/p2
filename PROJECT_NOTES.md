# پایش — سامانه هوشمند مدیریت مدرسه

## وضعیت پروژه
- **معماری:** تک‌فایلی، کاملاً آفلاین (`index.html` ~۴۲۷KB)
- **فونت:** Vazirmatn به‌صورت base64 جاسازی‌شده (بدون CDN)
- **لوگو:** جاسازی‌شده (data URI)
- **زبان/جهت:** فارسی، RTL
- **ذخیره‌سازی:** localStorage با الگوی event-log (`log` → `applyOp` → `applyLog`)
- **داده:** دیتای دمو با تولیدکننده‌ی شبه‌تصادفی (`SEED` + `rng()`) — قابل بازتولید

> ⚠️ در نسخه‌ی آپلودشده یک اسکریپت Cloudflare (`/cdn-cgi/challenge-platform`) به انتهای فایل چسبیده بود که از مرورگر تزریق شده بود؛ در ورک‌اسپیس **حذف شد**.

## نقش‌های کاربری (۶ نقش)
| نقش | کلید | توضیح |
|---|---|---|
| مدیر کل سامانه | `superadmin` | نظارت کلان، مدارس، ادارات، تقسیمات کشوری، اشتراک‌ها |
| اداره آموزش‌وپرورش | `edu_office` | داشبورد آماری منطقه، مدارس تحت پوشش |
| مدیر مدرسه | `manager` | کلاس، درس، کاربر، حضورغیاب، نمره، انضباط، امتحانات، مالی |
| دبیر | `teacher` | کلاس‌های من، ثبت نمره/حضور/انضباط، مراقبت امتحان |
| دانش‌آموز | `student` | کارنامه، برنامه، شهریه، مرخصی |
| اولیا | `parent` | پرونده فرزندان، خانواده، شهریه و اقساط، اشتراک (paywall) |

## ماژول‌های پیاده‌شده (routes)
`dashboard` · `schools` · `users` · `classes` · `subjects` · `attendance` · `grades` ·
`discipline` · `schedule` · `announcements` · `record` · `children` · `notifications` ·
`leaves` · `calendar` · `chat` · `tuition` · `mytuition` · `regions` · `exams` ·
`teachers` · `corrections` · `family` · `geo` · `offices` · `officedash` ·
`officeschools` · `subscription` · `adminsubs`

## مجموعه‌های داده (db collections)
`users` `schools` `classes` `subjects` `enrollments` `attendance` `grades` `discipline`
`schedule` `announcements` `notifications` `leaves` `messages` `tuitions` `installments`
`transactions` `exams` `exam_terms` `exam_duties` `corrections` `teacher_schools`
`parent_links` `parent_subscriptions` `parent_verifications` `subscription_payments`
`provinces` `counties` `districts` `offices` `app_settings`

## قابلیت‌های شاخص
- **تقویم جلالی کامل:** `toJalali` / `toGregorian` / `isLeapJ` / `monthMatrix` + کامپوننت date-picker (`jdate`)
- **پیمایش با دکمه Back گوشی:** `S.stack` + `history.pushState` + `goBack()`
- **Paywall اولیا:** `parentLocked()` → `viewLocked()`؛ فقط `subscription`/`notifications`/`announcements` باز است
- **دروازه‌ی احراز ولی:** `parentGate()` + `validNid()` (اعتبارسنجی کد ملی) + `makeNid()`
- **چاپ رسید:** `printReceipt()` — تولید سند مستقل با auto-print
- **تقسیمات کشوری:** استان → شهرستان → منطقه → اداره
- **ریسپانسیو موبایل:** ۳ اندازه‌ی گوشی تست‌شده

## تست‌های انجام‌شده (طبق چت قبلی)
| بخش | نتیجه |
|---|---|
| تک‌فایلی (فازهای ۱۱ تا ۱۶) | ✅ |
| سرور (۱۶ فاز) | ۷۳۹ ✅ / ۰ ❌ |
| رابط کاربری موبایل | ۱۱۴ ✅ / ۰ ❌ (شامل ۷ صفحه‌ی جدید در ۳ اندازه) |
| **مجموع** | **۱۲۲۸ سناریو، بدون خطا** |

## قرارداد کاری
> هر قابلیت جدید **همزمان در هر دو نسخه** (تک‌فایلی و سرور) پیاده و تست می‌شود.

## کارهای بعدی
- [ ] (در انتظار تعیین توسط کاربر)

## نحوه‌ی اجرا
```bash
cd /home/user/payesh && python3 -m http.server 3000 --bind 0.0.0.0
```
