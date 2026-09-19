#!/usr/bin/env node
/**
 * سئوت حضورِ خودکارِ کلاس مجازی (بند ۱۲) — پایش
 *
 * بخش‌ها:
 *  V1 دادهٔ نمونه (یکی الان داخل، یکی شرکت‌کرده و خارج)
 *  V2 vclassJoin: دانش‌آموزِ کلاس قبول (ISO) + تکراری رد + کلاسِ دیگر رد + نقش رد
 *  V3 vclassLeave: بدون ورود رد + خروج + تکراری رد + بازموردن (همان ردیف)
 *  V4 نمایش: شمارندهٔ دبیر + دکمه‌های تب پرونده + ولی فقط‌خوان
 *
 * اجرا: node tests/vclass2.js
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
  catch (e) { const stack1 = String((e.stack||'').split(String.fromCharCode(10))[1]||'').trim(); results.push({ name, ok: false, detail: String(e.message || e) + '  ||  ' + stack1, ms: Date.now() - t0 }); }
};

(async () => {
  await sleep(300);
  const fx = JSON.parse(W(`JSON.stringify((function(){
    var sc = db.schools.filter(function(s){return s.active;})[0];
    var sess = db.vclass_sessions.filter(function(x){return x.school_id===sc.id;})[0];
    if(!sess) return null;
    var cls = byId('classes', sess.class_id);
    var inCls = db.users.filter(function(x){return x.role==='student'&&classOf(x.id)&&classOf(x.id).id===cls.id;});
    var free = inCls.filter(function(x){return !vclassAttOf(sess.id, x.id);});
    var other = db.users.filter(function(x){return x.role==='student'&&(!classOf(x.id)||classOf(x.id).id!==cls.id);})[0];
    var t = db.users.filter(function(x){return x.role==='teacher'&&x.school_id===sc.id;})[0];
    return {sc:sc.id, sess:sess.id, cls:cls.id,
      a: inCls[0]?inCls[0].id:0, b: inCls[1]?inCls[1].id:0,
      f1: free[0]?free[0].id:0, f2: free[1]?free[1].id:0,
      other: other?other.id:0, t: t?t.id:0};
  })())`));
  if(!fx) throw new Error('فیکسور ساخته نشد');
  if(!fx.f1) throw new Error('دانش‌آموزِ آزاد پیدا نشد');

  const setU = (id) => W(`S.user=byId('users',${id});S.persona=null;S.boss=null;S.child=null;`);
  const drop = (sid) => {
    const rowId = W(`(function(){var a=vclassAttOf(${fx.sess},${sid}); return a?a.id:0;})()`);
    if(rowId) W(`remove('vclass_attendance',${rowId})`);
  };

  await sec('V1 دادهٔ نمونه: یکی الان داخل + یکی خارج‌شده', async () => {
    const r = JSON.parse(W(`JSON.stringify((function(){
      var att = db.vclass_attendance.filter(function(a){return a.session_id===${fx.sess};});
      return {n: att.length, now: vclassPresentNow(${fx.sess}).length,
        left: att.filter(function(a){return a.left_at;}).length};
    })())`));
    assert(r.n>=2, 'شرکت‌کنندگانِ نمونه نیست: ' + JSON.stringify(r));
    assert(r.now>=1 && r.left>=1, 'هر دو حالت لازم است: ' + JSON.stringify(r));
  });

  await sec('V2 vclassJoin: کلاسِ خود + ISO + تکراری/کلاسِ دیگر/نقش رد', async () => {
    try{
      setU(fx.f1);
      const r1 = JSON.parse(W(`JSON.stringify(vclassJoin(${fx.sess}))`));
      assert(r1.ok===true, 'ورود شکست: ' + (r1.msg||''));
      assert(!isNaN(Date.parse(r1.rec.joined_at)) && /^\d{4}-\d{2}-\d{2}T/.test(r1.rec.joined_at), 'joined_at ISO نیست: ' + r1.rec.joined_at);
      const r2 = JSON.parse(W(`JSON.stringify(vclassJoin(${fx.sess}))`));
      assert(r2.ok===false, 'ورودِ تکراری پذیرفته شد!');
      if(fx.other){
        setU(fx.other);
        const rX = JSON.parse(W(`JSON.stringify(vclassJoin(${fx.sess}))`));
        assert(rX.ok===false, 'دانش‌آموزِ کلاسِ دیگر وارد شد!');
      }
      setU(fx.t);
      const rT = JSON.parse(W(`JSON.stringify(vclassJoin(${fx.sess}))`));
      assert(rT.ok===false, 'دبیر وارد کلاس شد!');
    } finally { drop(fx.f1); }
  });

  await sec('V3 vclassLeave: بدون ورود رد + خروج + تکراری رد + بازموردن', async () => {
    const sid = fx.f2 || fx.f1;
    try{
      setU(sid);
      const r0 = JSON.parse(W(`JSON.stringify(vclassLeave(${fx.sess}))`));
      assert(r0.ok===false, 'خروجِ بدون ورود پذیرفته شد!');
      const rJ = JSON.parse(W(`JSON.stringify(vclassJoin(${fx.sess}))`));
      assert(rJ.ok===true, 'ورود شکست: ' + (rJ.msg||''));
      const rL = JSON.parse(W(`JSON.stringify(vclassLeave(${fx.sess}))`));
      assert(rL.ok===true, 'خروج شکست: ' + (rL.msg||''));
      const v = JSON.parse(W(`JSON.stringify(vclassAttOf(${fx.sess},${sid}))`));
      assert(!isNaN(Date.parse(v.left_at)) && /^\d{4}-\d{2}-\d{2}T/.test(v.left_at), 'left_at ISO نیست: ' + JSON.stringify(v.left_at));
      const rL2 = JSON.parse(W(`JSON.stringify(vclassLeave(${fx.sess}))`));
      assert(rL2.ok===false, 'خروج تکراری پذیرفته شد!');
      const rJ2 = JSON.parse(W(`JSON.stringify(vclassJoin(${fx.sess}))`));
      assert(rJ2.ok===true && rJ2.rec.id===v.id, 'بازموردن ردیفِ دوم ساخت!');
      const v2 = JSON.parse(W(`JSON.stringify(vclassAttOf(${fx.sess},${sid}))`));
      assert(!v2.left_at, 'بازموردن left را پاک نکرد');
      const rL3 = JSON.parse(W(`JSON.stringify(vclassLeave(${fx.sess}))`));
      assert(rL3.ok===true, 'خروجِ آخر شکست: ' + (rL3.msg||''));
    } finally { drop(sid); }
  });

  await sec('V4 نمایش: شمارندهٔ دبیر + دکمه‌های تب پرونده + ولی فقط‌خوان', async () => {
    const out = W(`(function(){
      S.user=byId('users',${fx.t});S.persona=null;S.boss=null;S.child=null;
      S.route='vclass';S.filters={};S.page=1;
      return renderRoute();
    })()`);
    assert(out.indexOf('الان: ')>=0, 'شمارندهٔ «الان» نیست');
    const outS = W(`(function(){
      S.user=byId('users',${fx.f1});S.persona=null;S.boss=null;S.child=null;
      S.route='record';S.filters={};S.page=1;S.tab='vclass';
      return renderRoute();
    })()`);
    assert(outS.indexOf('data-act="vc-join"')>=0, 'دکمهٔ ورود نیست');
    /* الان داخل باشد → دکمهٔ خروج */
    W(`vclassJoin(${fx.sess})`);
    const outS2 = W(`(function(){
      S.user=byId('users',${fx.f1});S.persona=null;S.boss=null;S.child=null;
      S.route='record';S.filters={};S.page=1;S.tab='vclass';
      return renderRoute();
    })()`);
    assert(outS2.indexOf('data-act="vc-leave"')>=0 && outS2.indexOf('الان داخل کلاس')>=0, 'دکمهٔ خروج/برچسبِ «الان» نیست');
    drop(fx.f1);
    /* ولی: وضعیت هست ولی دکمه نیست */
    const pl = JSON.parse(W(`JSON.stringify((function(){
      var p = db.parent_links.filter(function(x){return x.student_id===${fx.a};})[0]
           || db.parent_links[0];
      return p ? {p:p.parent_id, c:p.student_id} : null;
    })())`));
    if(pl && pl.p){
      const outP = W(`(function(){
        S.user=byId('users',${pl.p});S.persona=null;S.boss=null;S.child=${pl.c};
        S.route='record';S.filters={};S.page=1;S.tab='vclass';
        return renderRoute();
      })()`);
      assert(outP.indexOf('data-act="vc-join"')<0 && outP.indexOf('data-act="vc-leave"')<0, 'ولی دکمهٔ ورود/خروج دارد!');
      assert(outP.indexOf('داخل کلاس')>=0 || outP.indexOf('شرکت‌کرد')>=0 || outP.indexOf('هنوز وارد نشده')>=0, 'وضعیتِ حضور برای ولی نیست');
    }
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت کلاس مجازی ۲: ${ok}/${results.length} موفق  —  ${ok===results.length?'بدون خطا ✅':'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
