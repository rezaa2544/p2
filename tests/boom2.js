#!/usr/bin/env node
/**
 * تست‌های C.2 فرناز — برنامه ویژه مدرسه (بوم): اهداف سالانه
 *  - ثبت از کارت داشبورد مدیر (مسیر واقعی: دکمه → مودال → ذخیره)
 *  - پیش‌بینیِ بازگشایی، گیت مدرسهٔ خودی، سقف ۲۰۰۰ نویسه، پاک‌سازی با خالی
 *  - مسیر سوپرادمین (schoolModal) + قاعدهٔ سرور به‌صورت مستقیم
 *
 * اجرا:  node tests/boom2.js   (نیازمند jsdom)
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
const asSuper = (route) => W(`(function(){
  S.user=db.users.find(function(u){return u.role==='superadmin';});S.persona=null;S.boss=null;
  S.filters={};S.route=${JSON.stringify(route)};S.tab='';render();
})()`);

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);
console.log('\n▸ برنامه ویژه مدرسه — بوم (C.2 فرناز)');

test('B0 بوت بدون خطا + دادهٔ نمونه', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  assert(W('db.schools.length') >= 2, 'دادهٔ نمونهٔ schools نیست');
});

const ctx = W(`(function(){
  var m6=db.users.find(function(u){return u.role==='manager'&&u.school_id===6;});
  return {m6:m6.id};
})()`);
assert(ctx.m6, 'مدیر مدرسهٔ ۶ نیست');

function openBoom() {
  W(`document.querySelector('[data-act="school-boom"]').click()`);
  assert(W(`document.getElementById('boom_goals')?1:0`) === 1, 'مودال بوم باز نشد!');
}
function saveBoom(text) {
  W(`(function(){
    document.getElementById('boom_goals').value=${JSON.stringify(text)};
    document.querySelector('[data-act="school-boom-save"]').click();
  })()`);
}

test('B1 ثبت اهداف از کارت داشبورد مدیر', () => {
  asMgr(ctx.m6, 'dashboard');
  assert(W(`document.querySelector('[data-act="school-boom"]')?1:0`) === 1, 'دکمهٔ بوم در داشبورد نیست!');
  openBoom();
  saveBoom('کسب رتبه اول منطقه\nراه‌اندازی آزمایشگاه');
  assert(W(`byId('schools',6).boom_goals`) === 'کسب رتبه اول منطقه\nراه‌اندازی آزمایشگاه', 'اهداف ذخیره نشد');
  assert(W(`document.body.textContent.includes('راه‌اندازی آزمایشگاه')`) === true, 'کارت داشبورد اهداف را نشان نمی‌دهد');
  assert(W(`byId('schools',5).boom_goals||null`) === null, 'مدرسهٔ دیگر نباید دست بخورد');
});

test('B2 بازگشایی، متن قبلی را نشان می‌دهد', () => {
  asMgr(ctx.m6, 'dashboard');
  openBoom();
  assert(W(`document.getElementById('boom_goals').value`).indexOf('رتبه اول') > -1, 'پیش‌پر کردن مودال کار نمی‌کند');
  W(`closeModal()`);
});

test('B3 گیت مدرسهٔ خودی: جعل مدرسهٔ دیگر رد می‌شود', () => {
  asMgr(ctx.m6, 'dashboard');
  openBoom();
  W(`window._boomSid=5`);
  saveBoom('نفوذ به مدرسهٔ ۵');
  assert(W(`byId('schools',5).boom_goals||null`) === null, 'گیت شکست: مدرسهٔ ۵ نوشته شد!');
  assert(W(`byId('schools',6).boom_goals`).indexOf('رتبه اول') > -1, 'مدرسهٔ خودی نباید دست می‌خورد');
  W(`closeModal()`);
});

test('B4 سوپرادمین از فرم مدرسه ذخیره می‌کند', () => {
  asSuper('schools');
  W(`document.querySelector('[data-act="school-edit"][data-id="5"]').click()`);
  assert(W(`document.getElementById('m_boom')?1:0`) === 1, 'فیلد بوم در فرم مدرسه نیست!');
  W(`(function(){
    document.getElementById('m_boom').value='هدف مدیریتی از سوپرادمین';
    document.querySelector('[data-act="school-save"]').click();
  })()`);
  assert(W(`byId('schools',5).boom_goals`) === 'هدف مدیریتی از سوپرادمین', 'ذخیرهٔ سوپرادمین کار نکرد');
  assert(W(`document.body.textContent.includes('هدف مدیریتی از سوپرادمین')`) === true, 'چکیده در فهرست مدارس نیست');
});

test('B5 سقف ۲۰۰۰ نویسه', () => {
  asMgr(ctx.m6, 'dashboard');
  const before = W(`byId('schools',6).boom_goals`);
  openBoom();
  saveBoom(new Array(2002).join('x'));
  assert(W(`byId('schools',6).boom_goals`) === before, 'متن بلند باید رد می‌شد!');
  W(`closeModal()`);
});

test('B6 خالی = پاک شدن برنامه', () => {
  asMgr(ctx.m6, 'dashboard');
  openBoom();
  saveBoom('');
  assert(W(`byId('schools',6).boom_goals`) === '', 'خالی باید برنامه را پاک می‌کرد');
});

test('B7 قاعدهٔ سرور: رشته با سقف ۲۰۰۰', () => {
  const v = require('../server/validate.js');
  const r = v.ruleFor('schools', 'boom_goals');
  assert(r && r.type === 'string' && r.max === 2000, 'ruleFor باید string/2000 بدهد');
  assert(v.checkRule(new Array(2001).join('y'), r) === null, '۲۰۰۰ نویسه باید قبول شود');
  assert(v.checkRule(new Array(2002).join('y'), r) === 'too_long', '۲۰۰۱ نویسه باید too_long بگیرد');
});

await __seq;
const total = pass + fail;
console.log(`بوم (برنامه ویژه): ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
dom.window.close();
process.exit(fail ? 1 : 0);
}
