#!/usr/bin/env node
/**
 * کمبودِ نیروی انسانی به تفکیکِ درس (بند D.4)
 *  R1  مجموعه در مدل/مجوز/شماست و فقط مدیر می‌نویسد
 *  R2  مدیر از مسیرِ واقعیِ دکمه اعلام می‌کند؛ درس باید از همان مدرسه باشد
 *  R3  اداره فقط می‌خواند (اکشن بسته، روت باز)
 *  R4  تجمیع: شمارِ مدارس و مجموعِ کمبود درست است
 *  R5  ایزولاسیونِ محدوده: نیازِ مدرسهٔ بیرون در نمای اداره نیست
 *  R6  «تأمین‌شده» از شمارشِ باز بیرون است ولی در جدول هست
 *  R7  نقش‌هایِ غیرمجاز نه روت را می‌بینند نه اکشن را
 *  R8  مدیر نمی‌تواند رکوردِ مدرسهٔ دیگر را تغییر دهد
 *  R9  همهٔ ورودی‌ها esc می‌شوند (XSS در توضیح و نام)
 *  R10 خروجیِ چاپی: خلاصهٔ درس + جزئیات + بدون اسکریپت
 *
 * اجرا:  node tests/staffneeds2.js
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
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

const consoleErrors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  virtualConsole: new (require('jsdom').VirtualConsole)()
    .on('jsdomError', (e) => consoleErrors.push(e.message))
    .on('error', (m) => consoleErrors.push(String(m))),
});
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);
console.log('\n▸ کمبودِ نیروی انسانی (D.4)');

const S1 = 1;                                            /* مدرسهٔ ۱ (در محدودهٔ ادارهٔ کردستان) */
const S_OUT = 3;                                         /* مدرسهٔ بیرونِ محدوده */
const MGR = W(`db.users.find(u=>u.role==='manager'&&u.school_id===${S1}).id`);
const MGR5 = W(`db.users.find(u=>u.role==='manager'&&u.school_id===5).id`);
const EO = W(`db.users.find(u=>u.role==='edu_office').id`);
const SA = W(`db.users.find(u=>u.role==='superadmin').id`);
const DEMO = W(`db.staff_needs.length`);

/* ── R1 ───────────────────────────────────────────────────────────── */
test('R1 — مجموعه در مدل/مجوز/شماست و نوشتن فقط دستِ مدیر است', () => {
  const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz/model.json'), 'utf8'));
  assert(model.collections.staff_needs, 'staff_needs در مدل نیست');
  const ops = model.collections.staff_needs;
  assert(ops.ins.join(',') === 'manager,superadmin', 'نویسندهٔ ins غلط است: ' + ops.ins);
  assert(ops.ins.indexOf('edu_office') === -1, 'اداره نباید حقِ نوشتن داشته باشد');
  const perms = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz/write-perms.json'), 'utf8'));
  assert((perms.ops.staff_needs.ins || []).join(',') === 'manager,superadmin', 'جدولِ سرور با مدل یکی نیست');
  const sql = fs.readFileSync(path.join(ROOT, 'server/schema.sql'), 'utf8');
  assert(/CREATE TABLE IF NOT EXISTS staff_needs \(/.test(sql), 'جدول در شِمای سرور نیست');
  const val = fs.readFileSync(path.join(ROOT, 'server/validate.js'), 'utf8');
  assert(/staff_needs\s*:\s*\['open', 'filled'\]/.test(val), 'enumِ وضعیت در اعتبارسنجِ سرور نیست');
  assert(W(`typeof db.staff_needs!=='undefined'`), 'مجموعه در پایگاه داده نیست');
});

/* ── R2 ───────────────────────────────────────────────────────────── */
test('R2 — مدیر از مسیرِ واقعی اعلام می‌کند و درس باید از همان مدرسه باشد', () => {
  const SUB = W(`db.subjects.find(s=>s.school_id===${S1}).id`);
  const FOREIGN = W(`db.subjects.find(s=>s.school_id===${S_OUT}).id`);
  const before = W(`db.staff_needs.length`);
  W(`S.user=byId('users',${MGR});S.persona=null;S.boss=null;S.route='staffneeds';S.filters={};
     (function(){
       var mk=function(id,v){var e=document.getElementById(id);if(!e){e=document.createElement('input');e.id=id;document.body.appendChild(e);}e.value=v;return e;};
       mk('nd_subject',${SUB}); mk('nd_count',2); mk('nd_note','آزمونِ D4');
       window._needEdit=0;
       var b=document.getElementById('__nbtn'); if(!b){b=document.createElement('button');b.id='__nbtn';b.setAttribute('data-act','need-save');document.body.appendChild(b);}
       b.click();
     })()`);
  const rec = W(`db.staff_needs.filter(n=>n.note==='آزمونِ D4')[0]`);
  assert(rec, 'رکورد ساخته نشد (احتمالاً درس رد شده)');
  assert(rec.school_id === S1, 'مدرسه درست نیست');
  assert(rec.count === 2 && rec.status === 'open', 'تعداد/وضعیت درست نیست: ' + rec.count + '/' + rec.status);
  /* درسِ مدرسهٔ دیگر باید رد شود */
  W(`(function(){document.getElementById('nd_subject').value=${FOREIGN};document.getElementById('__nbtn').click();})()`);
  assert(W(`db.staff_needs.filter(n=>n.subject_id===${FOREIGN}&&n.note==='آزمونِ D4').length`) === 0,
    'درسِ مدرسهٔ دیگر نباید پذیرفته شود');
  W(`remove('staff_needs',${rec.id})`);
  assert(W(`db.staff_needs.length`) === before, 'پاک‌سازی انجام نشد');
});

/* ── R3 ───────────────────────────────────────────────────────────── */
test('R3 — اداره فقط می‌خواند: اکشن بسته است، روت باز', () => {
  assert(W(`canAction('need-save','edu_office')`) === false, 'اداره نباید بتواند بنویسد');
  assert(W(`canAction('need-del','edu_office')`) === false, 'اداره نباید بتواند حذف کند');
  assert(W(`canAction('need-fill','edu_office')`) === false, 'اداره نباید بتواند تغییرِ وضعیت دهد');
  assert(W(`canAction('need-save','manager')`) === true, 'مدیر باید بتواند بنویسد');
  assert(W(`canRoute('staffneeds','edu_office')`) === true, 'اداره باید صفحه را ببیند');
  assert(W(`canRoute('staffneeds','manager')`) === true, 'مدیر باید صفحه را ببیند');
  /* جدولِ تولیدشدهٔ سرور هم باید همین را بگوید (تک‌منبع حقیقت = مدل) */
  const wp = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz/write-perms.json'), 'utf8'));
  assert((wp.ops.staff_needs.ins || []).indexOf('edu_office') === -1, 'اداره در جدولِ سرور حقِ نوشتن پیدا کرده');
  assert((wp.ops.staff_needs.upd || []).indexOf('edu_office') === -1, 'اداره در جدولِ سرور حقِ ویرایش پیدا کرده');
  W(`S.user=byId('users',${EO});S.persona=null;S.boss=null;S.route='staffneeds';S.filters={}`);
  const h = W(`viewStaffNeeds()`);
  assert(h.indexOf('need-new') === -1, 'در نمای اداره نباید دکمهٔ «اعلام کمبود» باشد');
  assert(h.indexOf('staff-needs-print') > -1, 'دکمهٔ چاپ باید باشد');
  assert(h.indexOf('اعلامِ خودِ مدیران') > -1, 'یادداشتِ «اداره نمی‌نویسد» باید باشد');
});

/* ── R4 ───────────────────────────────────────────────────────────── */
test('R4 — تجمیعِ محدوده: تعدادِ مدارس و مجموعِ کمبود درست است', () => {
  const SUB_A = W(`db.subjects.find(s=>s.school_id===${S1}).id`);
  const SUB_B = W(`db.subjects.filter(s=>s.school_id===5)[3].id`);
  const a = W(`insert('staff_needs',{school_id:${S1},subject_id:${SUB_A},count:2,status:'open',note:'T4a',created_by:${MGR},created_at:todayISO()})`);
  const b = W(`insert('staff_needs',{school_id:5,subject_id:${SUB_B},count:3,status:'open',note:'T4b',created_by:${MGR5},created_at:todayISO()})`);
  try {
    const agg = W(`officeNeedsRows(officeScopeSchools(officeOf(byId('users',${EO}))))`);
    const rows = agg.rows.filter((r) => r.need.note === 'T4a' || r.need.note === 'T4b');
    assert(rows.length === 2, 'هر دو باید در محدوده باشند: ' + rows.length);
    /* انتظار از رویِ خودِ داده: فقط رکوردهایِ بازِ «درونِ محدوده» */
    const open = agg.openCount;
    const expectOpen = W(`(function(){var ids={};officeScopeSchools(officeOf(byId('users',${EO}))).forEach(function(s){ids[s.id]=1;});
      return db.staff_needs.filter(function(n){return ids[n.school_id]&&n.status!=='filled';}).length;})()`);
    assert(open === expectOpen, `شمارِ بازِ محدوده (${open}) باید با دادهٔ درونِ محدوده یکی باشد (${expectOpen})`);
    const schools = agg.schoolsWithNeed;
    assert(schools >= 2, 'دست‌کم دو مدرسه باید نیازمند باشند: ' + schools);
    const sum = agg.bySubject.reduce((x, s) => x + s.count, 0);
    assert(sum === open ? true : sum >= 5, 'مجموعِ کمبودها باید با شمارِ رکوردها هم‌خوان باشد: ' + sum + ' در برابر ' + open);
    /* مرتب‌سازی: پرنیازتر اول */
    assert(agg.bySubject[0].count >= agg.bySubject[agg.bySubject.length - 1].count, 'ترتیبِ درس‌ها غلط است');
  } finally {
    W(`remove('staff_needs',${a.id});remove('staff_needs',${b.id})`);
  }
  assert(W(`db.staff_needs.length`) === DEMO, 'پاک‌سازی انجام نشد');
});

/* ── R5 ───────────────────────────────────────────────────────────── */
test('R5 — ایزولاسیونِ محدوده: نیازِ مدرسهٔ بیرون در نمای اداره نیست', () => {
  const SUB = W(`db.subjects.find(s=>s.school_id===${S_OUT}).id`);
  const rec = W(`insert('staff_needs',{school_id:${S_OUT},subject_id:${SUB},count:4,status:'open',note:'T5',created_by:${MGR},created_at:todayISO()})`);
  try {
    const agg = W(`officeNeedsRows(officeScopeSchools(officeOf(byId('users',${EO}))))`);
    assert(agg.rows.every((r) => r.need.id !== rec.id), 'رکوردِ بیرونِ محدوده نباید در نمای اداره باشد');
    W(`S.user=byId('users',${EO});S.persona=null;S.boss=null;S.route='staffneeds';S.filters={}`);
    const h = W(`viewStaffNeeds()`);
    assert(h.indexOf('T5') === -1, 'رکوردِ بیرونِ محدوده در خروجیِ اداره پیدا شد');
  } finally { W(`remove('staff_needs',${rec.id})`); }
  assert(W(`db.staff_needs.length`) === DEMO, 'پاک‌سازی انجام نشد');
});

/* ── R6 ───────────────────────────────────────────────────────────── */
test('R6 — «تأمین‌شده» از شمارشِ باز بیرون است ولی در جدول هست', () => {
  const SUB = W(`db.subjects.find(s=>s.school_id===${S1}).id`);
  const rec = W(`insert('staff_needs',{school_id:${S1},subject_id:${SUB},count:1,status:'filled',note:'T6',created_by:${MGR},created_at:todayISO()})`);
  try {
    const agg = W(`officeNeedsRows(officeScopeSchools(officeOf(byId('users',${EO}))))`);
    const row = agg.rows.filter((r) => r.need.id === rec.id)[0];
    assert(row, 'رکورد باید در جدولِ جزئیات باشد (سابقه می‌ماند)');
    assert(row.open === false, 'نباید باز شمرده شود');
    const subjName = W(`needSubjectName(byId('staff_needs',${rec.id}))`);
    assert(agg.bySubject.every((s) => s.subject !== subjName), 'در خلاصهٔ درس نباید باشد');
    /* دکمهٔ «تأمین شد» وضعیت را عوض می‌کند */
    W(`S.user=byId('users',${MGR});S.persona=null;S.boss=null;S.route='staffneeds';S.filters={}`);
    W(`update('staff_needs',${rec.id},{status:'open'})`);
    const before = W(`officeNeedsRows(officeScopeSchools(officeOf(byId('users',${EO})))).openCount`);
    W(`update('staff_needs',${rec.id},{status:'filled'})`);
    const after = W(`officeNeedsRows(officeScopeSchools(officeOf(byId('users',${EO})))).openCount`);
    assert(after === before - 1, `با تأمین شدن باید یکی کم شود (${before} → ${after})`);
  } finally { W(`remove('staff_needs',${rec.id})`); }
  assert(W(`db.staff_needs.length`) === DEMO, 'پاک‌سازی انجام نشد');
});

/* ── R7 ───────────────────────────────────────────────────────────── */
test('R7 — نقش‌هایِ غیرمجاز نه روت را می‌بینند نه اکشن را', () => {
  const ok = W(`['manager','edu_office','superadmin'].sort().join(',')`);
  const allowed = W(`['manager','teacher','student','parent','counselor','driver','edu_office','superadmin'].filter(r=>canRoute('staffneeds',r)).sort().join(',')`);
  assert(allowed === ok, 'دسترسیِ روت غلط است: ' + allowed);
  ['teacher', 'student', 'parent', 'counselor', 'driver'].forEach((r) => {
    assert(W(`canAction('need-save','${r}')`) === false, r + ' نباید بتواند بنویسد');
  });
  /* نمایِ غیرِ مرتبط: دبیر صفحه را باز کند ⇒ پیامِ «برای این نقش نیست» */
  const TCH = W(`db.users.find(u=>u.role==='teacher'&&u.school_id===${S1}).id`);
  W(`S.user=byId('users',${TCH});S.persona=null;S.boss=null;S.route='staffneeds';S.filters={}`);
  assert(W(`viewStaffNeeds().indexOf('برای این نقش نیست')`) > -1, 'برای نقشِ دیگر باید پیامِ روشن بیاید');
});

/* ── R8 ───────────────────────────────────────────────────────────── */
test('R8 — مدیر نمی‌تواند رکوردِ مدرسهٔ دیگر را تغییر دهد', () => {
  const SUB = W(`db.subjects.find(s=>s.school_id===${S_OUT}).id`);
  const rec = W(`insert('staff_needs',{school_id:${S_OUT},subject_id:${SUB},count:1,status:'open',note:'T8',created_by:${MGR},created_at:todayISO()})`);
  try {
    W(`S.user=byId('users',${MGR});S.persona=null;S.boss=null;S.route='staffneeds';S.filters={}`);
    assert(W(`needWritable(${rec.id})`) === false, 'رکوردِ مدرسهٔ دیگر نباید قابلِ تغییر باشد');
    W(`(function(){var b=document.getElementById('__nbtn2');if(!b){b=document.createElement('button');b.id='__nbtn2';b.setAttribute('data-act','need-fill');b.setAttribute('data-id','${rec.id}');document.body.appendChild(b);}b.click();})()`);
    assert(W(`byId('staff_needs',${rec.id}).status`) === 'open', 'اکشن باید رد شود و وضعیت عوض نشود');
    /* سوپرادمین اجازه دارد (استثنایِ صریح) */
    W(`S.user=byId('users',${SA});S.persona=null;S.boss=null;`);
    assert(W(`needWritable(${rec.id})`) === true, 'سوپرادمین باید بتواند');
  } finally { W(`remove('staff_needs',${rec.id})`); }
  assert(W(`db.staff_needs.length`) === DEMO, 'پاک‌سازی انجام نشد');
});

/* ── R9 ───────────────────────────────────────────────────────────── */
test('R9 — همهٔ ورودی‌ها esc می‌شوند (XSS در توضیح و نامِ مدرسه)', () => {
  const SUB = W(`db.subjects.find(s=>s.school_id===${S1}).id`);
  const X = '<img src=x onerror="window.__x=1">';
  const rec = W(`insert('staff_needs',{school_id:${S1},subject_id:${SUB},count:1,status:'open',note:${JSON.stringify(X)},created_by:${MGR},created_at:todayISO()})`);
  const sname = W(`byId('schools',${S1}).name`);
  W(`byId('schools',${S1}).name=${JSON.stringify(X)}`);
  try {
    W(`S.user=byId('users',${EO});S.persona=null;S.boss=null;S.route='staffneeds';S.filters={}`);
    const h = W(`viewStaffNeeds()`);
    assert(!/<img/i.test(h), 'تگِ خام در نمای اداره ماند');
    assert(h.indexOf('&lt;img') > -1, 'خروجی باید escape‌شده باشد');
    const p = W(`staffNeedsPrintHTML(officeNeedsRows(officeScopeSchools(officeOf(byId('users',${EO})))),'تست')`);
    assert(!/<img/i.test(p), 'تگِ خام در نسخهٔ چاپی ماند');
    W(`S.user=byId('users',${MGR});S.persona=null;S.boss=null;S.route='staffneeds';S.filters={}`);
    const m = W(`viewStaffNeeds()`);
    assert(!/<img/i.test(m), 'تگِ خام در نمای مدیر ماند');
  } finally {
    W(`byId('schools',${S1}).name=${JSON.stringify(sname)}`);
    W(`remove('staff_needs',${rec.id})`);
  }
  assert(W(`byId('schools',${S1}).name`) === sname, 'نامِ مدرسه بازگردانده نشد');
  assert(W(`db.staff_needs.length`) === DEMO, 'پاک‌سازی انجام نشد');
});

/* ── R10 ──────────────────────────────────────────────────────────── */
test('R10 — خروجیِ چاپی: خلاصهٔ درس + جزئیات + بدون اسکریپت', () => {
  W(`S.user=byId('users',${EO});S.persona=null;S.boss=null;S.route='staffneeds';S.filters={}`);
  const agg = W(`officeNeedsRows(officeScopeSchools(officeOf(byId('users',${EO}))))`);
  const p = W(`staffNeedsPrintHTML(${JSON.stringify(agg)},'ادارهٔ تست')`);
  assert(p.indexOf('خلاصه به تفکیکِ درس') > -1, 'بخشِ خلاصه نیست');
  assert(p.indexOf('جزئیات به تفکیکِ مدرسه') > -1, 'بخشِ جزئیات نیست');
  assert(p.indexOf('ادارهٔ تست') > -1, 'عنوان نیست');
  assert(!/<script/i.test(p), 'نسخهٔ چاپی نباید اسکریپت داشته باشد');
  assert(/<html lang="fa" dir="rtl">/.test(p), 'سندِ چاپ RTL نیست');
  assert(p.indexOf('window.print()') > -1, 'دکمهٔ چاپ نیست');
});

await __seq;

console.log(`\nبررسی — ${pass + fail} مورد: ✅ ${pass} · ❌ ${fail}` + (fail ? '' : '  —  بدون خطا ✅'));
if (errors.length) console.log('خطاها:\n' + errors.join('\n'));
if (consoleErrors.length) {
  console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
  consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
}
dom.window.close();
process.exit(fail ? 1 : 0);
}
