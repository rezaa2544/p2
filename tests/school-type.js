#!/usr/bin/env node
/**
 * تست‌های فاز ۰.۱ — نوع ساختاری مدرسه (school_type) با پیامد واقعی
 *  - ST0 بوت + حضور API و ۹ نوع
 *  - ST1 سطر پیامد هر ۹ نوع (شهریه/خوابگاه/IEP/چندپایه/کارگاه/آزمون ورودی)
 *  - ST2 schoolTypeOf fail-closed (خالی/نامعتبر = governmental)
 *  - ST3 زنجیرهٔ تقدم schoolCaps (صریح > نوعی > پیش‌فرض) + کلید بی‌نگاشت
 *  - ST4 مودال: سلکت ۹تایی + flip خودکار + ذخیرهٔ واقعی (مسیر کامل)
 *  - ST5 پیامد واقعی در منو با نوعِ تنها (بی‌قابلیت)
 *  - ST6 قاعدهٔ سرور: enum نه‌تایی + bad_enum برای ناشناخته
 *  - ST7 همگامی مدل: model.json + write-perms.json + freshness مولد
 *
 * اجرا:  node tests/school-type.js   (نیازمند jsdom)
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
console.log('\n▸ نوع ساختاری مدرسه — school_type (فاز ۰.۱)');

test('ST0 بوت بدون خطا + API نه‌گانه', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  assert(W('db.schools.length') >= 2, 'دادهٔ نمونهٔ schools نیست');
  assert(W(`(typeof SCHOOL_TYPE_DEFS!=='undefined' && SCHOOL_TYPE_DEFS.length===9)?1:0`) === 1, 'SCHOOL_TYPE_DEFS نه‌تایی نیست');
  assert(W(`(typeof schoolTypeOf==='function'&&typeof schoolTypeCaps==='function'&&typeof schoolTypeFeatures==='function')?1:0`) === 1, 'API نوع مدرسه نیست');
});

/* ترتیب ستون‌ها: tuition,dorm,iep,multigrade,workshop,entrance_exam */
const EXPECT = {
  governmental: [0,0,0,0,0,0], exemplary: [1,0,0,0,0,1], non_profit: [1,1,0,0,0,1],
  sampad: [0,0,0,0,0,1], shahed: [1,0,0,0,0,0], exceptional: [0,0,1,0,0,0],
  rural: [0,0,0,1,0,0], boarding: [1,1,0,0,0,0], vocational: [1,0,0,0,1,0],
};

test('ST1 سطر پیامد هر ۹ نوع', () => {
  const rows = JSON.parse(W(`JSON.stringify(SCHOOL_TYPE_DEFS.map(function(d){return [d[0],d[2].tuition,d[2].dorm,d[2].iep,d[2].multigrade,d[2].workshop,d[2].entrance_exam];}))`));
  assert(rows.length === 9, 'نه سطر نیست');
  for (const r of rows) {
    const e = EXPECT[r[0]];
    assert(e, 'نوع ناشناخته در DEFS: ' + r[0]);
    assert(r.slice(1).join('') === e.join(''), 'سطر ' + r[0] + ' مغایر جدول است: ' + r.slice(1) + '≠' + e);
  }
});

test('ST2 schoolTypeOf خالی/نامعتبر را governmental می‌کند', () => {
  const r = W(`JSON.stringify([schoolTypeOf(null),schoolTypeOf({}),schoolTypeOf({school_type:''}),schoolTypeOf({school_type:'golabi'}),schoolTypeOf({school_type:'RURAL'}),schoolTypeOf({school_type:'rural'}),schoolTypeOf({school_type:'sampad'})])`);
  assert(r === '["governmental","governmental","governmental","governmental","governmental","rural","sampad"]', 'خروجی: ' + r);
});

test('ST3 تقدم: صریح > نوعی > پیش‌فرض + کلید بی‌نگاشت', () => {
  const r = JSON.parse(W(`(function(){
    var s=byId('schools',6);
    var keepCaps=JSON.stringify(s.capabilities||null);
    var keepType=('school_type' in s)?s.school_type:'@@none';
    try{
      /* الف) صریح بر نوعی می‌چربد */
      update('schools',6,{capabilities:{has_tuition:1,has_dorm:0,has_iep:0,has_workshop:0,has_multigrade:0,has_second_term_exam:1,has_evening:0},school_type:'rural'});
      var a=schoolCaps(6);
      /* ب) نوعیِ بی‌قابلیت = سطر نوع */
      update('schools',6,{capabilities:null,school_type:'rural'});
      var b=schoolCaps(6);
      /* ج) قدیمیِ بی‌نوع و بی‌قابلیت = CAP_DEFAULTS */
      update('schools',6,{capabilities:null}); delete byId('schools',6).school_type;
      var c=schoolCaps(6);
      return JSON.stringify({a:a,b:b,c:c});
    }finally{
      update('schools',6,{capabilities:JSON.parse(keepCaps)});
      if(keepType==='@@none')delete byId('schools',6).school_type; else update('schools',6,{school_type:keepType});
    }})()`));
  assert(r.a.has_tuition === 1 && r.a.has_multigrade === 0, 'صریح باید بر نوعی بچربد');
  assert(r.b.has_multigrade === 1 && r.b.has_tuition === 0, 'سطر rural اعمال نشد');
  assert(r.b.has_second_term_exam === 1, 'کلید بی‌نگاشت باید از پیش‌فرض بیاید');
  assert(r.c.has_tuition === 1 && r.c.has_multigrade === 0, 'قدیمی باید CAP_DEFAULTS بگیرد');
});

test('ST4 مودال: سلکت + flip خودکار + ذخیرهٔ واقعی', () => {
  asSuper('schools');
  W(`document.querySelector('[data-act="school-new"]').click()`);
  assert(W(`document.getElementById('m_school_type')?1:0`) === 1, 'سلکت نوع مدرسه نیست!');
  assert(W(`document.getElementById('m_school_type').options.length`) === 9, 'نه گزینه نیست');
  assert(W(`document.getElementById('m_school_type').value`) === 'governmental', 'پیش‌فرض باید governmental باشد');
  assert(W(`document.querySelectorAll('.m-cap').length`) === 7, 'چیکنک‌ها باید ۷ بمانند');
  /* flip خودکار با تغییر نوع */
  W(`(function(){var s=document.getElementById('m_school_type');s.value='boarding';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const flip = JSON.parse(W(`JSON.stringify({t:document.querySelector('.m-cap[value="has_tuition"]').checked?1:0,d:document.querySelector('.m-cap[value="has_dorm"]').checked?1:0,m:document.querySelector('.m-cap[value="has_multigrade"]').checked?1:0})`));
  assert(flip.t === 1 && flip.d === 1 && flip.m === 0, 'flip شبانه‌روزی اعمال نشد: ' + JSON.stringify(flip));
  /* ذخیرهٔ واقعی: پر کردن فیلدهای الزامی و کلیک */
  const code = 'STY-' + Date.now().toString(36);
  const mgr = 'stypemgr_' + Date.now().toString(36);
  W(`(function(){
    document.getElementById('m_name').value='مدرسهٔ آزمایشی نوع';
    document.getElementById('m_code').value=${JSON.stringify(code)};
    var ps=document.getElementById('m_prov');
    ps.value=String(db.provinces[0].id); ps.dispatchEvent(new Event('change',{bubbles:true}));
    var co=[...document.getElementById('m_county').options].map(function(o){return o.value;}).filter(function(v){return v!=='';})[0];
    document.getElementById('m_county').value=co;
    document.getElementById('mg_name').value='مدیر آزمایشی';
    document.getElementById('mg_user').value=${JSON.stringify(mgr)};
    document.querySelector('[data-act="school-save"]').click();
  })()`);
  const saved = JSON.parse(W(`(function(){var s=db.schools.filter(function(x){return x.code===${JSON.stringify(code)};})[0];return s?JSON.stringify({t:s.school_type,tu:s.capabilities.has_tuition,du:s.capabilities.has_dorm}):'null';})()`));
  assert(saved && saved.t === 'boarding' && saved.tu === 1 && saved.du === 1, 'ذخیرهٔ واقعی نوع/قابلیت درست انجام نشد: ' + JSON.stringify(saved));
  /* پاک‌سازی */
  W(`(function(){var s=db.schools.filter(function(x){return x.code===${JSON.stringify(code)};})[0];if(s){db.users.filter(function(x){return x.school_id===s.id;}).forEach(function(x){remove('users',x.id);});remove('schools',s.id);}})()`);
  assert(W(`db.schools.filter(function(x){return x.code===${JSON.stringify(code)};}).length`) === 0, 'پاک‌سازی مدرسهٔ آزمایشی شکست خورد');
});

test('ST5 پیامد واقعی در منو با نوعِ تنها (بی‌قابلیت)', () => {
  const r = JSON.parse(W(`(function(){
    var m6=db.users.find(function(u){return u.username==='manager6';});
    var s=byId('schools',6);
    var keepCaps=JSON.stringify(s.capabilities||null);
    var keepType=('school_type' in s)?s.school_type:'@@none';
    var navIds=function(u){return navFor(u).map(function(g){return g[1].map(function(i){return i[0];});}).reduce(function(a,b){return a.concat(b);},[]);};
    try{
      update('schools',6,{capabilities:null,school_type:'rural'});
      var rural=navIds(m6);
      update('schools',6,{capabilities:null,school_type:'boarding'});
      var boarding=navIds(m6);
      return JSON.stringify({rural:rural,boarding:boarding});
    }finally{
      update('schools',6,{capabilities:JSON.parse(keepCaps)});
      if(keepType==='@@none')delete byId('schools',6).school_type; else update('schools',6,{school_type:keepType});
    }})()`));
  assert(r.rural.indexOf('tuition') < 0 && r.rural.indexOf('mytuition') < 0, 'منوی روستایی نباید شهریه داشته باشد');
  assert(r.boarding.indexOf('tuition') >= 0, 'منوی شبانه‌روزی باید شهریه داشته باشد');
  assert(r.boarding.indexOf('dorm') >= 0, 'منوی شبانه‌روزی باید خوابگاه داشته باشد');
});

test('ST6 قاعدهٔ سرور: enum نه‌تایی school_type', () => {
  const v = require('../server/validate.js');
  const r = v.ruleFor('schools', 'school_type');
  assert(r && r.type === 'enum' && r.values && r.values.length === 9, 'ruleFor باید enum نه‌تایی بدهد');
  for (const t of ['governmental','exemplary','non_profit','sampad','shahed','exceptional','rural','boarding','vocational'])
    assert(v.checkRule(t, r) === null, 'باید قبول شود: ' + t);
  assert(v.checkRule('golabi', r) === 'bad_enum', 'ناشناخته باید bad_enum بگیرد');
  assert(v.checkRule('', r) === 'bad_enum', 'خالی باید bad_enum بگیرد');
});

test('ST7 مدل: school_type در model.json و write-perms.json', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz', 'model.json'), 'utf8'));
  assert(m.collections.schools.fields.indexOf('school_type') > -1, 'model.json ندارد');
  const w = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz', 'write-perms.json'), 'utf8'));
  assert(w.fields.schools.indexOf('school_type') > -1, 'write-perms.json ندارد');
  require('child_process').execFileSync(process.execPath, [path.join(ROOT, 'tools', 'generate-write-perms.js'), '--check'], { stdio: 'pipe' });
});

await __seq;
const total = pass + fail;
console.log(`نوع مدرسه (school_type): ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
dom.window.close();
process.exit(fail ? 1 : 0);
}
