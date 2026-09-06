#!/usr/bin/env node
/**
 * سئوتِ ورودِ اطلاعات از فایل (دور ۸۱ بند ۱) — فایل‌هایِ نمونهٔ
 * `docs/samples/*.csv` باید از همین مسیرِ واقعیِ ویزارد عبور کنند:
 *   parseCSV → prepSheet (نگاشتِ خودکار) → validateImport → commitImport
 *  - I1/I2: خواندنِ csv + نگاشتِ خودکارِ ستون‌هایِ جابه‌جاشده + ردِّ «ردیف»
 *  - I3: چهار ردیفِ دانش‌آموز همه valid (۰ خطا)
 *  - I4/I5: ثبت: ۴ دانش‌آموز + ۵ ولی + ثبت‌نام در کلاسِ موجود
 *  - I6: شمارهٔ بدونِ شمارهٔ دانش‌آموز ← شمارهٔ پدر جایگزین می‌شود
 *  - I7: سه دبیر + درس تخصصی
 *  - I8: ردیفِ بدونِ نام ← خطا (نام الزامی)
 *  - I9: پاک‌سازی (آخرین تست زنجیر — درسِ دور ۷۹ بند ۴)
 *
 * اجرا:  node tests/import2.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const STUD_CSV = fs.readFileSync(path.join(ROOT, 'docs/samples/students_sample.csv'), 'utf8');
const TEACH_CSV = fs.readFileSync(path.join(ROOT, 'docs/samples/teachers_sample.csv'), 'utf8');

let pass = 0, fail = 0;
const errors = [];
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) { fail++; errors.push(name + ': ' + e.message); console.log(`  ❌ ${name}\n     ${e.message}`); resolve(); return; }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; errors.push(name + ': ' + e.message); console.log(`  ❌ ${name}\n     ${e.message}`); }
    ).then(resolve);
  }));
  __seq = p;
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
dom.window.addEventListener('error', (e) => { if (!/Could not parse CSS/.test(e.message)) { fail++; errors.push('window.onerror: ' + e.message); } });
const W = (s) => dom.window.eval(s);

let SNAPSHOT = null;
let MGR = null;

test('I0 — بوت + پایداریِ db + مدیرِ مدرسهٔ ۱', async () => {
  assert(W(`typeof parseCSV==='function' && typeof prepSheet==='function' && typeof validateImport==='function' && typeof commitImport==='function'`), 'تابع‌هایِ ویزارد تعریف نشده‌اند');
  const t0 = Date.now();
  let ref = null, stable = 0;
  while (Date.now() - t0 < 6000) {
    const cur = W(`(()=>{try{return (db&&db.users&&db.users.length)?db:null}catch(e){return null}})()`);
    if (cur && cur === ref) { stable++; if (stable >= 1) break; }
    else { ref = cur; stable = 0; }
    await new Promise(r => setTimeout(r, 100));
  }
  assert(ref !== null, 'دمو آماده نشد');
  MGR = W(`db.users.find(u=>u.role==='manager' && u.school_id===1).id`);
  assert(MGR, 'مدیرِ مدرسهٔ ۱ نیست');
  SNAPSHOT = W(`JSON.stringify(db)`);
  W(`S.user=byId('users',${MGR});S.persona=null;S.boss=null;`);
});

const S_CSV = () => JSON.stringify(STUD_CSV);
const T_CSV = () => JSON.stringify(TEACH_CSV);

test('I1 — parseCSV: چهار ردیف + تیتر', () => {
  const rows = W(`parseCSV(${S_CSV()})`);
  assert(Array.isArray(rows) && rows.length === 5, 'باید ۵ ردیف باشد: ' + rows.length);
  assert(rows[0].length === 11, 'تیتر باید ۱۱ ستون باشد: ' + rows[0].length);
});

test('I2 — نگاشتِ خودکار: ستون‌هایِ جابه‌جاشده + ردِّ «ردیف»', () => {
  const prep = W(`prepSheet(parseCSV(${S_CSV()}),'students')`);
  const m = prep.mapping;
  const keys = Object.values(m);
  for (const want of ['first_name','last_name','national_id','class_name','phone','father_name','father_phone','mother_name','last_gpa','gender'])
    assert(keys.indexOf(want) > -1, 'نگاشتِ ' + want + ' پیدا نشد: ' + JSON.stringify(keys));
  assert(keys.indexOf('undefined') === -1, 'نگاشتِ خراب');
  assert(JSON.stringify(m).indexOf('undefined') === -1, 'ردیف نباید نگاشت شود');
});

test('I3 — validateImport: ۴/۴ ردیف سالم', () => {
  const st = W(`(function(){var p=prepSheet(parseCSV(${S_CSV()}),'students');var r=validateImport(p.rows,p.mapping,'students');window.__IMP_P=p;window.__IMP_M=p.mapping;window.__IMP_E='students';return JSON.stringify({counts:r.counts, bad:r.rows.filter(function(x){return !x.ok}).map(function(x){return x.errors})})})()`);
  const o = JSON.parse(st);
  assert(o.counts.total === 4, 'کل: ' + o.counts.total);
  assert(o.counts.ok === 4, 'سالم: ' + o.counts.ok + ' — ' + JSON.stringify(o.bad));
  assert(o.counts.failed === 0, 'خطادار: ' + o.counts.failed);
});

test('I4 — commitImport: ۴ دانش‌آموز + ۵ ولی + بدونِ کلاسِ نو', () => {
  const rep = JSON.parse(W(`(function(){var st=validateImport(window.__IMP_P.rows,window.__IMP_M,window.__IMP_E);return JSON.stringify(commitImport({entity:window.__IMP_E,preview:st}))})()`));
  assert(rep.created === 4, 'ایجادشده: ' + JSON.stringify(rep));
  assert(rep.parents === 5, 'ولی‌ها: ' + JSON.stringify(rep));
  assert(rep.classes === 0, 'کلاسِ نو نباید ساخته شود: ' + JSON.stringify(rep));
  assert(rep.skipped === 0, 'ردیفِ ردشده: ' + JSON.stringify(rep));
});

test('I5 — سارا: کد ملی + تلفن + ثبت‌نام در کلاسِ موجود', () => {
  const r = W(`(function(){
    var u=db.users.find(function(x){return x.national_id==='9990001111'&&x.role==='student'});
    if(!u) return null;
    var e=db.enrollments.find(function(x){return x.student_id===u.id});
    var c=e&&byId('classes',e.class_id);
    return {name:u.full_name, phone:u.phone, cls:c&&c.name, gpa:u.last_gpa, gender:u.gender};
  })()`);
  assert(r, 'دانش‌آموز با کد ملی 9990001111 پیدا نشد');
  assert(r.name === 'سارا فرهادی', 'نام: ' + r.name);
  assert(r.phone === '09123456781', 'تلفن: ' + r.phone);
  assert(r.cls === 'دوازدهم ریاضی فیزیک', 'کلاس: ' + r.cls);
  assert(r.gender === 'دختر', 'جنسیت: ' + r.gender);
  assert(r.gpa === 17.5, 'معدل: ' + r.gpa);
});

test('I6 — نیلوفر: بدونِ شمارهٔ خود ← شمارهٔ پدر جایگزین', () => {
  const r = W(`(function(){
    var u=db.users.find(function(x){return x.national_id==='9990003335'});
    return u && u.phone;
  })()`);
  assert(r === '09354444444', 'تلفنِ نیلوفر باید شمارهٔ پدر باشد: ' + r);
});

test('I7 — دبیران: ۳/۳ ثبت + درس تخصصی', () => {
  const rep = JSON.parse(W(`(function(){var p=prepSheet(parseCSV(${T_CSV()}),'teachers');var st=validateImport(p.rows,p.mapping,'teachers');if(st.counts.failed>0)return JSON.stringify({err:JSON.stringify(st.rows)});return JSON.stringify(commitImport({entity:'teachers',preview:st}))})()`));
  assert(!rep.err, 'خطایِ اعتبارسنجی: ' + rep.err);
  assert(rep.created === 3, 'دبیران: ' + JSON.stringify(rep));
  const r = W(`(function(){
    var u=db.users.find(function(x){return x.national_id==='9990010013'&&x.role==='teacher'});
    return u && {name:u.full_name, phone:u.phone, subj:u.subject};
  })()`);
  assert(r, 'دبیر پیدا نشد');
  assert(r.name === 'رضا کاریمی', 'نام: ' + r.name);
  assert(r.phone === '09123456791', 'تلفن: ' + r.phone);
  assert(r.subj === 'ریاضی', 'درس: ' + r.subj);
});

test('I8 — ردیفِ بدونِ نام ← خطایِ «الزامی»', () => {
  const bad = ['نام,نام خانوادگی,کد ملی,کلاس',',,9990005559,دهم ریاضی فیزیک'].join(String.fromCharCode(10));
  const r = W(`(function(){var p=prepSheet(parseCSV(${JSON.stringify(bad)}),'students');var st=validateImport(p.rows,p.mapping,'students');return st.rows[0]})()`);
  assert(r && r.ok === false, 'باید خطا بدهد');
  assert(/الزامی/.test((r && r.errors || []).join(' ')), 'پیامِ الزامی نیست: ' + JSON.stringify(r && r.errors));
});

test('I8b — کد ملیِ تکراریِ داخلِ همان فایل ← خطا', () => {
  const bad = ['نام,نام خانوادگی,کد ملی,کلاس',',آزاد,9990005559,دهم ریاضی فیزیک',',آزاد,9990005559,دهم ریاضی فیزیک'].join(String.fromCharCode(10));
  const r = W(`(function(){var p=prepSheet(parseCSV(${JSON.stringify(bad)}),'students');var st=validateImport(p.rows,p.mapping,'students');return JSON.stringify({ok1:st.rows[0].ok, ok2:st.rows[1].ok, errs:st.rows[1].errors})})()`);
  const o = JSON.parse(r);
  assert(o.ok1 === true, 'ردیفِ اول باید سالم باشد');
  assert(o.ok2 === false, 'ردیفِ تکراری باید خطا بدهد');
  assert(/تکراری/.test(o.errs.join(' ')), 'پیامِ تکراری نیست: ' + JSON.stringify(o.errs));
});

test('I9 — پاک‌سازی: db به قبلِ تست بازمی‌گردد (آخرین تست)', () => {
  W(`db=JSON.parse(${JSON.stringify(SNAPSHOT)})`);
  assert(W(`!db.users.some(function(u){return u.national_id==='9990001111'})`), 'دانش‌آموزِ تست هنوز در db است');
  assert(W(`!db.users.some(function(u){return u.national_id==='9990010013'})`), 'دبیرِ تست هنوز در db است');
  W(`render()`);
});

__seq.then(() => {
  console.log('\n────────────────────────────────────────────────────────');
  console.log(`import2 (ورودِ اطلاعات از فایل): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
  if (fail) { console.log('\nخطاها:'); errors.forEach(e => console.log(' • ' + e)); }
  process.exit(fail ? 1 : 0);
});
