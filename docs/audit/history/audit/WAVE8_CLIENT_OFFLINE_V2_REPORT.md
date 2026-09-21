# گزارش نهایی — موج ۸: Offline-First Enhancements (`feat/client-offline-v2`)

> تاریخ: ۲۰۲۶-۰۹-۱۱ · پایه: `main @ 8ba3462` · PR: [#58](https://github.com/rezaa2544/p2/pull/58)

## گام ۰ — اتصال‌ها

| مورد | وضعیت |
|---|---|
| GitHub (توکن، repo خصوصی rezaa2544/p2) | ✅ HTTP 200 — clone، fetch، ls-remote موفق |
| `gh` CLI | ⚠️ در محیط نصب نیست — همهٔ عملیات با git + REST API انجام شد (بدون اثر بر نتیجه) |
| ruflo 3.39.2 | ✅ نصب شد (با دو دورِ ترمیم: prefix کاربری + دانلود sql-wasm.wasm ناقص از CDN + بازسازی memory.db خراب) — `memory init/list/store/retrieve` کار می‌کند |
| `p2/roadmap-status` در حافظه | کلید وجود نداشت (حافظهٔ /tmp تازه بود) — قید شد؛ در پایان مقدار جدید ذخیره شد |

## گام ۱ — شاخه و اسناد

- `feat/client-offline-v2` از `main` ساخته شد.
- `SKILLS_MASTER.md` خوانده و رعایت شد (تک‌فایلی از src/ + build.js، تست همراه هر تغییر، esc/escAttr، بدون توکن هاردکد، Conventional Commits، هر شکاف = کامیت جدا).
- ⚠️ **قید صادقانه:** `docs/MOBILE_UX_AUDIT.md`، `docs/DATA_EXPORT.md`، `docs/PWA_HARDENING_AUDIT.md` و تست‌های `mobile-ux-audit.js`، `a11y-audit.js`، `pwa-hardening.js`، `data-export-ui.js` که در brief آمده‌اند **در مخزن وجود ندارند**. سبز جعلی گزارش نشد.

## گام ۲ — جدول شکاف‌ها

| شکاف | وضعیت | کامیت | تست |
|---|---|---|---|
| ۱. Background Sync (SW) | ✅ | `5bfde35` | `tests/bgsync.js` — **14/14** |
| ۲. Conflict Resolution UI | ✅ | `d9e240f` | `tests/sync-conflict-ui.js` — **12/12** |
| ۳. Offline Indicator | ✅ | `cad65f4` | `tests/offline-indicator.js` — **12/12** |
| ۴. Storage Quota Management | ✅ | `bc41de5` | `tests/storage-quota.js` — **14/14** |
| ۵. Pull-to-Refresh | ✅ | `bb29722` | `tests/pull-to-refresh.js` — **15/15** |
| مستندات (گام ۴) | ✅ | `beefcdd` | — |

### خلاصهٔ فنی هر شکاف

1. **Background Sync:** `sw.js` رویداد `sync` با برچسب `payesh-sync-queue`؛ `bgFlushQueue` صف را از IndexedDB (`payesh_offline_v2/sync_queue`) می‌خواند و تکه‌تکه (۲۰۰تایی) با کوکی HttpOnly به `/api/sync` می‌فرستد — **هیچ توکنی در SW نیست**. کدهای ردّ پایدار (هم‌راستا با `SYNC_DEAD_CODES`) dead می‌شوند؛ شکست شبکه → reject تا مرورگر با backoff خودش دوباره بزند. کلاینت: آینهٔ debounceشدهٔ صف در IDB (`bgMirrorQueue` — با آشتی حذف تا SW قلم مرده نفرستد)، ثبت sync در هر enqueue، و آشتی نتیجهٔ پس‌زمینه (`bgApplyResult`). *تست «تب بسته» در jsdom ناممکن است؛ قرارداد دوطرف SW↔کلاینت تست شد (شرح در `docs/OFFLINE_FIRST.md §۲`).*
2. **Conflict UI:** مودال «نسخهٔ شما رد شد / تعارض» با مقایسهٔ فیلدبه‌فیلد محلی↔سرور، تفاوت‌ها برجسته، برچسب فارسی فیلدها، XSS بسته (پروب تست C11). `conflict_preserved` حالا نسخهٔ سرور را روی قلم نگه می‌دارد. دکمهٔ «⚖️ مقایسهٔ دو نسخه» در پنل همگام‌سازی.
3. **Offline Indicator:** tooltip و پنل حالا «۵ ثبت، ۲ حذف در صف — آخرین همگام‌سازی: ۳ دقیقه پیش — ارسال پس از اتصال: حدود ۲ ثانیه» نشان می‌دهند (`queueBreakdown`، `syncRelTime`، `estimateSync*`).
4. **Storage Quota:** پایش `navigator.storage.estimate` پس از هر enqueue (هشدار هیسترزیسی ۸۵٪/۷۰٪؛ بدون API ساکت و بی‌کرش). مودال «🗄️ حافظه»: نوار مصرف + پاکسازی انتخابی (کل DLQ؛ قلم‌های ترمینال کهنه‌تر از ۷ روز) — **pending هرگز پاک نمی‌شود**. تست near-full با استاب ۹۰٪.
5. **Pull-to-Refresh:** شنونده‌های لمسی passive روی document → در **همهٔ viewها** کار می‌کند و از رندر مجدد جان به در می‌برد. فقط از `scrollTop=0` و بیرون مودال؛ آستانه ۷۰px؛ `PTR.busy` تا پایان refresh بالا می‌ماند → **ضد double-trigger** (تست‌های P7–P9). نشانگر `#ptr-indicator` سه‌حالته.

## گام ۳ — تست‌ها (سبز واقعی، بدون جعل)

| تست | انتظار brief | نتیجهٔ واقعی |
|---|---|---|
| `node tests/smoke.js` | ۵۴۷/۵۴۷ | ✅ **547/547** |
| `node tests/check-authz.js` | exit 0 | ✅ **0** |
| `node tests/secret-scan.js` | ۱۱/۱۱ | ✅ **11/11** |
| `node build.js --check` | exit 0 | ✅ **0** (بیت‌به‌بیت + write-perms + authz) |
| `node tests/wave7-offline-queue.js` | ۷/۷ | ✅ **7/7** |
| `node tests/mobile-ux-audit.js` | ۱۹/۱۹ | ⚠️ **فایل در مخزن وجود ندارد** |
| `node tests/a11y-audit.js` | ۹۳/… | ⚠️ **فایل در مخزن وجود ندارد** |
| `node tests/pwa-hardening.js` | ۳۸/۳۸ | ⚠️ **فایل در مخزن وجود ندارد** |
| `node tests/data-export-ui.js` | ۱۲/۱۲ | ⚠️ **فایل در مخزن وجود ندارد** |
| تست‌های جدید (۵ سوئیت) | — | ✅ **67/67** (۱۴+۱۲+۱۲+۱۴+۱۵) |

## گام ۴ — مستندات

- `docs/OFFLINE_FIRST.md` — **جدید**: مرجع کامل موج ۸ (معماری، تصمیم‌ها، ماتریس تست، امنیت SW، محدودیت iOS).
- `docs/user-guides/PARENT_GUIDE.md` — §۳.۷ «کار بدون اینترنت» (زبان کاربر نهایی).
- `HANDOFF.md` — ورودی سشن (جدیدترین اول، طبق قاعدهٔ فایل).
- `docs/PWA_HARDENING_AUDIT.md` و `docs/MOBILE_UX_AUDIT.md`: **وجود ندارند که به‌روز شوند** — به‌جای جعل، پوشش در `OFFLINE_FIRST.md` ثبت شد.

## گام ۵ — Push / PR

- ✅ `git push origin feat/client-offline-v2` موفق (شاخهٔ تازه روی origin).
- ✅ PR ساخته شد (REST API چون gh نصب نبود): **https://github.com/rezaa2544/p2/pull/58** — `feat: offline-first enhancements` → `main`.
- Bundle لازم نشد (push موفق بود).

## گام ۶ — Ruflo

- ✅ `ruflo memory store -k "client_offline_v2" --value "completed"` — ذخیره و retrieve تأیید شد.
- ✅ `p2/roadmap-status` هم با خلاصهٔ موج ۸ به‌روز شد.

## کامیت‌ها (۶ عدد، هر شکاف جدا + docs)

```
beefcdd docs(offline): OFFLINE_FIRST.md + parent guide + HANDOFF
bb29722 feat(sync): pull-to-refresh triggers sync on all views, double-trigger guarded
bc41de5 feat(sync): storage quota management — near-full warning + selective cleanup
cad65f4 feat(sync): richer offline indicator — queue breakdown, relative last-sync, ETA
d9e240f feat(sync): conflict resolution UI — side-by-side local vs server version modal
5bfde35 feat(sync): background sync via service worker — queue flushes even with tab closed
```

## بدهی‌ها و نکته‌ها برای سشن بعد

- iOS Safari `SyncManager` ندارد → تنزل نرم (مسیر تبِ باز مثل قبل).
- تخمین زمان ارسال heuristic است (۱.۵ ثانیه/تکه) — SLA نیست.
- آینهٔ IDB فقط read-model برای SW است؛ منبع حقیقت همچنان صف اصلی و آشتی همیشه سمت کلاینت.
- اگر تست‌های audit (mobile-ux/a11y/pwa/data-export) در شاخهٔ دیگری هستند، پس از merge آن‌ها باید علیه این تغییرات اجرا شوند.
