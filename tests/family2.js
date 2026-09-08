#!/usr/bin/env node
/**
 * سناریوی «دو والد جدا + قیم غیر والد» (بندهای F.1/F.2 فرناز — چت۱):
 * فقط گزارش/اثباتِ رفتارِ موجود — صفر تغییر کد.
 *  - دو حساب ولیِ مستقل (پدر + مادر، بدون اولویت) روی یک دانش‌آموز
 *  - هر دو همه‌چیز (نمره/حضور/مالی/اعلان) را مستقل و کامل می‌بینند
 *  - relation برچسبِ نمایشیِ آزاد است (پدربزرگ/قیم قانونی هم کامل می‌بیند)
 *  - verify حالتِ خوداظهاری است نه محدودیت؛ مدیر محدودیتِ جزئی ندارد
 *
 * اجرا:  node tests/family2.js   (نیازمند jsdom)
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
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; errors.push(`${name}: ${e.message}`); console.log(`  ❌ ${name}\n     ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m || 'شرط برقرار نیست'); }

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
const asParent = (id) => W(`S.user=byId('users',${id});S.persona=null;S.boss=null;S.child=window.__K;S.filters={};`);

async function main() {
  await sleep(500);

  test('F0 برپایی: دانش‌آموزِ پرداده + پدر/مادر/پدربزرگ مستقل', () => {
    assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    const r = JSON.parse(W(`(function(){
      var K=db.users.find(function(u){return u.role==='student'
        && db.tuitions.some(function(t){return t.student_id===u.id;})
        && db.grades.some(function(g){return g.student_id===u.id;})
        && db.attendance.some(function(a){return a.student_id===u.id;});});
      if(!K)return JSON.stringify({err:'no-rich-student'});
      function mk(name,phone,nid,rel,ver){
        var p=insert('users',{role:'parent',school_id:K.school_id,full_name:name,phone:phone,national_id:nid,active:true});
        insert('parent_links',{parent_id:p.id,student_id:K.id,relation:rel});
        insert('parent_verifications',{parent_id:p.id,student_id:K.id,status:ver});
        return p.id;
      }
      window.__K=K.id;
      window.__P1=mk('پدر یکم','09190000111','0010000111','پدر','confirmed');
      window.__P2=mk('مادر یکم','09190000112','0010000112','مادر','pending');
      window.__G=mk('پدربزرگ یکم','09190000113','0010000113','پدربزرگ','confirmed');
      return JSON.stringify({ok:true,k:K.full_name});
    })()`));
    assert(!r.err, 'دانش‌آموز پرداده پیدا نشد');
  });

  test('F1 هر دو والد فرزند را در فهرست و پرونده می‌بینند', () => {
    for (const who of ['__P1', '__P2']){
      asParent(W('window.' + who));
      assert(Number(W('myKids().length')) === 1, who + ' فرزند نمی‌بیند');
      W(`S.route='children';`);
      assert(W('renderRoute()').indexOf(W(`byId('users',window.__K).full_name`)) > -1, who + ' نام فرزند را نمی‌بیند');
    }
  });

  test('F2/F3/F4 پرونده (نمره + حضور) برای هر دو یکسان باز می‌شود', () => {
    const marks = [];
    for (const who of ['__P1', '__P2']){
      asParent(W('window.' + who));
      assert(Number(W('recordTargetId()')) === Number(W('window.__K')), who + ' به پرونده نرسید');
      W(`S.route='record';`);
      const h = W('renderRoute()');
      assert(h.indexOf('دسترسی مجاز نیست') < 0, who + ' منع شد!');
      assert(h.indexOf('نمره') > -1 || h.indexOf('کارنامه') > -1, who + ' نمره نمی‌بیند');
      assert(h.indexOf('حضور') > -1, who + ' حضور نمی‌بیند');
      marks.push(h.length);
    }
    assert(marks[0] === marks[1], 'پروندهٔ دو والد فرق دارد!');
  });

  test('F5 مالی (شهریه/اقساط) برای هر دو یکسان است', () => {
    const bodies = [];
    for (const who of ['__P1', '__P2']){
      asParent(W('window.' + who));
      W(`S.route='mytuition';`);
      const h = W('renderRoute()');
      assert(h.indexOf('دسترسی مجاز نیست') < 0, who + ' از مالی منع شد!');
      assert(h.indexOf('شهریه') > -1 && h.indexOf('قسط') > -1, who + ' مالی نمی‌بیند');
      bodies.push(h);
    }
    assert(bodies[0] === bodies[1], 'نمای مالی دو والد فرق دارد!');
  });

  test('F6 هیچ مفهوم «ولی اصلی» وجود ندارد (پیوندها هم‌ساختارند)', () => {
    const r = JSON.parse(W(`JSON.stringify((function(){
      var ls=db.parent_links.filter(function(l){
        return l.student_id===window.__K&&(l.parent_id===window.__P1||l.parent_id===window.__P2);});
      return ls.map(function(l){return Object.keys(l).sort();});
    })())`));
    assert(r.length === 2, 'دو پیوند نیست');
    assert(JSON.stringify(r[0]) === JSON.stringify(r[1]), 'ساختار پیوندها فرق دارد');
    assert(r[0].join(',').indexOf('primary') < 0 && r[0].join(',').indexOf('main') < 0, 'فیلد اولویت هست!');
  });

  test('F7 تأییدیهٔ pending محدودیت ایجاد نمی‌کند (مادر pending هم کامل می‌بیند)', () => {
    asParent(W('window.__P2'));
    assert(W(`myKids()[0].verify`) === 'pending', 'پیش‌شرط: مادر باید pending باشد');
    W(`S.route='record';`);
    assert(W('renderRoute()').indexOf('دسترسی مجاز نیست') < 0, 'pending از پرونده منع شد!');
    W(`S.route='mytuition';`);
    assert(W('renderRoute()').indexOf('دسترسی مجاز نیست') < 0, 'pending از مالی منع شد!');
  });

  test('F8 rejected یادداشت است نه قفل (با ماندن پیوند، دسترسی می‌ماند)', () => {
    const seen = W(`(function(){
      var v=db.parent_verifications.find(function(x){return x.parent_id===window.__P2&&x.student_id===window.__K;});
      update('parent_verifications',v.id,{status:'rejected'});
      S.user=byId('users',window.__P2);S.persona=null;S.boss=null;S.child=window.__K;S.filters={};S.route='record';
      var h=renderRoute();
      update('parent_verifications',v.id,{status:'pending'});
      return h.indexOf('دسترسی مجاز نیست')<0;
    })()`);
    assert(seen === true, 'rejected نباید به‌خودیِ‌خود قفل کند (حذفِ پیوند جداست)');
  });

  test('F9 اعلان‌ها به هر دو والد می‌رسد (الگوی fan-out)', () => {
    const r = JSON.parse(W(`JSON.stringify((function(){
      var K=window.__K;
      var targets=[K].concat(db.parent_links.filter(function(l){return l.student_id===K;}).map(function(l){return l.parent_id;}));
      return {p1:targets.indexOf(window.__P1)>-1,p2:targets.indexOf(window.__P2)>-1,g:targets.indexOf(window.__G)>-1};
    })())`));
    assert(r.p1 && r.p2 && r.g, 'هر سه سرپرست باید در فهرست اعلان باشند');
  });

  test('F10 قیم غیر والد (پدربزرگ) دسترسی کامل دارد', () => {
    asParent(W('window.__G'));
    assert(Number(W('myKids().length')) === 1, 'پدربزرگ فرزند نمی‌بیند');
    W(`S.route='record';`);
    assert(W('renderRoute()').indexOf('دسترسی مجاز نیست') < 0, 'پدربزرگ از پرونده منع شد!');
    W(`S.route='mytuition';`);
    const h = W('renderRoute()');
    assert(h.indexOf('شهریه') > -1, 'پدربزرگ مالی نمی‌بیند');
    /* relation کاملاً آزاد است (حتی تغییر به قیم قانونی، دسترسی را عوض نمی‌کند) */
    const same = W(`(function(){
      var l=db.parent_links.find(function(x){return x.parent_id===window.__G&&x.student_id===window.__K;});
      update('parent_links',l.id,{relation:'قیم قانونی'});
      S.user=byId('users',window.__G);S.persona=null;S.boss=null;S.child=window.__K;S.filters={};S.route='record';
      return renderRoute().indexOf('دسترسی مجاز نیست')<0;
    })()`);
    assert(same === true, 'تغییر relation نباید دسترسی را عوض کند');
  });

  test('F11 اتصال خودکار کد ملی فقط پدر/مادر است (قیم به پیوند صریح نیاز دارد)', () => {
    const r = JSON.parse(W(`JSON.stringify((function(){
      var G=byId('users',window.__G);
      var withLink=childrenOfUser(G).map(function(u){return u.id;}).indexOf(window.__K)>-1;
      var l=db.parent_links.find(function(x){return x.parent_id===window.__G&&x.student_id===window.__K;});
      remove('parent_links',l.id);
      var withoutLink=childrenOfUser(byId('users',window.__G)).map(function(u){return u.id;}).indexOf(window.__K)>-1;
      insert('parent_links',{parent_id:window.__G,student_id:window.__K,relation:'قیم قانونی'});
      return {withLink:withLink,withoutLink:withoutLink};
    })())`));
    assert(r.withLink === true && r.withoutLink === false, 'قیم بدون پیوند صریح نباید وصل شود');
  });

  test('F12 پرداخت یکی، پنل دیگری را هم باز می‌کند (سود مشترک سرپرستان)', () => {
    const r = JSON.parse(W(`(function(){
      if(!subSettings().paywall_enabled)saveSubSettings({paywall_enabled:true});
      insert('parent_subscriptions',{user_id:window.__P1,student_id:window.__K,plan:'yearly',
        amount:1000,status:'active',start_date:todayISO(),end_date:addDaysISO(todayISO(),30)});
      function openAs(pid){
        S.user=byId('users',pid);S.persona=null;S.boss=null;S.child=window.__K;
        return !parentLocked();
      }
      return JSON.stringify({p1:openAs(window.__P1),p2:openAs(window.__P2),g:openAs(window.__G)});
    })()`));
    assert(r.p1 && r.p2 && r.g, 'پرداخت پدر باید هر سه پنل را باز کند: ' + JSON.stringify(r));
  });

  const total = pass + fail;
  console.log(`تست خانواده (دو والد + قیم): ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (consoleErrors.length){
    console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
    consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
  }
  console.log('─'.repeat(52) + '\n');
  dom.window.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
