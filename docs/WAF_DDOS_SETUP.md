# راه‌اندازیِ WAF و ضدِ DDoS (Tier 2)

**وضعیت:** POC پیاده‌سازی‌شده (شاخهٔ `feat/waf-ddos-chat3`)
**فلسفه:** اِعمال در لبه (nginx/Cloudflare)، تشخیص در برنامه (فقط-تشخیص، بدونِ بلاک)

---

## ۱.۱. انتخابِ راهکار

| گزینه | نقش | هزینه | نکته |
|---|---|---|---|
| **Cloudflare WAF + CDN** | پیشنهادِ اصلیِ پروداکشن | رایگان (سطحِ پایه) | WAF مدیریت‌شده، L3/L4/L7، کشِ لبه |
| AWS WAF + Shield | جایگزین (اگر روی AWS هستید) | پولی (per-rule/request) | Shield Standard رایگان، Advanced پولی |
| NGINX خودمیزبان | POC و لایهٔ دومِ دفاع | صفر (همین ریپو: `nginx/nginx.conf`) | نرخ/اتصال + بلاکِ ربات/ traversal |

ترتیبِ استقرار: اول DNS پشتِ Cloudflare (orange-cloud)، بعد nginx جلوی Node،
و تشخیصِ درون‌برنامه (`server/waf.js`) همیشه روشن.

## ۱.۲. قوانینِ WAF

| قانون | توضیح | اقدام (لبه) | اقدام (برنامه) |
|---|---|---|---|
| Rate Limiting | بیش از ۱۰۰ درخواست/دقیقه از یک IP | بلاکِ ۴۲۹ (nginx `limit_req`) | سرآیندِ advisory + شمارش (Redis) |
| SQL Injection | payload مخرب (`UNION SELECT`، `OR 1=1`، …) | بلاکِ ۴۰۳ (ویو۱۲: `map $edge_attack` در `nginx.conf`) + Cloudflare Rule | `X-WAF-Verdict: sqli` + ممیزی |
| XSS | `<script>`، `javascript:`، `on*=*`، … | بلاکِ ۴۰۳ (ویو۱۲: همان مَپ) + Cloudflare Rule | `X-WAF-Verdict: xss` + ممیزی |
| Path Traversal | `../`، `%2e`، `/etc/passwd`، … | بلاکِ ۴۰۳ (`map $traversal`) | `X-WAF-Verdict: traversal` + ممیزی |
| Bad Bot | sqlmap/nikto/masscan/… در UA | بستنِ ۴۴۴ + Challenge (Cloudflare) | `X-WAF-Verdict: badbot` + ممیزی |

قوانینِ لبهٔ ویو ۱۲ بینِ نشانگرهایِ `wave12-edge-rules:start/end` در
`nginx/nginx.conf` است؛ `tests/wave12-network.js` همان رگکس‌ها را استخراج و
روی فهرستِ مثبت/منفی تست می‌کند (پس هر تغییرِ قانون = اجرای آن تست).
قوانینِ نگینکس محافظه‌کارانه‌اند (خطای مثبت در لبه = ۴۰۳ کاربرِ واقعی)؛
شک‌ها را به تشخیصِ درون‌برنامه بسپارید.

قوانینِ Cloudflare (پیشنهادِ شروع): Managed Ruleset (OWASP + Cloudflare Managed)
روشن + قانونِ نرخِ سفارشیِ ۱۰۰r/m روی `/api/*` + قانونِ UA (کلماتِ بالا → Managed Challenge).

## ۱.۳. ضدِ DDoS

| لایه | راهکار | توضیح |
|---|---|---|
| شبکه (L3/L4) | Cloudflare / AWS Shield | جذبِ سیلِ SYN/UDP؛ origin فقط از IPهای لبه |
| برنامه (L7) | Rate Limiting + WAF + سقفِ اتصال | nginx (`limit_req`/`limit_conn`) + قوانینِ §۱.۲ |
| کشِ لبه | Cloudflare CDN (+ Cache Rules برای `/static/*`) | کم‌شدنِ بارِ origin؛ API هرگز کش نشود |

اصلِ مهم: فایروالِ سرور فقط پورتِ ۸۰/۴۴۳ از IPهای Cloudflare را بپذیرد
(لیستِ رسمیِ IPها + اسکریپتِ به‌روزرسانیِ دوره‌ای) تا مهاجم مستقیم به origin نزند.

## ۱.۴. تنظیماتِ نرخ در NGINX (فایلِ کامل: `nginx/nginx.conf`)

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
limit_req zone=api burst=20 nodelay;
limit_conn_zone $binary_remote_addr zone=addr:10m;
limit_conn addr 10;
```

اعتبارسنجیِ نحوی (خودکفا، بدونِ include):

```sh
nginx -t -c $PWD/nginx/nginx.conf -p $PWD/nginx/
```

## ۱.۵. تست‌ها

خودکار (همین ریپو):

```sh
node tests/waf-ddos.js              # ۲۸ تست: CFG + DET + LIM + INT
node tests/waf-ddos.js --unit-only  # بدونِ بوت (برای CI)
node tests/waf-mutations.js         # ۴ جهش (M1–M4)؛ هر ۴ باید کشته شوند
```

| سناریوی پرامپت | پوشش |
|---|---|
| ۲۰۰ درخواستِ همزمان | `LIM-d` (شمارنده) + `INT-f` (سرور زنده: هر ۲۰۰ سرو + صفر بلاک) |
| SQLi/XSS payloads | `DET-a/c` (واحد) + `INT-d` (زنده، log-only) |
| DDoS شبیه‌سازی‌شده (wrk) | دستی (زیر) + `INT-f` به‌عنوانِ جایگزینِ سبک |

دستی با wrk (روی nginx، نه مستقیم روی Node):

```sh
# پورتِ ۸۰۸۰ (POC بدونِ root)؛ در پروداکشن ۸۰/۴۴۳ پشتِ Cloudflare
wrk -t4 -c200 -d30s http://127.0.0.1:8080/api/health     # انتظار: ۴۲۹ها پس از burst، بدونِ ۵۰۰
wrk -t2 -c20 -d15s 'http://127.0.0.1:8080/api/x?q=%27%20OR%201%3D1'  # انتظار: بلاک/لاگ در لبه
```

دقتِ شناخته‌شده: شمارندهٔ `checkRateLimit` از نوعِ GET+SET است و زیرِ burstِ
شدیدِ همزمان تقریبی می‌شود (تستِ `LIM-c` کرانِ ۹۵..۱۰۵ را می‌پذیرد)؛ برای دقتِ
دقیق، جایگزینی با `INCR` اتمیک یا اسکریپتِ Lua در فهرستِ کارهای بعدی است.

---

## ۲. لایهٔ تشخیصِ درون‌برنامه (`server/waf.js`)

- **فقط-تشخیص**: هیچ‌وقت ۴۰۳/۴۲۹ نمی‌دهد؛ اِعمال با لبه است (POC) و Cloudflare (پروداکشن).
- **خروجی‌ها**: سرآیندِ `X-WAF-Verdict` (`clean|sqli|xss|traversal|badbot`)،
  سرآیندهایِ advisory نرخ (`X-RateLimit-Limit/Remaining/Reset`)،
  `req.context.waf`، و ممیزیِ `waf_detect` (سقفِ ۵ در دقیقه برای هر rule).
- **حریم**: ممیزی فقط `(rule, field, ip)` دارد؛ هیچ excerpt از payload
  (تستِ `INT-h`). بدنهٔ درخواست هرگز خوانده نمی‌شود.
- **نرخ**: شمارش با `checkRateLimit` در `server/cache.js` (Redis وقتی
  `REDIS_URL` هست، وگرنه fallback درون‌حافظه‌ایِ خودِ ریپو)؛ خطا/تأخیرِ
  Redis (سقفِ ۱۰۰ms) = بی‌سرآیند و ادامه (در دسترس‌بودن اول).
- **کارهای بعدی**: حالتِ اِعمالِ درون‌برنامه (با بازبینیِ fail-closed)،
  `INCR` اتمیک، اتصالِ `waf_detect` به SIEM.

## ۳. چک‌لیستِ عملیاتی

- [ ] DNS پشتِ Cloudflare (orange-cloud) + Always Use HTTPS
- [ ] Managed Ruleset روشن + قانونِ نرخِ `/api/*`
- [ ] فایروالِ origin فقط IPهای Cloudflare
- [ ] `nginx -t` سبز + `node tests/waf-ddos.js` سبز
- [ ] هشدار روی رشدِ `waf_detect` در ممیزی (SIEM/cron)
