#!/usr/bin/env node
/**
 * تست‌های C.1 فرناز — نوعِ جلسه در صورت‌جلسه (همان جدول assoc_minutes)
 *  - ثبت با نوع (شورای معلمان / شورای دانش‌آموزان) از مسیر واقعی فرم
 *  - فیلتر نمایشی + پیش‌فرض «انجمن» برای رکوردهای قدیمی + چاپ تیتربه‌تیتر
 *  - قاعدهٔ سرور (enum) به‌صورت مستقیم
 *
 * اجرا:  node tests/minutes2.js   (نیازمند jsdom)
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
const asMgr = (uid, route) => W(`(function(){
  S.user=byId('users',${uid});S.persona=null;S.boss=null;
  S.filters={};S.route=${JSON.stringify(route)};S.tab='';render();
})()`);

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);
console.log('\n▸ صورت‌جلسه — نوع جلسه (C.1 فرناز)');

test('M0 بوت بدون خطا + دادهٔ نمونه', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  assert(W('db.assoc_minutes.length') >= 2, 'دادهٔ نمونهٔ assoc_minutes نیست');
});

const ctx = W(`(function(){
  var m6=db.users.find(function(u){return u.role==='manager'&&u.school_id===6;});
  return {m6:m6.id};
})()`);
assert(ctx.m6, 'مدیر مدرسهٔ ۶ نیست');

function saveViaForm(type, att, res) {
  W(`document.querySelector('[data-act="assoc-min-new"]').click()`);
  W(`(function(){
    document.getElementById('am_date').value='2026-09-12';
    document.getElementById('am_type').value=${JSON.stringify(type)};
    document.getElementById('am_att').value=${JSON.stringify(att)};
    document.getElementById('am_res').value=${JSON.stringify(res)};
    document.querySelector('[data-act="assoc-min-save"]').click();
  })()`);
}

test('M1 ثبت شورای معلمان از فرم واقعی', () => {
  const before = W(`db.assoc_minutes.length`);
  asMgr(ctx.m6, 'association');
  W(`document.querySelector('[data-act="assoc-min-new"]').click()`);
  assert(W(`document.getElementById('am_type')?1:0`) === 1, 'سلکت نوع در مودال نیست!');
  saveViaForm('teachers', 'خانم رضایی — مدیر', 'تصویب برنامه امتحانات');
  assert(W(`db.assoc_minutes.length`) === before + 1, 'رکورد ساخته نشد');
  const m = W(`db.assoc_minutes[db.assoc_minutes.length-1]`);
  assert(m.meeting_type === 'teachers', 'نوع ذخیره نشد: ' + m.meeting_type);
  assert(m.school_id === 6, 'school_id ذخیره نشد');
});

test('M2 ثبت شورای دانش‌آموزان', () => {
  asMgr(ctx.m6, 'association');
  saveViaForm('students', 'نماینده کلاس نهم', 'برگزاری جشن تکلیف');
  const m = W(`db.assoc_minutes[db.assoc_minutes.length-1]`);
  assert(m.meeting_type === 'students', 'نوع students ذخیره نشد');
});

test('M3 فیلتر نوع، جدول را محدود می‌کند', () => {
  asMgr(ctx.m6, 'association');
  const all = (W(`renderRoute()`).match(/assoc-min-print/g) || []).length;
  assert(all >= 4, 'پیش‌شرط: دست‌کم ۴ رکورد (۲ دمو + ۲ تازه) — محیط بی‌معناست');
  W(`(function(){var s=document.querySelector('[data-f="mtype"]');s.value='teachers';
    s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const teachers = (W(`renderRoute()`).match(/assoc-min-print/g) || []).length;
  assert(teachers === 1, 'فیلتر معلمان باید دقیقاً ۱ ردیف بدهد، داد: ' + teachers);
  assert(W(`renderRoute()`).indexOf('شورای معلمان') > -1, 'برچسب نوع در جدول نیست');
  W(`(function(){var s=document.querySelector('[data-f="mtype"]');s.value='';
    s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const back = (W(`renderRoute()`).match(/assoc-min-print/g) || []).length;
  assert(back === all, 'بازگشت به «همه» جدول را برنگرداند');
});

test('M4 رکوردهای قدیمیِ بی‌نوع = انجمن اولیا (سازگاری عقب‌رو)', () => {
  asMgr(ctx.m6, 'association');
  const old = W(`db.assoc_minutes.filter(function(m){return !m.meeting_type;}).length`);
  assert(old >= 2, 'پیش‌شرط: رکوردهای بی‌نوع دمو نیستند');
  assert(W(`minTypeOf({})`) === 'assoc', 'پیش‌فرض minTypeOf باید assoc باشد');
  assert(W(`minTypeFa({})`) === 'انجمن اولیا و مربیان', 'برچسب پیش‌فرض درست نیست');
  assert(W(`renderRoute()`).indexOf('انجمن اولیا و مربیان') > -1, 'برچسب پیش‌فرض در جدول نیست');
});

test('M5 نوع نامعتبر → پیش‌فرض انجمن (نه سکوت، نه خرابی)', () => {
  const before = W(`db.assoc_minutes.length`);
  asMgr(ctx.m6, 'association');
  W(`document.querySelector('[data-act="assoc-min-new"]').click()`);
  W(`(function(){
    document.getElementById('am_date').value='2026-09-13';
    document.getElementById('am_type').value='zzz-nope';
    document.getElementById('am_att').value='x';
    document.getElementById('am_res').value='y';
    document.querySelector('[data-act="assoc-min-save"]').click();
  })()`);
  assert(W(`db.assoc_minutes.length`) === before + 1, 'رکورد ساخته نشد');
  const m = W(`db.assoc_minutes[db.assoc_minutes.length-1]`);
  assert(m.meeting_type === 'assoc', 'نامعتبر باید assoc می‌شد: ' + m.meeting_type);
});

test('M6 چاپ، تیتر نوع جلسه را می‌زند', () => {
  asMgr(ctx.m6, 'association');
  const tid = W(`db.assoc_minutes.filter(function(m){return m.meeting_type==='teachers';})[0].id`);
  let captured = '';
  win.open = () => ({ document: { write: (s) => { captured += s; }, close: () => {} } });
  W(`assocMinPrint(${tid})`);
  assert(captured.indexOf('شورای معلمان') > -1, 'تیتر چاپ نوع را ندارد');
  assert(captured.indexOf('صورت‌جلسهٔ جلسهٔ') > -1, 'ساختار چاپ به‌هم خورده');
});

test('M7 قاعدهٔ سرور: enum سه‌تایی', () => {
  const v = require('../server/validate.js');
  const r = v.ruleFor('assoc_minutes', 'meeting_type');
  assert(r && r.type === 'enum', 'ruleFor باید enum بدهد');
  assert(v.checkRule('teachers', r) === null, 'teachers باید قبول شود');
  assert(v.checkRule('assoc', r) === null && v.checkRule('students', r) === null, 'هر سه مقدار باید قبول شوند');
  assert(v.checkRule('zzz', r) === 'bad_enum', 'نامعتبر باید با bad_enum رد شود');
});

await __seq;
const total = pass + fail;
console.log(`صورت‌جلسه (نوع جلسه): ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
dom.window.close();
process.exit(fail ? 1 : 0);
}
