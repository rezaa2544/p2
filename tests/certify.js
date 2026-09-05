#!/usr/bin/env node
/**
 * سئوت گواهی‌های رسمی (بند ۶: اشتغال به تحصیل + انتقالی) — پایش
 *
 * در پروسهٔ جداگانه اجرا می‌شود (نه داخل smoke.js).
 * فیکسور: دانش‌آموز تازه در کلاسی از مدرسهٔ دمو + ولیِ تازه.
 *
 * بخش‌ها:
 *  C1 ساخت بدنهٔ اشتغال به تحصیل (فیلدها + کد)
 *  C2 ساخت بدنهٔ انتقالی (بازه + وضعیت کلی + کد)
 *  C3 قطعی بودن کد احراز (تکرار = همان؛ تغییر داده = کد دیگر)
 *  C4 راستی‌آزمایی (درست/غلط/حساسیت به حروف کوچک)
 *  C5 امنیت داده‌ای (دانش‌آموز فقط خودش؛ ولی فقط فرزندش)
 *  C6 ثبت صدور + دکمه‌های صفحهٔ پرونده
 *
 * اجرا: node tests/certify.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — سئوت رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

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

/* فیکسور: دانش‌آموز تازه در کلاسِ یک مدرسهٔ فعالِ دمو + ولی */
async function cfFx(){
  return JSON.parse(W(`JSON.stringify((function(){
    var sc = db.schools.filter(function(s){return s.active;})[0];
    var cls = db.classes.filter(function(c){return c.school_id===sc.id;})[0];
    var stud = insert('users',{role:'student',school_id:sc.id,full_name:'دانش‌آموز تستی گواهی',
      username:'certfx_'+Date.now(),password:'x12345',national_id:'1234567890',phone:'09120000000',active:1});
    var enr = insert('enrollments',{school_id:sc.id,class_id:cls.id,student_id:stud.id});
    var par = insert('users',{role:'parent',school_id:sc.id,full_name:'ولی تستی گواهی',
      username:'certpf_'+Date.now(),password:'x12345',national_id:'0987654321',phone:'09120000001',active:1});
    var lnk = insert('parent_links',{parent_id:par.id,student_id:stud.id,relation:'پدر'});
    window.__cfFx = {stud:stud.id,enr:enr.id,par:par.id,lnk:lnk.id,cls:cls.id,sc:sc.id};
    return {sc:sc.id, cls:cls.id, stud:stud.id, parent:par.id};
  })())`));
}
async function cfFxTearDown(){
  W(`(function(){
    var fx = window.__cfFx;
    if(fx){
      db.certificates.filter(function(c){return c.student_id===fx.stud;}).forEach(function(c){remove('certificates',c.id);});
      db.grades.filter(function(g){return g.student_id===fx.stud;}).forEach(function(g){remove('grades',g.id);});
      remove('parent_links', fx.lnk);
      remove('users', fx.stud);
      remove('users', fx.par);
      remove('enrollments', fx.enr);
    }
    window.__cfFx = null;
  })()`);
}

(async () => {
  await sleep(300);

  await sec('C1 اشتغال به تحصیل: فیلدها + پیشوند کد', async () => {
    const fx = await cfFx();
    try{
      const r = JSON.parse(W(`JSON.stringify(enrollmentCert(${fx.stud}))`));
      assert(r.ok===true, 'ساخت گواهی اشتغال شکست: ' + (r.msg||''));
      assert(r.title==='گواهی اشتغال به تحصیل', 'عنوان غلط');
      assert(r.body.indexOf('دانش‌آموز تستی گواهی')>=0, 'نام دانش‌آموز نیست');
      assert(r.body.indexOf('1234567890')>=0, 'کد ملی نیست');
      assert(r.body.indexOf('مشغول به تحصیل است')>=0, 'عبارت گواهی نیست');
      assert(/GHT-[A-Z2-9]{6}/.test(r.body), 'کد احراز با پیشوند GHT نیست');
    } finally { await cfFxTearDown(); }
  });

  await sec('C2 انتقالی: بازهٔ زمانی + وضعیت کلی (با نمره) + کد', async () => {
    const fx = await cfFx();
    try{
      const r = JSON.parse(W(`JSON.stringify(transferCert(${fx.stud}))`));
      assert(r.ok===true, 'ساخت گواهی انتقالی شکست: ' + (r.msg||''));
      assert(r.title==='گواهی انتقالی', 'عنوان غلط');
      assert(r.body.indexOf('انتقال می‌یابد')>=0, 'عبارت انتقال نیست');
      assert(r.body.indexOf('لغو تاریخ')>=0, 'بازهٔ زمانی نیست');
      assert(/GNT-[A-Z2-9]{6}/.test(r.body), 'کد احراز با پیشوند GNT نیست');
      assert(r.body.indexOf('وضعیت کلی')<0, 'بدون نمره، وضعیت کلی نباید بیاید');
      /* با نمره: وضعیت کلی ظاهر شود */
      W(`(function(){
        var sc=${fx.sc};
        var sub=db.subjects.filter(function(x){return x.school_id===sc;})[0];
        add('grades',{school_id:sc,student_id:${fx.stud},class_id:${fx.cls},subject_id:sub.id,
          teacher_id:0,term:'نوبت تست',exam_type:'کلی',score:18,max_score:20,created_at:new Date().toISOString()});
      })()`);
      const r2 = JSON.parse(W(`JSON.stringify(transferCert(${fx.stud}))`));
      assert(r2.ok===true && r2.body.indexOf('وضعیت کلی')>=0 && r2.body.indexOf('معدل')>=0,
        'با نمره، وضعیت کلی/معدل نیست');
    } finally { await cfFxTearDown(); }
  });

  await sec('C3 قطعی بودن کد: تکرار=همان، تغییر داده=کد دیگر', async () => {
    const fx = await cfFx();
    try{
      const c1 = W(`certCodeCalc('enrollment',${fx.stud},${fx.sc})`);
      const c2 = W(`certCodeCalc('enrollment',${fx.stud},${fx.sc})`);
      assert(c1===c2, 'کد قطعی نیست (دو بار مختلف)');
      const other = JSON.parse(W(`JSON.stringify((function(){
        var s=db.users.filter(function(x){return x.role==='student'&&x.school_id===${fx.sc}&&x.id!==${fx.stud};})[0];
        return s?s.id:0;
      })())`));
      if(other){
        const c3 = W(`certCodeCalc('enrollment',${other},${fx.sc})`);
        assert(c3!==c1, 'دو دانش‌آموزِ مختلف همان کد را گرفتند!');
      }
      const cT = W(`certCodeCalc('transfer',${fx.stud},${fx.sc})`);
      assert(cT!==c1, 'دو نوعِ گواهی همان کد را گرفتند!');
      assert(/^GHT-[A-Z2-9]{6}$/.test(c1) && /^GNT-[A-Z2-9]{6}$/.test(cT), 'فرمت کد درست نیست');
      /* حساسیت: هر تغییر در ورودی باید کد را عوض کند (به‌جای کد طلاییِ وابسته به سال) */
      const sA = W(`certCodeCalc('enrollment', 900001, 777777)`);
      const sB = W(`certCodeCalc('enrollment', 900002, 777777)`);
      const sC = W(`certCodeCalc('enrollment', 900001, 777778)`);
      assert(sA!==sB, 'تغییر شناسهٔ دانش‌آموز، کد را عوض نکرد!');
      assert(sA!==sC, 'تغییر مدرسه، کد را عوض نکرد!');
    } finally { await cfFxTearDown(); }
  });

  await sec('C4 راستی‌آزمایی: درست/غلط + بی‌حساسیت به حروف کوچک', async () => {
    const fx = await cfFx();
    try{
      const code = W(`certCodeCalc('enrollment',${fx.stud},${fx.sc})`);
      const tCode = W(`certCodeCalc('transfer',${fx.stud},${fx.sc})`);
      const rOk = JSON.parse(W(`JSON.stringify(certVerify(${JSON.stringify(code)},${fx.stud}))`));
      assert(rOk.ok===true, 'کد درست رد شد');
      const rLow = JSON.parse(W(`JSON.stringify(certVerify(${JSON.stringify(code.toLowerCase())},${fx.stud}))`));
      assert(rLow.ok===true, 'حروف کوچک باید پذیرفته شود');
      const rT = JSON.parse(W(`JSON.stringify(certVerify(${JSON.stringify(tCode)},${fx.stud}))`));
      assert(rT.ok===true, 'کد انتقالی رد شد');
      const rBad = JSON.parse(W(`JSON.stringify(certVerify('GHT-ZZZZZZ',${fx.stud}))`));
      assert(rBad.ok===false, 'کد غلط پذیرفته شد!');
    } finally { await cfFxTearDown(); }
  });

  await sec('C5 امنیت داده‌ای: دانش‌آموز فقط خودش، ولی فقط فرزندش', async () => {
    const fx = await cfFx();
    try{
      const other = JSON.parse(W(`JSON.stringify((function(){
        var s=db.users.filter(function(x){return x.role==='student'&&x.school_id===${fx.sc}&&x.id!==${fx.stud};})[0];
        return s?s.id:0;
      })())`));
      assert(other, 'فیکسور: دانش‌آموز دوم مورد نیاز است');
      /* دانش‌آموز: خودش بله، دیگران نه */
      W(`S.user=byId('users',${fx.stud});S.persona=null;S.boss=null;`);
      let r = JSON.parse(W(`JSON.stringify(certAllowedStudent(${fx.stud}))`));
      assert(r.ok===true, 'دانش‌آموز خودش مجاز نیست');
      r = JSON.parse(W(`JSON.stringify(certAllowedStudent(${other}))`));
      assert(r.ok===false, 'دانش‌آموز گواهیِ دیگران را می‌بیند!');
      /* ولی: فرزند بله، دیگران نه */
      W(`S.user=byId('users',${fx.parent});S.persona=null;S.boss=null;`);
      r = JSON.parse(W(`JSON.stringify(certAllowedStudent(${fx.stud}))`));
      assert(r.ok===true, 'ولی فرزندش مجاز نیست');
      r = JSON.parse(W(`JSON.stringify(certAllowedStudent(${other}))`));
      assert(r.ok===false, 'ولی گواهیِ فرزندِ دیگر را می‌بیند!');
      /* کلیکِ واقعیِ دکمه از طرف دانش‌آموز برای دانش‌آموزِ دیگر → بلاک */
      W(`S.user=byId('users',${fx.stud});S.persona=null;S.boss=null;`);
      W(`(function(){
        var el=document.createElement('button');
        el.setAttribute('data-act','cert-enroll-print');
        el.setAttribute('data-sid','${other}');
        document.body.appendChild(el); el.click(); el.remove();
      })()`);
      const issued = W(`db.certificates.filter(function(c){return c.student_id===${other};}).length`);
      assert(issued===0, 'گواهیِ دانش‌آموزِ دیگر صادر شد!');
    } finally { await cfFxTearDown(); }
  });

  await sec('C6 ثبت صدور + کارت گواهی در تب شناسنامه', async () => {
    const fx = await cfFx();
    try{
      /* کارت در تب شناسنامهٔ پرونده دانش‌آموز */
      W(`S.user=byId('users',${fx.stud});S.persona=null;S.boss=null;S.route='record';S.filters={};S.tab='profile';S.page=1;`);
      let out = W(`renderRoute()`);
      assert(out.indexOf('cert-enroll-print')>=0, 'دکمهٔ اشتغال نیست');
      assert(out.indexOf('cert-transfer-print')>=0, 'دکمهٔ انتقالی نیست');
      assert(out.indexOf('cert-verify')>=0, 'کادر احراز نیست');
      /* کلیکِ دکمه از روی دکمهٔ ساخته‌شده (renderRoute فقط string برمی‌گرداند) */
      const before = W(`db.certificates.length`);
      W(`(function(){
        var el=document.createElement('button');
        el.setAttribute('data-act','cert-enroll-print');
        el.setAttribute('data-sid','${fx.stud}');
        document.body.appendChild(el); el.click(); el.remove();
      })()`);
      const after = W(`db.certificates.length`);
      assert(after===before+1, 'رکورد صدور ثبت نشد');
      const rec = JSON.parse(W(`JSON.stringify(db.certificates[db.certificates.length-1])`));
      assert(rec.type==='enrollment' && rec.student_id===fx.stud && /^GHT-[A-Z2-9]{6}$/.test(rec.code),
        'رکورد صدور نادرست: ' + JSON.stringify(rec));
      assert(rec.year && rec.issued_by===fx.stud, 'سال/صادرکنندهٔ رکورد نیست');
      /* احراز از روی اکشن (مقدار کادر در DOM نیست — مستقیم از روی داده) */
      const rV = JSON.parse(W(`JSON.stringify(certVerify(certCodeCalc('transfer',${fx.stud},${fx.sc}),${fx.stud}))`));
      assert(rV.ok===true, 'مسیر احراز اکشن شکست');
    } finally { await cfFxTearDown(); }
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت گواهی‌ها: ${ok}/${results.length} موفق  —  ${ok===results.length?'بدون خطا ✅':'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
