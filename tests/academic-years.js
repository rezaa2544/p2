#!/usr/bin/env node
/**
 * تست‌های فاز ۰.۲ — هم‌زمانی دو سال تحصیلی (سال عملیاتی)
 *  - AY0 بوت + حضور API سال
 *  - AY1 زنجیرهٔ fallback سال عملیاتی (معتبر وگرنه تقویمی)
 *  - AY2 سیم‌کشی سال عملیاتی (state/funnel روی override)
 *  - AY3 مودال: سلکت سال + ذخیرهٔ واقعی (مسیر کامل)
 *  - AY4 بج هدر + بج جدول مدارس + قفل بستن
 *  - AY5 فیلتر سال در کارت سابقهٔ سال‌به‌سال
 *  - AY6 قاعدهٔ سرور: فرمت NNNN-NNNN
 *  - AY7 مدل + دروازهٔ فیلد (اثبات رفع DLQ بستن سال)
 *  - AY8 فصل پیش‌ثبت‌نام (تعیینی با هر تاریخ اجرا)
 *
 * اجرا:  node tests/academic-years.js   (نیازمند jsdom)
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
// hardening: rebuild base index.html (a previously crashed mutation suite may have left a mutated build)
try { require('child_process').execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); resolve(); return; }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
    ).then(resolve);
  }));
  __seq = p;
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
const asSuper = (route) => W(`(function(){
  S.user=db.users.find(function(u){return u.role==='superadmin';});S.persona=null;S.boss=null;
  S.filters={};S.route=${JSON.stringify(route)};S.tab='';render();
})()`);

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);
console.log('\n▸ هم‌زمانی دو سال تحصیلی — academic-years (فاز ۰.۲)');

test('AY0 بوت بدون خطا + API سال', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  assert(W('db.schools.length') >= 2, 'دادهٔ نمونهٔ schools نیست');
  assert(W(`['activeYearOf','prevYearCode','isPreSeason','yearCodeTitle','nextYearTitle','yearState','saveYearState','preEnrollFor','preAddRow'].every(function(f){return typeof window[f]==='function';})?1:0`) === 1, 'API سال ناقص است');
});

test('AY1 زنجیرهٔ fallback سال عملیاتی', () => {
  const r = W(`(function(){
    var sid=6, s=byId('schools',sid);
    var keep=('active_year_code' in s)?s.active_year_code:'@@none';
    try{
      var out=[];
      delete byId('schools',sid).active_year_code; out.push(activeYearOf(sid)===yearCode()?1:0);
      update('schools',sid,{active_year_code:'1402-1403'}); out.push(activeYearOf(sid));
      update('schools',sid,{active_year_code:'golabi'}); out.push(activeYearOf(sid)===yearCode()?1:0);
      update('schools',sid,{active_year_code:''}); out.push(activeYearOf(sid)===yearCode()?1:0);
      update('schools',sid,{active_year_code:'1404'}); out.push(activeYearOf(sid)===yearCode()?1:0);
      update('schools',sid,{active_year_code:null}); out.push(activeYearOf(sid)===yearCode()?1:0);
      return JSON.stringify(out);
    }finally{
      if(keep==='@@none')delete byId('schools',sid).active_year_code; else update('schools',sid,{active_year_code:keep});
    }})()`);
  assert(r === '[1,"1402-1403",1,1,1,1]', 'خروجی: ' + r);
});

test('AY2 سیم‌کشی سال عملیاتی (state/funnel)', () => {
  const r = JSON.parse(W(`(function(){
    var sid=6, s=byId('schools',sid);
    var keep=('active_year_code' in s)?s.active_year_code:'@@none';
    var rowId=null, preId=null;
    try{
      update('schools',sid,{active_year_code:'1402-1403'});
      var ay=activeYearOf(sid);
      saveYearState(sid,{closed:1});
      var st=yearState(sid);
      rowId=(db.school_years.filter(function(y){return y.school_id===sid&&y.year_code==='1402-1403';})[0]||{}).id||null;
      var pe=preAddRow(sid,{name:'تست سال',national_id:null,phone:null,grade:9,field:null});
      preId=pe.id;
      var funnel=preEnrollFor(sid).map(function(p){return p.id;});
      return JSON.stringify({ay:ay,styc:st.year_code,stclosed:st.closed,rowId:rowId,peyc:pe.year_code,inFunnel:funnel.indexOf(pe.id)>-1});
    }finally{
      if(preId)remove('pre_enrollments',preId);
      if(rowId)remove('school_years',rowId);
      if(keep==='@@none')delete byId('schools',sid).active_year_code; else update('schools',sid,{active_year_code:keep});
    }})()`));
  assert(r.ay === '1402-1403', 'activeYearOf override را نخواند');
  assert(r.styc === '1402-1403' && r.stclosed === 1, 'yearState روی سال عملیاتی نیست');
  assert(r.rowId, 'ردیف school_years ساخته نشد');
  assert(r.peyc === '1403-1404', 'preAddRow باید سال بعد عملیاتی بزند: ' + r.peyc);
  assert(r.inFunnel, 'preEnrollFor ردیف را ندید');
});

test('AY3 مودال: سلکت سال + ذخیرهٔ واقعی', () => {
  asSuper('schools');
  W(`document.querySelector('[data-act="school-new"]').click()`);
  assert(W(`document.getElementById('m_active_year')?1:0`) === 1, 'سلکت سال عملیاتی نیست!');
  assert(W(`document.getElementById('m_active_year').options.length`) === 4, '۴ گزینه نیست');
  assert(W(`document.getElementById('m_active_year').value`) === '', 'پیش‌فرض باید خودکار باشد');
  const prev = W(`prevYearCode()`);
  const code = 'AYC-' + Date.now().toString(36);
  const mgr = 'aymgr_' + Date.now().toString(36);
  W(`(function(){
    document.getElementById('m_active_year').value=${JSON.stringify(prev)};
    document.getElementById('m_name').value='مدرسهٔ آزمایشی سال';
    document.getElementById('m_code').value=${JSON.stringify(code)};
    var ps=document.getElementById('m_prov');
    ps.value=String(db.provinces[0].id); ps.dispatchEvent(new Event('change',{bubbles:true}));
    var co=[...document.getElementById('m_county').options].map(function(o){return o.value;}).filter(function(v){return v!=='';})[0];
    document.getElementById('m_county').value=co;
    document.getElementById('mg_name').value='مدیر آزمایشی';
    document.getElementById('mg_user').value=${JSON.stringify(mgr)};
    document.querySelector('[data-act="school-save"]').click();
  })()`);
  const saved = W(`(function(){var s=db.schools.filter(function(x){return x.code===${JSON.stringify(code)};})[0];return s?s.active_year_code:'NO-SCHOOL';})()`);
  assert(saved === prev, 'ذخیرهٔ واقعی سال عملیاتی درست انجام نشد: ' + saved);
  W(`(function(){var s=db.schools.filter(function(x){return x.code===${JSON.stringify(code)};})[0];if(s){db.users.filter(function(x){return x.school_id===s.id;}).forEach(function(x){remove('users',x.id);});remove('schools',s.id);}})()`);
  assert(W(`db.schools.filter(function(x){return x.code===${JSON.stringify(code)};}).length`) === 0, 'پاک‌سازی مدرسهٔ آزمایشی شکست خورد');
});

test('AY4 بج هدر + بج جدول مدارس + قفل بستن', () => {
  asSuper('schools');
  assert(W(`document.querySelector('.topbar .badge.b-gray')?1:0`) === 1, 'بج سال در هدر نیست');
  assert(W(`document.querySelector('.topbar .badge.b-gray').textContent`).indexOf('📅') === 0, 'بج هدر سال نیست');
  const r = JSON.parse(W(`(function(){
    try{
      saveYearState(6,{closed:1});
      S.route='schools';S.filters={};render();
      return JSON.stringify({lock:document.body.textContent.indexOf('🔒 بسته')>-1});
    }finally{
      var row=(db.school_years||[]).filter(function(y){return y.school_id===6;})[0];
      if(row)remove('school_years',row.id);
      S.route='schools';S.filters={};render();
    }})()`));
  assert(r.lock, 'قفل بستن در جدول مدارس دیده نشد');
});

test('AY5 فیلتر سال در کارت سابقهٔ سال‌به‌سال', () => {
  asSuper('dashboard');
  const r = JSON.parse(W(`(function(){
    var st=db.users.filter(function(u){return u.role==='student';})[0];
    var old=new Date(Date.now()-400*86400000).toISOString().slice(0,10);
    var g1=insert('grades',{student_id:st.id,school_id:st.school_id,score:15,created_at:old});
    var g2=insert('grades',{student_id:st.id,school_id:st.school_id,score:18,created_at:old});
    var g3=insert('grades',{student_id:st.id,school_id:st.school_id,score:16,created_at:todayISO()});
    try{
      S.filters.yhyear='';
      var h1=yearHistoryCard(st.id);
      var yOld=yearOfDate(old);
      var n1=(h1.match(/<tr/g)||[]).length;
      S.filters.yhyear=yOld;
      var h2=yearHistoryCard(st.id);
      var n2=(h2.match(/<tr/g)||[]).length;
      var hasOld=h2.indexOf(faD(yOld))>-1;
      return JSON.stringify({hasSel:h1.indexOf('data-f="yhyear"')>-1,yOld:yOld,n1:n1,n2:n2,hasOld:hasOld});
    }finally{
      remove('grades',g1.id);remove('grades',g2.id);remove('grades',g3.id);S.filters.yhyear='';
    }})()`));
  assert(r.hasSel, 'سلکت فیلتر سال نیست');
  assert(r.n1 >= 3, 'بدون فیلتر باید دست‌کم ۲ سطر سال باشد (tr=' + r.n1 + ')');
  assert(r.n2 === 2, 'با فیلتر باید دقیقاً ۱ سطر سال بماند (tr=' + r.n2 + ')');
  assert(r.hasOld, 'سطر سال فیلترشده باید بماند');
});

test('AY6 قاعدهٔ سرور: فرمت NNNN-NNNN', () => {
  const v = require('../server/validate.js');
  for (const k of ['year_code', 'active_year_code']) {
    const r = v.ruleFor('schools', k);
    assert(r && r.type === 'string' && r.pattern, 'ruleFor باید pattern بدهد: ' + k);
    assert(v.checkRule('1404-1405', r) === null, 'معتبر رد شد: ' + k);
    assert(v.checkRule('abcd-efgh', r) === 'bad_format', 'ناشناخته باید bad_format: ' + k);
    assert(v.checkRule('1404', r) === 'too_short', 'کوتاه باید too_short: ' + k);
  }
  const r2 = v.ruleFor('pre_enrollments', 'year_code');
  assert(v.checkRule('1405-1406', r2) === null, 'سال بعد باید قبول شود');
});

test('AY7 مدل + دروازهٔ فیلد (اثبات رفع DLQ)', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz', 'model.json'), 'utf8'));
  for (const f of ['closed', 'closed_at', 'placement', 'placement_year', 'promoted', 'reminded_at', 'school_id', 'year_code'])
    assert(m.collections.school_years.fields.indexOf(f) > -1, 'model ندارد: ' + f);
  assert(m.collections.schools.fields.indexOf('active_year_code') > -1, 'model سال عملیاتی ندارد');
  require('child_process').execFileSync(process.execPath, [path.join(ROOT, 'tools', 'generate-write-perms.js'), '--check'], { stdio: 'pipe' });
  const sy = require('../server/sync.js');
  const op = { c: 'school_years', t: 'ins', data: { school_id: 1, year_code: '1404-1405', closed: 0, promoted: 0, placement: null, created_at: '2026-01-01' } };
  assert(sy.fieldGate(op, { role: 'manager', school_id: 1, id: 2 }, null) === null, 'fieldGate باید عبور دهد (رفع DLQ)');
  const bad = { c: 'school_years', t: 'ins', data: { school_id: 1, hacker: 1 } };
  assert(sy.fieldGate(bad, { role: 'manager', school_id: 1, id: 2 }, null).code === 'unknown_field', 'گیت باید همچنان fail-closed باشد');
});

test('AY8 فصل پیش‌ثبت‌نام (تعیینی با هر تاریخ اجرا)', () => {
  const r = JSON.parse(W(`(function(){
    var p=todayISO().split('-').map(Number);var j=toJalali(p[0],p[1],p[2]);
    return JSON.stringify({m:j[1],open:isPreSeason()?1:0});
  })()`));
  const exp = (r.m === 12 || r.m <= 6) ? 1 : 0;
  assert(r.open === exp, 'فصل ماه ' + r.m + ' باید ' + (exp ? 'باز' : 'بسته') + ' باشد');
});

await __seq;
const total = pass + fail;
console.log(`سال تحصیلی (academic-years): ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
dom.window.close();
process.exit(fail ? 1 : 0);
}
