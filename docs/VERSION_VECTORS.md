# Version Vectors برای تعارض‌های Offline-First

**نسخه:** ۱.۰.۰  
**تاریخ:** ۱۸ شهریور ۱۴۰۵ (2026-09-09)  
**وضعیت:** ✅ پیاده‌سازی قرارداد sync + تست

---

## ۱. وضعیت قبلی Sync

پایش پیش از این از `base_version` عددی برای تشخیص تعارض استفاده می‌کرد:

- مجموعه‌های حساس `grades`، `attendance` و `discipline` نسخه‌دارند.
- در update، کلاینت `base_version` را همراه عملیات می‌فرستد.
- اگر `base_version` با `record.version` سرور برابر نباشد، تغییر اعمال نمی‌شود و در `sync_conflicts` ذخیره می‌شود.
- مجموعه‌های ساختاری مثل `classes`، `subjects`، `users`، `enrollments` و `schedule` در صورت نسخه کهنه با `stale_base` رد می‌شوند.
- مجموعه‌های LWW مثل `announcements` برای سازگاری عقب‌رو، `base_version` را الزام نمی‌کنند.

این مدل برای یک دستگاه خوب است؛ اما در multi-device، عدد ساده نمی‌گوید تغییر از کدام node آمده و آیا دو تغییر واقعاً هم‌زمان/واگرا بوده‌اند یا فقط fast-forward هستند.

---

## ۲. طراحی Version Vector

هر رکورد نسخه‌دار علاوه بر `version` عددی، فیلد زیر را نگه می‌دارد:

```js
version_vector: { "server": 5, "client_a": 2, "client_b": 1 }
```

فرم عملیات update:

```js
{
  t: 'upd',
  c: 'grades',
  id: 123,
  base_version: 4,
  base_vector: { "server": 4, "client_a": 2 },
  data: { score: 19 }
}
```

قانون:

- اگر `base_vector` با `version_vector` سرور برابر باشد، update قابل اعمال است.
- اگر برابر نباشد، برای مجموعه‌های حساس conflict حفظ می‌شود.
- برای مجموعه‌های ساختاری، اختلاف vector مثل نسخه کهنه با `stale_base` رد می‌شود.
- اگر `base_vector` وجود نداشته باشد، رفتار قبلی `base_version` حفظ می‌شود.

---

## ۳. هسته `server/version-vector.js`

توابع اصلی:

| تابع | کاربرد |
|---|---|
| `mergeVectors(a, b)` | ادغام با max هر مؤلفه |
| `isAncestor(base, current)` | آیا همه مؤلفه‌های base کمتر/برابر current هستند؟ |
| `compareVectors(a, b)` | `equal` / `ancestor` / `descendant` / `concurrent` |
| `needsConflict(base, current)` | هر چیزی جز equality، برای sync حساس conflict است |
| `bumpVector(vector, nodeId, version)` | افزایش مؤلفه node فعلی |
| `resolveConflict(...)` | سیاست manual یا LWW برای استفاده آینده |

بردارها fail-closed اعتبارسنجی می‌شوند:

- حداکثر ۳۲ node
- نام node فقط `[A-Za-z0-9_.:-]` و حداکثر ۶۴ کاراکتر
- مقدار هر نسخه عدد صحیح غیرمنفی و safe integer

---

## ۴. یکپارچه‌سازی سرور

در `server/sync.js`:

1. `base_vector` به پاکت مجاز sync اضافه شد.
2. بردار بدشکل با `validation_failed` و فیلد `base_vector` رد می‌شود.
3. در conflictهای `VERSIONED`، رکورد `sync_conflicts` اکنون این فیلدها را دارد:
   - `base_vector`
   - `server_vector`
   - `vector_relation`
   - `incoming.base_vector`
4. هنگام insert/update، سرور `version_vector` را خودش می‌سازد/به‌روزرسانی می‌کند.
5. `PAYESH_NODE_ID` شناسه node سرور را تعیین می‌کند؛ پیش‌فرض `server` است.

write هیچ‌وقت صرفاً به خاطر ادعای کلاینت روی `version_vector` اعتماد نمی‌کند؛ کلاینت فقط `base_vector` آخرین نسخه دیده‌شده را می‌فرستد.

---

## ۵. یکپارچه‌سازی کلاینت

در `src/js/03-persistence.js`:

- برای رکوردهای نسخه‌دار محلی، `version_vector` ساخته می‌شود.
- هنگام update، قبل از bump محلی، `base_vector` در operation ثبت می‌شود.
- یک `client_node_id` پایدار در `Store` نگهداری می‌شود.

در `src/js/27-sync.js`:

- `version` و `version_vector` از `op.data` ارسالی به سرور حذف می‌شوند، چون فیلدهای مدیریت‌شده‌اند.
- `base_vector` در سطح operation باقی می‌ماند و به `/api/sync` ارسال می‌شود.

---

## ۶. سازگاری عقب‌رو

- عملیات‌های قدیمی بدون `base_vector` همچنان با `base_version` کار می‌کنند.
- LWWها مجبور به ارسال vector نیستند.
- اگر رکورد قدیمی `version_vector` نداشته باشد، سرور از `version` عددی بردار معادل می‌سازد: `{server: version}`.

---

## ۷. تست‌ها

```bash
node tests/version-vector.js
node tests/version-vector-sync.js
```

گیت‌های عمومی:

```bash
node build.js --check
node tools/check-authz.js
node tests/secret-scan.js
node --expose-gc --max-old-space-size=2048 tests/smoke.js
```

---

## ۸. چک‌لیست پذیرش

- [x] هسته pure version vector اضافه شد.
- [x] sync سرور `base_vector` را می‌پذیرد و اعتبارسنجی می‌کند.
- [x] conflictهای حساس، vector را در `sync_conflicts` ذخیره می‌کنند.
- [x] کلاینت `base_vector` را برای رکوردهای نسخه‌دار ارسال می‌کند.
- [x] رفتار قدیمی `base_version` حفظ شده است.
- [x] تست واحد و تست یکپارچه sync اضافه شد.
