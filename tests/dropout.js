#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   دور ۷۶ — ترک تحصیل (بدون حذف داده) — تست‌های کلاینت
   D1 دکمهٔ ثبت برای مدیر، نه برای دبیر
   D2 ثبت: فقط وضعیت + فیلدها؛ کل پرونده (نمرات/حضور/ثبت‌نام) دست‌نخورده
   D3 «سایر» بدون توضیح = مسدود
   D4 بازگشت به تحصیل: active + returned_at + سابقهٔ ترک می‌ماند
   D5 dropStats: تفکیک دلیل/پایه/جنسیت
   D6 داشبوردِ اداره: کارتِ «آمار ترک تحصیل» با عددِ درست
   D7 نوارِ وضعیت: دلیل + توضیح + ثبت‌کننده
   اجرا: node tests/dropout.js   (نیازمند jsdom)
   ═══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const errors = [];
const testQueue = [];
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) {
      fail++; errors.push(`${name}: ${e.message}`);
      console.log(`  ❌ ${name}\n     ${e.message}`);
      resolve(); return;
    }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; errors.push(`${name}: ${e.message}`); console.log(`  ❌ ${name}\n     ${e.message}`); }
    ).then(resolve);
  }));
  __seq = p;
  testQueue.push(p);
}
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

const consoleErrors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: new (require('jsdom').VirtualConsole)()
    .on('jsdomError', (e) => consoleErrors.push(e.message))
    .on('error', (m) => consoleErrors.push(String(m))),
});
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  await sleep(500);

  console.log('\n▸ دور ۶ — ترک تحصیل (بدون حذف داده)');

  const ctx = W(`(function(){
    var sch = db.schools.filter(function(s){return s.active;})[0];
    var sid = sch.id;
    var manager = db.users.find(function(u){return u.role==='manager'&&u.school_id===sid;});
    var teacher = db.users.find(function(u){return u.role==='teacher'&&u.school_id===sid&&(u.status||'active')==='active';});
    var superadmin = db.users.find(function(u){return u.role==='superadmin';});
    var students = db.enrollments.filter(function(e){return e.class_id===db.classes.filter(function(c){return c.school_id===sid;})[0].id;})
      .map(function(e){return byId('users',e.student_id);})
      .filter(function(u){return u.role==='student'&&(u.status||'active')==='active';});
    var school4 = db.schools.filter(function(s){return s.active;})[3] || sch;
    return {sid:sid, manager:manager.id, teacher:teacher.id, superadmin:superadmin.id,
            students:students.map(s=>s.id), school4:school4.id,
            school4Gender: (byId('schools',school4.id)||{}).gender};
  })()`);
  assert(ctx.sid, 'مدرسهٔ فعال پیدا نشد');
  assert(ctx.manager, 'مدیر پیدا نشد');
  assert(ctx.students.length >= 4, 'دانش‌آموزِ کافی نیست');

  const asManager = (extra) => W(`(function(){
    S.user=byId('users',${ctx.manager});S.persona=null;S.boss=null;
    S.route='record';S.child=null;S.tab='grades';render();
    ${extra||''}
  })()`);

  /* دانش‌آموزی که dropped_out نیست (و رکوردش را مستقیم بازنمی‌گردانیم) */
  const fresh = (i) => Number(W(`(function(){
    var c=[${ctx.students.join(',')}];
    var s=c[${i}]||c[0];
    var u=byId('users',s);
    if((u.status||'active')==='dropped_out'){u.status='active';u.active=1;}
    return s;
  })()`));

  /* ── D1: دکمهٔ ثبت برای مدیر، نه برای دبیر ────────────────── */
  test('D1 دکمهٔ «ثبت ترک تحصیل» فقط برای مدیر (دبیر نمی‌بیند)', () => {
    const st = fresh(0);
    asManager(`S.child=${st};render();`);
    const mBtn = W(`document.querySelector('[data-act="drop-register"]') ? true : false`);
    assert(mBtn, 'دکمهٔ «ثبت ترک تحصیل» برای مدیر نیست');
    W(`(function(){
      S.user=byId('users',${ctx.teacher});S.persona=null;S.boss=null;
      S.route='record';S.child=${st};S.tab='grades';render();
    })()`);
    const tBtn = W(`document.querySelector('[data-act="drop-register"]') ? true : false`);
    assert(!tBtn, 'دبیر نباید دکمهٔ «ثبت ترک تحصیل» ببیند');
  });

  /* ── D2: ثبت — فقط وضعیت؛ کل پرونده دست‌نخورده ──────────── */
  test('D2 ثبت: وضعیت dropped_out + فیلدها؛ نمرات/حضور/ثبت‌نام دست‌نخورده', () => {
    const st = fresh(0);
    const before = W(`(function(){
      var u=byId('users',${st});
      return {grades:db.grades.filter(function(g){return g.student_id===${st};}).length,
              att:db.attendance.filter(function(a){return a.student_id===${st};}).length,
              enr:(db.enrollments||[]).some(function(e){return e.student_id===${st};}),
              disc:db.discipline.filter(function(d){return d.student_id===${st};}).length};
    })()`);
    asManager(`S.child=${st};render();`);
    W(`document.querySelector('[data-act="drop-register"]').click()`);
    const modalOk = W(`!!document.getElementById('drop_reason') && !!document.getElementById('drop_date')`);
    assert(modalOk, 'مودالِ ثبت باز نشد');
    W(`(function(){
      document.getElementById('drop_reason').value='economic';
      document.getElementById('drop_note').value='مشکلِ معیشتیِ مستند';
      document.querySelector('[data-act="drop-register-confirm"]').click();
    })()`);
    const after = W(`(function(){
      var u=byId('users',${st});
      return {status:u.status, at:u.dropped_out_at||null, by:u.dropped_out_by,
              reason:u.dropped_out_reason, note:u.dropped_out_note, active:u.active,
              grades:db.grades.filter(function(g){return g.student_id===${st};}).length,
              att:db.attendance.filter(function(a){return a.student_id===${st};}).length,
              enr:(db.enrollments||[]).some(function(e){return e.student_id===${st};}),
              disc:db.discipline.filter(function(d){return d.student_id===${st};}).length};
    })()`);
    assert(after.status === 'dropped_out', 'وضعیت dropped_out نشد (' + after.status + ')');
    global.__d2 = st;
    assert(after.at && /^\d{4}-\d{2}-\d{2}$/.test(after.at), 'تاریخِ ثبت نیست');
    assert(after.by === ctx.manager, 'ثبت‌کننده (مدیر) نیست');
    assert(after.reason === 'economic' && after.note === 'مشکلِ معیشتیِ مستند', 'دلیل/توضیح نیست');
    assert(after.active === 0, 'active:0 نشد');
    assert(after.grades === before.grades && after.att === before.att
           && after.disc === before.disc && after.enr === before.enr,
      'دادهٔ پرونده دست‌نخورده نیست! (قبل: ' + JSON.stringify(before) + ' بعد: ' + JSON.stringify(after) + ')');
  });

  /* ── D3: «سایر» بدون توضیح = مسدود ──────────────────────── */
  test('D3 «سایر» بدون توضیحِ آزاد مسدود می‌شود', () => {
    const st = fresh(1);
    asManager(`S.child=${st};render();`);
    W(`document.querySelector('[data-act="drop-register"]').click()`);
    W(`(function(){
      document.getElementById('drop_reason').value='other';
      document.getElementById('drop_note').value='';
      document.querySelector('[data-act="drop-register-confirm"]').click();
    })()`);
    const st1 = W(`byId('users',${st}).status||'active'`);
    assert(st1 === 'active', 'بدون توضیح، «سایر» ثبت شد! (' + st1 + ')');
    W(`closeModal()`);
  });

  /* ── D4: بازگشت به تحصیل ───────────────────────────────── */
  test('D4 بازگشت: active + returned_at؛ سابقهٔ ترک (دلیل) می‌ماند', () => {
    const st = global.__d2; /* دانش‌آموزِ D2 — هنوز dropped_out است */
    assert(st, 'دانش‌آموزِ D2 ذخیره نشده');
    asManager(`S.child=${st};render();`);
    const banner = W(`document.body.textContent.indexOf('ترک تحصیل ثبت شده') > -1`);
    assert(banner, 'نوارِ «ترک تحصیل ثبت شده» در پرونده نیست');
    W(`document.querySelector('[data-act="drop-return"]').click()`);
    const modalOk = W(`!!document.getElementById('dropret_date')`);
    assert(modalOk, 'مودالِ بازگشت باز نشد');
    W(`document.querySelector('[data-act="drop-return-confirm"]').click()`);
    const after = W(`(function(){
      var u=byId('users',${st});
      return {status:u.status, active:u.active, ret:u.returned_at||null,
              reason:u.dropped_out_reason, at:u.dropped_out_at||null};
    })()`);
    assert(after.status === 'active' && after.active === 1, 'بازگشت اعمال نشد');
    assert(after.ret && /^\d{4}-\d{2}-\d{2}$/.test(after.ret), 'تاریخِ بازگشت نیست');
    assert(after.reason === 'economic' && after.at, 'سابقهٔ ترک پاک شده!');
  });

  /* ── D5: dropStats — تفکیک دلیل/پایه/جنسیت ──────────────── */
  test('D5 dropStats: تفکیکِ دلیل + پایه + جنسیت (دو مدرسهٔ متفاوت)', () => {
    const st1 = fresh(2), st2 = fresh(3);
    const st4 = Number(W(`(function(){
      var cls=db.classes.filter(function(c){return c.school_id===${ctx.school4};})[0];
      var e=db.enrollments.filter(function(x){return x.class_id===cls.id;})[0];
      var s=byId('users',e.student_id);
      if((s.status||'active')==='dropped_out'){s.status='active';s.active=1;}
      return s.id;
    })()`));
    W(`(function(){
      dropRegister(${st1},'2026-09-01','economic',null,${ctx.manager});
      dropRegister(${st2},'2026-09-02','health','مشکلِ سلامت',${ctx.manager});
      dropRegister(${st4},'2026-09-03','bullying',null,${ctx.manager});
    })()`);
    const st5 = W(`(function(){
      var ds=dropStats([${ctx.sid},${ctx.school4}]);
      return {total:ds.total, byReason:ds.byReason,
              g1:(ds.byGender||{}), nGrades:Object.keys(ds.byGrade||{}).length};
    })()`);
    assert(st5.total === 3, 'مجموعِ ترک تحصیلی درست نیست (گرفت: ' + st5.total + ')');
    assert(st5.byReason.economic === 1 && st5.byReason.health === 1 && st5.byReason.bullying === 1,
      'تفکیکِ دلیل درست نیست: ' + JSON.stringify(st5.byReason));
    const g = st5.g1;
    if(ctx.school4Gender === 'دخترانه'){
      assert((g['پسر']||0) === 2 && (g['دختر']||0) === 1, 'تفکیکِ جنسیت درست نیست: ' + JSON.stringify(g));
    } else {
      assert((g['پسر']||0) === 3, 'تفکیکِ جنسیت درست نیست: ' + JSON.stringify(g));
    }
    assert(st5.nGrades >= 1, 'تفکیکِ پایه خالی است');
    /* پاک‌سازی */
    W(`(function(){
      dropReturn(${st1},'2026-09-04');
      dropReturn(${st2},'2026-09-04');
      dropReturn(${st4},'2026-09-04');
    })()`);
  });

  /* ── D6: داشبوردِ اداره — کارتِ آمارِ ترک تحصیل ─────────── */
  test('D6 داشبوردِ اداره: کارتِ «آمار ترک تحصیل» با عددِ درست', () => {
    const st1 = fresh(2);
    W(`dropRegister(${st1},'2026-09-05','migration','انتقالِ خانواده',${ctx.manager})`);
    W(`(function(){
      S.user=byId('users',${ctx.superadmin});S.persona=null;S.boss=null;
      S.route='officedash';S.filters={};render();
    })()`);
    const txt = W(`document.body.textContent`);
    assert(txt.indexOf('آمار ترک تحصیل') > -1, 'کارتِ «آمار ترک تحصیل» در داشبوردِ اداره نیست');
    const hasReason = txt.indexOf('مهاجرتِ خانواده') > -1;
    assert(hasReason, 'دلیلِ ترک در نمودارِ کارت نیست');
    W(`dropReturn(${st1},'2026-09-06')`);
  });

  /* ── D7: نوارِ وضعیت — دلیل + توضیح + ثبت‌کننده ─────────── */
  test('D7 نوار: دلیلِ فارسی + توضیح + نامِ ثبت‌کننده', () => {
    const st = fresh(1);
    W(`dropRegister(${st},'2026-09-07','family','طلاقِ والدین — نیاز به پیگیری',${ctx.manager})`);
    asManager(`S.child=${st};render();`);
    const txt = W(`(function(){
      var el=document.querySelector('.callout.red');
      return el?el.textContent:'';
    })()`);
    assert(txt.indexOf('ترک تحصیل ثبت شده') > -1, 'نوار نیست');
    assert(txt.indexOf('مشکلات خانوادگی') > -1, 'دلیلِ فارسی نیست');
    assert(txt.indexOf('طلاقِ والدین') > -1, 'توضیح نیست');
    const mgrName = W(`byId('users',${ctx.manager}).full_name`);
    assert(txt.indexOf(mgrName) > -1, 'نامِ ثبت‌کننده نیست');
    W(`dropReturn(${st},'2026-09-08')`);
  });

  await Promise.all(testQueue);
  const total = pass + fail;
  console.log('\n' + '─'.repeat(52));
  console.log(`ترک تحصیل (کلاینت): ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (consoleErrors.length) {
    console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
    consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
  }
  process.exit(fail || consoleErrors.length ? 1 : 0);
}
