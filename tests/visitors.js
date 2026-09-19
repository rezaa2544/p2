#!/usr/bin/env node
/**
 * سئوت مدیریت مهمان‌ها (بند ۷: ورود/خروج غیردانش‌آموز و غیرکارکنان) — پایش
 *
 * در پروسهٔ جداگانه اجرا می‌شود (نه داخل smoke.js).
 *
 * بخش‌ها:
 *  W1 دادهٔ نمونه (دو مهمان: یکی رفته، یکی هنوز در مدرسه)
 *  W2 صفحهٔ مدیر (جدول، شمارنده‌ها، دکمه‌ها)
 *  W3 ثبت مهمان: مدیر قبول + نقش‌های دیگر رد (گارد + داده)
 *  W4 خروج: ثبت out_at + تکراری رد + مدرسهٔ دیگر رد
 *  W5 نمایش: وضعیت (در مدرسه/رفته) + زمان شمسی
 *
 * اجرا: node tests/visitors.js
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

/* فیکسور: مدیر یک مدرسهٔ فعالِ دمو + یک مهمانِ خارجِ مدرسهٔ مدیر */
async function wFx(){
  return JSON.parse(W(`JSON.stringify((function(){
    var sc = db.schools.filter(function(s){return s.active;})[0];
    var mgr = db.users.filter(function(x){return x.role==='manager'&&x.school_id===sc.id;})[0];
    var other = db.schools.filter(function(s){return s.active && s.id!==sc.id;})[0];
    window.__wFx = {sc:sc.id, mgr:mgr.id, other:other?other.id:0};
    return {sc:sc.id, mgr:mgr.id, other:other?other.id:0};
  })())`));
}
async function wFxTearDown(){
  W(`(function(){
    var fx = window.__wFx;
    if(fx){
      db.visitors.filter(function(v){ return v._wtest===1; }).forEach(function(v){ remove('visitors', v.id); });
    }
    window.__wFx = null;
  })()`);
}
function wAddVisitor(schoolId, name, purpose, inAt, outAt){
  return W(`(function(){
    var r = add('visitors',{school_id:${JSON.stringify(schoolId)},name:${JSON.stringify(name)},
      purpose:${JSON.stringify(purpose||'')},in_at:${JSON.stringify(inAt)},
      out_at:${JSON.stringify(outAt||'')},registered_by:0,created_at:${JSON.stringify(inAt)},_wtest:1});
    return r.id;
  })()`);
}

(async () => {
  await sleep(300);

  await sec('W1 دادهٔ نمونه: دو مهمان (یکی رفته، یکی در مدرسه)', async () => {
    const fx = await wFx();
    const r = JSON.parse(W(`JSON.stringify((function(){
      var list = db.visitors.filter(function(v){return v.school_id===${fx.sc};});
      return {n:list.length,
        out:list.filter(function(v){return v.out_at;}).length,
        inb:list.filter(function(v){return !v.out_at;}).length};
    })())`));
    assert(r.n>=2, 'دادهٔ نمونهٔ مهمان نیست');
    assert(r.out>=1 && r.inb>=1, 'یک مهمانِ رفته و یک مهمانِ درمدرسه لازم است: ' + JSON.stringify(r));
  });

  await sec('W2 صفحهٔ مدیر: جدول + شمارنده‌ها + دکمه‌های ثبت/خروج', async () => {
    const fx = await wFx();
    try{
      const out = W(`(function(){
        S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;
        S.route='visitors';S.filters={};S.page=1;
        return renderRoute();
      })()`);
      assert(typeof out==='string' && out.indexOf('دسترسی مجاز نیست')<0, 'رندر مسدود یا خالی');
      assert(out.indexOf('ثبت مهمان')>=0, 'دکمهٔ ثبت نیست');
      assert(out.indexOf('در حال حاضر در مدرسه')>=0, 'شمارندهٔ درمدرسه نیست');
      assert(out.indexOf('data-act="vis-out"')>=0, 'دکمهٔ خروجِ مهمانِ درمدرسه نیست');
      const other = JSON.parse(W(`JSON.stringify((function(){
        var t=db.users.filter(function(x){return x.role==='teacher'&&x.school_id===${fx.sc};})[0];
        return t?t.id:0;
      })())`));
      if(other){
        const outT = W(`(function(){
          S.user=byId('users',${other});S.persona=null;S.boss=null;
          S.route='visitors';S.filters={};S.page=1;
          return renderRoute();
        })()`);
        assert(outT.indexOf('دسترسی مجاز نیست')>=0, 'دبیر صفحهٔ مهمان‌ها را دید!');
      }
    } finally { await wFxTearDown(); }
  });

  await sec('W3 ثبت مهمان: مدیر قبول (school_id روی داده) + نقش‌های دیگر رد', async () => {
    const fx = await wFx();
    try{
      const other = JSON.parse(W(`JSON.stringify((function(){
        var t=db.users.filter(function(x){return x.role==='teacher'&&x.school_id===${fx.sc};})[0];
        return t?t.id:0;
      })())`));
      assert(other, 'فیکسور: دبیر لازم است');
      /* گارد اکشن: دکمهٔ vis-save برای دبیر اجرا نمی‌شود (بدون عکس‌العمل) */
      W(`S.user=byId('users',${other});S.persona=null;S.boss=null;`);
      const nBefore = W(`db.visitors.length`);
      W(`(function(){
        var el=document.createElement('button');
        el.setAttribute('data-act','vis-save');
        document.body.appendChild(el); el.click(); el.remove();
      })()`);
      const nAfter = W(`db.visitors.length`);
      assert(nAfter===nBefore, 'اکشنِ غیرمجاز ردیف ساخت!');
      /* فراخوانی مستقیم از دبیر → رد */
      const rT = JSON.parse(W(`JSON.stringify(visitorRegister('مهمانِ غیرمجاز','تست'))`));
      assert(rT.ok===false, 'دبیر مهمان ثبت کرد!');
      /* دانش‌آموز → رد */
      const st = JSON.parse(W(`JSON.stringify((function(){
        var s=db.users.filter(function(x){return x.role==='student'&&x.school_id===${fx.sc};})[0];
        return s?s.id:0;
      })())`));
      W(`S.user=byId('users',${st});S.persona=null;S.boss=null;`);
      const rS = JSON.parse(W(`JSON.stringify(visitorRegister('مهمان_2','تست'))`));
      assert(rS.ok===false, 'دانش‌آموز مهمان ثبت کرد!');
      /* مدیر → قبول + school_id درست */
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
      const rM = JSON.parse(W(`JSON.stringify(visitorRegister('مهمانِ تستی','بازدید'))`));
      assert(rM.ok===true, 'مدیر نتوانست مهمان ثبت کند: ' + (rM.msg||''));
      assert(rM.rec.school_id===fx.sc && rM.rec.in_at && !rM.rec.out_at, 'رکورد نادرست: ' + JSON.stringify(rM.rec));
      W(`(function(){ var r=byId('visitors',${rM.rec.id}); if(r) r._wtest=1; })()`);
      /* نام خالی → رد */
      const rE = JSON.parse(W(`JSON.stringify(visitorRegister('   ','تست'))`));
      assert(rE.ok===false, 'نام خالی پذیرفته شد!');
    } finally { await wFxTearDown(); }
  });

  await sec('W4 خروج: out_at ثبت + تکراری رد + مدرسهٔ دیگر رد', async () => {
    const fx = await wFx();
    try{
      const vid = wAddVisitor(fx.sc, 'مهمان خروجی', 'تست', new Date().toISOString(), '');
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
      const r1 = JSON.parse(W(`JSON.stringify(visitorCheckout(${vid}))`));
      assert(r1.ok===true, 'خروج شکست: ' + (r1.msg||''));
      const v = JSON.parse(W(`JSON.stringify(byId('visitors',${vid}))`));
      assert(v.out_at && !isNaN(Date.parse(v.out_at)) && /\d{4}-\d{2}-\d{2}T/.test(v.out_at),
        'out_at به‌شکل ISO ثبت نشد: ' + JSON.stringify(v.out_at));
      const r2 = JSON.parse(W(`JSON.stringify(visitorCheckout(${vid}))`));
      assert(r2.ok===false, 'خروج تکراری پذیرفته شد!');
      /* مهمانِ مدرسهٔ دیگر */
      if(fx.other){
        const v2 = wAddVisitor(fx.other, 'مهمانِ مدرسهٔ دیگر', 'تست', new Date().toISOString(), '');
        const r3 = JSON.parse(W(`JSON.stringify(visitorCheckout(${v2}))`));
        assert(r3.ok===false, 'خروجِ مهمانِ مدرسهٔ دیگر پذیرفته شد!');
        const v2b = JSON.parse(W(`JSON.stringify(byId('visitors',${v2}))`));
        assert(!v2b.out_at, 'خروجِ غیرمجاز ثبت شد!');
      }
    } finally { await wFxTearDown(); }
  });

  await sec('W5 نمایش: وضعیت + زمان شمسی + پاک‌شدن دکمهٔ خروج بعد از خروج', async () => {
    const fx = await wFx();
    try{
      const vidIn = wAddVisitor(fx.sc, 'مهمان_A', 'بازدید', new Date().toISOString(), '');
      const vidOut = wAddVisitor(fx.sc, 'مهمان_B', 'ارائه', new Date(Date.now()-3600*1000).toISOString(), new Date(Date.now()-1800*1000).toISOString());
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;S.route='visitors';S.filters={};S.page=1;`);
      let out = W(`renderRoute()`);
      assert(out.indexOf('مهمان_A')>=0 && out.indexOf('مهمان_B')>=0, 'ردیف‌ها نیستند');
      assert(out.indexOf('🟢 در مدرسه')>=0, 'برچسب درمدرسه نیست');
      assert(out.indexOf('🔵 رفته')>=0, 'برچسب رفته نیست');
      /* خروجِ A → دکمهٔ خروجش از بین می‌رود و برچسب عوض می‌شود */
      W(`(function(){
        var el=document.createElement('button');
        el.setAttribute('data-act','vis-out'); el.setAttribute('data-id','${vidIn}');
        document.body.appendChild(el); el.click(); el.remove();
      })()`);
      out = W(`renderRoute()`);
      const rowA = (out.split('مهمان_A')[1]||'').slice(0,400);
      assert(rowA.indexOf('data-act="vis-out"')<0, 'دکمهٔ خروج بعد از خروج هنوز هست!');
      assert(rowA.indexOf('🔵 رفته')>=0, 'برچسب بعد از خروج عوض نشد');
    } finally { await wFxTearDown(); }
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت مهمان‌ها: ${ok}/${results.length} موفق  —  ${ok===results.length?'بدون خطا ✅':'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
