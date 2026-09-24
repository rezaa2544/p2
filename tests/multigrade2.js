#!/usr/bin/env node
/**
 * تستِ واقعیِ کلاسِ چندپایه (بند ۲.۱ — دور ۷۱)
 *
 *  G0 — بوت بدون خطا
 *  G1 — بدونِ قابلیتِ has_multigrade: دکمهٔ عضویت نیست (مدرسهٔ ۲)
 *  G2 — با قابلیت (مدرسهٔ ۱): دکمهٔ «عضویتِ دروس» روی کارتِ کلاس
 *  G3 — مودال: دروس از برنامهٔ هفتگی + دانش‌آموزانِ کلاس
 *  G4 — ذخیرهٔ انتخابِ جزئی ⇒ class_subject_members + classSubjectMembers
 *  G5 — انتخابِ همه ⇒ پاک‌شدنِ ردیف‌ها ⇒ fallback (همهٔ کلاس)
 *  G6 — چیکنکِ «کلاسِ چندپایه» در مودالِ کلاس ذخیره می‌شود
 *  G7 — canAction: ذخیرهٔ عضویت فقط مدیر (دبیر رد)
 *
 * اجرا:  node tests/multigrade2.js   (بعد از node build.js)
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
// hardening: rebuild base index.html (a previously crashed mutation suite may have left a mutated build)
try { require('child_process').execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let seq = Promise.resolve();
const results = [];
function test(name, fn) {
  const next = seq.then(async () => {
    await fn();
    results.push([name, true]);
    console.log('  ✅ ' + name);
  }).catch(e => {
    results.push([name, false]);
    console.log('  ❌ ' + name + ' — ' + e.message);
  });
  seq = next;
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: new VirtualConsole().on('jsdomError', e => {
    if (String(e.message).includes('Could not parse CSS')) return;
    console.log('   ⚠ jsdom:', e.message);
  })
});
const win = dom.window;
const W = expr => win.eval(expr);
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

setTimeout(async () => {
  const root = () => win.document.getElementById('root');
  const doc = () => win.document;

  /* کلاسِ مدرسهٔ ۱ که هم برنامهٔ هفتگی و هم دانش‌آموز دارد */
  const cls1 = W(`(function(){
    var out = null;
    db.classes.forEach(function(c){
      if(c.school_id !== 1) return;
      var hasSched = db.schedule.some(function(s){return s.class_id===c.id;});
      var n = db.enrollments.filter(function(e){return e.class_id===c.id;}).length;
      if(hasSched && n >= 3) out = c.id;
    });
    return out;
  })()`);
  assert(cls1, 'کلاسی با برنامه و دانش‌آموز برای مدرسهٔ ۱ پیدا نشد');
  const m1 = W(`db.users.find(u=>u.role==='manager'&&u.school_id===1).id`);
  const m2 = W(`db.users.find(u=>u.role==='manager'&&u.school_id===2).id`);
  const t1 = W(`db.users.find(u=>u.role==='teacher'&&u.school_id===1).id`);

  const asUser = (uid, route) => W(`(function(){
    S.user = byId('users', ${uid}); S.persona = null; S.boss = null;
    S.filters = {}; S.route = '${route}'; S.tab = ''; render();
  })()`);

  test('G0 بوت بدون خطا', async () => {
    await sleep(400);
    assert(root().innerHTML.length > 1000, 'ریشه خالی است');
  });

  test('G1 بدونِ قابلیت: دکمهٔ عضویت نیست', () => {
    assert(W(`hasCap(2,'has_multigrade')`) === false, 'مدرسهٔ ۲ نباید قابلیت داشته باشد');
    asUser(m2, 'classes');
    assert(doc().querySelector('[data-act="class-membership"]') === null, 'دکمهٔ عضویت برای مدرسهٔ ۲ رندر شد!');
  });

  test('G2 با قابلیت: دکمهٔ «عضویتِ دروس» هست', () => {
    assert(W(`hasCap(1,'has_multigrade')`) === true, 'مدرسهٔ ۱ قابلیت ندارد؟');
    asUser(m1, 'classes');
    const btn = doc().querySelector('[data-act="class-membership"][data-id="' + cls1 + '"]');
    assert(btn, 'دکمهٔ عضویت برای کلاسِ مدرسهٔ ۱ نیست');
  });

  let subA = null, kidOut = null;

  test('G3 مودال: دروسِ برنامه + دانش‌آموزان', () => {
    asUser(m1, 'classes');
    doc().querySelector('[data-act="class-membership"][data-id="' + cls1 + '"]').click();
    const cbs = doc().querySelectorAll('.mem-cb');
    assert(cbs.length > 0, 'چیکنکی نیست');
    const subs = {};
    cbs.forEach(cb => { subs[cb.dataset.sub] = (subs[cb.dataset.sub] || 0) + 1; });
    assert(Object.keys(subs).length >= 1, 'درسی در مودال نیست');
    const kids = W(`studentsOfClass(${cls1}).length`);
    Object.values(subs).forEach(n => assert(n === kids, 'تعدادِ چیکنک‌ها ≠ تعدادِ دانش‌آموزان'));
    subA = Object.keys(subs)[0];
    /* همه پیش‌فرض چک‌شده‌اند (بدون ردیف = fallback) */
    let allOn = true;
    cbs.forEach(cb => { if (cb.dataset.sub === subA && !cb.checked) allOn = false; });
    assert(allOn, 'حالتِ اولیهٔ fallback: همه باید چک‌شده باشند');
  });

  test('G4 ذخیرهٔ انتخابِ جزئی ⇒ membership + کوئری', () => {
    /* یکی از دانش‌آموزان را برای درسِ اول برمی‌داریم */
    const cbs = [...doc().querySelectorAll('.mem-cb')].filter(cb => cb.dataset.sub === subA);
    const target = cbs[cbs.length - 1];
    kidOut = target.dataset.stu;
    target.checked = false;
    doc().querySelector('[data-act="class-membership-save"]').click();
    const rows = W(`(db.class_subject_members||[]).filter(x=>x.class_id===${cls1}&&x.subject_id===${subA}).map(x=>x.student_id)`);
    const kids = W(`studentsOfClass(${cls1}).map(k=>k.id)`);
    assert(rows.length === kids.length - 1, 'تعدادِ ردیف‌ها درست نیست: ' + rows.length);
    assert(rows.indexOf(Number(kidOut)) === -1, 'دانش‌آموزِ خارج‌شده هنوز در ردیف‌هاست');
    const members = W(`classSubjectMembers(${cls1},${subA}).map(k=>k.id)`);
    assert(members.indexOf(Number(kidOut)) === -1, 'classSubjectMembers دانش‌آموزِ خارج‌شده را برگرداند');
    assert(members.length === kids.length - 1, 'تعدادِ اعضا درست نیست');
    /* بقیهٔ دروس نباید دست بخورند */
    const otherRows = W(`(db.class_subject_members||[]).filter(x=>x.class_id===${cls1}&&x.subject_id!==${subA}).length`);
    assert(otherRows === 0, 'ردیفِ دروسِ دیگر آلوده شد');
  });

  test('G5 انتخابِ همه ⇒ پاک‌شدنِ ردیف‌ها ⇒ fallback', () => {
    asUser(m1, 'classes');
    doc().querySelector('[data-act="class-membership"][data-id="' + cls1 + '"]').click();
    const cbs = [...doc().querySelectorAll('.mem-cb')].filter(cb => cb.dataset.sub === subA);
    cbs.forEach(cb => { cb.checked = true; });
    doc().querySelector('[data-act="class-membership-save"]').click();
    const rows = W(`(db.class_subject_members||[]).filter(x=>x.class_id===${cls1}&&x.subject_id===${subA}).length`);
    assert(rows === 0, 'ردیف‌ها پاک نشدند');
    const kids = W(`studentsOfClass(${cls1}).length`);
    const members = W(`classSubjectMembers(${cls1},${subA}).length`);
    assert(members === kids, 'fallback نشکست: ' + members + ' ≠ ' + kids);
  });

  test('G6 چیکنکِ «کلاسِ چندپایه» ذخیره می‌شود', () => {
    asUser(m1, 'classes');
    W(`classModal(byId('classes',${cls1}))`);
    const cb = doc().querySelector('#c_multigrade');
    assert(cb, 'چیکنکِ چندپایه در مودالِ کلاس نیست');
    cb.checked = true;
    doc().querySelector('[data-act="class-save"]').click();
    assert(W(`byId('classes',${cls1}).multigrade`) === 1, 'multigrade ذخیره نشد');
    /* برگرداندن به ۰ برای پاک‌سازی */
    W(`classModal(byId('classes',${cls1}))`);
    doc().querySelector('#c_multigrade').checked = false;
    doc().querySelector('[data-act="class-save"]').click();
    assert(W(`byId('classes',${cls1}).multigrade`) === 0, 'multigrade پاک نشد');
  });

  test('G7 canAction: فقط مدیر', async () => {
    assert(W(`canAction('class-membership-save','teacher')`) === false, 'دبیر مجاز شد!');
    assert(W(`canAction('class-membership-save','manager')`) === true, 'مدیر مجاز نیست!');
    /* اجرا: دکمهٔ مخفیِ ذخیره برای دبیر ⇒ رد + بدون تغییرِ داده */
    asUser(t1, 'classes');
    W(`(function(){
      window._memCid=${cls1};
      var b=document.createElement('button'); b.dataset.act='class-membership-save';
      document.body.appendChild(b); b.click(); b.remove();
    })()`);
    await sleep(100);
    const after = W(`(db.class_subject_members||[]).length`);
    assert(after === 0, 'دبیر توانست عضویت ذخیره کند!');
  });

  test('G8 پاک‌سازی', () => {
    W(`(function(){
      (db.class_subject_members||[]).filter(function(x){return x.class_id===${cls1};}).forEach(function(x){remove('class_subject_members',x.id);});
    })()`);
    assert(!doc().querySelector('[data-act="class-membership-save"]'), 'membership editor should be removed after delete');
  });

  await seq;
  await sleep(100);
  const bad = results.filter(r => !r[1]).length;
  console.log(`\nmultigrade2 (کلاسِ چندپایه): ${results.length} بررسی — ✅ ${results.length - bad} · ❌ ${bad}`);
// hardening: rebuild base index.html (a previously crashed mutation suite may have left a mutated build)
try { require('child_process').execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  process.exit(bad ? 1 : 0);
}, 300);
