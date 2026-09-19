#!/usr/bin/env node
/**
 * E.9 — مدیریت مراجعین: visitors (ورود/خروج میز پذیرش)
 *  - فیلدها: name, purpose, national_id?, phone?, visiting_person?,
 *    in_at, out_at?, status 'in'|'out', registered_by
 *  - دسترسی: مدیر+نگهبان (ثبت/خروج + مشاهده) · معاون (عنوان) فقط‌خوان
 *    · سایر نقش‌ها بدون دسترسی (گاردِ مسیر + گاردِ داده)
 *  - UI: فرمِ ورود، دکمهٔ خروج، جستجو (نام/تاریخ)، کارتِ داشبورد
 *
 * اجرا:  node tests/visitors2.js   (نیازمند jsdom)
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const errors = [];
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) { fail++; errors.push(`${name}: ${e.message}`); console.log(`  ❌ ${name}\n     ${e.message}`); resolve(); return; }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; errors.push(`${name}: ${e.message}`); console.log(`  ❌ ${name}\n     ${e.message}`); }
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

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);
console.log('\n▸ E.9 — مدیریت مراجعین (visitors)');

test('V0 بوت بدون خطا', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
});

/* ── زمینه دمو ── */
const ctx = W(`(function(){
  var v0 = db.visitors[0];
  if(!v0) return null;
  var sid = v0.school_id;
  var mgrs = db.users.filter(function(u){return u.role==='manager'&&u.school_id===sid;});
  var manager = mgrs.filter(function(u){return !/معاون/.test(u.title||'');})[0];
  var deputy = mgrs.filter(function(u){return /معاون/.test(u.title||'');})[0];
  var teacher = db.schedule.filter(function(x){return x.class_id && db.classes.some(function(c){return c.id===x.class_id&&c.school_id===sid;});})[0];
  var tuser = teacher?byId('users',teacher.teacher_id):null;
  var stud = db.users.filter(function(u){return u.role==='student'&&u.school_id===sid&&u.active;})[0];
  var otherSid = db.schools.filter(function(s){return s.active&&s.id!==sid;})[0].id;
  var otherMgr = db.users.filter(function(u){return u.role==='manager'&&u.school_id===otherSid&&!/معاون/.test(u.title||'');})[0];
  return {sid:sid, manager:manager.id, deputy:deputy?deputy.id:0,
          teacher:tuser?tuser.id:0, student:stud?stud.id:0, otherMgr:otherMgr.id};
})()`);
assert(ctx && ctx.sid, 'زمینهٔ دمو (مدرسهٔ دارایِ مراجع) پیدا نشد');

test('V1 دادهٔ نمونه: سه رکورد قطعی با status درست', () => {
  const c = W(`(function(){
    var sid=${ctx.sid};
    var list=db.visitors.filter(function(v){return v.school_id===sid;});
    var inNow=list.filter(function(v){return v.status==='in';});
    var outNow=list.filter(function(v){return v.status==='out';});
    return {n:list.length, inN:inNow.length, outN:outNow.length,
            hasPerson:!!list.find(function(v){return v.visiting_person;})};
  })()`);
  assert(c.n === 3, 'باید ۳ رکوردِ نمونه باشد (گرفت: ' + c.n + ')');
  assert(c.inN === 1 && c.outN === 2, 'status نمونه درست نیست (in=' + c.inN + ', out=' + c.outN + ')');
  assert(c.hasPerson, 'حداقل یک رکورد باید visiting_person داشته باشد');
});

test('V2 نمای مدیر: جدول + دکمهٔ ثبت + نوار جستجو', () => {
  W(`S.user=byId('users',${ctx.manager});S.persona=null;S.boss=null;S.filters={};S.route='visitors';render()`);
  const h = W(`document.getElementById('root').innerHTML`);
  assert(h.indexOf('در حال حاضر در مدرسه:') > -1, 'بَجِ «در حال حاضر در مدرسه» نیست');
  assert(h.indexOf('data-act="vis-new"') > -1, 'دکمهٔ «ثبت مهمان» برای مدیر نیست');
  assert(h.indexOf('data-f="visQ"') > -1 && h.indexOf('id="vis_date"') > -1, 'نوارِ جستجو (نام/تاریخ) نیست');
  assert(h.indexOf('data-act="vis-out"') > -1, 'دکمهٔ «خروج» برای مراجعِ حاضر نیست');
});

test('V3 ثبت از فرمِ واقعی (کلیک): فیلدهای تازه + status=in', () => {
  const nBefore = W(`db.visitors.length`);
  W(`(function(){
    document.querySelector('[data-act="vis-new"]').click();
    document.getElementById('vis_name').value='مهمان تست';
    document.getElementById('vis_purpose').value='جلسه با مدیر';
    document.getElementById('vis_person').value='معاون آموزشی';
    document.getElementById('vis_phone').value='09121112223';
    document.getElementById('vis_nid').value='1234567890';
    document.querySelector('[data-act="vis-save"]').click();
  })()`);
  assert(W(`db.visitors.length`) === nBefore + 1, 'مراجعهٔ تازه ثبت نشد');
  const v = W(`db.visitors[db.visitors.length-1]`);
  assert(v.status === 'in' && !v.out_at, 'status ثبت باید "in" باشد');
  assert(v.visiting_person === 'معاون آموزشی', 'visiting_person ذخیره نشد');
  assert(v.phone === '09121112223' && v.national_id === '1234567890', 'phone/national_id ذخیره نشدند');
  const meta = W(`(function(){var x=byId('visitors',${v.id});return x.school_id===${ctx.sid}&&x.registered_by===${ctx.manager};})()`);
  assert(meta, 'school/registered_by درست نیست');
});

test('V4 خروج از دکمهٔ واقعی + خروجِ دوم رد می‌شود', () => {
  const id = W(`db.visitors[db.visitors.length-1].id`);
  W(`document.querySelector('[data-act="vis-out"][data-id="${id}"]').click()`);
  const v1 = W(`byId('visitors',${id})`);
  assert(v1.status === 'out' && !!v1.out_at, 'خروج ذخیره نشد');
  const r2 = W(`visitorCheckout(${id})`);
  assert(!r2.ok, 'خروجِ دوم باید رد شود');
});

test('V5 جستجو: بر اساسِ نام و بر اساسِ تاریخ', () => {
  W(`(function(){S.user=byId('users',${ctx.manager});S.filters={visQ:'پیمانکار'};S.route='visitors';render();})()`);
  let h = W(`document.getElementById('root').innerHTML`);
  assert(h.indexOf('پیمانکار تأسیسات') > -1 && h.indexOf('کارشناس اداره') === -1, 'جستجویِ نام درست کار نمی‌کند');
  W(`(function(){S.filters={visQ:'',visDate:'${W(`db.visitors.filter(v=>v.school_id==${ctx.sid})[0].in_at.slice(0,10)`)}'};render();})()`);
  h = W(`document.getElementById('root').innerHTML`);
  assert(h.indexOf('پیمانکار تأسیسات') > -1, 'جستجویِ تاریخ رکوردِ همان روز را نشان نمی‌دهد');
  W(`(function(){S.filters={};render();})()`);
});

test('V6 کارتِ داشبوردِ مدیر: مراجعین امروز + درِ حالِ حضور', () => {
  W(`S.user=byId('users',${ctx.manager});S.persona=null;S.boss=null;S.filters={};S.route='dashboard';render()`);
  const h = W(`document.getElementById('root').innerHTML`);
  assert(h.indexOf('🚪 مراجعین') > -1, 'کارتِ «مراجعین» در داشبوردِ مدیر نیست');
  assert(h.indexOf('data-r="visitors"') > -1, 'لینکِ «مشاهدهٔ همه» در کارت نیست');
  const t = W(`S.user=byId('users',${ctx.teacher});S.route='dashboard';render();document.getElementById('root').innerHTML`);
  assert(t.indexOf('🚪 مراجعین') === -1, 'کارتِ مراجعین نباید در داشبوردِ دبیر باشد');
});

test('V7 معاون (عنوان): فقط‌خوان — بدونِ دکمه + ثبت رد می‌شود', () => {
  assert(ctx.deputy, 'کاربرِ معاون در دمو نیست');
  W(`(function(){S.user=byId('users',${ctx.deputy});S.persona=null;S.boss=null;S.filters={};S.route='visitors';render();})()`);
  let h = W(`document.getElementById('root').innerHTML`);
  assert(h.indexOf('data-act="vis-new"') === -1, 'دکمهٔ ثبت برای معاون نباید باشد');
  assert(h.indexOf('data-act="vis-out"') === -1, 'دکمهٔ خروج برای معاون نباید باشد');
  const r = W(`visitorRegister('مهمانِ معاون','بازدید',{})`);
  assert(!r.ok && /فقط‌خوان/.test(r.msg), 'ثبتِ مراجعِ معاون باید رد شود (فقط‌خوان)');
});

test('V8 سایر نقش‌ها: مسیر مسدود + canActionِ نوشتن‌ها false', () => {
  W(`S.user=byId('users',${ctx.teacher});S.persona=null;S.boss=null;S.route='visitors';render()`);
  const h = W(`document.getElementById('root').innerHTML`);
  assert(h.indexOf('دسترسی مجاز نیست') > -1, 'مسیرِ visitors برای دبیر باید مسدود باشد');
  assert(!W(`canAction('vis-new','teacher')`), 'canAction("vis-new") برای دبیر باید false باشد');
  assert(!W(`canAction('vis-out','teacher')`), 'canAction("vis-out") برای دبیر باید false باشد');
  W(`S.user=byId('users',${ctx.student});S.route='visitors';render()`);
  assert(W(`document.getElementById('root').innerHTML`).indexOf('دسترسی مجاز نیست') > -1, 'مسیرِ visitors برای دانش‌آموز باید مسدود باشد');
  const r = W(`visitorRegister('مهمانِ دانش‌آموز','بازدید',{})`);
  assert(!r.ok, 'ثبتِ مراجعِ دانش‌آموز باید رد شود');
});

test('V9 جداسازیِ مدرسه: مدیرِ مدرسهٔ دیگر نمی‌تواند خروج ثبت کند', () => {
  const id = W(`(function(){var v=db.visitors.filter(function(v){return v.school_id==${ctx.sid}&&visitorStatus(v)==='in';})[0];return v?v.id:0;})()`);
  assert(id, 'مراجعِ حاضری در مدرسهٔ دمو نیست');
  W(`S.user=byId('users',${ctx.otherMgr});S.persona=null;S.boss=null;S.filters={};S.route='dashboard';render()`);
  const r = W(`visitorCheckout(${id})`);
  assert(!r.ok && /مدرسهٔ شما/.test(r.msg), 'خروجِ بین‌مدرسه‌ای باید رد شود');
});

test('V10 رکوردِ کهنه (بدونِ status): وضعیت از out_at مشتق می‌شود', () => {
  W(`S.user=byId('users',${ctx.manager});S.persona=null;S.boss=null;S.filters={};S.route='dashboard';render()`);
  const n = W(`(function(){
    var rec={school_id:${ctx.sid},name:'مهمانِ کهنه',purpose:'legacy',in_at:'2026-09-01T08:00:00.000Z',out_at:'',registered_by:0,created_at:'2026-09-01T08:00:00.000Z'};
    var r=insert('visitors',rec);
    return {id:r.id, st:visitorStatus(byId('visitors',r.id))};
  })()`);
  assert(n.st === 'in', 'رکوردِ کهنهٔ بدونِ status باید "in" مشتق شود');
  const r = W(`visitorCheckout(${n.id})`);
  assert(r.ok, 'خروجِ رکوردِ کهنه کار نمی‌کند');
  const v = W(`byId('visitors',${n.id})`);
  assert(v.status === 'out' && !!v.out_at, 'خروج رکوردِ کهنه status=out نگاشت');
});

test('V11 اعتبارسنجی: نامِ خالی رد می‌شود؛ فیلدهای اختیاری بدونِ مشکل', () => {
  W(`S.user=byId('users',${ctx.manager});S.persona=null;S.boss=null;S.route='dashboard';render()`);
  const r1 = W(`visitorRegister('   ','بازدید',{phone:'09121112223'})`);
  assert(!r1.ok, 'ثبت با نامِ خالی باید رد شود');
  const nBefore = W(`db.visitors.length`);
  const r2 = W(`visitorRegister('مهمانِ حداقلی','','')`);
  assert(r2.ok, 'ثبت با فقطِ نام (فیلدهای اختیاری خالی) باید بپذیرد');
  assert(W(`db.visitors.length`) === nBefore + 1, 'رکوردِ حداقلی ثبت نشد');
});

test('V12 نقشِ نگهبان (تفویضی): ثبت + خروج + canAction', () => {
  const gid = W(`(function(){
    var u={school_id:${ctx.sid},role:'guard',full_name:'نگهبان تست',username:'guard_test',password:'x',national_id:'',phone:'',active:1,title:'',created_at:'2026-09-01'};
    return insert('users',u).id;
  })()`);
  W(`S.user=byId('users',${gid});S.persona=null;S.boss=null;S.filters={};S.route='visitors';render()`);
  const h = W(`document.getElementById('root').innerHTML`);
  assert(h.indexOf('data-act="vis-new"') > -1, 'دکمهٔ ثبت برای نگهبان نیست');
  assert(W(`canAction('vis-new','guard')`) && W(`canAction('vis-out','guard')`), 'canAction برای نگهبان باید true باشد');
  const r = W(`visitorRegister('مهمانِ نگهبان','تحویل تجهیزات',{visiting_person:'مدیر'})`);
  assert(r.ok, 'ثبتِ مراجعِ نگهبان کار نمی‌کند');
  const id = W(`db.visitors[db.visitors.length-1].id`);
  assert(W(`visitorCheckout(${id}).ok`), 'خروجِ نگهبان کار نمی‌کند');
});

await sleep(100);
console.log('\n────────────────────────────────────────────────────');
console.log(`visitors2 (E.9 مراجعین): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
if (fail) process.exit(1);
process.exit(0);
}
