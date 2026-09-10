/* ─────────────────────────────────────────────────────────────
   wave7-offline-queue.js — موج ۷ (باگ‌هانت چت ۵، نشست ۴)
   رگرسیونِ صفِ آفلاین:
   - W7-6: قلمِ failed‌شده‌ی جارویِ «پاسخِ ناقصِ سرور» هیچ تلاشِ
     خودکاری (backoff) نمی‌گرفت — `bad` فقط از نتایجِ res حساب می‌شد،
     پس پاسخِ ناقص ⇒ bad=0 ⇒ attempts ریست و بدون scheduleSync؛
     قلمِ failed تا یک محرکِ بیرونی زمین‌گیر می‌ماند.
     حالا هر قلمِ failedِ باقی در صف هم backoff را زمان‌بندی می‌کند.
   - وارسیِ تکمیلی: پس از موفقِ کامل، هیچ تلاشِ اضافه‌ای زمان‌بندی
     نمی‌شود (attempts=0 و autoTimer خالی).
   اجرا: node tests/wave7-offline-queue.js
   ───────────────────────────────────────────────────────────── */
'use strict';
const { JSDOM } = require('jsdom');
const fs = require('fs');
const HTML = fs.readFileSync(__dirname + '/../index.html', 'utf8');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jres = (obj, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => obj, headers: { get: () => null } });

(async () => {
  console.log('\n▸ W7-6 — قلمِ failedِ «پاسخِ ناقص» تلاشِ خودکار (backoff) می‌گیرد (jsdom)');

  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.fetch = function (url) {
        const p = String(url).split('?')[0];
        if (p === '/api/health') return Promise.resolve(jres({ ok: true }));
        if (p === '/api/auth/me') return Promise.resolve(jres({ ok: false, code: 'no_session' }, 401));
        return Promise.resolve(jres({}, 404));
      };
    }
  });
  const W = (c) => dom.window.eval(c);
  await sleep(1700);
  W(`S.user = { id: 5, role: 'manager', school_id: 1, username: 'm' };
     SYNC.online = true; SYNC.demoMode = true;`);
  const realSend = dom.window.sendBatch;

  /* ── ۱) پاسخِ ناقصِ سرور: قلم failed می‌شود و تلاشِ خودکار زمان‌بندی می‌شود ── */
  W(`SYNC.queue=[];SYNC.dlq=[];SYNC.lastSync=null;saveQueue();saveDlq();saveSyncMeta();
     enqueueOp({t:'ins',c:'announcements',data:{school_id:1,title:'بی‌پاسخ'},by:5});
     clearTimeout(SYNC.autoTimer); SYNC.autoTimer = null; SYNC.attempts = 0; 0;`);
  dom.window.sendBatch = async () => []; /* سرورِ بیمار: هیچ نتیجه‌ای */
  await W(`syncNow(true)`);
  dom.window.sendBatch = realSend;
  chk('Q1 قلمِ بی‌پاسخ sending نماند',
    W(`SYNC.queue.filter(function(x){return x.status==='sending';}).length`) === 0,
    'statuses=' + W(`SYNC.queue.map(function(x){return x.status;}).join(',')`));
  chk('Q2 قلم failed شد (قابلِ تلاشِ دوباره)',
    W(`SYNC.queue.length===1 && SYNC.queue[0].status`) === 'failed');
  chk('Q3 شمارندهٔ attempts بالا رفت (تلاشِ خودکار فعال)',
    W(`SYNC.attempts`) === 1, 'attempts=' + W(`SYNC.attempts`));
  chk('Q4 زمان‌بندِ backoff تنظیم شد (بدون محرکِ بیرونی دوباره ارسال می‌شود)',
    W(`SYNC.autoTimer != null`), 'autoTimer=' + W(`SYNC.autoTimer`));
  W(`clearTimeout(SYNC.autoTimer); SYNC.autoTimer = null; 0;`);

  /* ── ۲) موفقِ کامل: هیچ تلاشِ اضافه‌ای زمان‌بندی نمی‌شود ── */
  W(`SYNC.queue=[];SYNC.dlq=[];SYNC.lastSync=null;saveQueue();saveDlq();saveSyncMeta();
     enqueueOp({t:'ins',c:'announcements',data:{school_id:1,title:'خوب'},by:5});
     clearTimeout(SYNC.autoTimer); SYNC.autoTimer = null; SYNC.attempts = 0; 0;`);
  await W(`syncNow(true)`);
  chk('Q5 موفقِ کامل: صف تخلیه شد', W(`SYNC.queue.length`) === 0, 'len=' + W(`SYNC.queue.length`));
  chk('Q6 موفقِ کامل: attempts صفر ماند', W(`SYNC.attempts`) === 0, 'attempts=' + W(`SYNC.attempts`));
  chk('Q7 موفقِ کامل: زمان‌بندِ اضافه تنظیم نشد', W(`SYNC.autoTimer == null`), 'autoTimer=' + W(`SYNC.autoTimer`));

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
