/* ─────────────────────────────────────────────────────────────
   sync-sending-revive.js — W7-1 (باگ‌هانت چت ۵، نشست ۲، موج ۷)
   ─────────────────────────────────────────────────────────────
   قلمِ `sending` هیچ مسیرِ بازگشتی نداشت:
   - کرش/بستنِ تب وسطِ ارسال: loadQueue وضعیتِ sending را برمی‌گرداند و
     syncNow فقط pending/failed را برمی‌دارد — قلم برایِ همیشه می‌ماند،
     نشانگر هم «همگام» نشان می‌دهد (pendingCount ساکت). گم‌شدنِ بی‌صدا.
   - پاسخِ ناقصِ سرور (results کوتاه‌تر از batch): همان چسبندگی درونِ جلسه.
   رفع: (۱) loadQueue هر sendingِ بی‌پاسخ را pending می‌کند (سرور با uid
   تکراری را duplicate_ignored می‌کند — S2-1 — پس امن است)؛ (۲) syncNow پس
   از پردازشِ نتایج، هر قلمِ batch که هنوز sending مانده را failedِ گذرا
   می‌کند تا دوباره تلاش شود (پس از ۵ بار: DLQِ مرئی — نه چسبندگیِ نامرئی).
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
  console.log('\n▸ W7-1 — قلمِ sendingِ بی‌پاسخ احیا می‌شود (jsdom)');

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
     SYNC.online = false; SYNC.demoMode = true;`);

  /* ── ۱) شبیه‌سازیِ کرش: sendingِ ذخیره‌شده با بارگذاریِ دوباره pending می‌شود ── */
  W(`SYNC.queue=[];SYNC.dlq=[];saveQueue();saveDlq();0;`);
  W(`enqueueOp({t:'ins',c:'announcements',data:{school_id:1,title:'کرش؟'},by:5});
      enqueueOp({t:'ins',c:'announcements',data:{school_id:1,title:'کرش۲؟'},by:5});
      SYNC.queue.forEach(function(x){x.status='sending';}); saveQueue(); 0;`);
  chk('S1a دو قلمِ sending ذخیره شد', W(`SYNC.queue.filter(function(x){return x.status==='sending';}).length`) === 2);
  W(`loadQueue(); 0;`); /* همان کاری که بوتِ دوباره می‌کند */
  chk('S1b پس از loadQueue هر دو pending شدند (احیا)',
    W(`SYNC.queue.filter(function(x){return x.status==='pending';}).length`) === 2,
    'statuses=' + W(`SYNC.queue.map(function(x){return x.status;}).join(',')`));
  chk('S1c نشانگر دیگر «همگامِ دروغین» نیست (pending=۲)',
    W(`(function(){var n=SYNC.queue.filter(function(x){return x.status==='pending'||x.status==='failed';}).length;return n;})()`) === 2);

  /* ── ۲) احیا کاربردی است: آنلاین + ارسال → تخلیه ── */
  W(`SYNC.online = true; 0;`);
  await W(`syncNow(true)`);
  chk('S2 پس از احیا، ارسال موفق صف را تخلیه کرد', W(`SYNC.queue.length`) === 0, 'len=' + W(`SYNC.queue.length`));

  /* ── ۳) پاسخِ ناقصِ سرور: قلمِ بی‌پاسخ failedِ گذرا می‌شود (نه sendingِ چسبیده) ── */
  W(`SYNC.queue=[];saveQueue();
      enqueueOp({t:'ins',c:'announcements',data:{school_id:1,title:'بی‌پاسخ'},by:5}); 0;`);
  const realSend = dom.window.sendBatch;
  dom.window.sendBatch = async () => []; /* سرورِ بیمار: هیچ نتیجه‌ای */
  await W(`syncNow(true)`);
  dom.window.sendBatch = realSend;
  chk('S3a قلمِ بی‌پاسخ sending نماند', W(`SYNC.queue.filter(function(x){return x.status==='sending';}).length`) === 0,
    'statuses=' + W(`SYNC.queue.map(function(x){return x.status;}).join(',')`));
  chk('S3b همان قلم failed شد تا دوباره تلاش شود',
    W(`SYNC.queue.filter(function(x){return x.status==='failed';}).length`) === 1);
  chk('S3c شمارشِ تلاش بالا رفت (به‌سویِ DLQِ مرئی، نه چسبندگی)',
    W(`SYNC.queue.length && SYNC.queue[0].tries`) === 1);

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
