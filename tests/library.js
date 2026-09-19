#!/usr/bin/env node
/**
 * سئوت کتابخانه (بند ۸: کتاب‌ها + امانت + بازگشت + دیرکرد) — پایش
 *
 * در پروسهٔ جداگانه اجرا می‌شود (نه داخل smoke.js).
 *
 * بخش‌ها:
 *  L1 دادهٔ نمونه (کتاب‌ها + امانتِ فعال/دیرکرد/برگشته)
 *  L2 صفحهٔ مدیر (فهرست، شمارنده‌ها، بج‌های وضعیت، دکمه‌ها)
 *  L3 ثبت کتاب + حذف (با امانتِ فعال رد)
 *  L4 امانت: مدیر قبول (مدرسهٔ دانش‌آموز چک) + مهلت پیش‌فرض/داده‌شده + نقش‌های دیگر رد
 *  L5 بازگشت + دیرکرد (تغییر وضعیت با گذشت مهلت)
 *
 * اجرا: node tests/library.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — سئوت رد شد.  (npm i --no-save jsdom)'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
});
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

const results = [];
const sec = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, detail: '', ms: Date.now() - t0 }); }
  catch (e) { results.push({ name, ok: false, detail: String(e.message || e), ms: Date.now() - t0 }); }
};

async function lFx(){
  return JSON.parse(W(`JSON.stringify((function(){
    var sc = db.schools.filter(function(s){return s.active;})[0];
    var mgr = db.users.filter(function(x){return x.role==='manager'&&x.school_id===sc.id;})[0];
    var other = db.schools.filter(function(s){return s.active && s.id!==sc.id;})[0];
    window.__lFx = {sc:sc.id, mgr:mgr.id, other:other?other.id:0};
    return {sc:sc.id, mgr:mgr.id, other:other?other.id:0};
  })())`));
}
async function lFxTearDown(){
  W(`(function(){
    var fx = window.__lFx;
    if(fx){
      db.lib_books.filter(function(b){ return b._ltest===1; }).forEach(function(b){
        db.lib_loans.filter(function(l){return l.book_id===b.id;}).forEach(function(l){remove('lib_loans',l.id);});
        remove('lib_books', b.id);
      });
    }
    window.__lFx = null;
  })()`);
}
function lAddBook(title, scId){
  return W(`(function(){
    var r = add('lib_books',{school_id:${JSON.stringify(scId)},title:${JSON.stringify(title)},author:'',code:'',created_at:new Date().toISOString(),_ltest:1});
    return r.id;
  })()`);
}

(async () => {
  await sleep(300);

  await sec('L1 دادهٔ نمونه: کتاب‌ها + امانتِ فعال/دیرکرد/برگشته', async () => {
    const fx = await lFx();
    const r = JSON.parse(W(`JSON.stringify((function(){
      var books = db.lib_books.filter(function(b){return b.school_id===${fx.sc};});
      var loans = db.lib_loans.filter(function(l){return l.school_id===${fx.sc};});
      return {
        books: books.length,
        active: loans.filter(function(l){return !l.returned_at;}).length,
        late: loans.filter(function(l){return !l.returned_at && l.due_at && todayISO()>l.due_at.slice(0,10);}).length,
        returned: loans.filter(function(l){return l.returned_at;}).length
      };
    })())`));
    assert(r.books>=3, 'کتاب‌های نمونه نیست: ' + JSON.stringify(r));
    assert(r.active>=1 && r.late>=1 && r.returned>=1, 'سه حالت امانت لازم است: ' + JSON.stringify(r));
  });

  await sec('L2 صفحهٔ مدیر: بج‌های وضعیت + دکمه‌های امانت/بازگشت/حذف', async () => {
    const fx = await lFx();
    try{
      const out = W(`(function(){
        S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;
        S.route='library';S.filters={};S.page=1;
        return renderRoute();
      })()`);
      assert(typeof out==='string' && out.indexOf('دسترسی مجاز نیست')<0, 'رندر مسدود');
      assert(out.indexOf('کتاب جدید')>=0, 'دکمهٔ کتاب جدید نیست');
      assert(out.indexOf('امانت‌رفته')>=0, 'بج امانت‌رفته نیست');
      assert(out.indexOf('دیرکرد')>=0, 'بج دیرکرد نیست');
      assert(out.indexOf('data-act="lib-lend"')>=0, 'دکمهٔ امانت نیست');
      assert(out.indexOf('data-act="lib-return"')>=0, 'دکمهٔ بازگشت نیست');
      /* دبیر: صفحه را نمی‌بیند */
      const t = JSON.parse(W(`JSON.stringify((function(){
        var x=db.users.filter(function(x){return x.role==='teacher'&&x.school_id===${fx.sc};})[0];
        return x?x.id:0;
      })())`));
      if(t){
        const outT = W(`(function(){
          S.user=byId('users',${t});S.persona=null;S.boss=null;
          S.route='library';S.filters={};S.page=1;
          return renderRoute();
        })()`);
        assert(outT.indexOf('دسترسی مجاز نیست')>=0, 'دبیر صفحهٔ کتابخانه را دید!');
      }
    } finally { await lFxTearDown(); }
  });

  await sec('L3 ثبت/حذف کتاب: مدیر قبول، حذف با امانتِ فعال رد', async () => {
    const fx = await lFx();
    try{
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
      const rB = JSON.parse(W(`JSON.stringify(libAddBook('کتاب تستی','نویسنده','T-1'))`));
      assert(rB.ok===true, 'ثبت کتاب شکست: ' + (rB.msg||''));
      assert(rB.rec.school_id===fx.sc, 'school_id کتاب درست نیست');
      W(`(function(){ var b=byId('lib_books',${rB.rec.id}); if(b) b._ltest=1; })()`);
      /* حذف کتابِ با امانتِ فعال → رد */
      const bLoan = JSON.parse(W(`JSON.stringify((function(){
        var l=db.lib_loans.filter(function(l){return l.school_id===${fx.sc}&&!l.returned_at;})[0];
        return l?l.book_id:0;
      })())`));
      const rD1 = JSON.parse(W(`JSON.stringify(libDelBook(${bLoan}))`));
      assert(rD1.ok===false, 'کتابِ امانت‌رفته حذف شد!');
      /* حذف کتابِ آزاد → قبول */
      const rD2 = JSON.parse(W(`JSON.stringify(libDelBook(${rB.rec.id}))`));
      assert(rD2.ok===true, 'حذف کتابِ آزاد شکست: ' + (rD2.msg||''));
      const gone = W(`!!byId('lib_books',${rB.rec.id})`);
      assert(gone===false, 'کتاب حذف نشد');
    } finally { await lFxTearDown(); }
  });

  await sec('L4 امانت: مدرسهٔ دانش‌آموز چک + مهلت + نقش‌های دیگر رد', async () => {
    const fx = await lFx();
    try{
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
      const bid = lAddBook('کتاب امانتی', fx.sc);
      W(`(function(){ var b=byId('lib_books',${bid}); if(b) b._ltest=1; })()`);
      const stu = JSON.parse(W(`JSON.stringify((function(){
        var s=db.users.filter(function(x){return x.role==='student'&&x.school_id===${fx.sc};})[0];
        return s?s.id:0;
      })())`));
      /* مهلت پیش‌فرض (~+۱۴ روز) */
      const r1 = JSON.parse(W(`JSON.stringify(libLend(${bid}, ${stu}, ''))`));
      assert(r1.ok===true, 'امانت شکست: ' + (r1.msg||''));
      const dueDays = Math.round((Date.parse(r1.rec.due_at) - Date.now()) / 86400000);
      assert(dueDays>=13 && dueDays<=15, 'مهلت پیش‌فرض درست نیست: ' + dueDays);
      /* مهلتِ داده‌شده */
      const stu2 = JSON.parse(W(`JSON.stringify((function(){
        var s=db.users.filter(function(x){return x.role==='student'&&x.school_id===${fx.sc}&&x.id!==${stu};})[0];
        return s?s.id:0;
      })())`));
      const r2 = JSON.parse(W(`JSON.stringify(libLend(${bid}, ${stu2}, '2027-01-15'))`));
      assert(r2.ok===true && r2.rec.due_at==='2027-01-15', 'مهلتِ داده‌شده اعمال نشد');
      /* دانش‌آموزِ مدرسهٔ دیگر → رد */
      if(fx.other){
        const stuX = JSON.parse(W(`JSON.stringify((function(){
          var s=db.users.filter(function(x){return x.role==='student'&&x.school_id===${fx.other};})[0];
          return s?s.id:0;
        })())`));
        if(stuX){
          const rX = JSON.parse(W(`JSON.stringify(libLend(${bid}, ${stuX}, ''))`));
          assert(rX.ok===false, 'امانت به دانش‌آموزِ مدرسهٔ دیگر رفت!');
        }
      }
      /* نقش‌های دیگر → رد */
      const t = JSON.parse(W(`JSON.stringify((function(){
        var x=db.users.filter(function(x){return x.role==='teacher'&&x.school_id===${fx.sc};})[0];
        return x?x.id:0;
      })())`));
      W(`S.user=byId('users',${t});S.persona=null;S.boss=null;`);
      const rT = JSON.parse(W(`JSON.stringify(libLend(${bid}, ${stu}, ''))`));
      assert(rT.ok===false, 'دبیر امانت داد!');
    } finally { await lFxTearDown(); }
  });

  await sec('L5 بازگشت + دیرکرد: وضعیت با مهلت عوض می‌شود', async () => {
    const fx = await lFx();
    try{
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
      const bid = lAddBook('کتاب بازگشتی', fx.sc);
      W(`(function(){ var b=byId('lib_books',${bid}); if(b) b._ltest=1; })()`);
      const stu = JSON.parse(W(`JSON.stringify((function(){
        var s=db.users.filter(function(x){return x.role==='student'&&x.school_id===${fx.sc};})[0];
        return s?s.id:0;
      })())`));
      /* امانتِ بامهلت → وضعیت loaned */
      const r1 = JSON.parse(W(`JSON.stringify(libLend(${bid}, ${stu}, ''))`));
      let st1 = JSON.parse(W(`JSON.stringify(libBookStatus(${bid}))`));
      assert(st1.key==='loaned', 'وضعیت امانتِ تازه درست نیست: ' + JSON.stringify(st1));
      /* بازگشت → وضعیت free */
      const rRet = JSON.parse(W(`JSON.stringify(libReturn(${r1.rec.id}))`));
      assert(rRet.ok===true, 'بازگشت شکست: ' + (rRet.msg||''));
      let st2 = JSON.parse(W(`JSON.stringify(libBookStatus(${bid}))`));
      assert(st2.key==='free', 'وضعیت بعد از بازگشت درست نیست: ' + JSON.stringify(st2));
      /* بازگشت تکراری → رد */
      const rRet2 = JSON.parse(W(`JSON.stringify(libReturn(${r1.rec.id}))`));
      assert(rRet2.ok===false, 'بازگشت تکراری پذیرفته شد!');
      /* امانتِ دیرکرد → وضعیت late */
      const r2 = JSON.parse(W(`JSON.stringify(libLend(${bid}, ${stu}, '2020-01-01'))`));
      assert(r2.ok===true, 'امانتِ دیرکرد ثبت نشد: ' + (r2.msg||''));
      const st3 = JSON.parse(W(`JSON.stringify(libBookStatus(${bid}))`));
      assert(st3.key==='late', 'وضعیت دیرکرد درست نیست: ' + JSON.stringify(st3));
      /* کتابِ با امانتِ فعال نمی‌تواند حذف شود */
      const rD = JSON.parse(W(`JSON.stringify(libDelBook(${bid}))`));
      assert(rD.ok===false, 'کتابِ امانت‌رفته حذف شد!');
      /* امانتِ مدرسهٔ دیگر → بازگشت رد (کتاب و امانتِ آنجا خودِ تست می‌سازد) */
      if(fx.other){
        const oLoan = JSON.parse(W(`JSON.stringify((function(){
          var b=add('lib_books',{school_id:${fx.other},title:'کتابِ مدرسهٔ دیگر',author:'',code:'',created_at:new Date().toISOString()});
          var s=db.users.filter(function(x){return x.role==='student'&&x.school_id===${fx.other};})[0];
          if(!s){ remove('lib_books',b.id); return 0; }
          var l=add('lib_loans',{school_id:${fx.other},book_id:b.id,student_id:s.id,
            loan_at:new Date().toISOString(),due_at:'2027-01-01',returned_at:'',registered_by:0,created_at:new Date().toISOString()});
          window.__lOtherBook = b.id;
          return l.id;
        })())`));
        if(oLoan){
          const rX = JSON.parse(W(`JSON.stringify(libReturn(${oLoan}))`));
          assert(rX.ok===false, 'بازگشتِ امانتِ مدرسهٔ دیگر پذیرفته شد!');
          const v = JSON.parse(W(`JSON.stringify(byId('lib_loans',${oLoan}))`));
          assert(!v.returned_at, 'بازگشتِ غیرمجاز ثبت شد!');
          W(`remove('lib_loans',${oLoan}); remove('lib_books', window.__lOtherBook); window.__lOtherBook=null;`);
        }
      }
    } finally { await lFxTearDown(); }
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت کتابخانه: ${ok}/${results.length} موفق  —  ${ok===results.length?'بدون خطا ✅':'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
