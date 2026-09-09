#!/usr/bin/env node
/**
 * تست‌های گردشِ کارِ کاملِ امتحاناتِ تجدیدی/شهریور (بند ۶.۵ — فاز ۵)
 * ─────────────────────────────────────────────────────────────────
 * بخشِ الف (کلاینت، jsdom): گردشِ کارِ سرتاسری
 *   کشفِ خودکارِ مردودی‌ها → ثبت برای شهریور (مدیر) → ثبتِ نمرهٔ مجدد
 *   (مدیر/دبیر) → پیوند به دفترِ نمرات با برچسبِ «تجدیدی» → نمرهٔ مؤثر
 *   → دیدِ دانش‌آموز/ولی → گزارشِ چاپی
 * بخشِ ب (سرور، پورت 8993): مرزِ مجوزها
 *   مدیر ins · دبیر upd روی کلاسِ خود · دبیر ins ممنوع · دبیر روی
 *   مدرسه/کلاسِ دیگر ممنوع · فیلدهایِ تازه از fieldGate می‌گذرند
 *
 * اجرا:  node tests/retake-exams.js   (نیازمند jsdom برای بخشِ الف)
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('node:child_process');
const os = require('node:os');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { JSDOM = null; }

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const T = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ═════════════════════ بخشِ الف: کلاینت ═════════════════════ */
async function clientPart() {
  if (!JSDOM) { console.log('  ⏭️  jsdom نصب نیست — بخشِ کلاینت رد شد.  (npm i --no-save jsdom)'); return; }
  // hardening: rebuild base index.html (a previously crashed mutation suite may have left a mutated build)
  try { require('child_process').execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const consoleErrors = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: new VirtualConsole()
      .on('jsdomError', (e) => consoleErrors.push(e.message))
      .on('error', (m) => consoleErrors.push(String(m))),
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  /* کلیکِ ایمن: نبودِ دکمه «شکستِ تست» است، نه کرش (وگرنه جهش به‌جای
     قرمزِ برچسب‌دار، کلِ سوئیت را می‌کُشد و اندازه‌گیری نامرئی می‌ماند) */
  const clickAct = (act, id) => W(`(function(){
    var b=document.querySelector('[data-act="${act}"][data-id="${id}"]');
    if(!b)return false; b.click(); return true;})()`);
  const setVal = (id, v) => W(`(function(){var e=document.getElementById('${id}');if(!e)return false;e.value=${JSON.stringify(String(v))};return true;})()`);
  const clickSave = (act) => W(`(function(){var b=document.querySelector('[data-act="${act}"]');if(!b)return false;b.click();return true;})()`);
  const asRole = (uid, route) => W(`(function(){
    S.user=byId('users',${uid});S.persona=null;S.boss=null;
    S.filters={};S.route=${JSON.stringify(route)};S.tab='';render();
  })()`);

  await sleep(400);
  console.log('\n▸ گردشِ کارِ تجدیدی (بند ۶.۵) — کلاینت');

  /* W1 — بوتِ سالم و حضورِ ماژول */
  T(consoleErrors.length === 0, 'W1 بوت بدون خطا (' + consoleErrors.slice(0, 2).join(' | ') + ')');
  T(W(`typeof retakePassMark`) === 'function' && W(`typeof retakeApplyScore`) === 'function'
    && W(`typeof retakeCandidates`) === 'function', 'W1b توابعِ بند ۶.۵ در دسترس‌اند');

  /* W2 — آستانهٔ قبولی: نیمی از بیشینه (۱۰ از ۲۰) */
  T(W(`retakePassMark(20)`) === 10 && W(`retakePassMark(10)`) === 5,
    'W2 آستانهٔ قبولی = نیمی از بیشینه (۲۰→۱۰، ۱۰→۵)');

  /* W3 — تشخیصِ مردودی (و اینکه خودِ نمرهٔ تجدیدی مردود حساب نمی‌شود) */
  T(W(`retakeIsFail({score:9.5,max_score:20})`) === true
    && W(`retakeIsFail({score:10,max_score:20})`) === false
    && W(`retakeIsFail({score:14,max_score:20})`) === false
    && W(`retakeIsFail({score:8,max_score:20,is_retake:1})`) === false
    && W(`retakeIsFail({score:null,max_score:20})`) === false,
    'W3 مردودی: ۹.۵ بله · ۱۰ خیر · نمرهٔ تجدیدی خیر · بدونِ نمره خیر');

  /* W4 — مبنایِ مردودی: آخرین نمرهٔ هر (دانش‌آموز، درس) */
  const w4 = W(`(function(){
    var st=db.users.find(function(u){return u.role==='student'&&u.school_id===1&&u.active;}).id;
    var sub=db.subjects[0].id;
    var a=insert('grades',{school_id:1,student_id:st,subject_id:sub,term:'نوبت اول',exam_type:'پایان‌ترم',score:6,max_score:20,date:'2026-01-10'});
    var aid=db.grades[db.grades.length-1].id;
    var b=insert('grades',{school_id:1,student_id:st,subject_id:sub,term:'نوبت دوم',exam_type:'پایان‌ترم',score:15,max_score:20,date:'2026-05-10'});
    var map=subjectFinalGrades(1);
    var pick=map[st+'|'+sub];
    var res={picked:pick?pick.score:null,pickTerm:pick?pick.term:null,aid:aid};
    remove('grades',aid);remove('grades',db.grades[db.grades.length-1].id);
    return res;
  })()`);
  T(w4.picked === 15 && w4.pickTerm === 'نوبت دوم',
    'W4 مبنا = آخرین نمره: نوبت دوم (۱۵) بر نوبت اول (۶) غلبه کرد');

  /* W5 — مردودی‌هایِ واقعیِ مدرسه + نامزدها */
  const ctx = W(`(function(){
    var f=failingRows(1).filter(function(g){return Number(g.school_id)===1;});
    var c=retakeCandidates(1).filter(function(g){return Number(g.school_id)===1;});
    return {n:f.length, c:c.length, gid:f.length?f[0].id:0,
            gid2:c.length?c[0].id:0,
            score:f.length?f[0].score:null,
            sid:f.length?f[0].student_id:0,
            subid:f.length?f[0].subject_id:0,
            m1:db.users.find(function(u){return u.role==='manager'&&u.school_id===1&&u.active;}).id};
  })()`);
  T(ctx.n > 0 && ctx.gid > 0, 'W5 کشفِ خودکارِ مردودی‌ها در مدرسهٔ ۱ (' + ctx.n + ' مورد)');
  T(ctx.c > 0 && ctx.gid2 === ctx.gid, 'W5b نامزدها = مردودی‌هایِ ثبت‌نشده (' + ctx.c + ' مورد)');

  /* W6 — رابطِ مدیر: کارتِ نامزدها + دکمهٔ ثبتِ یک‌کلیکی */
  asRole(ctx.m1, 'reexams');
  let root = W(`document.getElementById('root').innerHTML`);
  T(root.indexOf('data-act="rt-register"') > -1, 'W6 کارتِ نامزدها در صفحهٔ مدیر رندر شد');
  T(root.indexOf('حدّ نصاب: ۱۰') > -1, 'W6b حدّ نصابِ قبولی در کارت نوشته شده (۱۰)');

  /* W7 — ثبتِ یک‌کلیکی برای شهریور */
  const before = W(`db.reexams.length`);
  const ok7 = clickAct('rt-register', ctx.gid);
  T(ok7, 'W7 دکمهٔ ثبت برای شهریور در کارتِ نامزدها هست و کلیک خورد');
  const rec = W(`(function(){var r=(db.reexams||[]).filter(function(x){return x.grade_id===${ctx.gid};});
    return r.length?{id:r[0].id,orig:r[0].original_score,st:r[0].status,gid:r[0].grade_id}:null;})()`);
  T(!!rec && W(`db.reexams.length`) === before + 1, 'W7 ثبت برای شهریور: یک رکوردِ تازه');
  T(!!rec && rec.gid === ctx.gid && rec.st === 'scheduled' && rec.orig === ctx.score,
    'W7b رکورد به نمرهٔ مردود پیوند خورد (grade_id) + نمرهٔ اصلی درست');

  /* W8 — جلوگیری از ثبتِ تکراری (هم‌منبع‌بودن) */
  const dup = W(`retakeRegister(${ctx.gid})`);
  T(dup && dup.ok === false && W(`(db.reexams||[]).filter(function(x){return x.grade_id===${ctx.gid};}).length`) === 1,
    'W8 ثبتِ تکراریِ همان درس رد می‌شود');

  /* W9 — ثبتِ نمرهٔ مجدد: وضعیت + پیوند به دفترِ نمرات با برچسبِ واضح */
  const gradesBefore = W(`db.grades.length`);
  const ok9 = rec ? clickAct('rt-score', rec.id) : false;
  T(ok9 && W(`document.getElementById('rt_new')`) != null, 'W9 مودالِ نمرهٔ مجددِ ردیفِ پیوندخورده باز شد');
  if (ok9) { setVal('rt_new', '14.5'); clickSave('rt-score-save'); }
  const after = W(`(function(){
    var r=byId('reexams',${rec.id});
    var g=(db.grades||[]).filter(function(x){return Number(x.is_retake)===1&&Number(x.retake_of_grade_id)===${ctx.gid};});
    var o=byId('grades',${ctx.gid});
    return {st:r.status,ns:r.new_score,n:g.length,
            gs:g.length?g[0].score:null,gt:g.length?g[0].exam_type:null,
            gid:g.length?g[0].id:0,
            origScore:o.score,mx:g.length?g[0].max_score:null,
            tid:g.length?g[0].teacher_id:null,
            term:g.length?g[0].term:null, oterm:o.term,
            total:db.grades.length};
  })()`);
  T(after.st === 'done' && after.ns === 14.5, 'W9b وضعیت «انجام‌شده» + نمرهٔ مجدد ذخیره شد');
  T(after.n === 1 && after.total === gradesBefore + 1, 'W9c یک ردیفِ نمرهٔ تجدیدی در دفترِ نمرات ساخته شد');
  T(after.gs === 14.5 && after.gt === 'تجدیدی', 'W9d برچسبِ واضحِ «تجدیدی» روی ردیفِ نمره');
  T(after.origScore === ctx.score && after.mx === 20,
    'W9e نمرهٔ اصلی دست‌نخورده ماند (' + ctx.score + ') و بیشینه منتقل شد');
  T(after.term === after.oterm, 'W9f نوبت از نمرهٔ اصلی به ارث رسید');

  /* W10 — نمرهٔ مؤثر و جبران */
  T(W(`retakeEffective(byId('grades',${ctx.gid}))`) === 14.5, 'W10 نمرهٔ مؤثر = نمرهٔ تجدیدی (۱۴.۵)');
  T(W(`retakeIsCleared(byId('grades',${ctx.gid}))`) === true, 'W10b مردودی با تجدیدی جبران شد');
  T(W(`retakeEffective(byId('grades',${ctx.gid}))`) !== W(`byId('grades',${ctx.gid}).score`),
    'W10c نمرهٔ مؤثر با نمرهٔ خام فرق دارد (تفکیکِ تجدیدی از اصلی)');

  /* W11 — ثبتِ دوباره: به‌روزرسانی همان ردیف (بدونِ تکرار) */
  asRole(ctx.m1, 'reexams');
  const ok11 = rec ? clickAct('rt-score', rec.id) : false;
  if (ok11) { setVal('rt_new', '18'); clickSave('rt-score-save'); }
  const again = W(`(function(){
    var g=(db.grades||[]).filter(function(x){return Number(x.is_retake)===1&&Number(x.retake_of_grade_id)===${ctx.gid};});
    return {n:g.length,s:g.length?g[0].score:null,ns:byId('reexams',${rec.id}).new_score};
  })()`);
  T(ok11 && again.n === 1 && again.s === 18 && again.ns === 18, 'W11 ثبتِ دوباره همان ردیف را به‌روز کرد (تکراری نساخت)');

  /* W12 — نمرهٔ نامعتبر رد می‌شود */
  asRole(ctx.m1, 'reexams');
  const gBefore = W(`db.grades.length`);
  const ok12 = rec ? clickAct('rt-score', rec.id) : false;
  if (ok12) { setVal('rt_new', '25'); clickSave('rt-score-save');
              setVal('rt_new', '-3'); clickSave('rt-score-save'); }
  T(ok12 && W(`byId('reexams',${rec.id}).new_score`) === 18 && W(`db.grades.length`) === gBefore,
    'W12 نمرهٔ بیرون از ۰-۲۰ (۲۵ و ۳-) رد شد و چیزی ساخته نشد');
  W(`(function(){var b=document.querySelector('[data-act="modal-close"]');if(b)b.click();})()`);

  /* W13 — مرزِ نقش‌ها: ثبت با مدیر، نمره با مدیر+دبیر */
  T(W(`canRoute('reexams','teacher')`) === false, 'W13 دبیر مسیرِ صفحهٔ تجدیدی را ندارد (ثبت دستِ مدیر است)');
  T(W(`canAction('rt-register','teacher')`) === false, 'W13b دبیر نمی‌تواند درسی را برای تجدیدی ثبت کند');
  T(W(`canAction('rt-score-save','teacher')`) === true, 'W13c دبیر می‌تواند نمرهٔ مجدد را ثبت کند');
  T(W(`canAction('rt-score-save','student')`) === false
    && W(`canAction('rt-score-save','parent')`) === false, 'W13d دانش‌آموز و ولی دسترسیِ نوشتن ندارند');

  /* W14 — کارتِ دبیر: فقط کلاس‌هایی که درس می‌دهد
     زمینه: درسی که دانش‌آموزش در کلاسِ دبیرِ ۵ است ولی دبیرِ ۴ نیست. */
  const pair = W(`(function(){
    var cand=null;
    failingRows(1).forEach(function(g){
      if(cand)return;
      var cls=(typeof classOf==='function')?(classOf(g.student_id)||{}):{};
      if(!cls.id)return;
      var t5=(cls.homeroom_teacher_id===5)||(db.schedule||[]).some(function(x){return x.class_id===cls.id&&x.teacher_id===5;});
      var t4=(cls.homeroom_teacher_id===4)||(db.schedule||[]).some(function(x){return x.class_id===cls.id&&x.teacher_id===4;});
      if(t5&&!t4)cand={gid:g.id,sid:g.student_id,cls:cls.id,score:g.score};
    });
    return cand;
  })()`);
  if (pair && W(`byId('users',5).role`)==='teacher') {
    const reg = W(`retakeRegister(${pair.gid})`);
    const rid = W(`(function(){var r=(db.reexams||[]).filter(function(x){return x.grade_id===${pair.gid};});return r.length?r[0].id:0;})()`);
    T(!!(reg && reg.ok) && rid > 0, 'W14 زمینه: درسِ مردود برای تجدیدی ثبت شد (دانش‌آموزِ کلاسِ دبیرِ ۵)');
    asRole(5, 'grades');
    const r5 = W(`document.getElementById('root').innerHTML`);
    asRole(4, 'grades');
    const r4 = W(`document.getElementById('root').innerHTML`);
    T(r5.indexOf(`data-act="rt-score" data-id="${rid}"`) > -1,
      'W14b دبیرِ کلاسِ دانش‌آموز، رکوردِ تجدیدیِ او را در صفحهٔ نمرات می‌بیند');
    T(r4.indexOf(`data-act="rt-score" data-id="${rid}"`) === -1,
      'W14c دبیرِ بی‌ربط همان رکورد را نمی‌بیند (محدود به کلاس‌هایی که درس می‌دهد)');

    /* W15 — دبیر نمره را ثبت می‌کند: ردیفِ نمره با teacher_id خودش ساخته می‌شود */
    asRole(5, 'grades');
    const gBefore15 = W(`(db.grades||[]).filter(function(x){return Number(x.retake_of_grade_id)===${pair.gid};}).length`);
    const ok15 = clickAct('rt-score', rid);
    if (ok15) { setVal('rt_new', '12'); clickSave('rt-score-save'); }
    const tr = W(`(function(){
      var r=byId('reexams',${rid});
      var g=(db.grades||[]).filter(function(x){return Number(x.retake_of_grade_id)===${pair.gid};});
      return {ns:r.new_score,st:r.status,n:g.length,tid:g.length?g[0].teacher_id:null,
              score:g.length?g[0].score:null,type:g.length?g[0].exam_type:null};
    })()`);
    T(ok15 && tr.st === 'done' && tr.ns === 12 && tr.n === gBefore15 + 1,
      'W15 دبیر نمرهٔ مجدد را ثبت کرد: وضعیت انجام‌شده + یک ردیفِ نمرهٔ تازه');
    T(tr.tid === 5 && tr.type === 'تجدیدی', 'W15b ردیفِ نمره با teacher_id خودِ دبیر و برچسبِ «تجدیدی» درج شد');
  } else { T(false, 'W14 زمینهٔ دبیر/کلاس در دادهٔ نمونه پیدا نشد'); }

  /* W16 — دیدِ دانش‌آموز/ولی در تبِ کارنامه */
  const vis = W(`(function(){
    var r=db.reexams.find(function(x){return x.status==='done'&&x.new_score!=null;});
    if(!r)return null;
    return {sid:r.student_id,final:reexamFinalScore(r),card:reexamCard(r.student_id).length};
  })()`);
  T(!!vis && vis.card > 0, 'W16 کارتِ تجدیدی برای دانش‌آموزِ دارای رکورد ساخته می‌شود');
  if (vis) {
    W(`(function(){S.user=db.users.find(function(u){return u.role==='student'&&u.id===${vis.sid};})||S.user;
        S.persona=null;S.boss=null;S.child=${vis.sid};S.route='record';S.tab='grades';S.filters={};render();})()`);
    const rec = W(`document.getElementById('root').innerHTML`);
    T(rec.indexOf('امتحاناتِ تجدیدی') > -1, 'W16b کارت در تبِ کارنامهٔ پرونده دیده می‌شود');
    T(rec.indexOf(W(`fa(${vis.final})`)) > -1, 'W16c نمرهٔ نهاییِ پس از تجدیدی در پرونده است (' + vis.final + ')');
  }

  /* W17 — گزارش: ردیف‌ها + بدنهٔ چاپی */
  const rep = W(`(function(){
    var rows=retakeReportRows(1);
    var done=rows.filter(function(r){return r.status==='done';});
    return {n:rows.length,done:done.length,
            passed:done.filter(function(r){return r.passed;}).length,
            linked:rows.filter(function(r){return r.linked;}).length,
            sample:rows.length?{s:rows[0].student,final:rows[0].final,res:rows[0].status==='done'?(rows[0].passed?'قبول':'مردود'):'در انتظار'}:null};
  })()`);
  T(rep.n > 0 && rep.done > 0, 'W17 گزارش: ' + rep.n + ' رکورد که ' + rep.done + ' تا انجام شده');
  T(rep.linked > 0, 'W17b رکوردهایِ پیوندخورده به دفترِ نمرات در گزارش مشخص‌اند (' + rep.linked + ')');
  const body = W(`retakePrintBody(1)`);
  T(body.indexOf('گزارش') > -1 || body.indexOf('تعدادِ رکوردها') > -1, 'W17c بدنهٔ چاپیِ گزارش ساخته شد');
  T(!!rep.sample && body.indexOf(rep.sample.s) > -1, 'W17d نامِ دانش‌آموز در گزارش چاپی هست');
  T(body.indexOf('قبول') > -1 || body.indexOf('مردود') > -1 || body.indexOf('در انتظار') > -1,
    'W17e ستونِ نتیجه در گزارش چاپی پر شده');

  /* W19 — تفکیکِ مدرسه در کشفِ مردودی‌ها (جهشِ فیلتر باید اینجا دیده شود) */
  const cross = W(`(function(){
    var f=failingRows(1);
    var leaked=f.filter(function(g){return Number(g.school_id)!==1;}).length;
    var other=failingRows(2).length;
    var name2=(function(){var g=failingRows(2)[0];return g?(byId('users',g.student_id)||{}).full_name:'';})();
    return {leaked:leaked,other:other,name2:name2};
  })()`);
  T(cross.leaked === 0, 'W19 فهرستِ مردودی‌هایِ مدرسهٔ ۱ هیچ ردیفِ مدرسهٔ دیگری ندارد');
  T(cross.other > 0, 'W19b مدرسهٔ ۲ مردودیِ خود را دارد (' + cross.other + ' مورد — تفکیک معنادار است)');
  asRole(ctx.m1, 'reexams');
  T(W(`document.getElementById('root').innerHTML`).indexOf(cross.name2) === -1,
    'W19c کارتِ نامزدهایِ مدیرِ مدرسهٔ ۱ دانش‌آموزِ مدرسهٔ ۲ را نشان نمی‌دهد');

  /* W18 — نامزدِ تازه بعد از ثبت از فهرست می‌رود */
  const gone = W(`retakeCandidates(1).some(function(g){return g.id===${ctx.gid};})`);
  T(gone === false, 'W18 درسِ ثبت‌شده دیگر نامزد نیست (فهرست زنده است)');

  await sleep(100);
  try { require('child_process').execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  win.close();
}

/* ═════════════════════ بخشِ ب: سرور ═════════════════════ */
const { opX } = require('./helpers/opx');
const PORT = 8993;
const BASE = `http://127.0.0.1:${PORT}`;
function http(method, url, body, cookie) {
  return fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})), hdr: r.headers.get('set-cookie') || '' }));
}

async function serverPart() {
  console.log('\n▸ گردشِ کارِ تجدیدی (بند ۶.۵) — سرور');
  const seed = path.join(ROOT, 'server/data/payesh.json');
  if (!fs.existsSync(seed)) { console.log('  ⏭️  server/data/payesh.json نیست — اول: node server/seed.js'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-retake-'));
  const store = path.join(dir, 'store.json');
  fs.copyFileSync(seed, store);
  const child = spawn('node', [path.join(ROOT, 'server/index.js')], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', PAYESH_STORE: store,
           PAYESH_AUDIT: path.join(dir, 'audit.jsonl'),
           PAYESH_JWT_SECRET: require('crypto').randomBytes(32).toString('hex'), PAYESH_DEMO_CODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  try {
    await new Promise((res, rej) => {
      let done = false;
      const iv = setInterval(async () => {
        if (done) return;
        try { const r = await http('GET', '/api/health'); if (r.status === 200) { done = true; clearInterval(iv); res(); } } catch {}
      }, 300);
      setTimeout(() => { if (!done) rej(new Error('سرور بالا نیامد: ' + out.slice(-300))); }, 12000);
    });

    const s0 = JSON.parse(fs.readFileSync(store, 'utf8'));
    const mgr = s0.users.find((u) => u.role === 'manager' && u.school_id === 1 && u.active);
    /* دبیری که کلاسِ یک دانش‌آموزِ مردود را درس می‌دهد (و یکی که نمی‌دهد) */
    const rank = (t) => String(t || '').includes('دوم') ? 2 : String(t || '').includes('اول') ? 1 : 0;
    const map = {};
    (s0.grades || []).filter((g) => g.school_id === 1).forEach((g) => {
      const k = g.student_id + '|' + g.subject_id; const p = map[k];
      if (!p) { map[k] = g; return; }
      const d = rank(g.term) - rank(p.term);
      if (d > 0 || (d === 0 && String(g.date) >= String(p.date))) map[k] = g;
    });
    const failing = Object.values(map).filter((g) => Number(g.score) < 10);
    const clsOf = (sid) => { const e = (s0.enrollments || []).find((e) => e.student_id === sid); return e && e.class_id; };
    let tea = null, teaOther = null, victim = null;
    for (const t of s0.users.filter((u) => u.role === 'teacher' && u.school_id === 1 && u.active)) {
      for (const g of failing) {
        const c = clsOf(g.student_id);
        const teaches = (s0.schedule || []).some((x) => x.class_id === c && x.teacher_id === t.id)
          || ((s0.classes || []).find((cl) => cl.id === c) || {}).homeroom_teacher_id === t.id;
        if (teaches && !tea) { tea = t; victim = g; }
        if (!teaches && !teaOther) teaOther = t;
      }
      if (tea && teaOther) break;
    }
    const mgr2 = s0.users.find((u) => u.role === 'manager' && u.school_id === 2 && u.active);
    if (!mgr || !tea || !victim) { T(false, 'زمینهٔ آزمون (مدیر/دبیر/نمرهٔ مردود) در دادهٔ نمونه نیست'); return; }

    const login = async (u) => {
      const sc = await http('POST', '/api/auth/send-code', { phone: u.phone });
      const code = sc.json.demo_code || sc.json.code || '000000';
      const lg = await http('POST', '/api/auth/login', { phone: u.phone, code, national_id: u.national_id });
      return lg.hdr.split(';')[0];
    };
    const mgrC = await login(mgr);
    const teaC = await login(tea);
    const tea2C = teaOther ? await login(teaOther) : null;
    const mgr2C = mgr2 ? await login(mgr2) : null;

    /* S1 — مدیر: ins رکوردِ تجدیدیِ پیوندخورده (فیلدِ تازه grade_id از fieldGate می‌گذرد) */
    const ins = await http('POST', '/api/sync', { ops: [opX({ by: mgr.id, collection: 'reexams', type: 'ins', data: {
      school_id: 1, student_id: victim.student_id, subject_id: victim.subject_id,
      grade_id: victim.id, original_score: Number(victim.score), exam_date: '2026-09-20',
      new_score: null, status: 'scheduled', created_at: '2026-09-06', updated_at: '2026-09-06' } })] }, mgrC);
    const insS = ins.json && ins.json.results && ins.json.results[0];
    T(ins.status === 200 && insS && insS.ok === true, 'S1 مدیر: ins تجدیدی با فیلدِ grade_id → 200 + ok');
    await sleep(2300);
    let st = JSON.parse(fs.readFileSync(store, 'utf8'));
    const row = (st.reexams || []).find((r) => r.grade_id === victim.id);
    T(!!row && row.original_score === Number(victim.score), 'S2 فلش: رکورد با پیوندِ grade_id در store ماندگار شد');

    /* S3 — دبیرِ همان کلاس: upd نمرهٔ مجدد مجاز (تازه در این فاز) */
    const upd = await http('POST', '/api/sync', { ops: [opX({ by: tea.id, collection: 'reexams', type: 'upd',
      id: row.id, data: { new_score: 16, status: 'done', updated_at: '2026-09-09' } })] }, teaC);
    const updS = upd.json && upd.json.results && upd.json.results[0];
    T(upd.status === 200 && updS && updS.ok === true,
      'S3 دبیرِ همان کلاس: upd نمرهٔ مجدد → مجاز (گرفت: ' + upd.status + ' ' + JSON.stringify(updS || upd.json).slice(0, 90) + ')');
    await sleep(2300);
    st = JSON.parse(fs.readFileSync(store, 'utf8'));
    const row2 = (st.reexams || []).find((r) => r.id === row.id);
    T(row2 && row2.status === 'done' && row2.new_score === 16, 'S4 فلش: نمرهٔ مجددِ دبیر در store ماندگار شد');

    /* S5 — دبیر: ins ممنوع (ثبتِ درسِ تجدیدی دستِ مدیر است) */
    const tins = await http('POST', '/api/sync', { ops: [opX({ by: tea.id, collection: 'reexams', type: 'ins', data: {
      school_id: 1, student_id: victim.student_id, subject_id: victim.subject_id,
      grade_id: victim.id, original_score: 5, exam_date: '2026-09-20', new_score: null,
      status: 'scheduled', created_at: '2026-09-06', updated_at: '2026-09-06' } })] }, teaC);
    const tinsS = tins.json && tins.json.results && tins.json.results[0];
    const deniedIns = (tins.status === 403 && ['role_denied', 'out_of_scope'].includes(tins.json && tins.json.code))
      || (tins.status === 200 && tinsS && !tinsS.ok && ['role_denied', 'out_of_scope'].includes(tinsS.code));
    T(deniedIns, 'S5 دبیر: ins رکوردِ تجدیدی → رد (گرفت: ' + tins.status + ' ' + ((tins.json && tins.json.code) || (tinsS && tinsS.code)) + ')');

    /* S6 — دبیرِ بی‌ربط: upd روی دانش‌آموزِ کلاسِ دیگر → ردِ دامنه */
    if (tea2C) {
      const oth = await http('POST', '/api/sync', { ops: [opX({ by: teaOther.id, collection: 'reexams', type: 'upd',
        id: row.id, data: { new_score: 20, status: 'done', updated_at: '2026-09-09' } })] }, tea2C);
      const othS = oth.json && oth.json.results && oth.json.results[0];
      const deniedOth = (oth.status === 403 && ['role_denied', 'out_of_scope'].includes(oth.json && oth.json.code))
        || (oth.status === 200 && othS && !othS.ok && ['role_denied', 'out_of_scope'].includes(othS.code));
      T(deniedOth, 'S6 دبیرِ بی‌ربط: upd تجدیدیِ کلاسِ دیگر → رد (گرفت: ' + oth.status + ' ' + ((oth.json && oth.json.code) || (othS && othS.code)) + ')');
    } else { console.log('  ⏭️  S6 دبیرِ بی‌ربط در دادهٔ نمونه نیست'); }

    /* S7 — مدیرِ مدرسهٔ دیگر: روی مدرسهٔ ۱ → out_of_scope */
    if (mgr2C) {
      const x = await http('POST', '/api/sync', { ops: [opX({ by: mgr2.id, collection: 'reexams', type: 'upd',
        id: row.id, data: { new_score: 3, status: 'done', updated_at: '2026-09-09' } })] }, mgr2C);
      T(x.status === 403 && x.json && x.json.code === 'out_of_scope',
        'S7 مدیرِ مدرسهٔ ۲ روی مدرسهٔ ۱ → out_of_scope (گرفت: ' + x.status + ' ' + (x.json && x.json.code) + ')');
    } else { console.log('  ⏭️  S7 مدیرِ مدرسهٔ ۲ در دادهٔ نمونه نیست'); }

    /* S8 — ردیفِ نمرهٔ تجدیدیِ دبیر (فیلدهای is_retake/retake_of_grade_id) در store */
    const gins = await http('POST', '/api/sync', { ops: [opX({ by: tea.id, collection: 'grades', type: 'ins', data: {
      school_id: 1, class_id: victim.class_id || clsOf(victim.student_id), student_id: victim.student_id,
      subject_id: victim.subject_id, teacher_id: tea.id, term: victim.term || '',
      exam_type: 'تجدیدی', kind: '', score: 16, max_score: victim.max_score || 20,
      date: '2026-09-09', source: '', is_retake: 1, retake_of_grade_id: victim.id,
      created_at: '2026-09-09', updated_at: '2026-09-09' } })] }, teaC);
    const ginsS = gins.json && gins.json.results && gins.json.results[0];
    T(gins.status === 200 && ginsS && ginsS.ok === true,
      'S8 دبیر: ins نمره با is_retake/retake_of_grade_id → مجاز (گرفت: ' + gins.status + ' ' + JSON.stringify(ginsS || gins.json).slice(0, 90) + ')');
    await sleep(2300);
    st = JSON.parse(fs.readFileSync(store, 'utf8'));
    const grow = (st.grades || []).find((g) => Number(g.is_retake) === 1 && Number(g.retake_of_grade_id) === victim.id);
    T(!!grow && grow.exam_type === 'تجدیدی', 'S9 فلش: ردیفِ نمرهٔ تجدیدی با فیلدهایِ تازه در store است');
    T(!!row2 && row2.new_score === 16, 'S9b نمرهٔ دستکاری‌شدهٔ دبیرِ بی‌ربط اعمال نشد (همچنان ۱۶)');

    /* S10 — گاردِ یکپارچگی: دبیر نمی‌تواند بی‌نمره «انجام‌شده» بزند
       (انجام‌شده‌یِ بی‌نمره = ادعایِ برگزاریِ امتحانی که برگزار نشده) */
    const bare = await http('POST', '/api/sync', { ops: [opX({ by: tea.id, collection: 'reexams', type: 'upd',
      id: row.id, data: { status: 'done', updated_at: '2026-09-10' } })] }, teaC);
    const bareS = bare.json && bare.json.results && bare.json.results[0];
    T((bare.status === 403 && bare.json && bare.json.code === 'field_denied')
      || (bare.status === 200 && bareS && !bareS.ok && bareS.code === 'field_denied'),
      'S10 دبیر: انجام‌شده بدونِ نمرهٔ مجدد → field_denied (گرفت: ' + bare.status + ' ' + ((bare.json && bare.json.code) || (bareS && bareS.code)) + ')');
    await sleep(2300);
    st = JSON.parse(fs.readFileSync(store, 'utf8'));
    const row3 = (st.reexams || []).find((r) => r.id === row.id);
    T(row3 && row3.new_score === 16, 'S10b نمرهٔ پیشینِ رکورد با تلاشِ بی‌نمره دست‌نخورده ماند');
  } finally {
    child.kill('SIGKILL');
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
async function main() {
  await clientPart();
  await serverPart();
  console.log('\n────────────────────────────────────────────────────');
  console.log(`retake-exams (بند ۶.۵): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
  process.exit(fail ? 1 : 0);
}
