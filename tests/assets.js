#!/usr/bin/env node
/**
 * سئوت املاک و موجودی (بند ۹: تجهیزات + وضعیت + مکان) — پایش
 *
 * در پروسهٔ جداگانه اجرا می‌شود (نه داخل smoke.js).
 *
 * بخش‌ها:
 *  A1 دادهٔ نمونه (تجهیزات با هر سه وضعیت)
 *  A2 صفحهٔ مدیر (شمارنده‌ها، بج‌ها، دکمه‌ها) + مسدود برای دبیر
 *  A3 assetAdd: مدیر قبول (مدرسه + نام + وضعیت معتبر) + نقش‌های دیگر رد
 *  A4 assetSetStatus: به‌روزرسانی + مکان + وضعیت نامعتبر رد + مدرسهٔ دیگر رد
 *  A5 assetDel: حذفِ مدیر + رد برای مدرسهٔ دیگر + رد برای دبیر
 *
 * اجرا: node tests/assets.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — سئوت رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

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

async function aFx(){
  return JSON.parse(W(`JSON.stringify((function(){
    var sc = db.schools.filter(function(s){return s.active;})[0];
    var mgr = db.users.filter(function(x){return x.role==='manager'&&x.school_id===sc.id;})[0];
    var other = db.schools.filter(function(s){return s.active && s.id!==sc.id;})[0];
    window.__aFx = {sc:sc.id, mgr:mgr.id, other:other?other.id:0};
    return {sc:sc.id, mgr:mgr.id, other:other?other.id:0};
  })())`));
}
async function aTearDown(){
  W(`(function(){
    db.assets.filter(function(a){ return a._atest===1; }).forEach(function(a){ remove('assets', a.id); });
    window.__aFx = null;
  })()`);
}
function aAdd(name, status, scId){
  return W(`(function(){
    var r = add('assets',{school_id:${JSON.stringify(scId)},name:${JSON.stringify(name)},category:'',status:${JSON.stringify(status)},location:'',note:'',created_at:new Date().toISOString(),_atest:1});
    return r.id;
  })()`);
}

(async () => {
  await sleep(300);

  await sec('A1 دادهٔ نمونه: تجهیزات با هر سه وضعیت', async () => {
    const fx = await aFx();
    const r = JSON.parse(W(`JSON.stringify((function(){
      var list = db.assets.filter(function(a){return a.school_id===${fx.sc};});
      return {
        n: list.length,
        available: list.filter(function(a){return a.status==='available';}).length,
        inUse: list.filter(function(a){return a.status==='in_use';}).length,
        repair: list.filter(function(a){return a.status==='repair';}).length
      };
    })())`));
    assert(r.n>=4, 'تجهیزاتِ نمونه نیست: ' + JSON.stringify(r));
    assert(r.available>=1 && r.inUse>=1 && r.repair>=1, 'هر سه وضعیت لازم است: ' + JSON.stringify(r));
  });

  await sec('A2 صفحهٔ مدیر: شمارنده‌ها + دکمه‌ها + مسدود برای دبیر', async () => {
    const fx = await aFx();
    try{
      const out = W(`(function(){
        S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;
        S.route='assets';S.filters={};S.page=1;
        return renderRoute();
      })()`);
      assert(typeof out==='string' && out.indexOf('دسترسی مجاز نیست')<0, 'رندر مسدود');
      assert(out.indexOf('املاک و موجودی')>=0, 'عنوان صفحه نیست');
      assert(out.indexOf('تجهیز جدید')>=0, 'دکمهٔ تجهیز جدید نیست');
      assert(out.indexOf('در حال استفاده')>=0, 'بجِ وضعیت نیست');
      assert(out.indexOf('data-act="as-status"')>=0, 'دکمهٔ تغییر وضعیت نیست');
      assert(out.indexOf('data-act="as-del"')>=0, 'دکمهٔ حذف نیست');
      /* دبیر: صفحه را نمی‌بیند */
      const t = JSON.parse(W(`JSON.stringify((function(){
        var x=db.users.filter(function(x){return x.role==='teacher'&&x.school_id===${fx.sc};})[0];
        return x?x.id:0;
      })())`));
      if(t){
        const outT = W(`(function(){
          S.user=byId('users',${t});S.persona=null;S.boss=null;
          S.route='assets';S.filters={};S.page=1;
          return renderRoute();
        })()`);
        assert(outT.indexOf('دسترسی مجاز نیست')>=0, 'دبیر صفحهٔ املاک را دید!');
      }
    } finally { await aTearDown(); }
  });

  await sec('A3 assetAdd: مدیر قبول + نام/وضعیت + نقش‌های دیگر رد', async () => {
    const fx = await aFx();
    try{
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
      const rB = JSON.parse(W(`JSON.stringify(assetAdd('تجهیز تستی','کامپیوتر','کلاس ۱','available'))`));
      assert(rB.ok===true, 'ثبت تجهیز شکست: ' + (rB.msg||''));
      assert(rB.rec.school_id===fx.sc, 'school_id درست نیست');
      assert(rB.rec.status==='available', 'وضعیت ثبت‌شده درست نیست');
      /* نام خالی → رد */
      const rN = JSON.parse(W(`JSON.stringify(assetAdd('   ','','','available'))`));
      assert(rN.ok===false, 'نام خالی پذیرفته شد!');
      /* وضعیت نامعتبر → رد */
      const rS = JSON.parse(W(`JSON.stringify(assetAdd('تجهیز تستی ۲','','','broken'))`));
      assert(rS.ok===false, 'وضعیت نامعتبر پذیرفته شد!');
      /* نقش‌های دیگر → رد */
      const t = JSON.parse(W(`JSON.stringify((function(){
        var x=db.users.filter(function(x){return x.role==='teacher'&&x.school_id===${fx.sc};})[0];
        return x?x.id:0;
      })())`));
      W(`S.user=byId('users',${t});S.persona=null;S.boss=null;`);
      const rT = JSON.parse(W(`JSON.stringify(assetAdd('تجهیز دبیری','','','available'))`));
      assert(rT.ok===false, 'دبیر تجهیز ثبت کرد!');
      const s2 = JSON.parse(W(`JSON.stringify((function(){
        var x=db.users.filter(function(x){return x.role==='student'&&x.school_id===${fx.sc};})[0];
        return x?x.id:0;
      })())`));
      W(`S.user=byId('users',${s2});S.persona=null;S.boss=null;`);
      const rS2 = JSON.parse(W(`JSON.stringify(assetAdd('تجهیز دانش‌آموزی','','','available'))`));
      assert(rS2.ok===false, 'دانش‌آموز تجهیز ثبت کرد!');
    } finally { await aTearDown(); }
  });

  await sec('A4 assetSetStatus: به‌روزرسانی + مکان + نامعتبر/مدرسهٔ دیگر رد', async () => {
    const fx = await aFx();
    try{
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
      const bid = aAdd('تجهیز ویرایشی', 'available', fx.sc);
      const r1 = JSON.parse(W(`JSON.stringify(assetSetStatus(${bid}, 'in_use', 'کارگاه'))`));
      assert(r1.ok===true, 'تغییر وضعیت شکست: ' + (r1.msg||''));
      const v1 = JSON.parse(W(`JSON.stringify(byId('assets',${bid}))`));
      assert(v1.status==='in_use', 'وضعیت به‌روز نشد: ' + v1.status);
      assert(v1.location==='کارگاه', 'مکان به‌روز نشد: ' + JSON.stringify(v1.location));
      /* وضعیت نامعتبر → رد + ردیف دست‌نخورده */
      const r2 = JSON.parse(W(`JSON.stringify(assetSetStatus(${bid}, 'unknown', ''))`));
      assert(r2.ok===false, 'وضعیت نامعتبر پذیرفته شد!');
      const v2 = JSON.parse(W(`JSON.stringify(byId('assets',${bid}))`));
      assert(v2.status==='in_use', 'ردیف با وضعیت نامعتبر عوض شد!');
      /* تجهیزِ مدرسهٔ دیگر → رد */
      if(fx.other){
        const oid = aAdd('تجهیزِ مدرسهٔ دیگر', 'available', fx.other);
        const rX = JSON.parse(W(`JSON.stringify(assetSetStatus(${oid}, 'repair', ''))`));
        assert(rX.ok===false, 'تغییر وضعیتِ مدرسهٔ دیگر رفت!');
      }
      /* دبیر → رد */
      const t = JSON.parse(W(`JSON.stringify((function(){
        var x=db.users.filter(function(x){return x.role==='teacher'&&x.school_id===${fx.sc};})[0];
        return x?x.id:0;
      })())`));
      W(`S.user=byId('users',${t});S.persona=null;S.boss=null;`);
      const rT = JSON.parse(W(`JSON.stringify(assetSetStatus(${bid}, 'repair', ''))`));
      assert(rT.ok===false, 'دبیر وضعیت عوض کرد!');
      const v3 = JSON.parse(W(`JSON.stringify(byId('assets',${bid}))`));
      assert(v3.status==='in_use', 'ردیف با تلاشِ غیرمجاز عوض شد!');
    } finally { await aTearDown(); }
  });

  await sec('A5 assetDel: حذفِ مدیر + رد برای مدرسهٔ دیگر + رد برای دبیر', async () => {
    const fx = await aFx();
    try{
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
      const bid = aAdd('تجهیز حذفی', 'available', fx.sc);
      /* دبیر → رد */
      const t = JSON.parse(W(`JSON.stringify((function(){
        var x=db.users.filter(function(x){return x.role==='teacher'&&x.school_id===${fx.sc};})[0];
        return x?x.id:0;
      })())`));
      W(`S.user=byId('users',${t});S.persona=null;S.boss=null;`);
      const rT = JSON.parse(W(`JSON.stringify(assetDel(${bid}))`));
      assert(rT.ok===false, 'دبیر تجهیز حذف کرد!');
      assert(!!W(`byId('assets',${bid})`), 'ردیف با تلاشِ غیرمجاز حذف شد!');
      /* مدیر → حذف + ناپدید شدن ردیف */
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
      const rD = JSON.parse(W(`JSON.stringify(assetDel(${bid}))`));
      assert(rD.ok===true, 'حذف شکست: ' + (rD.msg||''));
      assert(!W(`byId('assets',${bid})`), 'ردیف حذف نشد');
      /* تجهیزِ مدرسهٔ دیگر → رد */
      if(fx.other){
        const oid = aAdd('تجهیز حذفیِ دیگر', 'available', fx.other);
        const rX = JSON.parse(W(`JSON.stringify(assetDel(${oid}))`));
        assert(rX.ok===false, 'حذفِ مدرسهٔ دیگر رفت!');
        assert(!!W(`byId('assets',${oid})`), 'ردیفِ مدرسهٔ دیگر حذف شد!');
      }
    } finally { await aTearDown(); }
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت املاک: ${ok}/${results.length} موفق  —  ${ok===results.length?'بدون خطا ✅':'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
