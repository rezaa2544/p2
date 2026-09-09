# National Baseline — Wave 0 / Part 2

**موضوع:** اندازه‌گیری عملکرد سرور و API
**تاریخ اجرا:** ۱۸/۰۶/۱۴۰۵ — 2026-09-09
**شاخه کاری Arena:** `arena/01a085da-p2`
**محدوده:** اندازه‌گیری baseline در محیط sandbox/دمو؛ بدون تغییر کد پروژه.
**Commit هنگام اندازه‌گیری:** `ec92ee7b84e991606128259b3c770d4306dfbaca`

---

## 1. روش اندازه‌گیری

برای اینکه هیچ تغییری در کد پروژه ایجاد نشود، اندازه‌گیری با یک harness موقت خارج از repository انجام شد:

- مسیر موقت harness: `/tmp/payesh_measure_part2.js`
- سرور واقعی با `node server/index.js` اجرا شد.
- store دمو در یک فایل موقت کپی شد تا benchmark داده repository را تغییر ندهد.
- `PAYESH_DEMO_CODE=1` برای امکان login دمو فعال شد.
- برای جلوگیری از اثر cooldown روی benchmark ورود، سقف‌های OTP در همین اجرای موقت بالا برده شد.
- `perf_hooks.monitorEventLoopDelay()` با `NODE_OPTIONS=--require /tmp/probe.js` داخل همان process سرور فعال شد.
- latency با `fetch` داخلی Node.js اندازه‌گیری شد.
- مسیر `POST /api/v1/sync` در سرور وجود ندارد؛ endpoint واقعی sync در کد فعلی `POST /api/sync` است، بنابراین همان مسیر اندازه‌گیری شد.

> این نتایج baseline محیط توسعه/sandbox هستند، نه benchmark تولید. برای تصمیم ظرفیت ملی باید در Wave 18 با دیتاست و زیرساخت واقعی تکرار شوند.

---

## 2. مشخصات اجرای benchmark

| مورد | مقدار |
|---|---:|
| زمان اندازه‌گیری | `2026-09-09T12:38:48.486Z` |
| محیط | local sandbox/demo server |
| Store | JSON temp copy از `server/data/payesh.json` |
| کاربر تست | `superadmin` با `id=1` |
| پورت موقت | `19038` |
| تعداد اجرای login | `25` |
| تعداد اجرای endpointهای دیگر | `30` |
| event-loop monitor resolution | `10ms` |
| پنجره event-loop | حدود `1.36s`، یعنی بیش از ۱۰۰ نمونه ۱۰ms |

---

## 3. CPU و Memory سرور

### از `/proc/<pid>/status` و `/proc/<pid>/stat`

| متریک | قبل از benchmark | بعد از benchmark | توضیح |
|---|---:|---:|---|
| RSS | `87.48 MB` | `108.17 MB` | حافظه resident process |
| VmHWM | `96.21 MB` | `108.17 MB` | high-water mark حافظه |
| VmSize | `1113.03 MB` | `1113.43 MB` | virtual memory size |
| CPU ticks | `37` | `63` | user+system ticks از `/proc` |
| CPU seconds | — | `0.26s` | بر پایه USER_HZ≈100 |
| elapsed | — | `1.360s` | شامل benchmark و انتظار event-loop |
| CPU تقریبی | — | `19.11%` | میانگین دوره؛ شامل ۱ ثانیه idle برای جمع‌آوری event-loop |

### از `process.memoryUsage()` داخل process سرور

| متریک | مقدار | معادل MB |
|---|---:|---:|
| `rss` | `113,426,432 bytes` | `108.17 MB` |
| `heapTotal` | `60,719,104 bytes` | `57.91 MB` |
| `heapUsed` | `25,910,728 bytes` | `24.71 MB` |
| `external` | `2,462,307 bytes` | `2.35 MB` |
| `arrayBuffers` | `79,786 bytes` | `0.08 MB` |

---

## 4. Event-loop Latency

| متریک | مقدار |
|---|---:|
| min | `9.159 ms` |
| mean | `10.244 ms` |
| max | `14.631 ms` |
| p50 | `10.150 ms` |
| p95 | `10.846 ms` |
| p99 | `11.846 ms` |

تفسیر: در این workload کوچک و محلی، event loop پایدار است. این عدد برای بار ملی کافی نیست چون هنوز دیتاست بزرگ، DB واقعی، Redis واقعی، network و همزمانی بالا وارد نشده‌اند.

---

## 5. Endpoint Latency و حجم پاسخ

| Endpoint | Runs | Status | Avg ms | p95 ms | p99 ms | Avg response KB |
|---|---:|---|---:|---:|---:|---:|
| `POST /api/auth/login` با setup `send-code` | 25 | `200` | `4.366` | `7.358` | `7.459` | `0.130` |
| `GET /api/v1/bootstrap` | 30 | `200` | `1.308` | `2.347` | `3.033` | `0.654` |
| `POST /api/v1/attendance` | 30 | `201` | `2.172` | `3.752` | `5.093` | `0.180` |
| `POST /api/v1/grades` | 30 | `201` | `1.921` | `3.184` | `3.641` | `0.211` |
| `POST /api/sync` | 30 | `200` | `2.137` | `4.735` | `4.945` | `0.111` |

### یادداشت درباره login

برای اندازه‌گیری `POST /api/auth/login`، قبل از هر login یک `POST /api/auth/send-code` اجرا شد تا OTP معتبر ساخته شود. زمان جدول برای کل flow منطقی login شامل send-code setup و login است، چون login مستقل بدون OTP معتبر معنی عملیاتی ندارد.

### یادداشت درباره sync

در prompt مسیر `POST /api/v1/sync` آمده بود، اما در کد فعلی route واقعی sync این است:

```text
POST /api/sync
```

بنابراین baseline روی مسیر واقعی و فعال سرور ثبت شد.

---

## 6. محدودیت‌های شناخته‌شده

| محدودیت | اثر |
|---|---|
| محیط sandbox/localhost | latency شبکه واقعی، TLS واقعی، CDN/WAF/LB و jitter تولید اندازه‌گیری نشده‌اند. |
| JSON temp store | PostgreSQL production source of truth هنوز وارد benchmark نشده است. |
| Redis واقعی الزاماً فعال نبود | hit/miss و latency Redis در این بخش سنجیده نشده؛ Part 3/Wave 6 باید پوشش دهد. |
| همزمانی پایین | benchmark sequential بود؛ load/stress/spike/soak نیست. |
| دیتاست دمو | دیتاست حدود هزار کاربر است، نه 10M. |
| OTP limits relaxed در harness | برای حذف cooldown از benchmark ورود؛ اعداد login نباید به‌عنوان abuse-limit production تفسیر شوند. |
| write endpoints داده تولید کردند | همه writes روی temp store انجام شد و repository/store اصلی تغییر نکرد. |

---

## 7. تفسیر اولیه نسبت به SLO پیشنهادی Roadmap

SLO اولیه roadmap:

```text
p50 < 100ms
p95 < 300ms
p99 < 1s
5xx < 0.1%
```

در این benchmark محلی، هر پنج endpoint از نظر p95/p99 بسیار پایین‌تر از هدف اولیه‌اند؛ اما این نتیجه فقط **baseline کوچک/دمو** است و برای Go/No-Go ملی اعتباری ندارد. bottleneck map نشان می‌دهد با دیتاست ملی، readهای مبتنی بر scan/filter/sort و sync/pull غیربومیِ DB ممکن است p95/p99 را به‌شدت افزایش دهند.

---

## 8. Evidence خام

خروجی خام benchmark در زمان اجرا:

```json
{
  "measured_at": "2026-09-09T12:38:48.486Z",
  "port": 19038,
  "temp_dir": "/tmp/payesh-baseline2-rMAZ4W",
  "server_pid": 1482,
  "env": "local sandbox/demo server, PAYESH_DEMO_CODE=1, temp JSON store",
  "user": { "id": 1, "role": "superadmin" },
  "server_resource": {
    "before": { "rss_mb": 87.48046875, "hwm_mb": 96.20703125, "vmsize_mb": 1113.02734375, "cpu_ticks": 37 },
    "after": { "rss_mb": 108.171875, "hwm_mb": 108.171875, "vmsize_mb": 1113.4296875, "cpu_ticks": 63 },
    "elapsed_sec": 1.360368448,
    "cpu_sec": 0.26,
    "approx_cpu_percent": 19.112469153650938
  },
  "event_loop": {
    "min_ms": 9.158656,
    "mean_ms": 10.24444834408602,
    "max_ms": 14.630911,
    "p50_ms": 10.149887,
    "p95_ms": 10.846207,
    "p99_ms": 11.845631,
    "memory_usage": {
      "rss": 113426432,
      "heapTotal": 60719104,
      "heapUsed": 25910728,
      "external": 2462307,
      "arrayBuffers": 79786
    }
  }
}
```

---

## 9. وضعیت Wave 0 پس از Part 2

Wave 0 هنوز کامل نیست؛ Part 1 و Part 2 کامل شده‌اند، اما Part 3 و Part 4 باید دریافت و سپس در `docs/NATIONAL_BASELINE.md` تجمیع شوند.
