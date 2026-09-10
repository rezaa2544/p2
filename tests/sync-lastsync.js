/* ─────────────────────────────────────────────────────────────
   sync-lastsync.js — W7-2 (باگ‌هانت چت ۵، نشست ۲، موج ۷)
   ─────────────────────────────────────────────────────────────
   «آخرین همگام‌سازی موفق» (SYNC.lastSync) پس از هر اجرایِ syncNow —
   حتی وقتی هیچ قلمی همگام نشده بود (همه failed یا ردِ سرور) — جلو می‌رفت؛
   پنل به کاربر «تازگیِ دروغین» نشان می‌داد. حالا فقط وقتی جلو می‌رود که
   دست‌کم یک قلم واقعاً همگام شده باشد (ok یا duplicate_ignored).
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
  console.log('\n▸ W7-2 — lastSync فقط با همگامِ واقعی جلو می‌رود (jsdom)');

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

  async function runCase(resultsFn) {
    W(`SYNC.queue=[];SYNC.dlq=[];SYNC.lastSync=null;saveQueue();saveDlq();saveSyncMeta();
        enqueueOp({t:'ins',c:'announcements',data:{school_id:1,title:'L'},by:5}); 0;`);
    dom.window.sendBatch = resultsFn;
    await W(`syncNow(true)`);
    dom.window.sendBatch = realSend;
  }

  /* ── ۱) شکستِ گذرا: lastSync نباید جلو برود ── */
  await runCase(async (batch) => batch.map((x) => ({ uid: x.uid, ok: false, code: 'send_failed', message: 'قطع' })));
  chk('L1 شکستِ گذرا: lastSync همچنان null', W(`SYNC.lastSync`) === null, 'lastSync=' + W(`SYNC.lastSync`));
  chk('L2 همان: قلم failed ماند (برایِ تلاشِ دوباره)', W(`SYNC.queue.length===1 && SYNC.queue[0].status`) === 'failed');

  /* ── ۲) ردِ پایدارِ سرور: lastSync نباید جلو برود ── */
  await runCase(async (batch) => batch.map((x) => ({ uid: x.uid, ok: false, code: 'validation_failed', message: 'بد' })));
  chk('L3 ردِ سرور: lastSync همچنان null', W(`SYNC.lastSync`) === null);
  chk('L4 همان: قلم rejected شد', W(`SYNC.queue.length===1 && SYNC.queue[0].status`) === 'rejected');

  /* ── ۳) موفق: lastSync جلو می‌رود ── */
  await runCase(async (batch) => batch.map((x) => ({ uid: x.uid, ok: true })));
  chk('L5 موفق: lastSync ثبت شد', typeof W(`SYNC.lastSync`) === 'string' && W(`SYNC.lastSync`).length > 0);
  chk('L6 همان: صف تخلیه شد', W(`SYNC.queue.length`) === 0);

  /* ── ۴) تکراریِ سرور (ارسالِ دوباره پس از قطعی): پیشرفت حساب می‌شود ── */
  await runCase(async (batch) => batch.map((x) => ({ uid: x.uid, ok: true, code: 'duplicate_ignored' })));
  chk('L7 تکراری: lastSync ثبت شد', typeof W(`SYNC.lastSync`) === 'string' && W(`SYNC.lastSync`).length > 0);
  chk('L8 همان: صف تخلیه شد', W(`SYNC.queue.length`) === 0);

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
