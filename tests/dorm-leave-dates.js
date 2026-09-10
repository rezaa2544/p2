#!/usr/bin/env node
/* رگرسیون BUG-1 (باگ‌هانت چت ۵): مرخصیِ آخر هفتهٔ خوابگاه باید دقیقاً
   «پنجشنبه→جمعهٔ پیشِ رو» باشد، در هر ۷ روزِ هفته.
   ─────────────────────────────────────────────────────────────
   ریشه: در `19-actions-dorm.js` فرمولِ «روزهای مانده تا پنجشنبه» با
   `((5-getDay())+7)%7` نوشته شده بود — ولی در JS جمعه=۵ است نه
   پنجشنبه (پنجشنبه=۴). نتیجه: بازه همیشه جمعه→شنبه می‌شد و در خودِ
   پنجشنبه هم from به‌جایِ امروز، فردا (جمعه) بود. دودیِ موجود هم
   همان فرمولِ غلط را آینه می‌کرد، پس سبزِ کاذب می‌داد.
   این سابت Date را روی هر ۷ روز هفته پین می‌کند، اکشنِ واقعیِ
   dorm-leave را کلیک می‌کند و weekday و ISO دقیقِ بازه را می‌سنجد. */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const vc = new VirtualConsole();
vc.on('jsdomError', () => {});
vc.on('error', () => {});

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true,
  url: 'http://localhost/', virtualConsole: vc,
});
const W = (expr) => dom.window.eval(expr);

function pinDate(isoDateTime) {
  const T = new Date(isoDateTime).getTime();
  dom.window.eval(`(function(T){
    const R = window.Date;
    class D extends R {
      constructor(...a){ if(a.length===0) super(T); else super(...a); }
      static now(){ return T; }
    }
    window.Date = D;
  })(${T})`);
}

let pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
/* پنجشنبهٔ پیشِ رو (۰ اگر امروز پنجشنبه است) — محاسبهٔ مستقلِ مرجع */
function upcomingThursday(todayIso) {
  const jsDay = new Date(todayIso + 'T12:00:00').getDay(); /* پنجشنبه=۴ */
  const off = ((4 - jsDay) + 7) % 7;
  const d = new Date(todayIso + 'T12:00:00');
  d.setDate(d.getDate() + off);
  const f = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  d.setDate(d.getDate() + 1);
  const t = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return { f, t };
}

dom.window.addEventListener('load', () => {
  setTimeout(() => {
    try {
      W(`S.user=db.users.find(u=>u.role==='manager'&&u.school_id===1);S.persona=null;S.boss=null;S.route='dorm';S.filters={};render();`);
      const sid = W(`(function(){var b=document.querySelector('[data-act="dorm-leave"]');return b?b.dataset.sid:0;})()`);
      if (!sid) { console.log('❌ dorm-leave-dates: دکمهٔ مرخصی پیدا نشد'); process.exit(1); }
      /* شنبه تا جمعه: ۵ تا ۱۱ سپتامبر ۲۰۲۶ */
      const days = ['2026-09-05','2026-09-06','2026-09-07','2026-09-08','2026-09-09','2026-09-10','2026-09-11'];
      for (const d of days) {
        pinDate(d + 'T12:00:00');
        W(`document.querySelector('[data-act="dorm-leave"][data-sid="${sid}"]').click()`);
        const rec = JSON.parse(W(`(function(){var l=db.leaves.filter(l=>l.student_id===${sid}&&l.kind==='dorm_weekend');var r=l[l.length-1];return JSON.stringify({f:r.from_date,t:r.to_date});})()`));
        const exp = upcomingThursday(d);
        const wdF = new Date(rec.f + 'T12:00:00').getDay();
        const wdT = new Date(rec.t + 'T12:00:00').getDay();
        chk(d + ': from پنجشنبه است', wdF === 4, 'شد ' + rec.f);
        chk(d + ': to جمعه است', wdT === 5, 'شد ' + rec.t);
        chk(d + ': بازه دقیقِ پنجشنبه→جمعهٔ پیشِ رو', rec.f === exp.f && rec.t === exp.t,
          'شد ' + rec.f + ' تا ' + rec.t + '، انتظار ' + exp.f + ' تا ' + exp.t);
      }
      console.log(`\ndorm-leave-dates: ${pass} سبز / ${fail} قرمز`);
      process.exit(fail ? 1 : 0);
    } catch (e) { console.log('❌ dorm-leave-dates خطا: ' + (e && e.message)); process.exit(1); }
  }, 1500);
});
setTimeout(() => { console.log('❌ dorm-leave-dates: timeout'); process.exit(1); }, 90000);
