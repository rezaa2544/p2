#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   فاز ۲ بند ۲ — کشِ classScoreContext
   زمینهٔ نمراتِ هر کلاس تا بعد از نخستین تغییرِ داده کش می‌شود؛
   پیش از این، هر رندر کلِ db.grades را می‌گذشت (بند ۲.۷ بازبینی).
   نیازمند jsdom:  npm i --no-save jsdom
   ═══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — رد شد.  (npm i --no-save jsdom)'); process.exit(1); }

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

(async function main(){
  console.log('▸ فاز  — بند ۲: کشِ classScoreContext');
  const a = boot(); const wa = a.window;
  await sleep(800);

  const ready = W(wa, 'typeof classScoreContext === "function" && db.classes && db.classes.length && db.grades && db.grades.length');
  check('K0 بوت + classScoreContext + دادهٔ نمرات', !!ready, 'ready=' + ready);
  if(!ready){ console.log(`\nclsctx: ${pass} بررسی — ❌ ${fail} خطا`); process.exit(1); }

  /* ── صحنهٔ کنترل‌شده: یک کلاس + یک درسِ جدید + ۳ دانش‌آموز ── */
  W(wa, `
    (function(){
      SYNC_MUTED = true;
      var cls = db.classes[0];
      var studs = studentsOfClass(cls.id);
      var g0 = db.grades[0] || {};
      var term = g0.term || 'نوبت اول', et = g0.exam_type || 'آزمون';
      var SID = 999999;
      window._c = { clsId: cls.id, sid: SID, term: term, et: et };
      /* ۲ عضوِ صریح برای درسِ جدید (مسیرِ classSubjectMembers فعال می‌شود)؛
         سومِ دانش‌آموزان هنوز عضو نیست و نمرهٔش شمرده نمی‌شود */
      [0,1].forEach(function(i){
        insert('class_subject_members', {class_id: cls.id, subject_id: SID, student_id: studs[i].id});
      });
      var base = Object.assign({}, g0, {class_id: cls.id, subject_id: SID, term: term, exam_type: et, max_score: 20});
      delete base.id;
      window._g1 = insert('grades', Object.assign({}, base, {student_id: studs[0].id, score: 10})).id;
      window._g2 = insert('grades', Object.assign({}, base, {student_id: studs[1].id, score: 10})).id;
      window._g3 = insert('grades', Object.assign({}, base, {student_id: studs[2].id, score: 20})).id;
      window._s3 = studs[2].id;
      SYNC_MUTED = false;
    })();
  `);
  check('K1 صحنهٔ آزمون ساخته شد (کلاس + ۲ عضو + ۳ نمره)', W(wa, '!!window._c && !!window._g1'), '');

  const key = W(wa, 'window._c.sid + "|" + window._c.term + "|" + window._c.et');
  const e1 = W(wa, 'classScoreContext(window._c.clsId)');
  const e1again = W(wa, 'classScoreContext(window._c.clsId)');
  check('K2 ورودیِ زمینه ساخته شد (n=2 — نمرهٔ سوم خارج از شمار)',
        e1 && e1[key] && e1[key].n === 2 && e1[key].students === 2,
        'entry=' + JSON.stringify(e1 && e1[key]));
  check('K3 کش فعال: فراخوانیِ دوم همان شیء را برمی‌گرداند', e1again === e1, '');

  /* ── K4: تغییرِ نمره → زمینهٔ تازه ── */
  W(wa, 'SYNC_MUTED=true; update("grades", window._g1, {score: 20}); SYNC_MUTED=false;');
  const e4 = W(wa, 'classScoreContext(window._c.clsId)');
  check('K4 تغییرِ نمره: زمینه بازمحاسبه شد (اشارهٔ تازه + میانگین ۱۵)',
        e4 !== e1 && e4[key] && Math.abs(e4[key].avg - 15) < 1e-9,
        'avg=' + (e4 && e4[key] && e4[key].avg) + ' sameRef=' + (e4 === e1));
  check('K5 کشِ تازه پایدار است', W(wa, 'classScoreContext(window._c.clsId)') === e4, '');

  /* ── K6: عضویتِ جدید → زمینهٔ تازه ── */
  W(wa, 'SYNC_MUTED=true; insert("class_subject_members", {class_id: window._c.clsId, subject_id: window._c.sid, student_id: window._s3}); SYNC_MUTED=false;');
  const e6 = W(wa, 'classScoreContext(window._c.clsId)');
  check('K6 افزودنِ عضو سوم: زمینه بازمحاسبه شد (n=3)',
        e6 !== e4 && e6[key] && e6[key].n === 3 && e6[key].students === 3,
        'entry=' + JSON.stringify(e6 && e6[key]));

  /* ── K7: کلاسِ دیگر مستقل است ── */
  const e7 = W(wa, '(function(){ var o=db.classes[1]; return o?classScoreContext(o.id):null; })()');
  check('K7 کلاسِ دوم: زمینهٔ جداگانه',
        e7 !== null && e7 !== e6,
        'cls2=' + (e7 ? Object.keys(e7).length : 'null'));

  /* ── K8: هر عملیاتِ ثبت‌شده نسخه را زیاد می‌کند ── */
  const e8a = W(wa, 'classScoreContext(window._c.clsId)');
  W(wa, 'SYNC_MUTED=true; insert("announcements", {title:"تست کش", body:"بی‌ربط", created_at:"2026-09-07"}); SYNC_MUTED=false;');
  const e8b = W(wa, 'classScoreContext(window._c.clsId)');
  check('K8 عملیاتِ بی‌ربط: بازمحاسبه (اشارهٔ تازه، محتوا یکسان)',
        e8b !== e8a && JSON.stringify(e8b) === JSON.stringify(e6),
        'sameRef=' + (e8b === e8a));

  console.log(`\nclsctx (کشِ زمینهٔ نمرات): ${pass} بررسی — ${fail ? '❌ ' + fail + ' خطا' : '✅ همه سبز'}`);
  if (fail) { console.log(errors.join('\n')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('فاجعهٔ تست:', e); process.exit(1); });
