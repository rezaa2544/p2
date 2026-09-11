/* ─────────────────────────────────────────────────────────────
   offline-indicator.js — شکاف ۳ (client-offline-v2): Offline Indicator
   نشانگرِ آفلاین: تفکیکِ صف (ثبت/ویرایش/حذف) + آخرین همگام‌سازیِ نسبی
   («۳ دقیقه پیش») + زمانِ تخمینیِ ارسال، در tooltipِ نشانگر و پنل.
   اجرا: node tests/offline-indicator.js
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
  console.log('\n▸ شکاف ۳ — نشانگرِ آفلاین: تفکیکِ صف + زمانِ نسبی + تخمین');

  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ ok: false, status: 404, json: async () => ({}), headers: { get: () => null } });
    }
  });
  const W = (c) => dom.window.eval(c);
  await sleep(1700);
  W(`S.user = { id: 5, role: 'manager', school_id: 1, username: 'm' };
     SYNC.online = false; SYNC.demoMode = true; SYNC.syncing = false;
     SYNC.queue = []; SYNC.dlq = []; saveQueue(); saveDlq(); 0;`);

  /* صف: ۵ ثبت + ۲ حذف + ۱ ویرایش (مطابقِ سناریویِ پرامپت) */
  W(`for(var i=0;i<5;i++) enqueueOp({t:'ins',c:'attendance',data:{status:'present'},by:5});
     for(var j=0;j<2;j++) enqueueOp({t:'del',c:'discipline',data:{},by:5});
     enqueueOp({t:'upd',c:'grades',data:{score:20},by:5});
     clearTimeout(SYNC.autoTimer); SYNC.autoTimer=null;
     SYNC.lastSync = new Date(Date.now() - 3*60*1000).toISOString(); 0;`);

  /* ── ۱) queueBreakdown ── */
  const b = W(`JSON.stringify(queueBreakdown())`);
  chk('I1 queueBreakdown تفکیکِ درست می‌دهد (۵ ثبت، ۱ ویرایش، ۲ حذف)',
    b === JSON.stringify({ ins: 5, upd: 1, del: 2, total: 8 }), b);
  chk('I2 queueBreakdownFa خلاصهٔ فارسی می‌سازد',
    W(`queueBreakdownFa()`).includes(W('fa(5)') + ' ثبت') && W(`queueBreakdownFa()`).includes(W('fa(2)') + ' حذف'));

  /* ── ۲) syncRelTime ── */
  chk('I3 زمانِ نسبی: ۳ دقیقه پیش',
    W(`syncRelTime(SYNC.lastSync)`) === W('fa(3)') + ' دقیقه پیش', W(`syncRelTime(SYNC.lastSync)`));
  chk('I4 زمانِ نسبی: همین حالا (زیرِ یک دقیقه)',
    W(`syncRelTime(new Date().toISOString())`) === 'همین حالا');
  chk('I5 زمانِ نسبی: ساعت و روز',
    W(`syncRelTime(new Date(Date.now()-2*3600*1000).toISOString())`).includes('ساعت پیش') &&
    W(`syncRelTime(new Date(Date.now()-3*86400*1000).toISOString())`).includes('روز پیش'));
  chk('I6 زمانِ نسبی: ورودیِ نامعتبر null (نه کرش، نه NaN)',
    W(`syncRelTime(null)`) === null && W(`syncRelTime('bogus')`) === null);

  /* ── ۳) تخمین ── */
  chk('I7 تخمینِ صفِ خالی صفر است', W(`SYNC.queue=[];estimateSyncSeconds()`) === 0);
  W(`for(var i=0;i<8;i++) SYNC.queue.push({uid:'u'+i,op:{t:'ins',c:'grades',data:{}},status:'pending',tries:0,created_at:new Date().toISOString()}); 0;`);
  chk('I8 تخمینِ ۸ قلم: مثبت و خوانا («ثانیه»)',
    W(`estimateSyncSeconds()`) > 0 && W(`estimateSyncFa()`).includes('ثانیه'));
  W(`SYNC.queue=[]; for(var i=0;i<10000;i++) SYNC.queue.push({uid:'q'+i,op:{t:'ins',c:'grades',data:{}},status:'pending',tries:0,created_at:new Date().toISOString()}); 0;`);
  chk('I9 صفِ خیلی بزرگ: تخمین به دقیقه می‌رود', W(`estimateSyncFa()`).includes('دقیقه'));
  W(`SYNC.queue=[]; 0;`);

  /* ── ۴) نشانگر و پنل ── */
  W(`for(var i=0;i<5;i++) SYNC.queue.push({uid:'b'+i,op:{t:'ins',c:'attendance',data:{}},status:'pending',tries:0,created_at:new Date().toISOString()});
     for(var j=0;j<2;j++) SYNC.queue.push({uid:'d'+j,op:{t:'del',c:'discipline',data:{}},status:'pending',tries:0,created_at:new Date().toISOString()});
     SYNC.lastSync = new Date(Date.now() - 3*60*1000).toISOString(); 0;`);
  const badge = W(`syncBadge()`);
  chk('I10 tooltipِ نشانگرِ آفلاین تفکیک و آخرین همگام‌سازی و تخمین دارد',
    badge.includes('ثبت') && badge.includes('حذف') && badge.includes('آخرین همگام‌سازی') && badge.includes('دقیقه پیش'),
    badge.slice(0, 200));
  W(`syncPanelModal(); 0;`);
  const panel = W(`document.getElementById('modal').innerHTML`);
  chk('I11 پنل تفکیکِ صف را کنارِ شمارش نشان می‌دهد',
    panel.includes('ثبت') && panel.includes('حذف'));
  chk('I12 پنل زمانِ تخمینی و زمانِ نسبیِ آخرین همگام‌سازی را نشان می‌دهد',
    panel.includes('زمانِ تخمینیِ ارسال') && panel.includes('دقیقه پیش'));
  W(`closeModal(); 0;`);

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
