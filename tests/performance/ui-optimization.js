#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/performance/ui-optimization.js — آزمونِ بهینه‌سازیِ کلاینت (Wave 24)
   -------------------------------------------------------------------
   پروفایلِ jsdom (۲۵ رندر × ۵ مسیر) نشان داد داغ‌ترین توابعِ کلاینت:
     queueBytes (stringify کل صف در هر رندر) ~۴۴۰ms
     fa / jalali (toLocaleString/Intl در هر سلولِ جدول) ~۲۴۰ms
   بهینه‌سازی: memoize کران‌دار (fa/jalali) + کشِ افزایشیِ queueBytes.

   بخش A — درستیِ fa/jalali پس از memoize:
     A1..A5 مقادیرِ مرزی (null/undefined/''/صفر/اعشار/منفی) عینِ قبل
     A6 کشِ تکراری همان خروجی را می‌دهد (نه مقدارِ کهنهٔ کلیدِ دیگر)
     A7 سررسیدِ سقفِ کش → پاک‌سازی، نه خطا؛ خروجی همچنان درست
     A8 jalali تاریخِ معتبر/نامعتبر مثلِ قبل

   بخش B — درستیِ queueBytes پس از کش:
     B1 مقدارِ کش‌شده = stringify واقعی
     B2 push به صف → مقدار بزرگ می‌شود (کشِ کهنه سرو نمی‌شود)
     B3 جایگزینیِ آرایه (filter) → بازمحاسبه
     B4 گیتِ سقفِ حجمی enforceQueueCaps همچنان کار می‌کند

   بخش C — گیت‌های عملکردِ رندر (jsdom، دمو با ۳۴k ردیف):
     C1 میانهٔ رندرِ گرمِ هر مسیرِ اصلی < 500ms (سقفِ بسیار امن برای
        jsdom؛ در مرورگرِ واقعی innerHTML چند برابر سریع‌تر است —
        هدفِ گیت: جلوگیری از رگرسیونِ درجه‌دومِ آینده، نه سنجشِ UX)
     C2 ۱۰۰ فراخوانیِ متوالی fa+jalali+queueBytes < 50ms (مسیرِ داغِ کش‌شده)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
let JSDOM;
try { ({ JSDOM } = require(path.join(ROOT, 'node_modules', 'jsdom'))); }
catch (e) { console.error('⚠️ jsdom نصب نیست: npm install --no-save jsdom'); process.exit(1); }

let pass = 0, fail = 0;
const T = (ok, name, detail) => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

console.log('▸ Wave 24 — بهینه‌سازیِ کلاینت (رندر/کش)');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  beforeParse(w) {
    w.fetch = () => Promise.reject(new Error('offline'));
    w.scrollTo = () => {};
    w.URL.createObjectURL = () => 'blob:x';
  },
});

setTimeout(() => {
  const w = dom.window;
  const E = (code) => w.eval(code);
  try {
    E("S.user = db.users.find(u=>u.role==='manager'); SYNC.demoMode = true;");

    /* ── A: fa / jalali ── */
    T(E("fa(null)") === '—' && E("fa(undefined)") === '—' && E("fa('')") === '—', 'A1 مقادیرِ تهی → «—»');
    T(E("fa(0)") === '۰', 'A2 صفر درست', E("fa(0)"));
    T(E("fa(1234.56)") === E("Number(1234.56).toLocaleString('fa-IR',{maximumFractionDigits:2})"), 'A3 اعشار = مرجعِ بومی');
    T(E("fa(-45)") === E("Number(-45).toLocaleString('fa-IR',{maximumFractionDigits:2})"), 'A4 منفی = مرجعِ بومی');
    T(E("fa(17.75)") === E("fa(17.75)"), 'A5 فراخوانیِ تکراری همان خروجی');
    T(E("fa(11) !== fa(22)"), 'A6 کلیدهای متفاوت → خروجی‌های متفاوت (کش قاطی نمی‌کند)');
    E("for(var i=0;i<5000;i++) fa(i+0.5);"); /* عبور از سقفِ 4096 → پاک‌سازی */
    T(E("fa(17.75)") === E("Number(17.75).toLocaleString('fa-IR',{maximumFractionDigits:2})"), 'A7 پس از سررسیدِ کش، خروجی همچنان درست');
    T(E("jalali('2026-09-12')") === E("new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'long',day:'numeric'}).format(new Date('2026-09-12'))"),
      'A8a jalali تاریخِ معتبر = مرجعِ Intl');
    T(E("jalali('')") === '—' && E("jalali(null)") === '—', 'A8b jalali تهی → «—»');

    /* ── B: queueBytes ── */
    const real = E("JSON.stringify(SYNC.queue).length");
    const cached = E("queueBytes()");
    T(cached === real, 'B1 مقدارِ queueBytes = stringify واقعی', cached + ' vs ' + real);
    const before = E("queueBytes()");
    E("SYNC.queue.push({uid:'w24_test_1',op:{t:'ins'},status:'pending',tries:0,error:null,created_at:new Date().toISOString(),user_id:1,school_id:1})");
    const after = E("queueBytes()");
    T(after > before, 'B2 push → مقدار بزرگ‌تر (کشِ کهنه سرو نمی‌شود)', before + '→' + after);
    const realAfter = E("JSON.stringify(SYNC.queue).length");
    T(Math.abs(after - realAfter) <= 2, 'B2b تقریبِ افزایشی ≤ ۲ بایت خطا', after + ' vs ' + realAfter);
    E("SYNC.queue = SYNC.queue.filter(x=>x.uid!=='w24_test_1')");
    const shrunk = E("queueBytes()");
    T(shrunk === E("JSON.stringify(SYNC.queue).length"), 'B3 جایگزینیِ آرایه → بازمحاسبهٔ دقیق');
    T(E("typeof enforceQueueCaps==='function' && enforceQueueCaps() >= 0"), 'B4 enforceQueueCaps روی کشِ نو سالم است');

    /* ── C: گیت‌های رندر ── */
    const routes = ['dashboard', 'attendance', 'grades', 'students', 'reports'];
    let worst = { r: '', ms: 0 };
    for (const r of routes) {
      const times = [];
      for (let i = 0; i < 5; i++) {
        const t0 = Date.now();
        E(`S.route='${r}'; render();`);
        times.push(Date.now() - t0);
      }
      const med = median(times);
      if (med > worst.ms) worst = { r, ms: med };
      T(med < 500, `C1 رندرِ «${r}» (میانهٔ ۵) = ${med}ms < 500ms`, times.join(','));
    }

    const t0 = Date.now();
    E("for(var i=0;i<100;i++){ fa(i%20+0.25); jalali('2026-09-1'+(i%9+1)); queueBytes(); }");
    const hot = Date.now() - t0;
    T(hot < 50, `C2 ۱۰۰×(fa+jalali+queueBytes) = ${hot}ms < 50ms (مسیرِ داغِ کش‌شده)`);

    console.log(`\nui-optimization: ${pass} سبز / ${fail} قرمز ${fail ? '❌' : '✅'}`);
    w.close();
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('خطا:', e && e.message);
    process.exit(1);
  }
}, 2500);
