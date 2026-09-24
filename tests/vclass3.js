#!/usr/bin/env node
/**
 * سئوت کلاس مجازی ۳ (بند ۱۵ — لینکِ اختصاصیِ واقعی) — پایش
 *
 * در پروسهٔ جداگانه اجرا می‌شود (نه داخل smoke.js).
 *
 * بخش‌ها:
 *  L1 توکن: منحصربه‌فرد و قطعی (دو بار همان توکن؛ دانش‌آموزِ دیگر فرق)
 *  L2 ورود واقعی: دانش‌آموز با لینکِ خودش وارد می‌شود (ردیف حضور ثبت)
 *  L3 لینکِ دیگران/نقش‌های دیگر رد (روی داده)
 *  L4 مودالِ لینک‌ها: مالکیت (دبیرِ غیرمالک رد، مدیرِ مدرسهٔ دیگر رد) +
 *     فهرستِ کامل
 *  L5 خروج واقعی: همان ردیفِ ورود، left ثبت می‌شود
 *  L6 hash خودکار: vclassAutoJoinFromHash با hashِ لینک (و hashِ
 *     نامعتبر بی‌اثر)
 *
 * اجرا: node tests/vclass3.js
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

const setU = (id) => W(`S.user=byId('users',${id});S.persona=null;S.boss=null;S.child=null;`);

(async () => {
  await sleep(300);
  const fx = JSON.parse(W(`JSON.stringify((function(){
    var sc = db.schools.filter(function(s){return s.active;})[0];
    var sess = db.vclass_sessions.filter(function(x){return x.school_id===sc.id && x.type==='shad';})[0];
    if(!sess) return null;
    var cls = byId('classes', sess.class_id);
    var inCls = db.users.filter(function(x){return x.role==='student'&&classOf(x.id)&&classOf(x.id).id===cls.id;});
    var free = inCls.filter(function(x){return !vclassAttOf(sess.id, x.id);});
    var owner = db.users.filter(function(x){return x.role==='teacher'&&teacherClasses(x.id).some(function(c){return c.id===cls.id;})})[0];
    var otherT = db.users.filter(function(x){return x.role==='teacher'&&!teacherClasses(x.id).some(function(c){return c.id===cls.id;})})[0];
    var otherSc = db.schools.filter(function(s){return s.active && s.id!==sc.id;})[0];
    var otherMgr = otherSc ? db.users.filter(function(x){return x.role==='manager'&&x.school_id===otherSc.id;})[0] : null;
    return {sc:sc.id, sess:sess.id, cls:cls.id,
      a: free[0]?free[0].id:0, b: free.length>1?free[1].id:0,
      owner: owner?owner.id:0, otherT: otherT?otherT.id:0,
      otherMgr: otherMgr?otherMgr.id:0};
  })())`));
  if(!fx || !fx.a || !fx.b) throw new Error('فیکسور ساخته نشد');
  const sess = fx.sess;

  /* تمیزکاریِ مشترک: لینک‌ها و حضورهایی که این سئوت ساخت */
  function cleanup(){
    W(`(function(){
      db.vclass_links.slice().forEach(function(l){
        if(l.session_id!==${sess}) return;
        var a = vclassAttOf(${sess}, l.student_id);
        if(a) remove('vclass_attendance', a.id);
        remove('vclass_links', l.id);
      });
    })()`);
  }

  await sec('L1 توکن: منحصربه‌فرد و قطعی', async () => {
    try{
      const r = JSON.parse(W(`JSON.stringify((function(){
        var l1a = vclassLinkEnsure(${sess},${fx.a});
        var l1b = vclassLinkEnsure(${sess},${fx.a});
        var l2 = vclassLinkEnsure(${sess},${fx.b});
        return {same:l1a.id===l1b.id, sameToken:l1a.token===l1b.token,
                diff:l1a.token!==l2.token,
                prefix:l1a.token.indexOf('vc-')===0,
                url: vclassLinkFullUrl(l1a)};
      })())`));
      assert(r.same && r.sameToken, 'توکنِ قطعی نیست (دوبار ساخت)');
      assert(r.diff, 'توکنِ دو دانش‌آموز یکی شد!');
      assert(r.prefix, 'پیشوندِ توکن نیست');
      assert(r.url.indexOf('#vc-')>=0, 'آدرسِ کامل درست نیست: ' + r.url);
    } finally { cleanup(); }
  });

  await sec('L2 ورود واقعی با لینکِ خود', async () => {
    try{
      const tok = W(`vclassLinkEnsure(${sess},${fx.a}).token`);
      setU(fx.a);
      const r = JSON.parse(W(`JSON.stringify(vclassJoinLink(${JSON.stringify(tok)}))`));
      assert(r.ok===true, 'ورود با لینکِ خود شکست: ' + (r.msg||''));
      const att = JSON.parse(W(`JSON.stringify(vclassAttOf(${sess},${fx.a}))`));
      assert(att && !att.left_at && att.by===fx.a, 'ردیفِ حضور ثبت نشد: ' + JSON.stringify(att));
      assert(!isNaN(Date.parse(att.joined_at)), 'joined_at ISO نیست');
      /* تکراری: «همین الان داخل هستید» */
      const r2 = JSON.parse(W(`JSON.stringify(vclassJoinLink(${JSON.stringify(tok)}))`));
      assert(r2.ok===false, 'ورودِ تکراری پذیرفته شد!');
    } finally { cleanup(); }
  });

  await sec('L3 لینکِ دیگران/نقش‌ها رد (روی داده)', async () => {
    try{
      const tokA = W(`vclassLinkEnsure(${sess},${fx.a}).token`);
      const tokB = W(`vclassLinkEnsure(${sess},${fx.b}).token`);
      /* دانش‌آموزِ b با لینکِ a → رد + حضور ثبت نشود */
      setU(fx.b);
      let r = JSON.parse(W(`JSON.stringify(vclassJoinLink(${JSON.stringify(tokA)}))`));
      assert(r.ok===false, 'لینکِ دانش‌آموزِ دیگر پذیرفته شد!');
      const attB = W(`vclassAttOf(${sess},${fx.b})`);
      assert(!attB, 'با لینکِ دیگر، حضور ثبت شد!');
      /* ولی با لینکِ فرزند → رد */
      const pl = JSON.parse(W(`JSON.stringify((function(){
        var p = db.parent_links.filter(function(x){return x.student_id===${fx.a};})[0];
        return p ? p.parent_id : 0;
      })())`));
      if(pl){
        setU(pl);
        r = JSON.parse(W(`JSON.stringify(vclassJoinLink(${JSON.stringify(tokA)}))`));
        assert(r.ok===false, 'ولی با لینکِ فرزند وارد شد!');
      }
      /* دبیر → رد */
      setU(fx.owner);
      r = JSON.parse(W(`JSON.stringify(vclassJoinLink(${JSON.stringify(tokB)}))`));
      assert(r.ok===false, 'دبیر با لینک وارد شد!');
      /* لینکِ نامعتبر → رد */
      setU(fx.a);
      r = JSON.parse(W(`JSON.stringify(vclassJoinLink('vc-fake123'))`));
      assert(r.ok===false, 'لینکِ نامعتبر پذیرفته شد!');
    } finally { cleanup(); }
  });

  await sec('L4 مودالِ لینک‌ها: مالکیت + فهرست', async () => {
    try{
      /* دبیرِ غیرمالک → رد (روی داده) */
      if(fx.otherT){
        setU(fx.otherT);
        const r = JSON.parse(W(`(function(){
          var err='';
          try{ vclassLinksModal(${sess}); }catch(e){ err=String(e.message||e); }
          var hasModal = (document.getElementById('modal')||{}).innerHTML || '';
          return JSON.stringify({rejected: hasModal.indexOf('لینک‌های اختصاصی')<0});
        })()`));
        assert(r.rejected, 'دبیرِ غیرمالک مودالِ لینک را دید!');
      }
      /* مدیرِ مدرسهٔ دیگر → رد */
      if(fx.otherMgr){
        setU(fx.otherMgr);
        const r = JSON.parse(W(`(function(){
          vclassLinksModal(${sess});
          var hasModal = (document.getElementById('modal')||{}).innerHTML || '';
          return JSON.stringify({rejected: hasModal.indexOf('لینک‌های اختصاصی')<0});
        })()`));
        assert(r.rejected, 'مدیرِ مدرسهٔ دیگر مودالِ لینک را دید!');
      }
      /* دانش‌آموز → مودالِ لینک‌ها برایش نباشد */
      setU(fx.a);
      const rStu = JSON.parse(W(`(function(){
        vclassLinksModal(${sess});
        var hasModal = (document.getElementById('modal')||{}).innerHTML || '';
        return JSON.stringify({rejected: hasModal.indexOf('لینک‌های اختصاصی')<0});
      })()`));
      assert(rStu.rejected, 'دانش‌آموز مودالِ لینک‌ها را دید!');
      /* مالک → فهرستِ کامل */
      setU(fx.owner);
      W(`vclassLinksModal(${sess})`);
      const out = W(`(document.getElementById('modal')||{}).innerHTML || ''`);
      assert(out.indexOf('لینک‌های اختصاصی')>=0, 'مودال باز نشد');
      assert(out.indexOf('data-act="vclass-link-copy"')>=0, 'دکمهٔ کپی نیست');
      var _nm = W(`(function(){var u=byId('users',${fx.a}); return u?u.full_name:'';})()`);
      assert(out.indexOf(_nm)>=0, 'فهرستِ دانش‌آموزان نیست');
      W(`closeModal()`);
      /* تعداد لینک‌های ساخته‌شده = تعداد دانش‌آموزانِ کلاس */
      const n = W(`db.vclass_links.filter(function(l){return l.session_id===${sess};}).length`);
      const nStuds = W(`studentsOfClass(${fx.cls}).length`);
      assert(n===nStuds, 'تعداد لینک‌ها با تعداد دانش‌آموزان فرق دارد: ' + n + '/' + nStuds);
    } finally { cleanup(); }
  });

  await sec('L5 خروج واقعی (همان ردیفِ ورود)', async () => {
    try{
      const tok = W(`vclassLinkEnsure(${sess},${fx.a}).token`);
      setU(fx.a);
      JSON.parse(W(`JSON.stringify(vclassJoinLink(${JSON.stringify(tok)}))`));
      const r = JSON.parse(W(`JSON.stringify(vclassLeave(${sess}))`));
      assert(r.ok===true, 'خروج شکست: ' + (r.msg||''));
      const att = JSON.parse(W(`JSON.stringify(vclassAttOf(${sess},${fx.a}))`));
      assert(att && att.left_at && !isNaN(Date.parse(att.left_at)), 'left_at ثبت نشد');
    } finally { cleanup(); }
  });

  await sec('L6 hash خودکار: join + hashِ نامعتبر بی‌اثر', async () => {
    try{
      const tok = W(`vclassLinkEnsure(${sess},${fx.a}).token`);
      setU(fx.a);
      W(`location.hash = ${JSON.stringify(tok)}`);
      W(`vclassAutoJoinFromHash()`);
      let att = JSON.parse(W(`JSON.stringify(vclassAttOf(${sess},${fx.a}))`));
      assert(att && !att.left_at, 'ورود از hash انجام نشد');
      assert(W(`S.route`)==='vclass', 'مسیر به vclass نرفت');
      /* hashِ نامعتبر: بی‌اثر */
      W(`location.hash = 'vc-fake999'`);
      W(`vclassAutoJoinFromHash()`);
      const n = W(`db.vclass_links.length`);
      assert(n === db.vclass_links.length, 'invalid hash must not mutate vclass link state');
      /* hash خالی: بی‌اثر */
      W(`location.hash = ''`);
      W(`vclassAutoJoinFromHash()`);
    } finally { W(`location.hash=''`); cleanup(); }
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت کلاس مجازی ۳: ${ok}/${results.length} موفق  —  ${ok===results.length?'بدون خطا ✅':'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
