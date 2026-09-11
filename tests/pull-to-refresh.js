/* ─────────────────────────────────────────────────────────────
   pull-to-refresh.js — شکاف ۵ (client-offline-v2): Pull-to-Refresh
   رویِ موبایل، کشیدنِ صفحه به پایین از بالایِ اسکرول باید sync کند.
   - در همهٔ viewها کار می‌کند (شنوندهٔ واگذارشده رویِ document + .content)
   - ضدِ double-trigger: تا پایانِ refreshِ جاری کشیدنِ تازه بی‌اثر است
   - فقط از scrollTop=0 و بیرونِ مودال شروع می‌شود
   اجرا: node tests/pull-to-refresh.js
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

(async () => {
  console.log('\n▸ شکاف ۵ — Pull-to-Refresh (کشیدن برایِ همگام‌سازی)');

  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ ok: false, status: 404, json: async () => ({}), headers: { get: () => null } });
    }
  });
  const W = (c) => dom.window.eval(c);
  const win = dom.window;
  await sleep(1700);

  /* ورود تا shell (با .content) رندر شود */
  W(`finishLogin(db.users.find(u=>u.role==='manager')); 0;`);
  await sleep(200);
  W(`S.showPicker=false; closeModal(); render(); 0;`); /* مودالِ انتخابِ پنل را ببند */
  await sleep(100);
  W(`SYNC.online = true; SYNC.demoMode = true; SYNC.syncing = false;
     SYNC.queue = []; SYNC.dlq = []; saveQueue(); saveDlq(); 0;`);

  chk('P1 شنونده‌هایِ لمسی نصب شده‌اند (initSync → initPullToRefresh)',
    W(`initSync.toString()`).includes('initPullToRefresh') && W(`typeof ptrTouchStart`) === 'function');
  chk('P2 ظرفِ همهٔ viewها (.content) در shell هست', W(`ptrContainer() != null`));

  /* شبیه‌سازِ لمس: touch رویِ .content از scrollTop=0 */
  function touch(type, y){
    W(`(function(){
      var c = ptrContainer();
      var ev = new window.Event('${type}', { bubbles: true });
      ev.touches = ${type === 'touchend' ? '[]' : `[{ clientY: ${y}, clientX: 100 }]`};
      Object.defineProperty(ev, 'target', { value: c, enumerable: true });
      ${type === 'touchstart' ? 'ptrTouchStart(ev);' : type === 'touchmove' ? 'ptrTouchMove(ev);' : 'ptrTouchEnd(ev);'}
    })(); 0;`);
  }

  /* ── ۱) کشیدنِ کامل → trigger ── */
  let syncCalls = 0;
  const realSyncNow = win.syncNow;
  win.syncNow = function(){ syncCalls++; return Promise.resolve(); };

  touch('touchstart', 100);
  chk('P3 کشیدن از scrollTop=0 شروع می‌شود', W(`PTR.pulling`) === true);
  touch('touchmove', 300);
  chk('P4 فاصلهٔ کشیدن با مقاومتِ کشسانی ثبت شد', W(`PTR.dist`) > 0 && W(`PTR.dist`) <= 140);
  chk('P5 نشانگرِ ptr ساخته و مرئی شد',
    W(`document.getElementById('ptr-indicator') != null`) &&
    W(`document.getElementById('ptr-indicator').textContent`).length > 0);
  touch('touchend', 300);
  chk('P6 رهاسازی پس از آستانه → syncNow صدا شد', syncCalls === 1, 'calls=' + syncCalls);
  chk('P7 در حالِ refresh پرچمِ busy بالاست (ضدِ double-trigger)', W(`PTR.busy`) === true);

  /* ── ۲) double-trigger: کشیدنِ دوم وسطِ refresh بی‌اثر است ── */
  touch('touchstart', 100);
  chk('P8 وسطِ refresh کشیدنِ تازه شروع نمی‌شود', W(`PTR.pulling`) === false);
  touch('touchmove', 300);
  touch('touchend', 300);
  chk('P9 وسطِ refresh هیچ syncِ دومی اجرا نشد', syncCalls === 1, 'calls=' + syncCalls);

  await sleep(700); /* پایانِ refresh (۵۰۰ms نمایشِ حداقلی) */
  chk('P10 پس از پایان، busy آزاد شد', W(`PTR.busy`) === false);

  /* ── ۳) کشیدنِ ناکافی (زیرِ آستانه) trigger نمی‌کند ── */
  touch('touchstart', 100);
  touch('touchmove', 140); /* dy=40 → dist=22 < 70 */
  touch('touchend', 140);
  await sleep(50);
  chk('P11 کشیدنِ زیرِ آستانه sync نمی‌کند', syncCalls === 1, 'calls=' + syncCalls);

  /* ── ۴) از وسطِ لیست (scrollTop>0) شروع نمی‌شود ── */
  W(`Object.defineProperty(ptrContainer(), 'scrollTop', { value: 200, configurable: true }); 0;`);
  touch('touchstart', 100);
  chk('P12 با scrollTop>0 کشیدن شروع نمی‌شود', W(`PTR.pulling`) === false);
  W(`Object.defineProperty(ptrContainer(), 'scrollTop', { value: 0, configurable: true }); 0;`);

  /* ── ۵) وسطِ مودال شروع نمی‌شود ── */
  W(`openModal('<div class="card-body">مودال</div>'); 0;`);
  touch('touchstart', 100);
  chk('P13 وسطِ مودالِ باز کشیدن شروع نمی‌شود', W(`PTR.pulling`) === false);
  W(`closeModal(); 0;`);

  /* ── ۶) در همهٔ viewها: پس از تعویضِ روت، ظرف هنوز پیدا می‌شود ── */
  W(`S.route='attendance'; render(); 0;`);
  await sleep(100);
  touch('touchstart', 100);
  chk('P14 پس از تعویضِ view (attendance) هنوز کار می‌کند', W(`PTR.pulling`) === true);
  touch('touchend', 100);

  win.syncNow = realSyncNow;

  /* ── ۷) CSS نشانگر در باندل هست ── */
  chk('P15 استایلِ #ptr-indicator در باندل هست', HTML.includes('#ptr-indicator'));

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
