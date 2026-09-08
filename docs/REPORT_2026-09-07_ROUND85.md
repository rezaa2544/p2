# گزارش تجمیعی دور 85 — 5 رفعِ حیاتیِ پیش از استقرار — ۱۶/۰۶/۱۴۰۵ (2026-09-07)

> دورِ «اجرایِ بخشِ امنیتیِ بازبینیِ معماری»: 4 موردِ P0/P1ِ
> docs/ARCHITECTURE_REVIEW.md پیاده شد — با سئوتِ واقعیِ سرور،
> جهش‌سنجی و gateِ کاملِ بعد از هر کامیت. برنچِ جدا
> (fix/pre-deployment-critical) — طبقِ دستور، **فقط** این 5 مورد.

## ۱. خلاصه

5 رفع + 1 کامیتِ اسناد روی برنچِ تازه — درزِ جعلِ مرخصی (P0-1)،
صفِ زهریِ همگام‌سازی (P0-2)، کدِ دموِ پیش‌فرض (P0-4)، TLSِ
production (P1-4) و قراردادِ شبکه (P1-2). smoke 546/546 و همهٔ
سئوت‌های server*/client در **هر** gate سبز ماندند.

## ۲. جدولِ بندها

| # | بند | نتیجه | کامیت |
|---|---|---|---|
| 1 | **P0-1 سفیدفهرستِ فیلدِ `leaves`** | ✅ درِ مشترکِ `filterFields` (IEP/ترک/leaves) · ins: والد فقط pending (مدیر/سوپرادمین: pending|approved|rejected — AD 78.3 حفظ) · upd status: فقط مدیر/سوپرادمین به approved|rejected · ردِّ per-op + آدیتِ `sync_field_denied` · server12 18/18 + جهش 2/2 | `3e68008` |
| 2 | **P0-2 dead-letter** | ✅ raw:true در sendBatch · کدهایِ پایدار → `rejected` (خارج از چرخه) · 401/5xx/شبکه → `failed`+backoff · duplicate_ignored → `synced` (حلقهٔ ابدی بسته) · نشانگر/پنل + sync-del · deadletter 18/18 + جهش 2/2 | `6b32db0` |
| 3 | **P0-4 DEMO_CODE پیش‌فرضِ خاموش** | ✅ `=== '1'` بدون fallback · سِوهٔ 21 تست: شکاف صفر · S31 (سرورِ فرزندِ بی-env) + M20 → server-mutations 20/20 · DEVELOPMENT.md به‌روز | `773d94f` |
| 4 | **P1-4 fail-fastِ TLS** | ✅ production + self-signed (subject===issuer) → exit(1) «Error: Production requires valid CA certificate» · گواهیِ خراب → «cert unreadable» · development دست‌نخورده · server13 9/9 + جهش 1/1 | `19d5b37` |
| 5 | **P1-2 قراردادِ `httpGetJson`** | ✅ همیشه resolve: ok/status/code/serverTime/data/error/networkError/timedOut · تمایز 4xx/5xx · code=alias (دیاگ بدونِ تغییرِ UX) · bell/detectServer صفرِ تغییر · httpgetjson 10/10 + جهش 3/3 | `43018d6` |
| 6 | **اسناد** | ✅ IMPLEMENTATION_SUMMARY.md (ریشه) + HANDOFF/آرشیو + AI_PROMPT بایگانیِ 85 + این گزارش | `2be3af7` + (این کامیت) |

## ۳. کد در برابرِ مستندات

- `DEPLOY.md` از قبل پیش‌فرضِ خاموشِ DEMO_CODE را (۰) می‌گفت — کد از
  سند عقب مانده بود؛ حالا یکی شدند. `DEVELOPMENT.md` ستونِ پیش‌فرض را
  به‌روز کرد.
- انحرافِ واحدِ مستند از متنِ دستور: قاعدهٔ `ins` نقش‌محور شد —
  دستور «فقط pending» با روندِ قفل‌شدهٔ خوابگاه (AD 78.3)
  برخورد داشت. جزئیات در IMPLEMENTATION_SUMMARY §3-P0-1.
- `AI_PROMPT.md`: بایگانیِ دور 85 — 5 قرارداد (filterFields،
  SYNC_DEAD_CODES، httpGetJson، DEMO_CODE/TLS، محیط/‌orphan/‌.git/config).

## ۴. آزمون‌ها (gate نهایی)

smoke 546/546 · server1 31/31 · server2 25 · server3 14 · server4 16 ·
server5 14 · server6 9 · server7 15 · server8 9 · server9 10 ·
server10 7 · server11-sms 9 · server11-mutations 6/6 · server12 18/18 ·
server12-mutations 2/2 · server13 9/9 · server13-mutations 1/1 ·
deadletter 18/18 · httpgetjson 10/10 · httpgetjson-mutations 3/3 ·
server-mutations 20/20 — **بدونِ هیچ regress**؛ 0 فرآیندِ سرورِ مانده؛
build --check سبز.

## ۵. تصمیم‌ها (قفل)

1. درزِ `leaves` با **ردِّ per-op** بسته شد (نه 403ِ کل‌دسته) —
   opهای سالمِ همان دسته زنده می‌مانند (دستور «403 یا ردِّ خاموش»
   هر دو را قبول داشت).
2. `duplicate_ignored` = «قبلاً اعمال‌شده» → `synced`؛ قبلاً در حلقهٔ
   retryِ ابدی می‌ماند.
3. `code` در قراردادِ httpGetJson **aliasِ status** است — حذف ممنوع
   (مصرف‌کننده‌های قدیمی).
4. تشخیصِ self-signed از `subject===issuer` (X509Certificate) — نه
   string-match روی خروجیِ tls-cert.js.

## ۶. آنچه موند

- **5 رفعِ باقی‌ماندهٔ ARCHITECTURE_REVIEW** (اگر دستور برسد): P0-3
  compactionِ log · P1-3 GCِ سرور · ریفکتورِ 19-actions + classScoreContext
  (بند 8) · P1-1 SSoTِ مجوز · P2 (base_version/‌inScope-index).
- mergeِ fix/pre-deployment-critical به main — منتظرِ دستور.
- 4 موردِ دائمی دست‌نخورده: پیامکِ واقعی · سرور+دامنه · Play ·
  پایلوت/تاریخ.

## ۷. GitHub

- برنچ `fix/pre-deployment-critical`: 6 کامیت روی `bab2036` —
  push + `git ls-remote` تأیید شد (2be3af7).
- نکتهٔ محیط: ریسِتِ سنبوکس remote/identity را پاک می‌کند و رفرانسِ
  کهنهٔ origin/main یک بار reset را گمراه کرد (main واقعی = bab2036).
