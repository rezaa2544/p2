#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Arena 5 — Demo-Boot Guard (دور ۱۱۱)
   رگرسیونِ نقصِ date-bound: جدولِ برنامه ۵ روز دارد (d=0..4) ولی
   نگاشتِ «امروز» (dow=(getDay()+1)%7) چهارشنبه را d=5 می‌دهد ⇒
   `slot.teacher_id` روی undefined ⇒ crashِ بوتِ دمو در هر چهارشنبه
   (smoke را 405/547 کرد). نگهبان: برایِ هر ۶ مقدارِ ممکنِ dow،
   جستجویِ جابه‌جای (با فِلبکِ period) باید به یک سطرِ واقعی برسَد.
   قطعی است: به روزِ هفتهٔ واقعی وابسته نیست.
   اجرا: node tests/arena5-demo-guard.js
   ═══════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — سئوت رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function chk(name, cond, extra){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\n▸ Arena5 — Demo-Boot Guard (crashِ چهارشنبه)');

  const errors = [];
  const vc = new VirtualConsole().on('jsdomError', (e) => errors.push(String((e && e.message) || e)));
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc,
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  await sleep(2500);

  /* G1: بوت بدونِ خطایِ load (همان شرطِ smoke — ولی مستقل ازِ smoke) */
  chk('G1 بوتِ دمو بدونِ خطا (امروز ' + new Date().toISOString().slice(0, 10) + ')', errors.length === 0, errors.slice(0, 2).join(' | '));

  /* G2: برایِ هر ۶ مقدارِ dow، جستجویِ slot با فِلبکِ period
          (همان منطقی که 02-demo-data.js اجرا می‌کند) ⇒ سطرِ واقعی */
  const probe = W(`(()=>{const c=db.classes.find(x=>x.school_id===1);
    const out=[];
    for(let dow=0; dow<6; dow++){
      let s=db.schedule.find(x=>x.class_id===c.id&&x.day===dow&&x.period===2)
          ||db.schedule.find(x=>x.class_id===c.id&&x.period===2);
      out.push(!!(s&&typeof s.teacher_id==='number'));
    }
    return JSON.stringify(out);})()`);
  const ok = JSON.parse(probe);
  chk('G2 جستجویِ جابه‌جای برایِ dow=0..5 همواره سطرِ معتبر می‌دهد (فِلبکِ period)', ok.length === 6 && ok.every(Boolean), JSON.stringify(ok));

  /* G3: بنیاد — پیش از PR #45 مدرسهٔ دمو پنج‌روزه بود و دمایِ خامِ d=5 وجود
          نداشت (رگرسِ معکوسِ نقص). با دموِ شش‌روزهٔ 351bd10 دمایِ d=5 هست؛
          فِلبکِ period باقی می‌ماند به‌عنوانِ دفاعِ دوم (G2 + بندِ ۱.۵ِ smoke). */
  const raw = W(`(()=>{const c=db.classes.find(x=>x.school_id===1);
    return JSON.stringify(db.schedule.some(x=>x.class_id===c.id&&x.day===5&&x.period===2));})()`);
  chk('G3 دمایِ خامِ d=5 وجود دارد (مدرسهٔ دمو شش‌روزه — فِلبک به‌عنوانِ دفاعِ دوم می‌ماند)', JSON.parse(raw) === true);

  /* G4: نتیجهٔ کاربری — جابه‌جایِ دمو ساخته شده (مدرسهٔ ۱) */
  const subs = W(`(()=>db.substitutions.filter(s=>s.school_id===1).length)()`);
  chk('G4 جابه‌جایِ دمو برایِ مدرسهٔ ۱ ساخته شده', subs >= 1, 'subs=' + subs);

  console.log('\n════════════════════════════════════════');
  console.log('Arena5-DemoGuard: ' + pass + ' سبز / ' + fail + ' قرمز');
  if(fail){ for(const f of fails) console.log('  ✗ ' + f); process.exit(1); }
  process.exit(0);
})().catch((e) => {
  console.error('FATAL: ' + ((e && e.stack) || e));
  process.exit(1);
});
