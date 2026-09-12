# گزارش روزانه — ۱۴۰۵/۰۶/۲۱ (۲۰۲۶-۰۹-۱۲): P1-2 — قطع آینه از مسیر نوشتن در PG-live (Wave 18 §۵-۳)

## شرح
الزام §۵-۳ بند ۳: «هر op پذیرفته‌شده `store[c].push(row)` و `__processed_uids[uid]` می‌شود — حتی وقتی PG مرجع است؛ پیشنهاد: در حالت PG-live، اعمال درون‌حافظه‌ای فقط برای cacheِ LRU محدود باشد؛ dedup با TTL/سقف.» بررسی کد main نشان داد **«توقف رشد» هرگز پیاده نشده بود**: هرسِ ring دورِ P0-6 فقط برای مجموعه‌های لیست‌سفید (`PAYESH_PG_MIRROR_PRUNE_SAFE`) بود و مجموعه‌های غیرِ لیست‌سفید — که اکثریت‌اند — بی‌سقف در آینه رشد می‌کردند؛ سوک P0-6 چون env لیست‌سفید را ست می‌کرد، این را نمی‌دید.

پیاده‌سازی در **PR #124** (شاخهٔ `feat/p12-mirror-write-cut`، کامیت c90fd8f70c پس از rebase روی main جدید):

| # | تغییر | طراحی |
|---|---|---|
| ۱ | **پاک‌سازی post-commit مالکیت‌دار** | مدخل‌های `k='pop'` مجموعه‌های غیر لیست‌سفید، پس از commit موفق persistOpsBatch از آینه بریده می‌شوند. مدخلِ **با after** (ins خودِ دسته) فقط وقتی می‌بُرد که رکورد فعلی آینه دقیقاً === after باشد (تغییر هم‌زمانِ دست/درخواست دیگر محفوظ می‌ماند — همان after-guard دور ۲)؛ مدخلِ **بدون after** (هیدراتاسیونِ همین دسته از findForApply) با idx/id حذف می‌شود |
| ۲ | درون‌دسته دست‌نخورده | policy و دست‌های وابستهٔ همان batch رفتار امروز را می‌بینند؛ rollback دستهٔ شکست‌خورده (undo runner) پیش از clean-up اجرا می‌شود و fail-path دقیقاً همان دور ۲ می‌ماند |
| ۳ | `sync_conflicts` همیشه لیست‌سفید | تنها read-pathی که زنده از آینه می‌خواند (conflicts.js) و بالذات bounded (resolve ⇒ del). بررسی کردم: pull از قبل از `db.readCollection` (PG وقتی live) می‌خواند → برش بر مسیر خواندن کلاینت بی‌اثر است |
| ۴ | **رفع باگ: هیدراتاسیون گِیت scope بدون undo** | کشف همین نوبت: `findForApply` در گِیتِ scope (پیش از دروازه‌ها) بدون undo صدا می‌شد → ردیف هیدراته‌شده در rollback برنمی‌گشت و در آینه می‌نشست — نشتیِ مجزای §۵-۳ که هیچ تستی نگرفته بود. حالا با undo ثبت می‌شود (rollback دقیق + برش post-commit) |
| ۵ | conflict-notification از mirrorAppend + رفع uPush دوبل | push خام حذف؛ در مرور نهایی diff، یک uPush تکراری (خط قدیمی مانده) کشف و حذف شد |
| ۶ | **dedup با TTL** | `PAYESH_UID_DEDUP_TTL_MS` (پیش‌فرض ۲۴h، هم‌پنجرهٔ کش Redis) در `pruneProcessedUids`، پیش از count-cap. مرجعِ رد (PG `server_processed_uids` / Redis) دست‌نخورده — TTL فقط حافظهٔ in-memory را سقف می‌زند، idempotency را تضعیف نمی‌کند |

## رویداد فرایندی ۱ — کامیت دور ۲ از merge #112 جا مانده بود
در آغاز P1-2 متوجه شدم تست‌های p06 در main فقط ۳۵ چک دارند (نه ۴۷). ریشه: **PR #112 با head کامیت دور ۱ (4975096) merge شده بود**؛ کامیت دور ۲ (40b773d143 — رفع ۳ باگ بازبین + U9-U11) اگرچه به شاخه پوش شده بود، در merge نیامده بود و main از آن محروم مانده بود. شاخهٔ `feat/p06-review-round2` با rebase تمیز روی main ساخته شد → **PR #119** (بدون تغییر محتوا) + کامنت توضیح در #112. **#119 توسط ناظر merge شد (5e3a8243ac)** و P1-2 روی همان درختِ کامل بنا شد.

**درس:** پس از هر merge، جا‌ماندن کامیت‌های شاخهٔ خودم را با `git merge-base --is-ancestor <sha> origin/main` راستی‌آزمایی کنم — «PR merged» به معنی «همهٔ کامیت‌ها وارد main شدند» نیست.

## رویداد فرایندی ۲ — آلودگی جهش و قرمزیِ کاذبِ sync-queue-caps
اجرای suite-بستر با اسکریپتی که فیلتر `-mutations` نداشت، فایل‌های جهشیِ غیرِالگوی-امن را اجرا کرد؛ برخی (برخلاف p06/p11) مستقیم سورسِ تولید را mutate می‌کنند و پاک‌سازی‌شان با timeout اسکریپت ناقص ماند → auth.js/conflicts.js/index.html/00-data-layer.js آلوده (`if(false) … /* MUTATION */`). نتیجه: **sync-queue-caps Q0a سه‌بار پشت‌سرهم قرمز** (len=606) در حالی که baseline سبز بود — رگرسیون به‌نظر می‌رسید ولی کاملاً آلودگی جهش index.html بود (فیلتر صف بوت خنثی شده بود). پاک‌سازی (checkout فایل‌های آلوده) و **اجرای مجدد کامل همهٔ رگرسیون‌ها روی درخت پاک** → همگی سبز.

**درس‌ها:** (۱) هرگز suite را بدون فیلتر mutations اجرا نکنم؛ (۲) «baseline سبز + تغییرات قرمز» وقتی غیرمنتظره است، اول یکپارچگی درخت را چک کنم (grep MUTATION) نه فقط flake؛ (۳) فایل‌های جهشیِ غیرِالگوی-امن باید به الگوی «کپی جدا + unlink در exit» مهاجرت کنند — در NEXT_ACTIONS ثبت شد.

## اعداد صادقانه
| گیت | نتیجه |
|---|---|
| p06-sync-oom-arch | **53/53** (۴۷ قبلی + V1-V6؛ U2i/U5c/U8a به سنجش از مرجع PG بازنویسی، U9 با env لیست‌سفید — سناریوی آینهٔ پُر) |
| جهش‌های جدید N1-N3 | **3/3 کشته** (N1: حذف clean-up → V5 قرمز · N2: برش whitelist هم → V3 قرمز · N3: حذف TTL → V6 قرمز) |
| wave1-multi-instance | **33/33** — ۴ ادعای آینده‌ای به سنجش از مرجع PG بازنویسی شد (T1e حالا برشِ post-commit را هم می‌سنجد؛ T1b/T4a/T8 خواندن شناسه از PG) |
| smoke | **547/547** (file-mode بی‌تغییر — pgLive=false ⇒ clean-up غیرفعال) |
| رگرسیون گسترده | sync-mirror-visible 6/6 · sync-atomic-batch 22/22 · bgsync 14/14 · behavior2 4/4 · att2 6/6 (+جهش 5/5) · sync-conflict-ui 12/12 · sync-del-mirror 7/7 · sync-cache-errors 7/7 · sync-chunk 28/28 · sync-dlq-retry 7/7 · sync-dup-claim 7/7 · sync-lastsync 8/8 · **sync-queue-caps 36/36 (پس از پاک‌سازی آلودگی؛ سه اجرای قرمزِ قبلی آلودگی جهش بود، نه رگرسیون)** · sync-sending-revive 7/7 · sync-virtualday-audit 7/7 · delta-sync-hardening 19/19 · pull-bootstrap · pull-rest-delete 6/6 · pull-to-refresh 15/15 · persist-roundtrip 9/9 · db-engineering 14/14 · db-replica-recovery 11/11 · lock-atomic 12/12 · cache-l2-epoch 8/8 · p11-phone-auth 17/17 |
| verify پس از rebase روی main جدید (پس از merge #119/#118/#123) | p06 53/53 · wave1 33/33 · sync-mirror-visible 6/6 · sync-atomic-batch 22/22 · bgsync 14/14 · smoke 547/547 · sync-conflict-ui 12/12 · sync-queue-caps 36/36 — force-push با `--force-with-lease` |

## یافته‌هایی که خودم رد کردم (خودبازبینی)
1. **برشِ نهفته (هرس یک‌جای مجموعه‌های بزرگ):** «هر مجموعه‌ای که بزرگ شده حذفش کنیم» دقیقاً همان باگ-۱ بازبین دور ۱ (باگ‌های هرس PR #103) را بازتولید می‌کرد. رد شد؛ برش فقط «نوشته‌های همین دسته» است — seed/آینهٔ موجود هرگز دست نمی‌خورد (U8a صریحاً می‌سنجد: مجموعهٔ مجوزیِ موجود دست‌نخورده، فقط تازه‌ها وارد نمی‌شوند).
2. **TTL در چک duplicate:** پنجره‌دار کردن ردِ درون‌حافظه‌ای idempotency را تضعیف می‌کرد و با مرجعِ دائمیِ PG (`server_processed_uids`) ناسازگار بود. TTL فقط در prune (حافظه) ماند؛ V6 رفتارِ sweep را می‌سنجد نه تضعیف رد را.
3. **هرس مجموعه‌های غیر لیست‌سفید در mirrorAppend:** رد شد — semantic لیست سفید حفظ شد (whitelist = write-through cache با هرس ring، رفتار امروز؛ غیرِ آن = برش post-commit). سازگاری env کامل.
4. **بازنویسی conflicts.js به PG-خوان:** خارج از اسکوپ P1-2؛ به‌جایش `sync_conflicts` در لیست‌سفیدِ پیش‌فرض (bounded به تعارض‌های باز). ثبت در صف برای آینده اگر read-path داوری DB-native شود.
5. **ins با id موجود در PG روی آینهٔ سرد:** نخستین پیاده‌سازی، شکست کل دسته با duplicate-key می‌داد (آینه نمی‌دانست رکورد هست). بررسی showed findForApply از قبل هیدراتاسیون pre-upsert دارد → V2 این مسیر را قفل کرد (ins برخوردی → مسیر ex → موفق)؛ هیچ کد اضافه لازم نشد — فقط تست.

## وضعیت
- **PR #124** (feat/p12-mirror-write-cut → main): open، mergeable:True، rebased روی main جدید (c90fd8f70c) — در انتظار بازبینی.
- PR #119 (رفع‌های دور ۲ جا‌مانده) **merge شد** (5e3a8243ac) · PR #118 (گزارش دور ۲) **merge شد** (15f5766aac) — main اکنون هر دو دور بازبینی P0-6 و گزارش‌ها را کامل دارد.
- گام بعدی: بازخورد بازبین روی #124؛ در صورت تأیید → صف: P1-3 (public-report → aggregation سمت PG؛ هم‌پوشان با PR #93 باز) · مهاجرت فایل‌های جهش به الگوی امن (ثبت در NEXT_ACTIONS).
