#!/usr/bin/env node
/**
 * سئوت مدل کلاس — پایش
 * بند ۲ (مدل چندپایهٔ زودهنگام: class_subject_members + fallback تنبل)
 * و بند ۳ (میانگین کلاس کنار نمره — پنهان‌نام، فقط عدد).
 *
 * در پروسهٔ جدا از smoke اجرا می‌شود (فیکسورهای این سئوت با heapِ
 * ۸۰۰ مگابایتیِ خاتمةٔ smoke جا نمی‌گیرند).
 *
 * اجرا: node tests/classmodel.js
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
  catch (e) { results.push({ name, ok: false, detail: String(e.message || e), ms: Date.now() - t0 }); }
};

(async () => {
  await sleep(300);

/* ═══════════════ مدل چندپایه (بند ۲ — فقط دادهٔ مدل) ═══════════════ */

console.log('\n▸ مدل چندپایه (class_subject_members)');

  await sec('چندپایه: بدون ردیف، fallback تنبل = همهٔ دانش‌آموزان کلاس (رفتار امروز)', () => {
  const r = JSON.parse(W(`JSON.stringify((function(){
    var sc = db.schools.filter(function(s){return s.active;})[0];
    var cls = db.classes.filter(function(c){return c.school_id===sc.id;})[0];
    var sub = db.subjects.filter(function(x){return x.school_id===sc.id;})[0];
    var all = studentsOfClass(cls.id).map(function(u){return u.id;}).sort(function(a,b){return a-b;});
    var got = classSubjectMembers(cls.id, sub.id).map(function(u){return u.id;}).sort(function(a,b){return a-b;});
    return {all:all, got:got};
  })())`));
  assert(JSON.stringify(r.all) === JSON.stringify(r.got),
    'fallback با studentsOfClass یکسان نیست: ' + JSON.stringify(r));
});

  await sec('چندپایه: با ردیف، فقط همان دانش‌آموزان (و تطبیق setClassSubjectMembers)', () => {
  const r = JSON.parse(W(`JSON.stringify((function(){
    var sc = db.schools.filter(function(s){return s.active;})[0];
    var cls = null;
    for(var ci=0; ci<db.classes.length; ci++){
      if(db.classes[ci].school_id!==sc.id) continue;
      if(studentsOfClass(db.classes[ci].id).length >= 2){ cls = db.classes[ci]; break; }
    }
    if(!cls) return {skip:true};
    var sub = db.subjects.filter(function(x){return x.school_id===sc.id;})[0];
    var all = studentsOfClass(cls.id);
    setClassSubjectMembers(cls.id, sub.id, [all[0].id, all[1].id]);
    var got = classSubjectMembers(cls.id, sub.id).map(function(u){return u.id;});
    /* افزودن و کم کردن */
    setClassSubjectMembers(cls.id, sub.id, [all[1].id]);
    var got2 = classSubjectMembers(cls.id, sub.id).map(function(u){return u.id;});
    /* پاک‌سازی */
    (db.class_subject_members||[]).slice().forEach(function(x){
      if(x.class_id===cls.id&&x.subject_id===sub.id) remove('class_subject_members',x.id);
    });
    var left = (db.class_subject_members||[]).filter(function(x){return x.class_id===cls.id&&x.subject_id===sub.id;}).length;
    return {skip:false, n1:got.length, s1:got.indexOf(all[0].id)>=0, s2:got.indexOf(all[1].id)>=0,
            n2:got2.length, only2:got2.indexOf(all[1].id)>=0, left:left};
  })())`));
  assert(!r.skip, 'کلاس آزمایشی دانش‌آموز ندارد');
  assert(r.n1===2 && r.s1 && r.s2, 'با ردیف، فهرست باید فقط همان دو نفر باشد: ' + JSON.stringify(r));
  assert(r.n2===1 && r.only2, 'تطبیق (کم‌کردن) کار نکرد: ' + JSON.stringify(r));
  assert(r.left===0, 'پاک‌سازی ردیف‌ها کار نکرد');
});

  await sec('چندپایه: ردیفِ درس دیگر را نمی‌خواند', () => {
  const r = JSON.parse(W(`JSON.stringify((function(){
    var sc = db.schools.filter(function(s){return s.active;})[0];
    var cls = db.classes.filter(function(c){return c.school_id===sc.id;})[0];
    var subs = db.subjects.filter(function(x){return x.school_id===sc.id;});
    if(subs.length < 2) return {skip:true};
    var all = studentsOfClass(cls.id);
    if(all.length < 1) return {skip:true};
    insert('class_subject_members',{class_id:cls.id,subject_id:subs[0].id,student_id:all[0].id});
    var inA = classSubjectMembers(cls.id, subs[0].id).map(function(u){return u.id;});
    var inB = classSubjectMembers(cls.id, subs[1].id).map(function(u){return u.id;});
    (db.class_subject_members||[]).slice().forEach(function(x){
      if(x.class_id===cls.id&&x.subject_id===subs[0].id) remove('class_subject_members',x.id);
    });
    var allB = studentsOfClass(cls.id).map(function(u){return u.id;});
    return {skip:false, nA:inA.length, a:inA.indexOf(all[0].id)>=0,
            sameB:JSON.stringify(inB.sort())===JSON.stringify(allB.sort())};
  })())`));
  assert(!r.skip, 'دادهٔ آزمایشی کافی نیست');
  assert(r.nA===1 && r.a, 'درس الف باید فقط عضو خودش را بدهد');
  assert(r.sameB===true, 'درس ب باید fallback (همهٔ کلاس) بدهد');
});



/* ═══════════════ میانگین کلاس کنار نمره (بند ۳) ═══════════════ */

console.log('\n▸ میانگین کلاس (بدون نام، فقط عدد)');

  await sec('میانگین کلاس: context با دو دانش‌آموز، میانگین درست می‌دهد و تک‌نفره حذف می‌شود', () => {
  const r = JSON.parse(W(`JSON.stringify((function(){
    var sc = db.schools.filter(function(s){return s.active;})[0];
    var cls = null;
    for(var ci=0; ci<db.classes.length; ci++){
      if(db.classes[ci].school_id!==sc.id) continue;
      if(studentsOfClass(db.classes[ci].id).length >= 2){ cls = db.classes[ci]; break; }
    }
    if(!cls) return {skip:true};
    var all = studentsOfClass(cls.id);
    var sub = db.subjects.filter(function(x){return x.school_id===sc.id;})[0];
    var t = 'VC-نوبت تست';
    insert('grades',{school_id:sc.id,student_id:all[0].id,class_id:cls.id,subject_id:sub.id,teacher_id:0,term:t,exam_type:'کلاسی',score:10,max_score:20,created_at:'2026-06-01'});
    insert('grades',{school_id:sc.id,student_id:all[1].id,class_id:cls.id,subject_id:sub.id,teacher_id:0,term:t,exam_type:'کلاسی',score:18,max_score:20,created_at:'2026-06-01'});
    var ctx = classScoreContext(cls.id);
    var k = sub.id+'|'+t+'|کلاسی';
    var soloKey = null;
    /* گروه تک‌نفره: درس دوم با یک نمره */
    var subs = db.subjects.filter(function(x){return x.school_id===sc.id;});
    if(subs.length>1){
      insert('grades',{school_id:sc.id,student_id:all[0].id,class_id:cls.id,subject_id:subs[1].id,teacher_id:0,term:t,exam_type:'کلاسی',score:15,max_score:20,created_at:'2026-06-01'});
      ctx = classScoreContext(cls.id);
      soloKey = subs[1].id+'|'+t+'|کلاسی';
    }
    /* پاک‌سازی */
    db.grades.slice().forEach(function(g){ if(g.term===t) remove('grades',g.id); });
    return {skip:false, avg:ctx[k]?ctx[k].avg:null, n:ctx[k]?ctx[k].n:null,
            soloGone:(soloKey?!(soloKey in ctx):true)};
  })())`));
  assert(!r.skip, 'کلاسی با دو دانش‌آموز نیست');
  assert(r.avg===14 && r.n===2, 'میانگین باید ۱۴ با ۲ نمره باشد: ' + JSON.stringify(r));
  assert(r.soloGone===true, 'گروه تک‌نفره نباید میانگین داشته باشد');
});

  await sec('میانگین کلاس: در تب کارنامه کنار نمره نمایش می‌یابد (پنهان‌نام: بدون نام)', () => {
  const r = JSON.parse(W(`JSON.stringify((function(){
    var sc = db.schools.filter(function(s){return s.active;})[0];
    var cls = null;
    for(var ci=0; ci<db.classes.length; ci++){
      if(db.classes[ci].school_id!==sc.id) continue;
      if(studentsOfClass(db.classes[ci].id).length >= 2){ cls = db.classes[ci]; break; }
    }
    if(!cls) return {skip:true};
    var all = studentsOfClass(cls.id);
    var sub = db.subjects.filter(function(x){return x.school_id===sc.id;})[0];
    var t = 'VC-نوبت نمایش';
    insert('grades',{school_id:sc.id,student_id:all[0].id,class_id:cls.id,subject_id:sub.id,teacher_id:0,term:t,exam_type:'کلاسی',score:10,max_score:20,created_at:'2026-06-01'});
    insert('grades',{school_id:sc.id,student_id:all[1].id,class_id:cls.id,subject_id:sub.id,teacher_id:0,term:t,exam_type:'کلاسی',score:18,max_score:20,created_at:'2026-06-01'});
    var out = '';
    (function(){S.user=byId('users',all[0].id);S.persona=null;S.boss=null;S.route='record';S.tab='grades';S.child=null;S.filters={};S.page=1;out=renderRoute();})();
    var expected = fa((14).toFixed(2));
    var has = out.indexOf('· کلاس: ' + expected) >= 0;
    /* انیمه: نام دانش‌آموز دوم در کنار نمره نباشد */
    var otherName = all[1].full_name;
    var leak = false;
    out.split('· کلاس: ').forEach(function(seg){ if(seg.indexOf(otherName)>=0) leak=true; });
    db.grades.slice().forEach(function(g){ if(g.term===t) remove('grades',g.id); });
    S.__clsCtx = {};
    return {skip:false, has:has, leak:leak, sample:out.slice(out.indexOf('VC-نوبت نمایش')>=0?out.indexOf('VC-نوبت نمایش'):0, 120)};
  })())`));
  assert(!r.skip, 'کلاسی با دو دانش‌آموز نیست');
  assert(r.has===true, 'میانگین کلاس کنار نمره نیست: ' + JSON.stringify(r.sample));
  assert(r.leak===false, 'نام دانش‌آموز دیگر در بخش میانگین است (انیمه شکسته)');
});

  await sec('میانگین کلاس: کلاس تک‌نفره، میانگین نشان نمی‌دهد', () => {
  const r = JSON.parse(W(`JSON.stringify((function(){
    var sc = db.schools.filter(function(s){return s.active;})[0];
    var cls = insert('classes',{school_id:sc.id,name:'VC-کلاس تستی',grade:1,school_year:'',homeroom_teacher_id:0,capacity:30});
    var stud = insert('users',{role:'student',school_id:sc.id,full_name:'دانش‌آموز تک‌نفره VC',username:'vcln_'+Date.now(),password:'x12345'});
    insert('enrollments',{school_id:sc.id,class_id:cls.id,student_id:stud.id});
    var sub = db.subjects.filter(function(x){return x.school_id===sc.id;})[0];
    var t = 'VC-نوبت تک';
    insert('grades',{school_id:sc.id,student_id:stud.id,class_id:cls.id,subject_id:sub.id,teacher_id:0,term:t,exam_type:'کلاسی',score:12,max_score:20,created_at:'2026-06-01'});
    var ctx = classScoreContext(cls.id);
    var k = sub.id+'|'+t+'|کلاسی';
    var has = k in ctx;
    db.grades.slice().forEach(function(g){ if(g.term===t) remove('grades',g.id); });
    remove('enrollments', (db.enrollments||[]).find(function(e){return e.student_id===stud.id&&e.class_id===cls.id;}).id);
    remove('users', stud.id);
    remove('classes', cls.id);
    return {has:has};
  })())`));
  assert(r.has===false, 'کلاس تک‌نفره نباید میانگین کلاس نشان دهد');
});



  /* ── خاتمه ─────────────────────────────────────────────────── */
  console.log('────────────────────────────────────────────────────────────');
  results.forEach((r) => {
    console.log('  ' + (r.ok ? '✅' : '❌') + ' ' + r.name + (r.ok ? '' : '\n     ' + r.detail));
  });
  const bad = results.filter((r) => !r.ok).length;
  console.log('────────────────────────────────────────────────────────────');
  console.log('  مدل کلاس: ' + (results.length - bad) + '/' + results.length +
    (bad ? ' — ' + bad + ' قرمز 🔴' : ' سبز ✅'));
  process.exit(bad ? 1 : 0);
})();
