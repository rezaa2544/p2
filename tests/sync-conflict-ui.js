/* ─────────────────────────────────────────────────────────────
   sync-conflict-ui.js — شکاف ۲ (client-offline-v2): Conflict Resolution UI
   وقتی دو دستگاه هم‌زمان یک رکورد را عوض کنند و سرور تغییرِ دیرهنگام را
   conflict_preserved / stale_base کند، کاربر باید ببیند کدام نسخه برنده
   شد: مودالِ «نسخهٔ شما رد شد» با مقایسهٔ فیلدبه‌فیلدِ دو نسخه.
   اجرا: node tests/sync-conflict-ui.js
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
  console.log('\n▸ شکاف ۲ — مودالِ داوریِ تعارض (نسخهٔ شما در برابرِ نسخهٔ سرور)');

  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.fetch = (url) => Promise.resolve(jres({}, 404));
    }
  });
  const W = (c) => dom.window.eval(c);
  await sleep(1700);
  W(`S.user = { id: 5, role: 'manager', school_id: 1, username: 'm' };
     SYNC.online = true; SYNC.demoMode = true;
     SYNC.queue = []; SYNC.dlq = []; saveQueue(); saveDlq(); 0;`);

  /* ── ۱) conflict_preserved: قلم conflict می‌شود و نسخهٔ سرور نگه داشته می‌شود ── */
  await sleep(1500); /* بگذار syncِ خودکارِ راه‌اندازی تمام شود (syncing=false) */
  W(`SYNC.syncing=false; SYNC.queue=[]; SYNC.dlq=[]; saveQueue(); saveDlq();
     enqueueOp({t:'upd',c:'grades',data:{score:17,term:'نوبت اول'},by:5});
     clearTimeout(SYNC.autoTimer); SYNC.autoTimer=null; 0;`);
  const realSend = dom.window.sendBatch;
  dom.window.sendBatch = async (batch) => batch.map(x => ({
    uid: x.uid, ok: false, code: 'conflict_preserved',
    message: 'تغییر هم‌زمان', server: { score: 19, term: 'نوبت اول' }
  }));
  await W(`syncNow(true)`);
  dom.window.sendBatch = realSend;
  chk('C1 قلمِ conflict_preserved وضعیتِ conflict گرفت',
    W(`SYNC.queue.length===1 && SYNC.queue[0].status`) === 'conflict',
    'status=' + W(`SYNC.queue[0] && SYNC.queue[0].status`));
  chk('C2 نسخهٔ سرور رویِ قلم نگه داشته شد (برایِ مقایسه)',
    W(`SYNC.queue[0].server && SYNC.queue[0].server.score`) === 19);

  /* ── ۲) پنلِ همگام‌سازی دکمهٔ «مقایسهٔ دو نسخه» دارد ── */
  W(`syncPanelModal(); 0;`);
  const panel = W(`document.getElementById('modal').innerHTML`);
  chk('C3 پنل دکمهٔ مقایسه برایِ قلمِ conflict دارد',
    panel.includes('sync-conflict-view') && panel.includes('مقایسهٔ دو نسخه'));

  /* ── ۳) مودالِ مقایسه: دو ستون + برجستگیِ تفاوت ── */
  const uid = W(`SYNC.queue[0].uid`);
  W(`syncConflictModal('${uid}'); 0;`);
  const modal = W(`document.getElementById('modal').innerHTML`);
  chk('C4 مودال بازشد و هر دو نسخه را نشان می‌دهد',
    modal.includes('نسخهٔ شما') && modal.includes('نسخهٔ سرور'));
  chk('C5 مقدارِ محلی (۱۷) و مقدارِ سرور (۱۹) هر دو دیده می‌شوند',
    modal.includes(W('fa(17)')) && modal.includes(W('fa(19)')));
  chk('C6 برچسبِ فارسیِ فیلد (نمره) به‌جایِ نامِ خام',
    modal.includes('نمره'));
  chk('C7 پیامِ داوری برایِ conflict: مدیر مدرسه داوری می‌کند',
    modal.includes('داوری'));

  /* ── ۴) stale_base: rejected + مودال با پیامِ «نسخهٔ سرور برنده است» ── */
  W(`closeModal(); SYNC.syncing=false; SYNC.queue=[]; saveQueue();
     enqueueOp({t:'upd',c:'attendance',data:{status:'absent'},by:5});
     clearTimeout(SYNC.autoTimer); SYNC.autoTimer=null; 0;`);
  dom.window.sendBatch = async (batch) => batch.map(x => ({
    uid: x.uid, ok: false, code: 'stale_base', message: 'نسخهٔ کهنه'
  }));
  await W(`syncNow(true)`);
  dom.window.sendBatch = realSend;
  chk('C8 قلمِ stale_base وضعیتِ rejected گرفت',
    W(`SYNC.queue.length===1 && SYNC.queue[0].status`) === 'rejected');
  const uid2 = W(`SYNC.queue[0].uid`);
  W(`syncConflictModal('${uid2}'); 0;`);
  const modal2 = W(`document.getElementById('modal').innerHTML`);
  chk('C9 مودالِ rejected: عنوانِ «نسخهٔ شما رد شد» و برنده‌بودنِ سرور',
    modal2.includes('نسخهٔ شما رد شد') && modal2.includes('برنده'));
  chk('C10 بدونِ نسخهٔ سرور، تغییرِ محلی نمایش داده می‌شود',
    modal2.includes('تغییری که همگام نشد'));

  /* ── ۵) XSS: دادهٔ مخرب در مودال تگ نمی‌سازد ── */
  W(`closeModal(); SYNC.queue=[]; saveQueue();
     SYNC.queue.push({ uid:'x1', op:{t:'upd',c:'grades',data:{reason:'<img src=x onerror=alert(1)>'}},
       status:'rejected', tries:0, error:null, created_at:new Date().toISOString(), server:{reason:'<b>سالم</b>'} });
     syncConflictModal('x1'); 0;`);
  chk('C11 مقدارِ مخرب escape می‌شود (XSS بسته)',
    W(`document.getElementById('modal').querySelector('img[src=x]')`) === null &&
    W(`document.getElementById('modal').innerHTML`).includes('&lt;img'));

  /* ── ۶) اکشنِ sync-conflict-view ثبت است ── */
  chk('C12 اکشنِ sync-conflict-view در SYNC_ACTIONS هست',
    W(`typeof SYNC_ACTIONS['sync-conflict-view']`) === 'function');

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
