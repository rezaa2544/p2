#!/usr/bin/env node
/**
 * سناریوی مدرسه‌ی شاهد + اشتراک فرزندبه‌فرزند (بند A.2 فرناز — چت۱):
 *  - شهریه سطح دانش‌آموز است: در یک مدرسه، یکی بدهکار و دیگری معافِ کامل
 *  - اشتراک/قفل پنل سطح دانش‌آموز است، نه حساب ولی
 * فقط رفتارِ موجود را قفل می‌کند (بدون تغییر کد).
 *
 * اجرا:  node tests/tuition-exempt.js   (نیازمند jsdom)
 */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const errors = [];
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; errors.push(`${name}: ${e.message}`); console.log(`  ❌ ${name}\n     ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m || 'شرط برقرار نیست'); }

const consoleErrors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', (e) => consoleErrors.push(String(e && e.message || e))),
});
const W = (code) => dom.window.eval(code);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  await sleep(500);
  test('بوت بدون خطا', () => {
    assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    assert(W('db.schools.length') > 0, 'داده‌ی نمونه ساخته نشد');
  });
  W(`(function(){
    window.__T = {};
    var plans = db.tuition_plans.filter(function(p){ return p.school_id; });
    __T.plan = plans[0];
    var sid = __T.plan.school_id;
    var kids = db.users.filter(function(u){ return u.role==='student' && u.school_id===sid; }).slice(0,3);
    // سناریوی تمیز: شهریه‌ها/اقساطِ قبلیِ همین سه دانش‌آموز پاک می‌شود
    __T.A = kids[0].id; __T.B = kids[1].id; __T.C = kids[2].id;
    var tids = {};
    db.tuitions.filter(function(t){ return t.student_id===__T.A || t.student_id===__T.B || t.student_id===__T.C; })
      .forEach(function(t){ tids[t.id] = 1; });
    db.tuitions = db.tuitions.filter(function(t){ return !tids[t.id]; });
    db.installments = (db.installments||[]).filter(function(i){ return !tids[i.tuition_id]; });
  })()`);

  test('T1 صدور شهریه عادی برای دانش‌آموز اول (بدهکار)', () => {
    const r = JSON.parse(W(`(function(){
      var ret = issueTuition(__T.A, __T.plan.id, 0);
      if(!ret.ok) return JSON.stringify({err:ret.msg});
      var t = byId('tuitions', ret.tuition);
      return JSON.stringify({payable:t.payable, status:t.status, student:t.student_id});
    })()`));
    assert(!r.err, 'صدور ناموفق: ' + r.err);
    assert(r.payable > 0, 'payable باید مثبت باشد: ' + r.payable);
    assert(r.status === 'open', 'وضعیت باید open باشد: ' + r.status);
    assert(Number(r.student) === Number(W('__T.A')), 'رکورد باید مال همان دانش‌آموز باشد');
  });

  test('T2 معافیت کامل دانش‌آموز دوم با تخفیفِ برابرِ سقف (payable=0)', () => {
    const r = JSON.parse(W(`(function(){
      var ret = issueTuition(__T.B, __T.plan.id, __T.plan.amount);
      if(!ret.ok) return JSON.stringify({err:ret.msg});
      var t = byId('tuitions', ret.tuition);
      return JSON.stringify({payable:t.payable, discount:t.discount, total:t.total});
    })()`));
    assert(!r.err, 'صدور ناموفق: ' + r.err);
    assert(Number(r.payable) === 0, 'payable باید صفر باشد: ' + r.payable);
    assert(Number(r.discount) === Number(r.total), 'تخفیف باید برابر سقف باشد');
  });

  test('T3 استقلال: بدهی اولی از معافیت دومی اثر نگرفت', () => {
    const r = JSON.parse(W(`(function(){
      function out(sid){
        return db.tuitions.filter(function(t){ return t.student_id===sid; })
          .reduce(function(a,t){ return a + Math.max(0,(t.payable||0)-(t.paid||0)); },0);
      }
      return JSON.stringify({a:out(__T.A), b:out(__T.B)});
    })()`));
    assert(r.a > 0, 'مانده‌ی اولی باید مثبت بماند: ' + r.a);
    assert(r.b === 0, 'مانده‌ی دومی باید صفر باشد: ' + r.b);
  });

  test('T4 اشتراک سطح دانش‌آموز: فعال برای یکی، هیچ برای دیگری', () => {
    const r = JSON.parse(W(`(function(){
      var sch = db.users.find(function(u){ return u.role==='student'; }).school_id;
      var p1 = insert('users',{role:'parent',school_id:sch,full_name:'ولی آزمون شاهد',phone:'09190000001',national_id:'0010000001',active:true});
      var k1 = insert('users',{role:'student',school_id:sch,full_name:'فرزند یک شاهد',national_id:'0010000002',active:true});
      var k2 = insert('users',{role:'student',school_id:sch,full_name:'فرزند دو شاهد',national_id:'0010000003',active:true});
      insert('parent_links',{parent_id:p1.id,student_id:k1.id,relation:'father'});
      insert('parent_links',{parent_id:p1.id,student_id:k2.id,relation:'father'});
      insert('parent_subscriptions',{user_id:p1.id,student_id:k1.id,plan:'yearly',amount:1000,status:'active',
        start_date:todayISO(),end_date:addDaysISO(todayISO(),30)});
      __T.px = p1.id;
      return JSON.stringify({k1:studentSubOf(k1.id,null,false).active, k2:studentSubOf(k2.id,null,false).active});
    })()`));
    assert(r.k1 === true, 'فرزند اول باید اشتراک فعال داشته باشد');
    assert(r.k2 === false, 'فرزند دوم نباید اشتراک داشته باشد');
  });

  test('T5 قفل پنل از روی «دست‌کم یک فرزند فعال» (نه حساب ولی)', () => {
    const r = JSON.parse(W(`(function(){
      S.user = byId('users', __T.px); S.persona = null; S.boss = null;
      if(!subSettings().paywall_enabled) saveSubSettings({paywall_enabled:true});
      var lockedMixed = parentLocked();
      // ولیِ بدون هیچ فرزندِ فعال → قفل
      var p2 = insert('users',{role:'parent',school_id:S.user.school_id,full_name:'ولی قفل شاهد',phone:'09190000002',national_id:'0010000004',active:true});
      S.user = byId('users', p2.id);
      var lockedNone = parentLocked();
      return JSON.stringify({mixed:lockedMixed, none:lockedNone, paywall:subSettings().paywall_enabled});
    })()`));
    assert(!!r.paywall, 'پیش‌شرط: دیوار پرداخت باید روشن باشد');
    assert(r.mixed === false, 'ولیِ با یک فرزند فعال باید باز باشد');
    assert(r.none === true, 'ولیِ بدون فرزند فعال باید قفل باشد');
  });

  test('T6 جمع معوقه مدرسه فقط بدهکار واقعی را می‌شمارد', () => {
    const n = Number(W(`(function(){
      function out(sid){
        return db.tuitions.filter(function(t){ return t.student_id===sid; })
          .reduce(function(a,t){ return a + Math.max(0,(t.payable||0)-(t.paid||0)); },0);
      }
      return out(__T.A) + out(__T.B);
    })()`));
    const a = Number(W(`(function(){
      return db.tuitions.filter(function(t){ return t.student_id===__T.A; })
        .reduce(function(x,t){ return x + Math.max(0,(t.payable||0)-(t.paid||0)); },0);
    })()`));
    assert(n === a && a > 0, 'جمع باید دقیقاً برابر بدهی اولی باشد: ' + n + ' vs ' + a);
  });

  test('T7 سقف تخفیف: تخفیفِ بیش از سقف به سقف برش می‌خورد (قاتل جهش M1)', () => {
    const r = JSON.parse(W(`(function(){
      var ret = issueTuition(__T.C, __T.plan.id, __T.plan.amount + 50000);
      if(!ret.ok) return JSON.stringify({err:ret.msg});
      var t = byId('tuitions', ret.tuition);
      return JSON.stringify({payable:t.payable, discount:t.discount, total:t.total});
    })()`));
    assert(!r.err, 'صدور ناموفق: ' + r.err);
    assert(Number(r.payable) === 0, 'payable باید صفر بماند: ' + r.payable);
    assert(Number(r.discount) === Number(r.total), 'تخفیف باید به سقف برش بخورد');
  });

  const total = pass + fail;
  console.log(`تست معافیت/شاهد: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (consoleErrors.length) {
    console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
    consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
  }
  console.log('─'.repeat(52) + '\n');
  dom.window.close();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
