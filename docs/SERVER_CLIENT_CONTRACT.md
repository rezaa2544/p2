# قرارداد سیمِ سرور ↔ کلاینت (Pull / Sync)

> **تاریخ ایجاد:** ۲۰۲۶-۰۹-۱۱ (Delta Hardening Phase 2). این سند به درخواستِ بریفِ آن فاز ساخته شد —
> پیش از آن وجود نداشت و تنها `docs/SERVER_SECURITY_CONTRACT.md` (قراردادِ امنیتیِ push) در ریپو بود.
> این سند **توصیفِ وضعیتِ واقعیِ کد** است (برخلاف آن سند که آینده‌نگر است) و گیتِ
> `tests/contract-layers.js` (۱۸/۱۸) لایه‌به‌لایه آن را نگه می‌دارد.

---

## ۱. `GET /api/v1/pull` — دریافت اسنپ‌شات/دلتا

### ۱.۱ پارامترها

| پارامتر | نوع | شرح |
|---|---|---|
| `since` | ISO 8601 | لحظهٔ دلتای قبلی (مسیرِ legacy — هنوز معتبر) |
| `cursor` | توکن `pc1.…` | کرسرِ امضاشدهٔ سرور (فاز ۲) — **بر `since` مقدم** |
| `collections` | لیست با کاما | زیرمجموعهٔ مجموعه‌ها؛ نامِ ناشناخته **حذف** می‌شود (fail-closed) |

### ۱.۲ پاسخِ ۲۰۰

```json
{
  "ok": true,
  "server_time": "<ISO — لحظهٔ شروعِ خواندنِ داده>",
  "since": "<since مؤثر>",
  "full_snapshot": false,
  "full_snapshot_required": true,
  "full_snapshot_reason": "since_too_old",
  "next_cursor": "pc1.<b64>.<sig>",
  "cursor_ttl_s": 3600,
  "server_version": 42,
  "collections": { "<name>": [ "…rows" ] },
  "deleted": [ { "c": "…", "id": 99, "at": "<ISO>" } ]
}
```

- `full_snapshot=false` ⇒ فقط ردیف‌های `updated_at|created_at > since` (پس از scope نقش/مدرسه).
- `full_snapshot=true` ⇒ کل مجموعهٔ scoped؛ کلاینت **جایگزین** می‌کند (به‌جز ردیف‌های صفِ آفلاین
  خودش). تومب‌استون‌ها وقتی `since` فرستاده شده همیشه بعد از `since` برمی‌گردند.
- `server_time`/`next_cursor.since` از **لحظهٔ شروعِ خواندن** است (نه پایانِ پاسخ) — تغییری که
  وسطِ pull رخ دهد در دلتای بعدی گم نمی‌شود.
- کلیدهای `full_snapshot_required`/`full_snapshot_reason` فقط روی دلتای اجباریاً کامل می‌آیند؛
  `next_cursor`/`cursor_ttl_s` فقط وقتی کلیدِ کرسر تنظیم است. روی سیمِ JSON، کلیدِ غایب ≠ null.

### ۱.۳ خطاها

| وضعیت | بدنه | شرح |
|---|---|---|
| 401 | `{ok:false, code:'unauthorized'}` | نشست نامعتبر |
| 401 | `{ok:false, code:'cursor_expired', cursor_renewal:'full_pull'}` | کرسرِ منقضی — کلاینت یک pull کامل می‌گیرد |
| 401 | `{ok:false, code:'cursor_invalid', cursor_renewal:'full_pull'}` | امضا/شکلِ توکن خراب |
| 401 | `{ok:false, code:'cursor_unavailable', cursor_renewal:'full_pull'}` | توکن فرستاده شده ولی سرور کلیدِ کرسر ندارد |
| 401 | `{ok:false, code:'region_mismatch', cursor_renewal:'full_pull'}` | کرسرِ v2 در منطقهٔ دیگری صادر شده (فاز ۴، گپ ۵) |

### ۱.۴ آستانهٔ دلتا (گپ ۱)

`since` کهنه‌تر از `PAYESH_DELTA_MAX_AGE_DAYS` (پیش‌فرض **۷ روز**) ⇒ پاسخ خودِ اسنپ‌شات کامل است با
پرچم‌های §۱.۲. کلاینت‌های قدیمیِ بی‌آگاه از پرچم هم درست جمع می‌شوند (full + تومب‌استون‌ها).

### ۱.۵ کرسرِ امضاشده (گپ ۲؛ v2 در فاز ۴)

- توکن: `pc1.<base64url(payload)>.<base64url(HMAC-SHA256)>`، payload ‏`{v:2, since, iat, exp, jti, rg}`
  (فاز ۴: `rg` = منطقهٔ صادرکننده از `PAYESH_REGION`)؛ توکن‌های v1 تا TTL خودشان پذیرفته
  می‌شوند (دورهٔ گذار).
- TTL پیش‌فرض **۳۶۰۰ ثانیه** (`PAYESH_CURSOR_TTL_S`؛ clamp ‏۶۰..۸۶۴۰۰).
- کلید: `PAYESH_CURSOR_SECRET` (≥۳۲ بایت) وگرنه اشتقاقِ domain-separated از کلیدِ JWT —
  **کلیدِ کرسر ≠ کلیدِ JWT**. بدونِ کلید: `next_cursor` صادر نمی‌شود و توکنِ ارسالی ⇒ ‏401 (fail-closed).
- sinceِ داخلِ توکنِ امضاشده بر `?since=` آزاد **مقدم** است.

### ۱.۶ کلاینت (`src/js/29-pull.js`)

1. اگر `payesh_pull_cursor` (توکنِ `pc1.` سالم‌شکل) موجود باشد ⇒ `?cursor=` می‌فرستد؛ وگرنه `?since=`.
2. پاسخِ موفق ⇒ ذخیرهٔ `next_cursor` (و `server_time` به‌عنوان sinceِ legacy برای سازگاری).
3. ‏401 کرسر ⇒ پاک‌کردنِ توکن + **دقیقاً یک** pull کامل (تمدید؛ تکرارِ 401 ⇒ توقف، بدون حلقه).
4. اسنپ‌شات کامل ⇒ جایگزینیِ مجموعه‌های بازگشده (حفظِ صفِ آفلاین).

## ۲. `POST /api/sync` — ارسالِ صفِ آفلاین

- درخواست: `{ ops: [ {uid, c, t, id?, data, by, at, base_version?} ] }` (≤۵۰۰ op).
- پاسخ: `{ ok, results: [ {uid, ok, code?, …} ] }` — **هر op جدا** پاسخ می‌گیرد؛ ردِ یک op دسته را نمی‌کشد.
- **Backpressure (فاز ۴، گپ ۱):** هر session پنجرهٔ ۶۰ثانیه‌ایِ وزن‌دار دارد (پیش‌فرض
  ۵۰۰۰ op/min باِ `PAYESH_SYNC_OPS_PER_MIN`) — یک دستهٔ N-opیی، N واحد مصرف می‌کند.
  عبور از سقف ⇒ `429 {ok:false, code:'sync_backpressure', retry_after_s}` + سرآیندِ
  `Retry-After`، **بدونِ اعمالِ هیچ op**. کلاینت opها را pending نگه می‌دارد (نه
  failed/DLQ) و بعد ازِ `max(retry_after_s, backoff)` دوباره می‌فرستد.
- **فشرده‌سازی (فاز ۴، گپ ۲):** پاسخ‌های بزرگِ pull با `Accept-Encoding: gzip` (ارجح)
  یا `br` فشرده می‌شوند (آستانهٔ `PAYESH_DELTA_COMPRESS_MIN_BYTES`، پیش‌فرض ۱KB)؛ بدنهٔ
  JSON و قرارداد، برایِ کلاینتِ ناتفاوض‌کننده بایت‌به‌بایت همانِ قبل است.
- کدهای per-op نمونه: `duplicate_ignored` (idempotency) · `validation_failed` · `conflict_preserved`
  (+ `conflict_id` — مجموعه‌های نسخه‌دار: grades/attendance/discipline؛ سطرِ `sync_conflicts` برای
  داوری با `base_version`/`server_version`/`incoming`) · `stale_base` (مجموعه‌های ساختاری).
- سنجهٔ تعارض (فاز ۲): `payesh_sync_conflict_detection_seconds{outcome=conflict|stale|clean}` +
  `payesh_sync_conflicts_total{collection}` روی `/metrics`.

## ۳. قواعدِ ناسرشکن

1. **Fail-closed:** مجموعهٔ ناشناخته، توکنِ خراب، نشستِ غایب ⇒ رد.
2. **کامل بودنِ پاسخِ اجباری:** سرور هیچ‌وقت «پرچمِ خالی» نمی‌فرستد — پرچمِ `full_snapshot_required`
   همیشه همراهِ خودِ دادهٔ کامل است (کلاینتِ قدیمی هرگز داده گم نمی‌کند).
3. **افزودنی‌بودن:** کلیدهای تازه (`next_cursor`، `cursor_ttl_s`، `full_snapshot_required`) فقط
   اضافه می‌شوند؛ کلاینتِ قدیمی رفتارِ قبل را عیناً می‌گیرد.
4. **scope پس از دلتا:** فیلترِ نقش/مدرسه روی نتیجهٔ DB اعمال می‌شود و «فقط حذف می‌کند» —
   دلتا نمی‌تواند ردیفِ خارجِ محدوده اضافه کند.
