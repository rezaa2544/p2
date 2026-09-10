/* ─────────────────────────────────────────────────────────────
   sync-dlq-retry.js — W7-3 (باگ‌هانت چت ۵، نشست ۲، موج ۷)
   ─────────────────────────────────────────────────────────────
   صفِ مرده فقط «حذف» داشت، نه «تلاش دوباره»: قلمی که از قطعیِ شبکه (۵ بار)
   یا سقفِ صف دفن شده بود — یعنی دادهٔ کاربر که سرور هرگز ندیده — هیچ مسیرِ
   بازگشتی نداشت؛ کاربر یا واگرایی را نگه می‌داشت یا تغییر را از نو می‌زد.
   حالا سطرِ DLQ دکمهٔ «تلاش دوباره» دارد: قلم با tries=۰ به صف برمی‌گردد
   (سقف‌ها دوباره اعمال می‌شوند) و در چرخهٔ عادی ارسال می‌شود.
   ───────────────────────────────────────────────────────────── */
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
  console.log('\n▸ W7-3 — قلمِ مردهٔ گذرا دوباره به صف برمی‌گردد (jsdom)');

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
  W(`SYNC.queue=[];SYNC.dlq=[];saveQueue();saveDlq();0;`);

  /* ── ۱) دفنِ واقع‌گرایانه: ۵ شکستِ گذرا ← DLQ ── */
  const uid = W(`(function(){ var it = enqueueOp({t:'ins',c:'announcements',data:{school_id:1,title:'دفن‌شده'},by:5});
    for(var i=0;i<5;i++) noteOpFailed(it, 'قطع '+i);
    return it.uid; })()`);
  chk('T1 پس از ۵ شکستِ گذرا قلم در DLQ است', W(`SYNC.dlq.length`) === 1 && W(`SYNC.queue.length`) === 0);
  chk('T2 علت، پایانِ تلاش‌هاست', W(`SYNC.dlq.length && SYNC.dlq[0].dead_reason`) === 'retry_exhausted');

  /* ── ۲) تلاش دوباره: بازگشت به صف ── */
  let retryErr = null;
  try {
    W(`SYNC_ACTIONS['sync-retry']({dataset:{uid:'${uid}'}}); 0;`);
  } catch (e) { retryErr = String(e && e.message || e); }
  chk('T3 اکشنِ sync-retry اجرا شد', retryErr === null, retryErr);
  chk('T4 قلم با tries=۰ و pending برگشت', W(`SYNC.queue.length`) === 1
    && W(`SYNC.queue[0].status`) === 'pending' && W(`SYNC.queue[0].tries`) === 0
    && W(`SYNC.dlq.length`) === 0);

  /* ── ۳) بازیابی کاربردی است: ارسال موفق تخلیه‌اش می‌کند ── */
  await W(`syncNow(true)`);
  chk('T5 پس از تلاشِ دوباره، ارسال موفق صف را تخلیه کرد', W(`SYNC.queue.length`) === 0);

  /* ── ۴) ایمنیِ دوبار-کلیک: ورودیِ تکراری ساخته نمی‌شود ── */
  const uid2 = W(`(function(){ var it = enqueueOp({t:'ins',c:'announcements',data:{school_id:1,title:'دوبار'},by:5});
    for(var i=0;i<5;i++) noteOpFailed(it, 'قطع');
    return it.uid; })()`);
  W(`SYNC_ACTIONS['sync-retry']({dataset:{uid:'${uid2}'}}); 0;`);
  W(`SYNC_ACTIONS['sync-retry']({dataset:{uid:'${uid2}'}}); 0;`);
  chk('T6 تلاشِ دوبارهٔ دوم، قلمِ تکراری نساخت', W(`SYNC.queue.length`) === 1 && W(`SYNC.dlq.length`) === 0);

  /* ── ۵) uid ناشناس: بی‌اثرِ بی‌سر‌و‌صدا ── */
  const before = W(`SYNC.queue.length + '/' + SYNC.dlq.length`);
  W(`SYNC_ACTIONS['sync-retry']({dataset:{uid:'nope-none'}}); 0;`);
  chk('T7 uid ناشناس چیزی را عوض نکرد', W(`SYNC.queue.length + '/' + SYNC.dlq.length`) === before);

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
