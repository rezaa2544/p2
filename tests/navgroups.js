#!/usr/bin/env node

/**
 * رگرسیون دسته‌بندی منو (بند ۲ دور ۶۴):
 * منوی همهٔ نقش‌ها باید «دسته‌بندی‌شده» باشد — چند گروه با عنوان،
 * نه یک فهرستِ تخت. این تست برای همهٔ ۸ نقش، هم در سطحِ دیتا
 * (navFor) و هم در سطحِ DOM (nav-group) بررسی می‌کند.
 *
 * اجرا:  node tests/navgroups.js   (نیازمند jsdom)
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
const testQueue = [];
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) {
      fail++; errors.push(`${name}: ${e.message}`);
      console.log(`  ❌ ${name}\n     ${e.message}`);
      resolve(); return;
    }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; errors.push(`${name}: ${e.message}`); console.log(`  ❌ ${name}\n     ${e.message}`); }
    ).then(resolve);
  }));
  __seq = p;
  testQueue.push(p);
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

/* نقش → شمارهٔ حسابِ نمونه (راهنما) */
const ROLES = [
  ['superadmin', '09999838444'],
  ['manager', '09992630039'],
  ['teacher', '09994420533'],
  ['student', '09992336550'],
  ['parent', '09990001234'],
  ['edu_office', '09995425098'],
  ['counselor', '09995068284'],
  ['driver', '09998149493'],
];

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);

console.log('\n▸ دسته‌بندی منو — همهٔ نقش‌ها (بند ۲)');

test('بوت بدون خطا', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  assert(W('db.schools.length') > 0);
});

ROLES.forEach(([role, phone]) => {
  test(`منوی ${role} دسته‌بندی‌شده است (دیتا + DOM)`, () => {
    const u = W(`db.users.find(x=>x.role==="${role}"&&x.phone==="${phone}")`);
    assert(!!u, 'حسابِ نمونهٔ ' + role + ' پیدا نشد');
    const uid = u.id;
    const nav = W(`(function(){var n=navFor(byId('users',${uid}));return {groups:n.length,
      titles:n.map(g=>String(g[0])),
      items:n.reduce((a,g)=>a+g[1].length,0),
      okTits:n.every(g=>g[0]&&String(g[0]).length>1),
      okItems:n.every(g=>g[1]&&g[1].length>0)};})()`);
    assert(nav.groups >= 2, 'دسته کمتر از ۲ است (' + nav.groups + ')');
    assert(nav.okTits, 'عنوانِ دستهٔ خالی هست');
    assert(nav.okItems, 'دستهٔ بدونِ گزینه هست');
    assert(nav.items >= 3, 'گزینهٔ منو خیلی کم است');
    /* سطحِ DOM: رندرِ واقعیِ پوسته */
    W(`S.user=byId('users',${uid});S.persona=null;S.boss=null;S.filters={};S.route='dashboard';render()`);
    const domg = W(`(function(){var g=document.querySelectorAll('.nav-group');
      return {n:g.length, texts:[].slice.call(g).map(x=>x.textContent.trim())};})()`);
    assert(domg.n === nav.groups, 'تعدادِ دسته‌های DOM با دیتا نمی‌خواند (DOM=' + domg.n + ' data=' + nav.groups + ')');
    domg.texts.forEach(t => assert(t.length > 1, 'عنوانِ دستهٔ DOM خالی است'));
  });
});

await Promise.all(testQueue);
const total = pass + fail;
console.log('\n' + '─'.repeat(52));
console.log(`تست منو: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
if (consoleErrors.length) {
  console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
  consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
}
console.log('─'.repeat(52) + '\n');
dom.window.close();
process.exit(fail ? 1 : 0);
}
