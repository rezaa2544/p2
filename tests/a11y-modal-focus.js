#!/usr/bin/env node
/**
 * a11y-modal-focus.js — Bug Hunt session 9 · زنجیرهٔ فوکوسِ مودال (PR #77)
 * ══════════════════════════════════════════════════════════════════
 * ممیزیِ «بازگشتِ فوکوس» در کدِ a11y-keyboard-nav. سه ریسکِ واقعی:
 *   AF1 پایه: باز کن → ببند ⇒ فوکوس به همان بازکننده در صفحه برمی‌گردد.
 *   AF2 S9-4 (قرمز پیش از رفع): مودالِ تودرتو — دکمه‌ای *درون* مودال A
 *       مودالِ B را باز می‌کند (مسیرهای واقعیِ مخزن: dorm-assign-pick،
 *       sub-del، hw-view، leave-new و همهٔ ۳۲ فراخوانِ askConfirm). چون
 *       openModal عنصرِ فعال را در لحظهٔ باز شدنِ B از داخلِ A می‌خواند و
 *       A همین‌جا نابود می‌شود، بازکنندهٔ ذخیره‌شده از سند بیرون می‌افتد؛
 *       closeModal هم به‌خاطرِ document.contains رها می‌کند ⇒ فوکوس روی
 *       <body> سقوط می‌کند (نقضِ WCAG 2.4.3 ترتیبِ فوکوس) و مسیرِ
 *       بازگشتِ کاربرِ کیبوردی گم می‌شود.
 *   AF3 مسیرِ Escape همان بازگشتِ فوکوس را باید داشته باشد.
 *   AF4 trap: Tab/Shift+Tab درونِ مودال می‌چرخد (jsdom offsetParent را
 *       دستی شبیه‌سازی می‌کنیم تا فیلترِ «قابل‌مشاهده» معنا داشته باشد).
 *   AF5 بستن باید trap را جدا کند (keydown دیگر preventDefault نشود).
 *   AF6 اگر بازکننده به هر دلیل از سند خارج شد (رندرِ مجدد)، فوکوس باید
 *       به محتوای اصلی (.main) برود، نه به <body>.
 *   AF7 closeModal بی‌مودال نباید فوکوسِ کاربر را بدزدد (جریان‌های عادیِ
 *       برنامه بی‌قید صدا می‌زنند و فوکوسِ کاربر باید سرِ جایش بماند).
 *   AF8 بهداشتِ شنونده: در هر لحظه دقیقاً یک trap روی #modal زنده است
 *       (بازِ تودرتو انبار نکند، بستن جدا کند).
 * اجرا: node tests/a11y-modal-focus.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
try { require('child_process').execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; failures.push({ name, msg: e.message }); console.log(`  ❌ ${name}\n     ${e.message}`); }
}

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
const doc = win.document;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const active = () => doc.activeElement;
const label = (el) => el ? ((el.id && '#' + el.id) || (el.tagName + (el.dataset && el.dataset.act ? '[data-act=' + el.dataset.act + ']' : ''))) : 'null';

/** شبیه‌سازی layout: فرزندانِ .modal را «قابل‌مشاهده» می‌کنیم (jsdom offsetParent=null دارد) */
function fakeLayout(scope) {
  scope.querySelectorAll('button,[href],input,select,textarea,[tabindex]').forEach((el) => {
    Object.defineProperty(el, 'offsetParent', { get() { return doc.body; }, configurable: true });
  });
}
/* دکمهٔ بازکنندهٔ واقعی در صفحه */
function makeOpener() {
  const b = doc.createElement('button');
  b.id = 's9-opener';
  b.setAttribute('data-act', 'probe-open');
  doc.querySelector('.main').appendChild(b);
  return b;
}
const key = (el, k, shift) => el.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, shiftKey: !!shift, bubbles: true, cancelable: true }));

(async () => {
await sleep(400);
console.log('\n▸ زنجیرهٔ فوکوسِ مودال — a11y-modal-focus (Bug Hunt session 9)');

W(`(function(){ S.user=db.users.find(function(u){return u.role==='superadmin';}); S.persona=null; S.boss=null; S.filters={}; S.route='dashboard'; render(); })()`);

await test('AF0 بوتِ تمیز (هیچ خطای زمانِ اجرا)', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  assert(typeof W('openModal') === 'function' && typeof W('closeModal') === 'function', 'openModal/closeModal نیست');
});

await test('AF1 پایه: باز کن → ببند ⇒ فوکوس به بازکنندهٔ صفحه برمی‌گردد', () => {
  const opener = makeOpener();
  opener.focus();
  assert(active() === opener, 'precondition: opener focus');
  W(`openModal('<div class="card-head"><h3>تست</h3><button class="icon-btn" data-act="modal-close">✕</button></div><div class="card-body"><input id="af-in"></div>')`);
  assert(W(`$('#modal').innerHTML.length > 0`), 'مودال باز نشد');
  W(`closeModal()`);
  assert(active() === opener, 'فوکوس باید به بازکننده برگردد، بود: ' + label(active()));
});

await test('AF2 S9-4 تودرتو: بازکردنِ مودال از درونِ مودال ⇒ بستن، فوکوس را به بازکنندهٔ *اصلی* برمی‌گرداند (نه body)', () => {
  const opener = makeOpener();
  opener.focus();
  /* A: مودالی با یک دکمهٔ داخلی (مثلِ «انتخابِ خوابگاه» در dorm-assign-pick) */
  W(`openModal('<div class="card-body"><button id="af-inner" data-act="probe-inner">انتخاب</button></div>')`);
  const inner = W(`document.getElementById('af-inner')`);
  assert(inner, 'دکمهٔ داخلی ساخته نشد');
  inner.focus();
  assert(active() === inner, 'precondition: inner focus');
  /* B: همان دکمهٔ داخلی، مودالِ بعدی را باز می‌کند (زنجیره) */
  W(`openModal('<div class="card-body"><button id="af-inner2" data-act="probe-inner2">تأیید</button></div>')`);
  /* شبیه‌سازی واقعی: در مرورگر فوکوسِ دکمهٔ A با نابودیِ A به body می‌افتد */
  assert(!doc.contains(inner), 'precondition: مودالِ A نابود شده باشد');
  W(`closeModal()`);
  assert(active() !== doc.body, 'فوکوس روی <body> سقوط کرد (WCAG 2.4.3)');
  assert(active() === opener, 'فوکوس باید به بازکنندهٔ اصلی برگردد، بود: ' + label(active()));
});

await test('AF3 مسیرِ Escape: بستن با Esc هم فوکوس را برمی‌گرداند', () => {
  const opener = makeOpener();
  opener.focus();
  W(`openModal('<div class="card-body"><input id="af-esc"></div>')`);
  assert(W(`$('#modal').innerHTML.length > 0`), 'مودال باز نشد');
  key(doc.body, 'Escape');
  assert(W(`$('#modal').innerHTML.length`) === 0, 'Esc مودال را نبست');
  assert(active() === opener, 'فوکوس باید به بازکننده برگردد، بود: ' + label(active()));
});

await test('AF4 trap: Tab از آخرین عنصر به اولی و Shift+Tab از اولی به آخری می‌چرخد', () => {
  W(`openModal('<div class="card-body"><button id="af-a">الف</button><button id="af-b">ب</button><button id="af-c">پ</button></div>')`);
  const modal = doc.querySelector('#modal .modal');
  assert(modal, '.modal نیست');
  fakeLayout(modal);
  const last = doc.getElementById('af-c'), first = doc.getElementById('af-a');
  last.focus();
  const ev1 = new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  last.dispatchEvent(ev1);
  assert(ev1.defaultPrevented === true, 'Tab از آخرین باید گرفته شود');
  assert(active() === first, 'Tab از آخرین باید به اولین بچرخد، بود: ' + label(active()));
  first.focus();
  const ev2 = new win.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  first.dispatchEvent(ev2);
  assert(ev2.defaultPrevented === true, 'Shift+Tab از اولین باید گرفته شود');
  assert(active() === last, 'Shift+Tab از اولین باید به آخرین بچرخد، بود: ' + label(active()));
  W(`closeModal()`);
});

await test('AF5 بستن، trap را جدا می‌کند (keydown دیگر گرفته نمی‌شود)', () => {
  W(`openModal('<div class="card-body"><button id="af-x">x</button></div>')`);
  const trapTarget = W(`$('#modal')`);
  W(`closeModal()`);
  const ev = new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  trapTarget.dispatchEvent(ev);
  assert(ev.defaultPrevented === false, 'trap پس از بستن هنوز فعال است');
});

await test('AF6 بازکنندهٔ خارج‌شده از سند (رندر مجدد) ⇒ فوکوس به محتوای اصلی، نه <body>', () => {
  const opener = makeOpener();
  opener.focus();
  W(`openModal('<div class="card-body"><button id="af-y">y</button></div>')`);
  opener.remove(); /* مثلِ رندرِ مجددِ پوسته */
  assert(!doc.contains(opener), 'precondition: opener حذف شد');
  W(`closeModal()`);
  assert(active() !== doc.body, 'فوکوس روی <body> سقوط کرد');
  const main = doc.querySelector('.main');
  assert(main && (active() === main || main.contains(active())), 'فوکوس باید به .main برود، بود: ' + label(active()));
});

await test('AF7 closeModal بی‌مودال، فوکوسِ کاربر را نمی‌دزدد', () => {
  const opener = makeOpener();
  opener.focus();
  W(`closeModal()`); /* جریان‌های عادیِ برنامه بی‌قید صدا می‌زنند (مثلِ att-commit) */
  assert(active() === opener, 'closeModal بدونِ مودال نباید فوکوس را جابه‌جا کند، بود: ' + label(active()));
});

await test('AF8 بهداشتِ شنونده: در هر لحظه فقط یک trap روی #modal زنده است', () => {
  /* شمارشِ *ثبتِ واقعی*: هر add شناسهٔ تابع را به فهرستِ زنده می‌افزاید و هر
     remove همان را برمی‌دارد (شمارشِ صرفِ فراخوانی‌ها گمراه‌کننده است، چون
     ثبتِ ایدمپوتنت عمداً یک remove پیش از add دارد). */
  W(`(function(){
    var el=document.getElementById('modal');
    if(!el.__s9live){
      el.__s9live=[];
      var a=el.addEventListener, r=el.removeEventListener;
      el.addEventListener=function(t,f,o){ if(t==='keydown'&&el.__s9live.indexOf(f)<0)el.__s9live.push(f); return a.call(el,t,f,o); };
      el.removeEventListener=function(t,f,o){ if(t==='keydown'){ var i=el.__s9live.indexOf(f); if(i>-1)el.__s9live.splice(i,1); } return r.call(el,t,f,o); };
    }
    el.__s9live.length=0;
  })()`);
  const live = () => W(`document.getElementById('modal').__s9live.length`);
  const opener = makeOpener();
  opener.focus();
  W(`openModal('<div class="card-body"><button id="af-n1">۱</button></div>')`);
  assert(live() === 1, 'پس از یک باز: انتظار ۱ trap زنده، بود: ' + live());
  W(`openModal('<div class="card-body"><button id="af-n2">۲</button></div>')`); /* تودرتو */
  assert(live() === 1, 'بازِ تودرتو نباید trap انبار کند؛ زنده: ' + live());
  W(`closeModal()`);
  assert(live() === 0, 'پس از بستن باید trap جدا شود؛ زنده: ' + live());
  W(`openModal('<div class="card-body"><button id="af-n3">۳</button></div>')`);
  assert(live() === 1, 'بازِ بعدی باید دوباره دقیقاً یک trap داشته باشد؛ زنده: ' + live());
  W(`closeModal()`);
});

if (consoleErrors.length) console.log('   ⚠️ خطاهای زمانِ اجرا: ' + consoleErrors.slice(0, 3).join(' | '));
console.log('\n────────────────────────────────────────────');
if (fail) console.log(`a11y-modal-focus: ${pass}/${pass + fail} ❌\n` + failures.map((f) => '   ' + f.name + ' — ' + f.msg).join('\n'));
else console.log(`a11y-modal-focus: ${pass}/${pass} ✅`);
console.log('────────────────────────────────────────────');
process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL: ' + ((e && e.stack) || e)); process.exit(1); });
