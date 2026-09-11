# گزارش نهایی — Delta Sync Phase 4

**شاخه:** `feat/delta-phase4` (پایه: `main @ 6dbef89` — PR #68) · **تاریخ:** ۲۰۲۶-۰۹-۱۱
**وضعیت پوش:** ✅ پوش شد · **PR #71:** https://github.com/rezaa2544/p2/pull/71 (base: main — باز برای بازبینی)

---

## جدول شکاف‌ها

| # | شکاف | وضعیت | کامیت | تست |
|---|---|---|---|---|
| ۱ | **Sync Backpressure** — پنجرهٔ op وزن‌دار per-session (۶۰ث، پیش‌فرض ۵۰۰۰ op/min از `PAYESH_SYNC_OPS_PER_MIN`)؛ رد ⇒ 429 `sync_backpressure` + `retry_after_s` + `Retry-After` بدون اعمالِ هیچ op؛ کلاینت opها را **pending** نگه می‌دارد (نه failed/DLQ) و با `max(retry_after, backoff)` دوباره می‌آید؛ زیرساخت اتمیک `incrByWithTtl` (Lua + دوقلوی حافظه) + `weight` در `checkRateLimit` | ✅ کامل | `3b262c7` | BP1–BP6 (۶/۶) · جهش M1–M5 |
| ۲ | **Delta Compression** — `server/compress.js`: gzip ارجح (سطح ۶) / brotli جایگزین (کیفیت ۵)، آستانهٔ ۱KB، fallback سازگار به sendJson، `Vary: Accept-Encoding`؛ **868.9KB → 51.8KB gzip (۶٪) / 31.2KB br** در فیکسچر ۳۰۰۰ ردیف؛ parse 8.7ms | ✅ کامل | `d936511` | CM1–CM6 (۶/۶) · جهش M6–M8 |
| ۳ | **Cursor Warmup** — ممیزی: کلید از پیش پایدار بود (keyfile→JWT_SECRET→اشتقاقِ domain-separated)؛ تحویلِ غایب: `cursor.keySource`، لاگِ بوت، `/api/health` ⇒ `cursor:{enabled,persistent,key_source}`، هشدارِ رازِ کوتاه؛ **تستِ بوتِ واقعیِ فرآیند ×۲ با همان keyfile** — توکنِ پیش از restart همچنان verify، منقضی همچنان رد | ✅ کامل | `424afc3` | CW1–CW3 (۳/۳) · جهش M9–M11 |
| ۴ | **Sync Metrics** — `/api/health` ⇒ `sync:{pulls_total, pulls_delta, pulls_full, pushes_total, conflicts_total, backpressure_rejections_total, cursor_expired_total, cursor_region_mismatch_total, delta_size_bytes_avg, delta_wire_bytes_avg, compressions_total}` از `syncHealthStats` (تابعِ محض؛ Q3-safe)؛ push فقط دستهٔ غیرخالی | ✅ کامل | `412eaa1` | MX1–MX4 (۴/۴) · جهش M12–M15 |
| ۵ | **Multi-Region Ready** — کرسرِ v2 `{v:2, since, iat, exp, jti, rg}` از `PAYESH_REGION`؛ توکنِ بین‌منطقه‌ای ⇒ 401 `region_mismatch` + `cursor_renewal:'full_pull'` (**بدون تغییر کلاینت** — مسیر تجدید عمومی 29-pull.js)؛ v2 بدشکل ⇒ `cursor_invalid`؛ v1 تا TTLِ خودش (دورهٔ گذار) | ✅ کامل | `fe9ac26` | MR1–MR4 (۴/۴) · جهش M16–M19 |

## گیت‌های نهایی (همه سبز)

| گیت | نتیجه |
|---|---|
| smoke | **547/547** ✅ |
| check-authz | **0** ✅ |
| secret-scan | **11/11** ✅ |
| `build --check` | ✅ |
| delta-sync-hardening | **19/19** ✅ |
| wave4-sync-all-collections | **13/13** ✅ |
| wave10-query-audit | **14/14** ✅ |
| pull-bootstrap / pull-rest-delete / pull-to-refresh | **12/12** · ✓ · ✓ |
| contract-layers | **18/18** ✅ |
| delta-schema-gaps | **12/12** ✅ |
| sync-chunk · sync-atomic-batch | ✓ · **22/22** |
| tests/run.js | ✅ |
| **delta-phase4 (جدید)** | **23/23** ✅ |
| **delta-phase4-mutations (جدید)** | **20/20 — همهٔ جهش‌ها کشته شدند** ✅ |

## کامیت‌های شاخه (۷)

```
26e82c5 docs: Delta Hardening Phase 4 — DELTA_HARDENING_PHASE4.md + SYNC_PROTOCOL §6 + SERVER_CLIENT_CONTRACT + HANDOFF
fe9ac26 feat(cursor): region-aware cursor v2 — cross-region tokens force a clean full pull (gap 5)
412eaa1 feat(metrics): sync pulse in /api/health — pulls/pushes/conflicts/backpressure/cursor + delta size averages (gap 4)
424afc3 feat(cursor): warmup-safe cursor keys — introspection, boot log, health block, misconfig warning (gap 3)
d936511 feat(sync): negotiated delta compression — gzip preferred, brotli fallback (gap 2)
3b262c7 feat(sync): backpressure — per-session op-window rate limit + graceful 429 client handling (gap 1)
0c86c97 fix(git): repair mojibake .gitignore tail that silently ignored ALL new files
```

## حوادث و ترمیم‌ها (شفافیت کامل)

1. **موجی‌بیکِ `.gitignore` (کشفِ این فاز):** دنبالهٔ UTF-16/NUL از کامیت قدیمیِ `9a08ac5` توسط git به‌عنوان قاعدهٔ تنها `*` خوانده می‌شد و **همهٔ فایل‌های جدید را بی‌صدا ignore می‌کرد** — تست‌های گپ ۱ و `compress.js` از کامیت‌های خودشان جا مانده بودند. ترمیم (`0c86c97`): بازنویسیِ tail با الگوهای سالم + **بازسازیِ تمیز تاریخچه** (reset/rebuild) تا هر گپ تست‌های خودش را در همان کامیت داشته باشد.
2. **رگرسیونِ قراردادِ بازگشتی sendJson در pull** (کشف با pull-bootstrap 6/12): مسیر فشرده‌سازی مقدارِ بازگشتی را نمی‌رساند — ترمیم شد (`reply` در `sendJsonCompressed`) و pull-bootstrap به 12/12 برگشت؛ تست CM5 اکنون همین قرارداد را نگه می‌دارد.
3. **بلعیده‌شدنِ خطای 429 در sendChunked:** بدون re-throw، خطای backpressure به per-op-rejection تبدیل و DLQ می‌سوزاند — رفع شد و BP6 + جهش M4 آن را قفل کردند.
4. **متریکِ اعلام‌نشده:** `inc` روی نامِ declare نشده بی‌صدا drop می‌شود — هر ۹ متریکِ فاز ۴ در `metrics.js` اعلام شدند.

## مستندات

- **`docs/DELTA_HARDENING_PHASE4.md`** (جدید) — طرح کامل، اعداد، یادداشت استقرارِ چندمنطقه‌ای (sticky LB، راز مشترک + rg، کرانهٔ skew)
- `docs/SYNC_PROTOCOL.md` §۶ · `docs/SERVER_CLIENT_CONTRACT.md` (ردیف 401 `region_mismatch` + §۲ backpressure/compression) · `HANDOFF.md` (ورودی بالای فایل)

## یادداشت‌ها

- `ruflo memory store --key delta_phase4 --value completed`: ابزار ruflo در این سندباکس روی PATH نیست (غیرمسدودکننده) — وضعیت در همین گزارش و HANDOFF ثبت است.
- PR #71 باز است برای بازبینی/مرج (فاز ۳ با دستور صریح مرج شد؛ این‌جا صبر می‌کنم).
