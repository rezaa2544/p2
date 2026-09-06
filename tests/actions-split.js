#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   دور 85 بند W3 — شکستنِ A در 19-actions.js (بند 2.8 بازبینی)
   گروه‌های bus/vclass/hw به آبجکت‌هایِ ماژولِ خودشان منتقل شدند و
   زنجیرهٔ dispatch (الگوی F7_ACTIONS) آن‌ها را با (el,id) صدا می‌زند.
   این تست: (الف) نام‌ها درست جابه‌جا شده‌اند، (ب) دکمه‌ها واقعاً کلیک
   می‌شوند و مودال می‌سازند — در jsdomِ واقعیِ build شده.
   ═══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0, errors = [];
function check(name, cond, extra){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function boot(pre){
  const vc = new VirtualConsole().on('jsdomError', () => {}).on('error', () => {});
  return new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'http://localhost/', virtualConsole: vc,
    beforeParse(w){ if(pre) pre(w); },
  });
}
const W = (win, expr) => win.eval(expr);

const BUS_NAMES = ['bus-route-new','bus-route-save','bus-route-del','bus-students','bus-students-save','bus-event','bus-need-set','bus-need-save','bus-need-parent-save','bus-event-student','bus-loc-driver','bus-loc-student','bus-follow-open','bus-follow-save','bus-follow-close','bus-follow-close-save'];
const VC_NAMES = ['vclass-links','vclass-link-copy','vc-join','vc-leave','vclass-new','vclass-save','vclass-del','vclass-play','vclass-q-ask','vclass-q-save','vclass-q-answer','vclass-q-answer-save'];
const HW_NAMES = ['hw-window','hw-window-save','hw-lock','hw-view','hw-new','hw-save','hw-del','hw-list','hw-grade','hw-grade-save','hw-canvas-clear','hw-submit'];

(async function main(){
  console.log('▸ دور 85 — W3: شکستنِ A (bus/vclass/hw به ماژولِ خود)');
  const a = boot(); const wa = a.window;
  await sleep(800);

  const names = W(wa, `(typeof BUS_ACTIONS==='object'&&typeof VCLASS_ACTIONS==='object'&&typeof HW_ACTIONS==='object')
      ? {bus:Object.keys(BUS_ACTIONS), vc:Object.keys(VCLASS_ACTIONS), hw:Object.keys(HW_ACTIONS)} : null`);
  check('S0 سه آبجکتِ اکشنِ ماژولی وجود دارند', !!names, 'names=' + String(names));
  if(!names){ console.log(`\nactions-split: ${pass} بررسی — ❌ ${fail} خطا`); process.exit(1); }
  const same = (x, y) => JSON.stringify(x.slice().sort()) === JSON.stringify(y.slice().sort());
  check('S1 BUS_ACTIONS دقیقاً ۱۶ اکشنِ bus است', same(names.bus, BUS_NAMES), 'got=' + names.bus.join(','));
  check('S2 VCLASS_ACTIONS دقیقاً ۱۲ اکشنِ کلاسِ مجازی است', same(names.vc, VC_NAMES), 'got=' + names.vc.join(','));
  check('S3 HW_ACTIONS دقیقاً ۱۲ اکشنِ تکالیف است', same(names.hw, HW_NAMES), 'got=' + names.hw.join(','));

  /* حذف از 19-actions.js: هیچ‌کدام از ۴۰ نام دیگر در A نیستند */
  const src19 = fs.readFileSync(path.join(ROOT, 'src/js/19-actions.js'), 'utf8');
  const still = [...BUS_NAMES, ...VC_NAMES, ...HW_NAMES].filter(
      n => src19.includes("'" + n + "'(") || src19.includes(n + '()'));
  check('S4 هیچ‌کدام از ۴۰ اکشن در 19-actions.js (A) نمی‌ماند', still.length === 0, 'باقی‌مانده: ' + still.join(','));
  const disp = W(wa, `typeof BUS_ACTIONS!=='undefined' ? 'yes' : 'no'`);
  check('S5 زنجیرهٔ dispatch در build است (BUS_ACTIONS)', disp === 'yes', '');

  /* ── رفتار: کلیکِ واقعی در jsdom ── */
  const login = W(wa, `(function(){
      var m = db.users.find(function(u){ return u.role==='manager' && u.school_id===1; });
      S.user = m; S.persona = null; S.boss = null;
      return !!(m && m.id);
    })()`);
  check('S6 حسابِ مدیرِ seed موجود است (ورود مستقیم)', !!login, '');

  function clickAndModal(act){
    return W(wa, `(function(){
      var b = document.querySelector('[data-act="${act}"]');
      if(!b) return {btn: false, modal: false};
      b.dispatchEvent(new MouseEvent('click', {bubbles: true}));
      return {btn: true, modal: !!document.querySelector('#modal .modal')};
    })()`);
  }

  W(wa, "S.route='busservice'; render();");
  await sleep(50);
  const r1 = clickAndModal('bus-route-new');
  check('S7 bus: دکمهٔ «مسیر جدید» رندر و کلیک → مودال', r1.btn && r1.modal, JSON.stringify(r1));
  W(wa, 'closeModal();');

  /* vclass/homework روتِ دبیر است — یک دبیرِ دارای کلاس انتخاب می‌شود */
  const tlogin = W(wa, `(function(){
      var t = db.users.filter(function(u){ return u.role==='teacher' && teacherClasses(u.id).length > 0; })[0];
      if(!t) return false;
      S.user = t; S.persona = null;
      return true;
    })()`);
  check('S8a حسابِ دبیرِ دارای کلاس موجود است', !!tlogin, '');

  W(wa, "S.route='vclass'; render();");
  await sleep(50);
  const r2 = clickAndModal('vclass-new');
  check('S8 vclass: دکمهٔ «نشست جدید» رندر و کلیک → مودال', r2.btn && r2.modal, JSON.stringify(r2));
  W(wa, 'closeModal();');

  W(wa, "S.route='homework'; render();");
  await sleep(50);
  const r3 = clickAndModal('hw-new');
  check('S9 homework: دکمهٔ «تکلیف جدید» رندر و کلیک → مودال', r3.btn && r3.modal, JSON.stringify(r3));

  console.log(`\nactions-split (شکستنِ A): ${pass} بررسی — ${fail ? '❌ ' + fail + ' خطا' : '✅ همه سبز'}`);
  if (fail) { console.log(errors.join('\n')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('فاجعهٔ تست:', e); process.exit(1); });
