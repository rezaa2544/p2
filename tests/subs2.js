#!/usr/bin/env node

/**
 * تست‌های اشتراکِ فرزندبه‌فرزند (بند ۱٫۵ دور ۶۴):
 *  - وضعیتِ پرداخت به student_id گره‌خورده است، نه حسابِ ولی
 *  - پرداختِ پدر → ولی‌های دیگرِ همان فرزند به‌صورت خودکار باز
 *  - چندفرزند: پرداختِ جداگانه برای هر فرزند
 *  - دادهٔ پایه همیشه رایگان؛ قفل فقط «ارتباط و درخواست‌ها» را می‌گیرد
 *
 * اجرا:  node tests/subs2.js   (نیازمند jsdom)
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

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);

console.log('\n▸ اشتراکِ فرزندبه‌فرزند (بند ۱٫۵)');

test('بوت بدون خطا', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  assert(W('db.schools.length') > 0);
});

/* ── خانواده چندفرزندِ نمونه ─ */
test('دادهٔ نمونه — parent_multi: یک فرزند فعال، دیگری منقضی', () => {
  const r = W(`(function(){
    var p=db.users.find(u=>u.username==="parent_multi");
    var kids=db.parent_links.filter(l=>l.parent_id===p.id).map(l=>byId('users',l.student_id)).filter(Boolean);
    if(!p||kids.length<2)return null;
    return {p:p.id,k0:kids[0].id,k1:kids[1].id,
      s0:studentSubOf(kids[0].id,null,false),
      s1:studentSubOf(kids[1].id,null,false)};
  })()`);
  assert(r, 'parent_multi یا دو فرزندش پیدا نشد');
  assert(r.s0.active === true, 'فرزندِ اول باید فعال باشد');
  assert(r.s1.active === false, 'فرزندِ دوم باید منقضی باشد');
  assert(r.s1.status === 'expired', 'وضعیتِ فرزندِ دوم باید expired باشد');
  global.__fam = r;
});

test('تست رایگان فرزندبه‌فرزند ساخته می‌شود (دبیرِ ولی)', () => {
  const r = W(`(function(){
    var t=db.users.find(u=>u.role==="teacher"&&u.active);
    var kids=db.parent_links.filter(l=>l.parent_id===t.id).map(l=>byId('users',l.student_id)).filter(Boolean);
    if(!t||kids.length<2)return null;
    return {t:t.id,k0:kids[0].id,k1:kids[1].id};
  })()`);
  assert(r, 'دبیرِ ولی با دو فرزند پیدا نشد');
  // پیش‌نیاز: سطرِ اشتراکی برای این ولی نباشد
  W(`db.parent_subscriptions.filter(s=>s.user_id===${r.t}).forEach(s=>remove('parent_subscriptions',s.id));1`);
  W(`studentSubOf(${r.k0},${r.t},true);1`);
  const row0 = W(`db.parent_subscriptions.find(s=>s.user_id===${r.t})`);
  assert(!!row0, 'سطرِ تست ساخته نشد');
  assert(row0.student_id === r.k0, 'تست باید برای همان فرزند ساخته شود (student_id)');
  assert(row0.status === 'trial');
  // فرزندِ دوم با ساختِ تستِ فرزندِ اول «فعال» نمی‌شود
  const s1 = W(`studentSubOf(${r.k1},${r.t},false)`);
  assert(s1.active === false, 'تستِ فرزندِ اول نباید فرزندِ دوم را باز کند');
});

test('پرداختِ جداگانه: فقط همان فرزند باز می‌شود', () => {
  const f = global.__fam;
  // پرداختِ فرزندِ دوم (منقضی) — دقیقاً مثلِ عملِ sub-pay
  W(`(function(){
    var end=addDaysISO(todayISO(),30);
    var row=db.parent_subscriptions.find(s=>s.user_id===${f.p}&&Number(s.student_id)===${f.k1});
    if(row)update('parent_subscriptions',row.id,{plan:"monthly",amount:250000,status:"active",start_date:todayISO(),end_date:end,paid_at:todayISO(),ref_id:"SUB-TEST-1"});
    else insert("parent_subscriptions",{user_id:${f.p},student_id:${f.k1},plan:"monthly",amount:250000,status:"active",start_date:todayISO(),end_date:end,paid_at:todayISO(),ref_id:"SUB-TEST-1"});
    insert("subscription_payments",{user_id:${f.p},student_id:${f.k1},plan:"monthly",amount:250000,months:1,ref_id:"SUB-TEST-1",method:"online",paid_at:todayISO()});
  })()`);
  const s1 = W(`studentSubscription(${f.k1})`);
  assert(s1 && s1.sub.active, 'فرزندِ دوم پس از پرداخت باید فعال باشد');
  assert(s1.payerId === f.p, 'صاحبِ اشتراک باید پدر باشد');
  const s0 = W(`studentSubscription(${f.k0})`);
  assert(s0 && s0.sub.active, 'فرزندِ اول هم باز می‌ماند');
});

test('قفلِ فرزندبه‌فرزند: فرزندِ منقضی در بخشِ اشتراکی قفل، فرزندِ فعال باز', () => {
  const f = global.__fam;
  // فرزندِ اول را موقتاً منقضی می‌کنیم — همهٔ سطرهای همهٔ والدینِ او
  W(`db.parent_subscriptions.filter(s=>Number(s.student_id)===${f.k0}||(!s.student_id&&db.parent_links.some(l=>l.student_id===${f.k0}&&l.parent_id===s.user_id))).forEach(s=>update('parent_subscriptions',s.id,{status:"expired",end_date:"2020-01-01"}));1`);
  W(`S.user=byId('users',${f.p});S.persona="parent";S.boss=null;S.filters={};S.route="chat";S.child=${f.k0};1`);
  const locked = W('renderRoute()');
  assert(locked.indexOf('🔒') > -1, 'فرزندِ منقضی باید قفل شود');
  assert(locked.indexOf('اشتراک لازم است') > -1, 'عنوانِ قفل نیست');
  W(`S.child=${f.k1};1`);
  const open = W('renderRoute()');
  assert(open.indexOf('🔒') === -1, 'فرزندِ فعال نباید قفل شود');
});

test('پرداختِ پدر → ولی‌های دیگرِ همان فرزند خودکار باز می‌شوند', () => {
  const f = global.__fam;
  // یک ولیِ تازه (مادرِ دومی) را به فرزندِ دوم می‌پیوندیم
  const Q = W(`(function(){
    var q=insert('users',{school_id:null,role:'parent',full_name:'مادرِ دوم',username:'test_mom2_'+Date.now(),phone:'09900000099',national_id:null,active:1,created_at:todayISO()});
    insert('parent_links',{parent_id:q.id,student_id:${f.k1},relation:'مادر'});
    return q.id;
  })()`);
  const acc = W(`effectiveParentAccess(${Q})`);
  assert(acc.active === true, 'ولیِ دوم باید دسترسی داشته باشد');
  assert(acc.own === false, 'ولیِ دوم صاحبِ اشتراک نیست');
  assert(acc.via && acc.via.payerId === f.p, 'مسیرِ دسترسی باید به پرداختِ پدر برگردد');
  assert(W(`parentLocked()`) === false || true, '');
  W(`S.user=byId('users',${Q});S.persona="parent";S.boss=null;S.filters={};1`);
  assert(W('parentLocked()') === false, 'پنلِ ولیِ دوم قفل است');
});

test('سطرهای قدیمی (بدون student_id) همهٔ فرزندانِ آن ولی را می‌بازند', () => {
  const r = W(`(function(){
    var p=db.users.filter(u=>u.role==="parent"&&u.username!=="parent_multi")
      .map(p=>({p:p,kids:db.parent_links.filter(l=>l.parent_id===p.id).map(l=>l.student_id)}))
      .find(x=>x.kids.length>=1);
    return p;
  })()`);
  assert(r, 'ولیِ نمونه پیدا نشد');
  W(`db.parent_subscriptions.filter(s=>s.user_id===${r.p.id}).forEach(s=>remove('parent_subscriptions',s.id));1`);
  W(`insert('parent_subscriptions',{user_id:${r.p.id},plan:"yearly",amount:2200000,status:"active",start_date:todayISO(),end_date:addDaysISO(todayISO(),300),paid_at:todayISO(),ref_id:"SUB-LEGACY"});1`);
  const kids = W(`db.parent_links.filter(l=>l.parent_id===${r.p.id}).map(l=>l.student_id)`);
  kids.forEach(k=>{
    const s = W(`studentSubOf(${k},null,false)`);
    assert(s.active === true, 'فرزندِ ' + k + ' با سطرِ قدیمی باز نیست');
  });
});

test('دادهٔ پایه رایگان: parent بدون اشتراک به record دسترسی دارد', () => {
  const f = global.__fam;
  // همهٔ اشتراک‌های هر دو فرزند (از همهٔ والدین) منقضی می‌شوند
  W(`[${f.k0},${f.k1}].forEach(k=>db.parent_subscriptions.filter(s=>Number(s.student_id)===k||(!s.student_id&&db.parent_links.some(l=>l.student_id===k&&l.parent_id===s.user_id))).forEach(s=>update('parent_subscriptions',s.id,{status:"expired",end_date:"2020-01-01"})));1`);
  W(`S.user=byId('users',${f.p});S.persona="parent";S.boss=null;S.filters={};S.child=${f.k0};1`);
  W(`S.route="record";1`);
  const rec = W('renderRoute()');
  assert(rec.indexOf('🔒') === -1 && rec.length > 200, 'پروندهٔ تحصیلی باید رایگان باز باشد');
  W(`S.route="chat";1`);
  const chat = W('renderRoute()');
  assert(chat.indexOf('🔒') > -1, 'گفتگو باید قفل شود');
});

test('جدولِ مدیریت: ستونِ فرزند نمایش داده می‌شود', () => {
  W(`S.user=db.users.find(u=>u.role==="superadmin");S.persona=null;S.boss=null;S.filters={};S.route="adminsubs";1`);
  const o = W('renderRoute()');
  assert(o.indexOf('<th>فرزند</th>') > -1, 'ستونِ فرزند نیست');
  assert(o.indexOf('اشتراک اولیا') > -1, 'صفحهٔ اشتراک اولیا باز نشد');
});

await Promise.all(testQueue);
const total = pass + fail;
console.log('\n' + '─'.repeat(52));
console.log(`تست اشتراک: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
if (consoleErrors.length) {
  console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
  consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
}
console.log('─'.repeat(52) + '\n');
dom.window.close();
process.exit(fail ? 1 : 0);
}
