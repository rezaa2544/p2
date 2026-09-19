#!/usr/bin/env node
/**
 * سئوت کارآموزی ۲ (E.2: ساعتِ لازم + پیشرفت + نمای کلی + گواهی + حذفِ فقط-مدیر)
 *
 * روی جدولِ موجود (internships — هر ردیف یک ثبتِ ساعت) — بدونِ جدولِ موازی.
 * در پروسهٔ جداگانه اجرا می‌شود (نه داخل smoke.js).
 *
 * بخش‌ها:
 *  I1 پیشرفت (لازمِ پیش‌فرض/ویژهٔ مدرسه + درصد + تکمیل)
 *  I2 گواهی (ناقص/کامل/تکراری/نقش/غیرِ سالِ آخر)
 *  I3 نماها (کارت، دکمهٔ دبیر، نمای کلی، داشبورد)
 *  I4 مدلِ سرور (del بدونِ دبیر + اکشنِ گواهی)
 *
 * اجرا: node tests/internship2.js
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
const J = (expr) => JSON.parse(W(`JSON.stringify(${expr})`));
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const sec = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, detail: '', ms: Date.now() - t0 }); }
  catch (e) { results.push({ name, ok: false, detail: String(e.message || e), ms: Date.now() - t0 }); }
};

/* ── فیکسور: هنرستانِ کوچک ───────────────────────────────────────── */
function fx() {
  return J(`(function(){
    var now = new Date().toISOString(), tag = Date.now();
    var sch = add('schools',{name:'هنرستان تستی'+tag,code:'IN'+tag,city:'تست',address:'',
      phone:'09120000000',level:'متوسطه دوم',type:'فنی و حرفه‌ای',gender:'پسرانه',
      branches:['فنی و حرفه‌ای'],fields:['مکانیک'],shift:'صبح',capacity:100,active:1,
      capabilities:{has_workshop:1},created_at:now});
    function mkUser(role, name, suffix){
      return add('users',{school_id:sch.id,role:role,full_name:name,username:'in'+tag+suffix,
        password:'x12345',national_id:'0000000001',phone:'09121111111',active:1,
        grade_level:'دوازدهم',created_at:now});
    }
    var mgr = mkUser('manager','مدیر','mg');
    var t = mkUser('teacher','دبیر','t1');
    var par = mkUser('parent','ولی','pa');
    var cls = add('classes',{school_id:sch.id,name:'دوازدهم الف',grade:'دوازدهم',field:'مکانیک',
      room:'ر1',capacity:30,homeroom_teacher_id:t.id});
    var cls10 = add('classes',{school_id:sch.id,name:'دهم الف',grade:'دهم',field:'مکانیک',
      room:'ر2',capacity:30,homeroom_teacher_id:t.id});
    function mkStud(clsId, n){
      var s = mkUser('student','دانش‌آموز '+n,'s'+n);
      add('enrollments',{school_id:sch.id,class_id:clsId,student_id:s.id});
      return s.id;
    }
    var st1 = mkStud(cls.id, 1), st2 = mkStud(cls.id, 2), st10 = mkStud(cls10.id, 3);
    add('parent_links',{parent_id:par.id,student_id:st1});
    function mkLog(sid, hours, status){
      return add('internships',{school_id:sch.id,student_id:sid,date:'2026-08-0'+(1+(sid%8)),
        hours:hours,location:'کارگاه',note:'',status:status,
        approved_by:status==='approved'?mgr.id:null,
        approved_at:status==='approved'?'2026-08-10':null,
        created_by:mgr.id,created_at:now});
    }
    mkLog(st1, 50, 'approved');
    mkLog(st1, 30, 'pending');
    mkLog(st2, 200, 'approved');
    window.__inFx = {sch:sch.id,mgr:mgr.id,t:t.id,par:par.id,cls:cls.id,cls10:cls10.id,st1:st1,st2:st2,st10:st10};
    return window.__inFx;
  })()`);
}
function fxDown() {
  W(`(function(){
    var fx = window.__inFx;
    if(fx){
      db.internships.filter(function(x){return x.school_id===fx.sch;}).forEach(function(x){remove('internships',x.id);});
      (db.certificates||[]).filter(function(x){return x.school_id===fx.sch;}).forEach(function(x){remove('certificates',x.id);});
      db.enrollments.filter(function(e){return e.class_id===fx.cls||e.class_id===fx.cls10;}).forEach(function(e){remove('enrollments',e.id);});
      db.parent_links.filter(function(l){return l.student_id===fx.st1;}).forEach(function(l){remove('parent_links',l.id);});
      [fx.st1,fx.st2,fx.st10,fx.t,fx.mgr,fx.par].forEach(function(id){remove('users',id);});
      [fx.cls,fx.cls10].forEach(function(id){remove('classes',id);});
      remove('schools',fx.sch);
    }
    window.__inFx = null;
  })()`);
}
function asUser(id) { W(`S.user = byId('users', ${id}); S.filters = {};`); }

async function main() {
  await sleep(300);
  const F = fx();
  try {
    await sec('I1 پیشرفت', async () => {
      assert(J(`workshopSchool(${F.sch})`) === true, 'مدرسه باید کارگاهی باشد');
      assert(J(`isFinalYearStudent(${F.st1})`) === true, 'st1 باید سالِ آخر باشد');
      assert(J(`isFinalYearStudent(${F.st10})`) === false, 'st10 نباید سالِ آخر باشد');
      assert(J(`internshipRequired(${F.sch})`) === 200, 'پیش‌فرض باید ۲۰۰ باشد');
      const pr = J(`internshipProgress(${F.st1})`);
      assert(pr.required === 200 && pr.approved === 50, 'پیشرفتِ st1 باید ۵۰ از ۲۰۰ باشد: ' + JSON.stringify(pr));
      assert(pr.pct === 25 && pr.done === false, 'درصد/تکمیلِ st1 درست نیست');
      const pr2 = J(`internshipProgress(${F.st2})`);
      assert(pr2.approved === 200 && pr2.pct === 100 && pr2.done === true, 'st2 باید تکمیل باشد');
      /* سقفِ ویژهٔ مدرسه */
      const ov = J(`(function(){
        update('schools', ${F.sch}, {internship_hours: 100});
        var r = internshipRequired(${F.sch});
        update('schools', ${F.sch}, {internship_hours: null});
        return r;
      })()`);
      assert(ov === 100, 'سقفِ مدرسه باید لحاظ شود');
    });

    await sec('I2 گواهی', async () => {
      asUser(F.mgr);
      const no = J(`internshipIssueCert(${F.st1})`);
      assert(no.ok === false && /کامل نشده/.test(no.msg), 'ناقص باید رد شود: ' + JSON.stringify(no));
      const dup0 = J(`internshipCert(${F.st2})`);
      assert(dup0 === null, 'پیش از صدور نباید گواهی باشد');
      const ok = J(`internshipIssueCert(${F.st2})`);
      assert(ok.ok === true && ok.code, 'تکمیل باید صادر شود: ' + JSON.stringify(ok));
      const got = J(`internshipCert(${F.st2})`);
      assert(got && got.type === 'internship' && got.code === ok.code, 'گواهی باید با همان کد پیدا شود');
      const dup = J(`internshipIssueCert(${F.st2})`);
      assert(dup.ok === false && /قبلاً/.test(dup.msg), 'تکراری باید رد شود');
      asUser(F.t);
      const trole = J(`internshipIssueCert(${F.st2})`);
      assert(trole.ok === false && /مدیر/.test(trole.msg), 'دبیر نباید صادر کند');
      asUser(F.mgr);
      const ny = J(`internshipIssueCert(${F.st10})`);
      assert(ny.ok === false && /سالِ آخر/.test(ny.msg), 'غیرِ سالِ آخر باید رد شود');
    });

    await sec('I3 نماها', async () => {
      /* گواهیِ صادرشده در I2 را پس می‌گیریم تا دکمهٔ صدور دیده شود */
      W(`(db.certificates||[]).filter(function(x){return x.type==='internship'&&x.student_id===${F.st2};}).forEach(function(x){remove('certificates',x.id);});`);
      /* کارت: مدیر دکمهٔ گواهی می‌بیند (st2 تکمیل است)، دبیر ثبت می‌بیند */
      asUser(F.mgr);
      const card = W(`internshipCard(${F.st2})`);
      assert(card.indexOf('پیشرفت:') >= 0, 'کارت باید بجِ پیشرفت داشته باشد');
      assert(card.indexOf('data-act="internship-cert"') >= 0, 'مدیر باید دکمهٔ گواهی ببیند');
      asUser(F.t);
      const cardT = W(`internshipCard(${F.st1})`);
      assert(cardT.indexOf('data-act="internship-new"') >= 0, 'دبیر باید دکمهٔ ثبت ببیند');
      assert(cardT.indexOf('internship-cert') < 0, 'دبیر نباید دکمهٔ گواهی ببیند');
      asUser(F.st1);
      const cardS = W(`internshipCard(${F.st1})`);
      assert(cardS.indexOf('internship-new') < 0 && cardS.indexOf('internship-cert') < 0,
        'دانش‌آموز نباید دکمه‌ای ببیند');
      /* نمای کلی در نمراتِ مدیر */
      asUser(F.mgr);
      W(`S.filters = {};`);
      const gv = W(`viewGrades()`);
      assert(gv.indexOf('نمای کلیِ کارآموزی') >= 0, 'نمراتِ مدیر باید نمای کلی داشته باشد');
      assert(gv.indexOf('دانش‌آموز 2') >= 0, 'نمای کلی باید نامِ دانش‌آموز را نشان بدهد');
      asUser(F.t);
      const gvT = W(`viewGrades()`);
      assert(gvT.indexOf('نمای کلیِ کارآموزی') < 0, 'نمای دبیر نباید نمای کلی داشته باشد');
      /* داشبوردِ دانش‌آموز/ولی */
      asUser(F.st1);
      const dash = W(`summaryBlock(${F.st1})`);
      assert(dash.indexOf('پیشرفتِ کارآموزی') >= 0, 'داشبورد باید نوارِ کارآموزی داشته باشد');
      asUser(F.par);
      const dashP = W(`summaryBlock(${F.st1})`);
      assert(dashP.indexOf('پیشرفتِ کارآموزی') >= 0, 'داشبوردِ ولی باید نوارِ کارآموزی داشته باشد');
      asUser(F.st10);
      const dash10 = W(`summaryBlock(${F.st10})`);
      assert(dash10.indexOf('پیشرفتِ کارآموزی') < 0, 'غیرِ سالِ آخر نباید نوار ببیند');
    });

    await sec('I4 مدلِ سرور', async () => {
      const wp = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz', 'write-perms.json'), 'utf8'));
      const del = wp.ops.internships.del;
      assert(del.indexOf('teacher') < 0, 'دبیر باید از del بیرون باشد: ' + JSON.stringify(del));
      assert(del.indexOf('manager') >= 0, 'مدیر باید del داشته باشد');
      const q = wp.actions['internship-cert'];
      assert(q && q.roles.indexOf('manager') >= 0 && q.collections.indexOf('certificates') >= 0,
        'اکشنِ گواهی باید manager روی certificates باشد');
      assert(wp.ops.internships.ins.indexOf('teacher') >= 0, 'دبیر باید ins داشته باشد');
    });
  } finally {
    fxDown();
  }

  console.log('──────────────────────────────────────────');
  let ok = 0;
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ' + r.detail);
    else ok++;
  }
  console.log('──────────────────────────────────────────');
  console.log(`سوئیت کارآموزی ۲: ${ok}/${results.length} موفق  —  ${ok === results.length ? 'بدون خطا ✅' : 'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
}
main();
