/* ─────────────────────────────────────────────────────────────
   storage-quota.js — شکاف ۴ (client-offline-v2): Storage Quota Management
   اگر IndexedDB/حافظهٔ مرورگر نزدیکِ سهمیه شود:
   - هشدارِ هیسترزیس‌دار به کاربر (۸۵٪ هشدار، ریست زیرِ ۷۰٪)
   - مودالِ پاک‌سازیِ انتخابی: DLQ و قلم‌هایِ ترمینالِ کهنه
   - دادهٔ ارسال‌نشدهٔ کاربر (pending/sending) هرگز پاک نمی‌شود
   تست: quota near-full با استابِ navigator.storage.estimate
   اجرا: node tests/storage-quota.js
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
  console.log('\n▸ شکاف ۴ — مدیریتِ سهمیهٔ ذخیره‌سازی (هشدار + پاک‌سازیِ انتخابی)');

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

  /* ── ۱) سناریویِ quota near-full: استابِ estimate با ۹۰٪ مصرف ── */
  W(`Object.defineProperty(navigator, 'storage', {
       value: { estimate: () => Promise.resolve({ usage: 90 * 1048576, quota: 100 * 1048576 }) },
       configurable: true }); 0;`);
  const est1 = await W(`storageQuotaEstimate()`);
  chk('Q1 تخمینِ سهمیه known و ratio درست', est1.known === true && Math.abs(est1.ratio - 0.9) < 1e-9);

  W(`SYNC.quotaWarned = false; document.getElementById('toasts').innerHTML=''; 0;`);
  W(`checkStorageQuota(); 0;`);
  await sleep(80);
  chk('Q2 در ۹۰٪ هشدارِ سهمیه داده شد (toast + پرچم)',
    W(`SYNC.quotaWarned`) === true && W(`document.getElementById('toasts').textContent`).includes('سهمیه'));

  /* هیسترزیس: بارِ دوم هشدارِ تکراری نمی‌دهد */
  W(`document.getElementById('toasts').innerHTML=''; checkStorageQuota(); 0;`);
  await sleep(80);
  chk('Q3 هشدارِ تکراری داده نمی‌شود (هیسترزیس)',
    W(`document.getElementById('toasts').textContent`) === '');

  /* ریست زیرِ ۷۰٪ */
  W(`Object.defineProperty(navigator, 'storage', {
       value: { estimate: () => Promise.resolve({ usage: 50 * 1048576, quota: 100 * 1048576 }) },
       configurable: true });
     checkStorageQuota(); 0;`);
  await sleep(80);
  chk('Q4 زیرِ ۷۰٪ پرچمِ هشدار ریست می‌شود', W(`SYNC.quotaWarned`) === false);

  /* ── ۲) مودالِ سهمیه ── */
  W(`Object.defineProperty(navigator, 'storage', {
       value: { estimate: () => Promise.resolve({ usage: 92 * 1048576, quota: 100 * 1048576 }) },
       configurable: true }); 0;`);
  /* DLQ با ۳ قلم + صف با ۱ pending و ۲ ترمینالِ کهنه */
  W(`SYNC.dlq = [
       {uid:'d1',op:{t:'ins',c:'grades',data:{}},status:'rejected',dead_reason:'retry_exhausted',dead_at:new Date().toISOString(),tries:5,created_at:new Date().toISOString()},
       {uid:'d2',op:{t:'del',c:'discipline',data:{}},status:'rejected',dead_reason:'queue_overflow',dead_at:new Date().toISOString(),tries:0,created_at:new Date().toISOString()},
       {uid:'d3',op:{t:'upd',c:'users',data:{}},status:'rejected',dead_reason:'expired',dead_at:new Date().toISOString(),tries:0,created_at:new Date().toISOString()}];
     var old = new Date(Date.now() - 10*24*3600*1000).toISOString();
     SYNC.queue = [
       {uid:'p1',op:{t:'ins',c:'attendance',data:{}},status:'pending',tries:0,created_at:old},
       {uid:'r1',op:{t:'ins',c:'grades',data:{}},status:'rejected',tries:0,created_at:old},
       {uid:'f1',op:{t:'upd',c:'grades',data:{}},status:'failed',tries:2,created_at:old}];
     saveQueue(); saveDlq(); storageQuotaModal(); 0;`);
  await sleep(120);
  const modal = W(`document.getElementById('modal').innerHTML`);
  chk('Q5 مودال مصرف و درصد را نشان می‌دهد',
    modal.includes('۹۲') && modal.includes('مگابایت'));
  chk('Q6 در near-full هشدارِ روشن در مودال هست', modal.includes('نزدیکِ سهمیه'));
  chk('Q7 گزینهٔ پاک‌سازیِ DLQ با شمارش (۳ قلم)',
    modal.includes('sync-quota-clear-dlq') && modal.includes(W('fa(3)') + ' قلم'));
  chk('Q8 گزینهٔ هرسِ قلم‌هایِ ترمینالِ کهنه (۲ قلم)',
    modal.includes('sync-quota-prune') && modal.includes(W('fa(2)') + ' قلم'));
  chk('Q9 قولِ صریح: pending پاک نمی‌شود', modal.includes('هرگز پاک نمی‌شوند'));

  /* ── ۳) پاک‌سازیِ انتخابی ── */
  chk('Q10 quotaClearDlq همه را پاک می‌کند و شمارش برمی‌گرداند',
    W(`quotaClearDlq()`) === 3 && W(`SYNC.dlq.length`) === 0);
  chk('Q11 quotaPruneTerminal فقط ترمینال‌هایِ کهنه را هرس می‌کند (pending می‌ماند)',
    W(`quotaPruneTerminal()`) === 2 && W(`SYNC.queue.length`) === 1 && W(`SYNC.queue[0].status`) === 'pending');

  /* ── ۴) fail-safe: بدونِ API سهمیه، نه کرش نه هشدارِ کاذب ── */
  W(`Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true });
     SYNC.quotaWarned = false; document.getElementById('toasts').innerHTML=''; checkStorageQuota(); 0;`);
  await sleep(80);
  chk('Q12 بدونِ navigator.storage: بی‌صدا و بی‌هشدار',
    W(`SYNC.quotaWarned`) === false && W(`document.getElementById('toasts').textContent`) === '');

  /* ── ۵) enqueueOp پایش را صدا می‌زند + دکمهٔ حافظه در پنل ── */
  chk('Q13 enqueueOp پایشِ سهمیه را صدا می‌زند',
    W(`enqueueOp.toString()`).includes('checkStorageQuota'));
  W(`closeModal(); syncPanelModal(); 0;`);
  chk('Q14 پنلِ همگام‌سازی دکمهٔ «حافظه» دارد',
    W(`document.getElementById('modal').innerHTML`).includes('sync-quota'));
  W(`closeModal(); 0;`);

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
