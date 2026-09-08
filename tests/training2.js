#!/usr/bin/env node
/**
 * تست‌های دوره‌های آموزش ضمن خدمت + گواهی پایان دوره (بند B.2 فرناز — چت۱):
 *  - سید قطعی training_courses (صفر مصرف rng، فقط در حال برگزاری)
 *  - ثبت/ویرایش مدیر + تکمیل → صدور idempotent گواهی با کد DOR-
 *  - راستی‌آزمایی کد (درست/غلط/دوره‌ناموجود) + سند چاپی
 *  - گارد فقط-مدیر (تابع دامنه + ماتریس canAction هر ۸ نقش)
 *  - اعتبارسنجی fail-closed (عنوان/ساعت/تاریخ/وضعیت/هم‌مدرسه‌ای)
 *  - ساعت ۱۰۰ پذیرفته می‌شود (۲۰ تا ۶۰ فقط راهنماست، نه سقف سخت)
 *  - نمای مدیر + مسیر واقعی کلیک (ثبت → تکمیل → چاپ → راستی‌آزمایی)
 *  - جدایی: گواهی‌های دانش‌آموزی دست‌نخورده، حضور دست‌نخورده
 *
 * اجرا:  node tests/training2.js   (نیازمند jsdom)
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const errors = [];
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; errors.push(`${name}: ${e.message}`); console.log(`  ❌ ${name}\n     ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m || 'شرط برقرار نیست'); }

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
const mgrLogin = () => W(`S.user=db.users.find(function(u){return u.username==='manager1';});S.persona=null;S.boss=null;`);

async function main() {
  await sleep(500);
  W('window.ATT0=db.attendance.length;window.STUCERT0=db.certificates.filter(function(c){return c.type!=="staff_training";}).length;');

  test('T1 بوت بدون خطا + سید دوره‌ها', () => {
    assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    assert(Number(W('db.training_courses.length')) === 12, 'سید باید ۱۲ باشد');
    assert(Number(W(`db.users.length`)) === 1035, 'کاربر تازه ساخته شد!');
    assert(W(`!!db.users.find(function(u){return u.username==='manager1';})`), 'حساب نمونه جابه‌جا شد');
    assert(W(`!!db.users.find(function(u){return u.role==='counselor';})`), 'جریان rng جابه‌جا شد (مشاور نیست)');
    const comp = Number(W(`db.training_courses.filter(function(c){return c.status==='completed';}).length`));
    assert(comp === 0, 'سید نباید تکمیل‌شده داشته باشد');
  });

  test('T2 ثبت دورهٔ در حال برگزاری (بدون گواهی)', () => {
    mgrLogin();
    const r = JSON.parse(W(`(function(){
      var t=staffOfSchool(S.user.school_id)[2];
      var res=saveTrainingCourse(null,{staff_id:t.id,title:'آزمون دوره',hours:30,date:todayISO(),status:'ongoing'});
      if(!res.ok)return JSON.stringify({err:res.msg});
      var c=byId('training_courses',res.id);
      return JSON.stringify({id:res.id,school:c.school_id,staff:c.staff_id,title:c.title,
        hours:c.hours,date:c.date,status:c.status,cert:res.cert});
    })()`));
    assert(!r.err, 'ثبت ناموفق: ' + r.err);
    assert(r.school === Number(W('S.user.school_id')), 'school_id از نشست نیست');
    assert(r.title === 'آزمون دوره' && r.hours === 30 && r.status === 'ongoing', 'فیلدها درست نیست');
    assert(r.cert === null, 'دورهٔ جاری نباید گواهی بگیرد');
  });

  test('T3 تکمیل → صدور گواهی DOR- با سطر سوابق', () => {
    mgrLogin();
    const r = JSON.parse(W(`(function(){
      var c=coursesOfSchool(S.user.school_id).filter(function(x){return x.title==='آزمون دوره';})[0];
      var res=saveTrainingCourse(c.id,{staff_id:c.staff_id,title:c.title,hours:c.hours,date:c.date,status:'completed'});
      if(!res.ok)return JSON.stringify({err:res.msg});
      var rows=db.certificates.filter(function(x){return x.type==='staff_training'&&x.code===res.cert;});
      var row=rows[0]||{};
      return JSON.stringify({cert:res.cert,n:rows.length,school:row.school_id,by:row.issued_by,
        me:S.user.id,hasStudent:row.student_id!==undefined,year:row.year});
    })()`));
    assert(!r.err, 'تکمیل ناموفق: ' + r.err);
    assert(/^DOR-[A-Z2-9]{6}$/.test(r.cert), 'قالب کد نادرست: ' + r.cert);
    assert(r.n === 1, 'باید دقیقاً یک سطر گواهی باشد');
    assert(r.school === Number(W('S.user.school_id')), 'مدرسهٔ گواهی نادرست');
    assert(r.by === r.me, 'issued_by باید مدیر باشد');
    assert(r.hasStudent === false, 'گواهی کادر نباید student_id داشته باشد');
    assert(r.year !== '' && r.year !== undefined, 'سال خالی است');
  });

  test('T4 صدور idempotent است (تکمیل دوباره = همان کد، بدون سطر تازه)', () => {
    mgrLogin();
    const r = JSON.parse(W(`(function(){
      var c=coursesOfSchool(S.user.school_id).filter(function(x){return x.title==='آزمون دوره';})[0];
      var before=db.certificates.filter(function(x){return x.type==='staff_training';}).length;
      var res=saveTrainingCourse(c.id,{staff_id:c.staff_id,title:c.title,hours:c.hours,date:c.date,status:'completed'});
      var after=db.certificates.filter(function(x){return x.type==='staff_training';}).length;
      return JSON.stringify({ok:res.ok,cert:res.cert,before:before,after:after});
    })()`));
    assert(r.ok && r.before === r.after, 'سطر تکراری ساخته شد');
    assert(/^DOR-/.test(r.cert), 'کد برنگشت');
  });

  test('T5 راستی‌آزمایی کد + سند چاپی', () => {
    mgrLogin();
    const r = JSON.parse(W(`(function(){
      var c=coursesOfSchool(S.user.school_id).filter(function(x){return x.title==='آزمون دوره';})[0];
      var code=staffCertCode(c.id,c.staff_id,c.school_id);
      var d=trainingCert(c.id);
      var d2=trainingCert(999999);
      return JSON.stringify({
        good: staffCertVerify(code,c.id).ok,
        bad: staffCertVerify('DOR-XXXXXX',c.id).ok,
        ghost: staffCertVerify(code,999999).ok,
        doc: d.ok && d.body.indexOf(code)>-1 && d.body.indexOf('آزمون دوره')>-1
          && d.title.indexOf('گواهی پایان دوره')>-1,
        docGhost: d2.ok
      });
    })()`));
    assert(r.good === true, 'کد درست رد شد');
    assert(r.bad === false && r.ghost === false, 'کد غلط/دوره ناموجود پذیرفته شد');
    assert(r.doc === true, 'سند چاپی کامل نیست');
    assert(r.docGhost === false, 'سند دوره ناموجود ساخته شد');
  });

  test('T6 فقط مدیر: تابع دامنه + ماتریس canAction', () => {
    for (const role of ['teacher', 'student', 'parent']){
      const r = W(`(function(){
        S.user=db.users.find(function(u){return u.role==='${role}';});S.persona=null;S.boss=null;
        var sch=S.user.school_id||db.users.find(function(u){return u.role==='manager';}).school_id;
        var t=staffOfSchool(sch)[0];
        return saveTrainingCourse(null,{staff_id:t.id,title:'x',hours:10,date:todayISO(),status:'ongoing'}).ok;
      })()`);
      assert(r === false, role + ' توانست ثبت کند!');
    }
    const m = JSON.parse(W(`JSON.stringify(['manager','superadmin','teacher','student','parent','counselor','driver','edu_office'].map(function(r){
      return [r,canAction('trn-save',r),canAction('trn-complete',r),canAction('trn-print',r)];
    }))`));
    for (const row of m){
      const want = (row[0] === 'manager' || row[0] === 'superadmin');
      assert(row[1] === want && row[2] === want && row[3] === want, 'canAction نادرست برای ' + row[0]);
    }
    mgrLogin();
  });

  test('T7 اعتبارسنجی fail-closed (+ ساعت ۱۰۰ مجاز است)', () => {
    mgrLogin();
    const r = JSON.parse(W(`(function(){
      var t=staffOfSchool(S.user.school_id)[0];
      var other=staffOfSchool(db.schools.filter(function(s){return s.id!==S.user.school_id;})[0].id)[0];
      var stu=db.users.find(function(u){return u.role==='student'&&u.school_id===S.user.school_id;});
      var otherC=coursesOfSchool(other.school_id||db.schools.filter(function(s){return s.id!==S.user.school_id;})[0].id)[0];
      var longTitle=new Array(102).join('x');
      return JSON.stringify({
        emptyTitle: saveTrainingCourse(null,{staff_id:t.id,title:'  ',hours:10,date:todayISO(),status:'ongoing'}).ok,
        longTitle: saveTrainingCourse(null,{staff_id:t.id,title:longTitle,hours:10,date:todayISO(),status:'ongoing'}).ok,
        zeroHours: saveTrainingCourse(null,{staff_id:t.id,title:'x',hours:0,date:todayISO(),status:'ongoing'}).ok,
        negHours: saveTrainingCourse(null,{staff_id:t.id,title:'x',hours:-5,date:todayISO(),status:'ongoing'}).ok,
        nanHours: saveTrainingCourse(null,{staff_id:t.id,title:'x',hours:'x',date:todayISO(),status:'ongoing'}).ok,
        badDate: saveTrainingCourse(null,{staff_id:t.id,title:'x',hours:10,date:'1405-99-99',status:'ongoing'}).ok,
        badStatus: saveTrainingCourse(null,{staff_id:t.id,title:'x',hours:10,date:todayISO(),status:'done'}).ok,
        crossSchool: saveTrainingCourse(null,{staff_id:other.id,title:'x',hours:10,date:todayISO(),status:'ongoing'}).ok,
        notStaff: saveTrainingCourse(null,{staff_id:stu.id,title:'x',hours:10,date:todayISO(),status:'ongoing'}).ok,
        ghostStaff: saveTrainingCourse(null,{staff_id:999999,title:'x',hours:10,date:todayISO(),status:'ongoing'}).ok,
        ghostCourse: saveTrainingCourse(999999,{staff_id:t.id,title:'x',hours:10,date:todayISO(),status:'ongoing'}).ok,
        crossCourse: saveTrainingCourse(otherC.id,{staff_id:t.id,title:'x',hours:10,date:todayISO(),status:'ongoing'}).ok,
        hours100: saveTrainingCourse(null,{staff_id:t.id,title:'ساعت بالا',hours:100,date:todayISO(),status:'ongoing'}).ok
      });
    })()`));
    for (const k of Object.keys(r)){
      if (k === 'hours100') assert(r[k] === true, 'ساعت ۱۰۰ باید مجاز باشد!');
      else assert(r[k] === false, k + ' باید رد می‌شد');
    }
  });

  test('T8 نمای مدیر رندر می‌شود', () => {
    mgrLogin();
    W(`S.route='training';`);
    const h = W('renderRoute()');
    assert(h.indexOf('دوره‌های آموزش ضمن خدمت') > -1, 'عنوان نما نیست');
    assert(h.indexOf('روش‌های نوین تدریس') > -1, 'سید در نما نیست');
    assert(h.indexOf('آزمون دوره') > -1, 'دورهٔ تازه در نما نیست');
    assert(/id="trnrow_\d+"/.test(h), 'سطر شناسه‌دار نیست');
    assert(h.indexOf('DOR-') > -1, 'کد گواهی دورهٔ تکمیل‌شده در نما نیست');
  });

  test('T9 مسیر واقعی کلیک: ثبت → تکمیل → چاپ → راستی‌آزمایی', () => {
    mgrLogin();
    W(`S.route='training';document.getElementById('root').innerHTML=renderRoute();`);
    /* ثبت */
    win.document.querySelector('[data-act="trn-new"]').click();
    assert(win.document.getElementById('modal').innerHTML.indexOf('trn-save') > -1, 'مودال ثبت باز نشد');
    win.document.getElementById('trn_f_title').value = 'دوره کلیکی';
    win.document.getElementById('trn_f_hours').value = '45';
    win.document.querySelector('#modal [data-act="trn-save"]').click();
    assert(win.document.getElementById('modal').innerHTML === '', 'مودال بسته نشد');
    const cid = Number(W(`(coursesOfSchool(S.user.school_id).filter(function(c){return c.title==='دوره کلیکی';})[0]||{}).id`));
    assert(cid > 0, 'دوره از مسیر کلیک ساخته نشد');
    /* تکمیل */
    win.document.querySelector('#trnrow_' + cid + ' [data-act="trn-complete"]').click();
    const code = W(`(function(){var c=byId('training_courses',${cid});return c.status+':'+staffCertCode(c.id,c.staff_id,c.school_id);})()`);
    assert(code.indexOf('completed:DOR-') === 0, 'تکمیل از مسیر کلیک نشد: ' + code);
    assert(win.document.getElementById('root').innerHTML.indexOf(code.split(':')[1]) > -1, 'کد در جدول نیامد');
    /* چاپ (window.open قلابی برای گرفتن HTML چاپی) */
    W(`window.__printed='';window.open=function(){return {document:{write:function(h){window.__printed=h;},close:function(){}},print:function(){}};};`);
    win.document.querySelector('#trnrow_' + cid + ' [data-act="trn-print"]').click();
    const printed = String(W('window.__printed'));
    assert(printed.indexOf('دوره کلیکی') > -1, 'عنوان در چاپ نیست');
    assert(printed.indexOf(code.split(':')[1]) > -1, 'کد در چاپ نیست');
    assert(printed.indexOf('گواهی پایان دوره') > -1, 'تیتر گواهی در چاپ نیست');
    /* راستی‌آزمایی */
    win.document.querySelector('#trnrow_' + cid + ' [data-act="trn-verify"]').click();
    win.document.getElementById('trn_v_code').value = code.split(':')[1];
    win.document.querySelector('#modal [data-act="trn-verify-check"]').click();
    assert(win.document.getElementById('toasts').textContent.indexOf('معتبر است') > -1, 'تأیید نمایش داده نشد');
  });

  test('T10 دبیر به روت دسترسی ندارد', () => {
    W(`S.user=db.users.find(function(u){return u.username==='teacher1_1';});S.persona=null;S.boss=null;S.route='training';`);
    assert(W('renderRoute()').indexOf('دسترسی مجاز نیست') > -1, 'دبیر وارد نما شد!');
    assert(W(`navFor(S.user).some(function(g){return (g[1]||[]).some(function(it){return it[0]==='training';});})`) === false, 'روت در منوی دبیر هست!');
    mgrLogin();
    assert(W(`navFor(S.user).some(function(g){return (g[1]||[]).some(function(it){return it[0]==='training';});})`) === true, 'روت در منوی مدیر نیست!');
  });

  test('T11 جدایی: گواهی دانش‌آموزی و حضور دست‌نخورده‌اند', () => {
    assert(Number(W('STUCERT0')) === Number(W(`db.certificates.filter(function(c){return c.type!=='staff_training';}).length`)), 'گواهی دانش‌آموزی دست خورد!');
    assert(Number(W('ATT0')) === Number(W('db.attendance.length')), 'حضور دست خورد!');
    const bad = Number(W(`db.training_courses.filter(function(r){
      return r.student_id!==undefined||r.class_id!==undefined;
    }).length`));
    assert(bad === 0, 'کلید دانش‌آموزی در دوره!');
    /* گواهی دانش‌آموز هنوز همان رفتار را دارد (صفر انحراف ریفکتور) */
    const ok = W(`(function(){var s=db.users.find(function(u){return u.role==='student';});
      return certVerify(certCodeCalc('enrollment',s.id,s.school_id),s.id).ok
        && certVerify(certCodeCalc('transfer',s.id,s.school_id),s.id).ok
        && !certVerify('GHT-XXXXXX',s.id).ok;})()`);
    assert(ok === true, 'رفتار گواهی دانش‌آموز عوض شد!');
  });

  test('T12 دورهٔ تکمیل‌شده قفل است (Devin-R1: ویرایش رد، گواهی معتبر می‌ماند)', () => {
    mgrLogin();
    const r = JSON.parse(W(`(function(){
      var t=staffOfSchool(S.user.school_id)[1];
      var mk=saveTrainingCourse(null,{staff_id:t.id,title:'قفل گواهی',hours:12,date:todayISO(),status:'ongoing'});
      var done=saveTrainingCourse(mk.id,{staff_id:t.id,title:'قفل گواهی',hours:12,date:todayISO(),status:'completed'});
      var bad=saveTrainingCourse(mk.id,{staff_id:t.id,title:'قفل گواهی!',hours:12,date:todayISO(),status:'completed'});
      var v=staffCertVerify(done.cert,mk.id);
      return JSON.stringify({cert:done.cert,ok:bad.ok,msg:bad.msg,verify:v.ok});
    })()`));
    assert(r.cert && /^DOR-/.test(r.cert), 'گواهی صادر نشد');
    assert(r.ok === false && r.msg === 'دوره تکمیل شده قابل ویرایش نیست', 'ویرایش دورهٔ تکمیل‌شده باید رد شود');
    assert(r.verify === true, 'گواهی پس از تلاش ویرایش باید معتبر بماند');
  });

  const total = pass + fail;
  console.log(`تست دوره‌های آموزشی: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (consoleErrors.length){
    console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
    consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
  }
  console.log('─'.repeat(52) + '\n');
  dom.window.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
