#!/usr/bin/env node
/**
 * سئوت کلاس مجازی (نسخهٔ سبک) — پایش
 *
 * این سئوت در پروسهٔ جداگانه‌ای اجرا می‌شود (نه داخل smoke.js) چون smoke
 * با ~۸۰۰ مگابایت heap خاتمه می‌یابد و فیکسورهای این سئوت در همان
 * پروسه جا نمی‌گیرند.
 *
 * فیکسور: دانش‌آموز/ولی تازه + کلاسی که دبیرِ مالکش موجود است + یک نشست
 * برچسب‌خوردهٔ VC- — هر بخش فیکسور می‌سازد و در finally تخریب می‌کند،
 * بنابراین به وضعیت دمو وابسته نیست.
 *
 * اجرا: node tests/vclass.js
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

/* ── فیکسور ────────────────────────────────────────────────────── */

async function vcFx(){
  return JSON.parse(W(`JSON.stringify((function(){
    var sc = db.schools.filter(function(s){return s.active;})[0];
    var cands = db.classes.filter(function(c){return c.school_id===sc.id;});
    var pick = null, owner = null;
    for(var pass=0; pass<2 && !pick; pass++){
      for(var i=0;i<cands.length;i++){
        var c = cands[i];
        var hasSess = db.vclass_sessions.some(function(s){return s.class_id===c.id;});
        var t = db.users.filter(function(x){return x.role==='teacher'&&x.school_id===sc.id;})
          .filter(function(x){return teacherClasses(x.id).some(function(k){return k.id===c.id;});})[0];
        if(pass===0 ? (hasSess && t) : (hasSess || t)){ pick = c; owner = t; break; }
      }
    }
    if(!pick || !owner) throw new Error('کلاس/دبیر واجد شرایط یافت نشد');
    var stud = insert('users',{role:'student',school_id:sc.id,full_name:'دانش‌آموز تستی کلاس مجازی',username:'vcfx_'+Date.now(),password:'x12345'});
    var enr = insert('enrollments',{school_id:sc.id,class_id:pick.id,student_id:stud.id});
    var par = insert('users',{role:'parent',school_id:sc.id,full_name:'ولی تستی کلاس مجازی',username:'vcpf_'+Date.now(),password:'x12345'});
    var lnk = insert('parent_links',{parent_id:par.id,student_id:stud.id,relation:'پدر'});
    var sess = insert('vclass_sessions',{school_id:sc.id,class_id:pick.id,type:'shad',
      title:'VC-جلسهٔ نمونه',shad_url:'https://shad.ir/vcfx',shad_time:'',file_key:'',file_name:'',mime:'',size:0,
      description:'',created_at:new Date().toISOString(),created_by:owner.id});
    window.__vcFx = {stud:stud.id,enr:enr.id,par:par.id,lnk:lnk.id,sess:sess.id};
    return {sc:sc.id, cls:pick.id, sess:sess.id, teacher:owner.id, stud:stud.id, parent:par.id};
  })())`));
}
async function vcFxTearDown(){
  W(`(function(){
    var fx = window.__vcFx;
    if(fx){
      db.vclass_questions.slice().forEach(function(q){
        if(q.session_id===fx.sess) remove('vclass_questions', q.id);
      });
      var s = byId('vclass_sessions', fx.sess);
      if(s){ if(s.file_key) vclassIdbDel('vclass_files', s.file_key); remove('vclass_sessions', s.id); }
      remove('parent_links', fx.lnk);
      remove('users', fx.stud);
      remove('users', fx.par);
      remove('enrollments', fx.enr);
    }
    window.__vcFx = null;
    window.__vcFake = null;
    vclassIdbSetBackend(null);
  })()`);
}
/* کلیک دکمهٔ data-act (الگوی مشترک سئوت‌ها) */
function clickAct(act, id){
  W(`(function(){
    var el=document.createElement('button');
    el.setAttribute('data-act','${act}');
    if(${JSON.stringify(id)}!=null) el.setAttribute('data-id','${id}');
    document.body.appendChild(el);el.click();el.remove();
  })()`);
}

(async () => {
  await sleep(300);

  await sec('V1 دادهٔ نمونه: نشست شاد + ویدیو + سؤال هست', async () => {
    const r = JSON.parse(W(`JSON.stringify((function(){
      var ss = db.vclass_sessions;
      return {n:ss.length,
        shad:ss.filter(function(s){return s.type==='shad';}).length,
        video:ss.filter(function(s){return s.type==='video';}).length,
        q:db.vclass_questions.length};
    })())`));
    assert(r.n>=2 && r.shad>=1 && r.video>=1 && r.q>=1, 'دادهٔ نمونه ناقص: ' + JSON.stringify(r));
  });

  await sec('V2 صفحهٔ دبیر: کلاس، نشست‌ها و دکمهٔ نشست جدید', async () => {
    const fx = await vcFx();
    try{
      const out = W(`(function(){S.user=byId('users',${fx.teacher});S.persona=null;S.boss=null;S.route='vclass';S.filters={};S.page=1;return renderRoute();})()`);
      assert(typeof out==='string' && out.length>200 && out.indexOf('دسترسی مجاز نیست')<0, 'رندر مسدود یا خالی');
      assert(out.includes('نشست جدید'), 'دکمهٔ نشست جدید نیست');
      assert(out.includes('VC-جلسهٔ نمونه'), 'نشست فیکسور در صفحهٔ دبیر نیست');
    } finally { await vcFxTearDown(); }
  });

  await sec('V3 ساخت نشست شاد: رکورد + پیامک event در صف', async () => {
    const fx = await vcFx();
    const saved = JSON.parse(W(`JSON.stringify(notifySettings(${fx.sc}))`));
    try{
      const res = await W(`(function(){
        notifySaveSettings(${fx.sc},{enabled:true,kinds:{event:true}});
        S.user=byId('users',${fx.teacher});S.persona=null;S.boss=null;
        return vclassCreateSession({classId:${fx.cls},type:'shad',title:'VC-تست نشست',url:'https://shad.ir/t',time:''},null);
      })()`);
      assert(res.ok===true, 'ساخت نشست شکست: ' + (res.msg||''));
      const n = W(`db.notify_queue.filter(function(x){
        return x.kind==='event'&&typeof x.body==='string'&&x.body.indexOf('VC-تست نشست')>=0;
      }).length`);
      assert(n>=1, 'پیامک event در صف نیست');
    } finally {
      W(`notifySaveSettings(${fx.sc},${JSON.stringify(saved)})`);
      await vcFxTearDown();
    }
  });

  await sec('V4 آپلود فایل در IDB (backend تستی) + بازیابی', async () => {
    const fx = await vcFx();
    const res = await W(`(function(){
      var fake = makeIdbFake();
      vclassIdbSetBackend(fake);
      window.__vcFake = fake;
      S.user=byId('users',${fx.teacher});S.persona=null;S.boss=null;
      var f = new File([new Uint8Array(1024).fill(3)], 't.mp4', {type:'video/mp4'});
      return vclassCreateSession({classId:${fx.cls},type:'video',title:'VC-تست ویدیو',desc:''},f);
    })()`);
    try{
      assert(res.ok===true, 'ساخت نشست ویدیویی شکست: ' + (res.msg||''));
      assert(res.rec && res.rec.file_key, 'file_key ثبت نشده');
      const got = await W(`vclassIdbGet('vclass_files',${JSON.stringify(res.rec.file_key)})`);
      assert(got && got.size===1024, 'فایل از IDB برنگشت یا اندازهٔ نادرست');
      const sz = W(`window.__vcFake.__stores.get('vclass_files').size`);
      assert(sz===1, 'فروشگاه باید فقط یک فایل داشته باشد: ' + sz);
    } finally { await vcFxTearDown(); }
  });

  await sec('V5 سقف نرم: تابع خالص + رد فایل بزرگ', async () => {
    const cap = JSON.parse(W(`JSON.stringify([vclassOverCap(${200*1048576}),vclassOverCap(${200*1048576-1}),vclassOverCap(null)])`));
    assert(cap[0]===true && cap[1]===false && cap[2]===true, 'رفتار vclassOverCap نادرست: ' + JSON.stringify(cap));
    const fx = await vcFx();
    try{
      const res = await W(`(function(){
        S.user=byId('users',${fx.teacher});S.persona=null;S.boss=null;
        return vclassCreateSession({classId:${fx.cls},type:'video',title:'VC-بزرگ'},
          {size:${200*1048576+1},name:'big.mp4',type:'video/mp4'});
      })()`);
      assert(res.ok===false, 'فایل بزرگ‌تر از سقف پذیرفته شد');
      const left = W(`db.vclass_sessions.filter(function(s){return s.title==='VC-بزرگ';}).length`);
      assert(left===0, 'رکورد نشست بزرگ مانده است');
    } finally { await vcFxTearDown(); }
  });

  await sec('V6 تب دانش‌آموز در پرونده: نشست + دکمهٔ سؤال', async () => {
    const fx = await vcFx();
    try{
      const out = W(`(function(){S.user=byId('users',${fx.stud});S.persona=null;S.boss=null;S.route='record';S.tab='vclass';S.child=null;S.filters={};S.page=1;return renderRoute();})()`);
      assert(out.includes('VC-جلسهٔ نمونه'), 'نشست فیکسور در تب دانش‌آموز نیست');
      assert(out.includes('سؤال بپرس'), 'دکمهٔ سؤال نیست');
    } finally { await vcFxTearDown(); }
  });

  await sec('V7 تب ولی فقط‌خوان است (بدون دکمهٔ سؤال)', async () => {
    const fx = await vcFx();
    try{
      const out = W(`(function(){S.user=byId('users',${fx.parent});S.persona=null;S.boss=null;S.route='record';S.tab='vclass';S.child=${fx.stud};S.filters={};S.page=1;return renderRoute();})()`);
      assert(out.includes('VC-جلسهٔ نمونه'), 'نشست برای ولی نمایش داده نشد');
      assert(out.indexOf('سؤال بپرس')<0, 'ولی نباید دکمهٔ سؤال داشته باشد');
    } finally { W(`S.tab='grades';S.child=null`); await vcFxTearDown(); }
  });

  await sec('V8 دانش‌آموز از مودال سؤال می‌پرسد و ثبت می‌شود', async () => {
    const fx = await vcFx();
    try{
      const before = W(`db.vclass_questions.length`);
      W(`S.user=byId('users',${fx.stud});S.persona=null;S.boss=null`);
      clickAct('vclass-q-ask', fx.sess);
      assert(W(`!!document.getElementById('vc_qbody')`), 'مودال سؤال باز نشد');
      W(`document.getElementById('vc_qbody').value='سؤال تستی VC'`);
      W(`(function(){var el=document.querySelector('#modal [data-act="vclass-q-save"]');if(el)el.click();})()`);
      const n = W(`db.vclass_questions.filter(function(x){
        return x.session_id===${fx.sess}&&x.student_id===${fx.stud}&&x.body==='سؤال تستی VC';
      }).length`);
      assert(n===1 && W(`db.vclass_questions.length`)===before+1, 'سؤال ثبت نشد یا تکراری شد');
    } finally { await vcFxTearDown(); }
  });

  await sec('V9 🔴 امنیت: دانش‌آموزِ کلاس دیگر نمی‌تواند سؤال بپرسد', async () => {
    const fx = await vcFx();
    try{
      const stud2 = JSON.parse(W(`JSON.stringify((function(){
        var c2 = db.classes.filter(function(c){return c.school_id===${fx.sc}&&c.id!==${fx.cls};})[0];
        if(!c2) return null;
        var s2 = insert('users',{role:'student',school_id:${fx.sc},full_name:'دانش‌آموز خارج VC',username:'vcout_'+Date.now(),password:'x12345'});
        var e2 = insert('enrollments',{school_id:${fx.sc},class_id:c2.id,student_id:s2.id});
        window.__vcStud2 = {stud:s2.id,enr:e2.id};
        return {stud:s2.id,enr:e2.id,cls:c2.id};
      })())`));
      if(!stud2) return;
      const before = W(`db.vclass_questions.length`);
      W(`S.user=byId('users',${stud2.stud});S.persona=null;S.boss=null`);
      clickAct('vclass-q-ask', fx.sess);
      W(`document.getElementById('vc_qbody').value='سؤال غیرمجاز VC'`);
      W(`(function(){var el=document.querySelector('#modal [data-act="vclass-q-save"]');if(el)el.click();})()`);
      const after = W(`db.vclass_questions.length`);
      assert(after===before, 'دانش‌آموز خارج کلاس توانست سؤال ثبت کند!');
      W(`(function(){var o=window.__vcStud2;if(o){remove('enrollments',o.enr);remove('users',o.stud);}window.__vcStud2=null;})()`);
    } finally { W(`S.route='dashboard'`); await vcFxTearDown(); }
  });

  await sec('V10 🔴 امنیت: دبیرِ غیرمالک نمی‌تواند بسازد یا حذف کند', async () => {
    const fx = await vcFx();
    try{
      const outsider = JSON.parse(W(`JSON.stringify((function(){
        var mine = teacherClasses(${fx.teacher}).map(function(c){return c.id;});
        var t2 = db.users.filter(function(x){
          return x.role==='teacher'&&x.id!==${fx.teacher}&&
            teacherClasses(x.id).every(function(c){return mine.indexOf(c.id)<0;});
        })[0];
        return t2?t2.id:null;
      })())`));
      if(outsider===null) return;
      const r1 = await W(`(function(){
        S.user=byId('users',${outsider});S.persona=null;S.boss=null;
        return vclassCreateSession({classId:${fx.cls},type:'shad',title:'VC-حمله',url:''},null);
      })()`);
      assert(r1.ok===false, 'دبیر غیرمالک نشست ساخت!');
      W(`S.user=byId('users',${outsider});S.persona=null;S.boss=null`);
      clickAct('vclass-del', fx.sess);
      W(`(function(){var ok=document.querySelector('#modal [data-act="ask-ok"]');if(ok)ok.click();})()`);
      assert(W(`!!byId('vclass_sessions',${fx.sess})`)===true, 'دبیر غیرمالک نشست را حذف کرد!');
    } finally { await vcFxTearDown(); }
  });

  await sec('V11 حذف نشست، فایل آن را هم از IDB پاک می‌کند', async () => {
    const fx = await vcFx();
    const res = await W(`(function(){
      var fake = makeIdbFake();
      vclassIdbSetBackend(fake);
      window.__vcFake = fake;
      S.user=byId('users',${fx.teacher});S.persona=null;S.boss=null;
      var f = new File([new Uint8Array(512).fill(9)], 'del.mp4', {type:'video/mp4'});
      return vclassCreateSession({classId:${fx.cls},type:'video',title:'VC-برای حذف',desc:''},f);
    })()`);
    try{
      assert(res.ok===true, 'نشست ساخته نشد');
      const fid = res.rec.id;
      clickAct('vclass-del', fid);
      W(`(function(){var ok=document.querySelector('#modal [data-act="ask-ok"]');if(ok)ok.click();})()`);
      assert(W(`!byId('vclass_sessions',${fid})`)===true, 'نشست حذف نشد');
      await sleep(30);   /* پاک‌کردن فایل در IDB ناهمگام است */
      const sz = W(`(window.__vcFake.__stores.get('vclass_files')||new Map()).size`);
      assert(sz===0, 'فایل از IDB پاک نشد: ' + sz);
    } finally { await vcFxTearDown(); }
  });

  /* ── خاتمه ─────────────────────────────────────────────────── */
  console.log('────────────────────────────────────────────────────────────');
  results.forEach((r) => {
    console.log('  ' + (r.ok ? '✅' : '❌') + ' ' + r.name + (r.ok ? '' : '\n     ' + r.detail));
  });
  const bad = results.filter((r) => !r.ok).length;
  console.log('────────────────────────────────────────────────────────────');
  console.log('  کلاس مجازی: ' + (results.length - bad) + '/' + results.length +
    (bad ? ' — ' + bad + ' قرمز 🔴' : ' سبز ✅'));
  process.exit(bad ? 1 : 0);
})();
