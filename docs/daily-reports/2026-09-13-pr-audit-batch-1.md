# ممیزی PRها — دور ۲، Batch 1 ‏(PR #136 → #102)

تاریخ: 2026-09-13 · پایه: main@`ad7ce5c` · شاخهٔ ممیزی: `fix/pr-audit-batch-2`

> ممیزی دور ۲ — همهٔ ۱۱۷ PR باقی‌مانده (پس از دور ۱: ‏#133→#119).
> روش: (۱) راستی‌آزمایی مرج `merge-base --is-ancestor` روی sha مرج هر PR نسبت به main@`ad7ce5c`؛
> (۲) نگاشت PR→فایل‌های تستی از API گیت‌هاب؛ (۳) اجرای انبوه ۲۹۵ سوئیت یکتا (node، بدون DATABASE_URL) +
> بازاجرای تکی قرمزها + baseline روی main قدیم `b53a7a7` برای تفکیک «پیش‌موجود» از «رگرسیون»؛
> (۴) گیت‌های PG-لازم روی PostgreSQL embedded واقعی 18.4 (پورت 55433).
>
> ⚠️ نکتهٔ روش‌شناسی: در میانهٔ ممیزی، درخت کاری آلوده به بقایای جهش‌آزمایی قدیمی کشف شد
> (`if(false&&...)` در گارد نقش conflicts.js + auth.js تغییریافته) — با `git checkout -- .` پاک شد و
> همهٔ قرمزها روی درخت تمیز بازسنجی شدند. سری اول قرمزهای server15 (C14) محصول همین آلودگی بود، نه رگرسیون.

### راهنمای وضعیت
- ✅ = مرج تأییدشده + سوئیت‌های مرتبط سبز (یا PR بدون سوئیت تستی مستقیم؛ merge-verified)
- ✅⚠️ = سالم؛ سوئیت مرتبط قرمزِ «پیش‌موجود» دارد (در b53a7a7 هم قرمز بود — رگرسیونِ این PR نیست)
- ⏸/✅ = بخشی NOT-RUN با دلیل محیطی (playwright نصب‌نشدنی / RAM بنچ)؛ بقیه سبز
- ❌→✅ = مشکل واقعی یافته شد؛ PR رفعِ جداگانه باز است


| PR | عنوان | sha | مرج | وضعیت | Evidence |
|---|---|---|---|---|---|
| #136 | docs: چکیدهٔ بستن حلقهٔ P1-2 + قفل rc40 + ترمیم دو بدهیِ doc | `ad7ce5c` | ✅ | ✅ | `docs-freeze-marker.js` ✅ سبز |
| #134 | docs(daily): رفع ردیف تکراری BH-mut + گزارش فاز ۱ نسخهٔ بازس | `c504fb0` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #131 | test(bh-mut): مهاجرت فایل‌های جهش به الگوی امن — فاز ۱ (۹ فا | `670be18` | ✅ | ✅ | `att2-mutations.js` ✅ سبز؛ `docs-freeze-marker.js` ✅ سبز؛ `mutant-kit-test.js` ✅ سبز؛ `otp-ratelimit-mutations.js` ✅ TIMEOUT در batch؛ بازاجرا با مهلت بلند سبز (همهٔ جهش‌ها کشته)؛ `pr74-mutations.js` ✅ سبز؛ `pubrep-mutations.js` ✅ سبز؛ `rate-limit-distributed.js` ✅ سبز؛ `rate-limit-mutations.js` ✅ سبز؛ `session-revocation-mutations.js` ✅ سبز؛ `sync-queue-caps-mutations.js` ✅ سبز؛ `wave10-pg-live-mutations.js` ✅ سبز؛ `wave23-reports-mutations.js` ✅ سبز |
| #121 | fix(p0-6): reviewer round 2 — scoped ins undo, ownership-che | `0213427` | ✅ | ✅ | `p06-sync-oom-arch.js` ✅ سبز |
| #120 | feat(wave23): تکمیل P0-1 — گزارش‌های DB-native برای academic | `2ff8e90` | ✅ | ✅ | `wave23-reports-mutations.js` ✅ سبز؛ `wave23-reports-pg.js` ✅ سبز؛ `wave23-reports-sql.js` ✅ سبز |
| #117 | docs(p5b): سبزکردنِ قرمزهای ارثی + ثبت ردهٔ گزارش‌ها + قفل r | `9ad3b08` | ✅ | ✅ | `docs-freeze-marker.js` ✅ سبز |
| #116 | docs: daily report P1-1 — users(phone) index + auth from PG  | `2adc314` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #115 | perf(p1-1): users(phone) expression index + auth lookup from | `c04955c` | ✅ | ✅ | `bench-phone-lookup-p11.js` ✅ سبز؛ `p11-phone-auth-live.js` ✅ سبز؛ `p11-phone-auth.js` ✅ سبز |
| #113 | docs: پ۰ — بهداشت ورک‌اسپیس سندباکس (۲۳۲MB→۸۹٫۴MB) + WORKSPA | `fd200be` | ✅ | ✅ | `docs-freeze-marker.js` ✅ سبز |
| #112 | fix(p0-6): reviewer fixes — ownership-guarded undo, whitelis | `39a12ea` | ✅ | ✅ | `p06-sync-oom-arch.js` ✅ سبز |
| #111 | docs: گزارش روزانهٔ P0-3/P1-1 + ROADMAP/NEXT_ACTIONS + آینهٔ | `0ff3309` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #110 | P0-3: آفلاین E2E کامل (restart واقعی+جهش ۷/۷) + P1-1: PDF E2 | `5be0893` | ✅ | ✅ | `offline-e2e-mutations.js` ✅ سبز؛ `offline-e2e.js` ✅ سبز؛ `reports-pdf-e2e.js` ✅ سبز |
| #109 | docs(p5): correct the bundle size + final main SHA | `2c3b24c` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #108 | docs(p5): record the real push evidence (SHAs + main before/ | `a800560` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #107 | docs(p5): bug-hunt queue disposition (#76/#74/#80) + freeze  | `b0132c5` | ✅ | ✅ | `docs-freeze-marker.js` ✅ سبز |
| #106 | fix(bughunt): session-7 non-token fixes split out of #74 (S7 | `5b96897` | ✅ | ✅ | `idb-migration-queue.js` ✅ سبز؛ `idb-persistence.js` ✅ سبز؛ `pr74-mutations.js` ✅ سبز؛ `route-url-guard.js` ✅ سبز؛ `sync-del-mirror.js` ✅ سبز |
| #105 | P0-4: national dataset with real relations (10 new CSVs) + i | `aa0cff5` | ✅ | ✅ | `national-dataset-integrity.js` ✅ سبز؛ `national-dataset-mutations.js` ✅ سبز |
| #104 | docs(daily-reports): P0-4/P1-3 round + migration reservation | `805a04e` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #103 | feat(p0-6): O(batch) sync undo-log + bounded mirror growth / | `8921378` | ✅ | ✅ | `p06-sync-oom-arch.js` ✅ سبز |
| #102 | feat(p0-4): national dataset load at sandbox ceiling (scale  | `ad65f9b` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
