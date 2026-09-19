#!/usr/bin/env node
/**
 * سئوت حالت مدرسه ۲ (بند ۱۶ — روزِ غیرحضوری، عملِ واقعی) — پایش
 *
 * در پروسهٔ جداگانه اجرا می‌شود (نه داخل smoke.js).
 *
 * بخش‌ها:
 *  V1 کتابخانه: امانت در روزِ غیرحضوری مسدود (روی داده) + مدرسهٔ
 *     حضوری عادی
 *  V2 مهمان: ثبت مهمان در روزِ غیرحضوری مسدود + مدرسهٔ حضوری عادی
 *  V3 تجهیز: «استفاده» در روزِ غیرحضوری مسدود؛ وضعیتِ غیرفیزیکی
 *     (تعمیر) و «استفاده» در مدرسهٔ حضوری عادی
 *  V4 حضور: att-commit در روزِ غیرحضوری چیزی نمی‌نویسد (تستِ
 *     مسیرِ نوشتنِ واقعی با کلیک) + کنترلِ مدرسهٔ حضوری می‌نویسد
 *  V5 خبرِ اولیا: setSchoolMode(virtual) همهٔ اولیا را در صف می‌گذارد
 *     (بدون تکراری) + in_person پیام‌های معلق را لغو می‌کند
 *  V6 نوار: متنِ نوار «مسدود است» را می‌گوید
 *
 * اجرا: node tests/schoolmode2.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — سئوت رد شد.  (npm i --no-save jsdom)'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
});
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

const results = [];
const sec = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, detail: '', ms: Date.now() - t0 }); }
  catch (e) { const stack1 = String((e.stack||'').split(String.fromCharCode(10))[1]||'').trim(); results.push({ name, ok: false, detail: String(e.message || e) + '  ||  ' + stack1, ms: Date.now() - t0 }); }
};

const setU = (id, extra) => W(`S.user=byId('users',${id});S.persona=null;S.boss=null;S.child=null;${extra||''}`);

(async () => {
  await sleep(300);
  const T = W(`todayISO()`);
  const T2 = W(`new Date(Date.now()+86400000).toISOString().slice(0,10)`);
  const fx = JSON.parse(W(`JSON.stringify((function(){
    var T = ${JSON.stringify(T)};
    var sc1 = db.schools[0], sc2 = db.schools[1];
    var mgr1 = db.users.filter(function(u){return u.role==='manager'&&u.school_id===sc1.id;})[0];
    var mgr2 = db.users.filter(function(u){return u.role==='manager'&&u.school_id===sc2.id;})[0];
    var t1 = db.users.filter(function(u){return u.role==='teacher'&&teacherClasses(u.id).some(function(c){return c.school_id===sc1.id;});})[0];
    var t2 = db.users.filter(function(u){return u.role==='teacher'&&teacherClasses(u.id).some(function(c){return c.school_id===sc2.id;});})[0];
    var c1 = t1 ? teacherClasses(t1.id).filter(function(c){return c.school_id===sc1.id;})[0] : null;
    var c2 = t2 ? teacherClasses(t2.id).filter(function(c){return c.school_id===sc2.id;})[0] : null;
    var rowToday = function(u, T){ return db.attendance.filter(function(x){return x.student_id===u.id&&x.date===T;})[0]; };
    var cls1 = c1 ? db.users.filter(function(u){return u.role==='student'&&classOf(u.id)&&classOf(u.id).id===c1.id;}) : [];
    var cls2 = c2 ? db.users.filter(function(u){return u.role==='student'&&classOf(u.id)&&classOf(u.id).id===c2.id;}) : [];
    /* دانش‌آموزی که امروز «غایب» نیست — تا پیش‌نویسِ absent تفاوتِ واقعی بسازد */
    var st1 = cls1.filter(function(u){var r=rowToday(u,T);return !r||r.status!=='absent';})[0] || cls1[0] || null;
    var st2 = cls2.filter(function(u){var r=rowToday(u,T);return !r||r.status!=='absent';})[0] || cls2[0] || null;
    var b1 = db.lib_books.filter(function(b){return b.school_id===sc1.id;})[0];
    var a1 = db.assets.filter(function(a){return a.school_id===sc1.id;})[0];
    return {
      sc1:sc1.id, sc2:sc2.id,
      mgr1:mgr1?mgr1.id:0, mgr2:mgr2?mgr2.id:0,
      t1:t1?t1.id:0, t2:t2?t2.id:0,
      c1:c1?c1.id:0, c2:c2?c2.id:0,
      st1:st1?st1.id:0, st2:st2?st2.id:0,
      b1:b1?b1.id:0, a1:a1?a1.id:0, a1st:a1?a1.status:''
    };
  })())`));
  if(!fx.mgr1 || !fx.mgr2 || !fx.t1 || !fx.t2 || !fx.c1 || !fx.c2 || !fx.st1 || !fx.st2 || !fx.b1 || !fx.a1)
    throw new Error('فیکسور کامل نشد: ' + JSON.stringify(fx));

  const clickCommit = () => W(`(function(){
    var el = document.createElement('button');
    el.setAttribute('data-act','att-commit');
    el.id = '_sm2_commit';
    document.body.appendChild(el);
    el.click();
    el.remove();
    return true;
  })()`);

  await sec('V1 کتابخانه: امانت روزِ غیرحضوری مسدود', async () => {
    /* مدرسهٔ مجازی (۲): مسدود — حتی اگر کتابِ دیگر مدرسه باشد */
    setU(fx.mgr2);
    let r = JSON.parse(W(`JSON.stringify(libLend(${fx.b1},${fx.st2},null))`));
    assert(r.ok===false && r.msg.indexOf('مسدود')>=0, 'امانت در روزِ غیرحضوری رد نشد: ' + JSON.stringify(r));
    const nL = W(`db.lib_loans.length`);
    /* مدرسهٔ حضوری (۱): عادی */
    setU(fx.mgr1);
    r = JSON.parse(W(`JSON.stringify(libLend(${fx.b1},${fx.st1},null))`));
    assert(r.ok===true, 'امانت در مدرسهٔ حضوری شکست: ' + (r.msg||''));
    try{
      assert(W(`db.lib_loans.length`)===nL+1, 'ردیفِ امانت ساخته نشد');
    } finally {
      W(`remove('lib_loans', ${r.rec.id})`);
    }
  });

  await sec('V2 مهمان: ثبت روزِ غیرحضوری مسدود', async () => {
    setU(fx.mgr2);
    let r = JSON.parse(W(`JSON.stringify(visitorRegister('آزمون','تست'))`));
    assert(r.ok===false && r.msg.indexOf('مسدود')>=0, 'ثبت مهمان در روزِ غیرحضوری رد نشد: ' + JSON.stringify(r));
    const nV = W(`db.visitors.length`);
    setU(fx.mgr1);
    r = JSON.parse(W(`JSON.stringify(visitorRegister('آزمون','تست'))`));
    assert(r.ok===true, 'ثبت مهمان در مدرسهٔ حضوری شکست: ' + (r.msg||''));
    try{
      assert(W(`db.visitors.length`)===nV+1, 'ردیفِ مهمان ساخته نشد');
    } finally {
      W(`remove('visitors', ${r.rec.id})`);
    }
  });

  await sec('V3 تجهیز: «استفاده» روزِ غیرحضوری مسدود', async () => {
    setU(fx.mgr2);
    let r = JSON.parse(W(`JSON.stringify(assetSetStatus(${fx.a1},'in_use'))`));
    assert(r.ok===false && r.msg.indexOf('مسدود')>=0, 'in_use در روزِ غیرحضوری رد نشد: ' + JSON.stringify(r));
    /* مدرسهٔ حضوری: in_use عادی */
    setU(fx.mgr1);
    r = JSON.parse(W(`JSON.stringify(assetSetStatus(${fx.a1},'in_use'))`));
    assert(r.ok===true, 'in_use در مدرسهٔ حضوری شکست: ' + (r.msg||''));
    try{
      /* وضعیتِ غیرفیزیکی در هر حالت باید بماند (تعمیر فیزیکی تحویل نیست) */
      r = JSON.parse(W(`JSON.stringify(assetSetStatus(${fx.a1},'repair'))`));
      assert(r.ok===true, 'repair شکست: ' + (r.msg||''));
    } finally {
      W(`assetSetStatus(${fx.a1},${JSON.stringify(fx.a1st)})`);
    }
  });

  await sec('V4 حضور: att-commit روزِ غیرحضوری نمی‌نویسد', async () => {
    /* روزِ غیرحضوری: پیش‌نویس + کلیکِ واقعیِ «تأیید و ثبت» → هیچ نوشتن */
    setU(fx.t2, `S.route='attendance';S.filters={date:${JSON.stringify(T)},class:${JSON.stringify(String(fx.c2))}};S.page=1;`);
    W(`attDraftSet(${fx.c2},${JSON.stringify(T)},${fx.st2},'absent')`);
    const nAtt = W(`db.attendance.filter(function(x){return x.student_id===${fx.st2}&&x.date===${JSON.stringify(T)};}).length`);
    clickCommit();
    const nAtt2 = W(`db.attendance.filter(function(x){return x.student_id===${fx.st2}&&x.date===${JSON.stringify(T)};}).length`);
    const dLeft = JSON.parse(W(`JSON.stringify(attDraftDiff(${fx.c2},${JSON.stringify(T)}))`));
    assert(nAtt2===nAtt, 'در روزِ غیرحضوری ردیفِ حضور نوشته شد! (' + nAtt + '→' + nAtt2 + ')');
    assert(dLeft.changes.length===1, 'پیش‌نویس باید باقی بماند (ثبت نشده): ' + dLeft.changes.length);
    W(`attDraftClear(${fx.c2},${JSON.stringify(T)})`);
    /* کنترل: مدرسهٔ حضوری می‌نویسد */
    const stOrig = W(`(function(){var r=db.attendance.filter(function(x){return x.student_id===${fx.st1}&&x.date===${JSON.stringify(T)};})[0];return r?r.status:'__none__';})()`);
    setU(fx.t1, `S.route='attendance';S.filters={date:${JSON.stringify(T)},class:${JSON.stringify(String(fx.c1))}};S.page=1;`);
    W(`attDraftSet(${fx.c1},${JSON.stringify(T)},${fx.st1},'absent')`);
    const qBefore = W(`db.notify_queue.map(function(q){return q.id;})`);
    clickCommit();
    const stNew = W(`(function(){var r=db.attendance.filter(function(x){return x.student_id===${fx.st1}&&x.date===${JSON.stringify(T)};})[0];return r?r.status:'__none__';})()`);
    const dLeft2 = JSON.parse(W(`JSON.stringify(attDraftDiff(${fx.c1},${JSON.stringify(T)}))`));
    try{
      assert(stNew==='absent', 'کنترل: مدرسهٔ حضوری حضور را ننوشت: ' + stOrig + '→' + stNew);
      assert(dLeft2.changes.length===0, 'کنترل: پیش‌نویس پس از ثبت پاک نمی‌شود');
    } finally {
      W(`(function(){var r=db.attendance.filter(function(x){return x.student_id===${fx.st1}&&x.date===${JSON.stringify(T)};})[0];
        if(r){ if('${stOrig}'==='__none__'){ remove('attendance', r.id); } else { update('attendance', r.id, {status:'${stOrig}'}); } }
        db.notify_queue.slice().forEach(function(q){ if(${JSON.stringify(qBefore)}.indexOf(q.id)<0) remove('notify_queue', q.id); });
      })()`);
    }
  });

  await sec('V5 خبرِ اولیا: صف + بدون تکراری + لغو با حضوری', async () => {
    const origRules = W(`(function(){var s=byId('schools',${fx.sc1});return JSON.stringify(s.notify_rules||null);})()`);
    const pre = 'schoolmode:' + fx.sc1 + ':' + T2 + ':';
    const rowsOf = () => W(`db.notify_queue.filter(function(q){return q.source_ref && q.source_ref.indexOf(${JSON.stringify(pre)})===0;})`);
    try{
      W(`notifySaveSettings(${fx.sc1},{enabled:true})`);
      setU(fx.mgr1);
      const expect = W(`db.users.filter(function(x){return x.role==='student'&&x.school_id===${fx.sc1}&&(x.status||'active')==='active'&&db.parent_links.some(function(l){return l.student_id===x.id&&/^09\\d{9}$/.test((byId('users',l.parent_id)||{}).phone||'');});}).length`);
      assert(expect > 0, 'فیکسور: مدرسهٔ ۱ اولیای معتبر ندارد');
      /* virtual: همهٔ اولیا در صف */
      let r = JSON.parse(W(`JSON.stringify(setSchoolMode(${fx.sc1},${JSON.stringify(T2)},'virtual'))`));
      assert(r.ok===true, 'setSchoolMode شکست: ' + (r.msg||''));
      assert(r.notify && r.notify.created===expect, 'تعدادِ صف‌شده درست نیست: ' + JSON.stringify(r.notify) + ' / ' + expect);
      let rows = rowsOf();
      assert(rows.length===expect, 'ردیف‌های صف درست نیست: ' + rows.length + '/' + expect);
      assert(rows.every(q=>q.kind==='event' && q.status==='pending'), 'نقش/وضعیتِ صف درست نیست');
      assert(rows.every(q=>q.body.indexOf('غیرحضوری')>=0), 'متنِ پیام «غیرحضوری» ندارد');
      /* تکراری: دوباره virtual → هیچ ردیفِ تازه‌ای */
      r = JSON.parse(W(`JSON.stringify(setSchoolMode(${fx.sc1},${JSON.stringify(T2)},'virtual'))`));
      assert(r.notify.created===0 && r.notify.skipped===expect, 'تکراری حذف نشد: ' + JSON.stringify(r.notify));
      assert(rowsOf().length===expect, 'ردیفِ تکراری ساخته شد: ' + rowsOf().length);
      /* حضوری شدن: پیام‌های معلق لغو */
      r = JSON.parse(W(`JSON.stringify(setSchoolMode(${fx.sc1},${JSON.stringify(T2)},'in_person'))`));
      assert(r.notify && r.notify.cancelled===expect, 'لغو نشد: ' + JSON.stringify(r.notify));
      rows = rowsOf();
      assert(rows.every(q=>q.status==='cancelled'), 'وضعیتِ لغو ثبت نشد');
    } finally {
      W(`db.notify_queue.slice().forEach(function(q){ if(q.source_ref && q.source_ref.indexOf(${JSON.stringify(pre)})===0) remove('notify_queue', q.id); });
         db.attendance_modes.slice().forEach(function(x){ if(x.school_id===${fx.sc1}&&x.date===${JSON.stringify(T2)}) remove('attendance_modes', x.id); });
         update('schools', ${fx.sc1}, {notify_rules: ${origRules}});`);
    }
  });

  await sec('V6 نوار: «مسدود است» را می‌گوید', async () => {
    setU(fx.mgr2);
    const b = W(`virtualModeBanner(${JSON.stringify(T)})`);
    assert(b.indexOf('مسدود')>=0, 'متنِ نوار «مسدود» ندارد: ' + b.slice(0,120));
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت حالت مدرسه ۲ (بند ۱۶): ${ok}/${results.length} موفق  —  ${ok===results.length?'بدون خطا ✅':'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
