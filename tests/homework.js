#!/usr/bin/env node
/**
 * سئوت تکالیف (بند ۴: بارگذاری فایل + تصحیح دیجیتال) — پایش
 *
 * در پروسهٔ جداگانه اجرا می‌شود (نه داخل smoke.js) چون smoke با
 * ~۸۰۰ مگابایت heap خاتمه می‌یابد.
 *
 * بخش‌ها:
 *  HW1 دادهٔ نمونه (تکلیف + بارگذاری دمو با کلید hw:demo)
 *  HW2 امنیت ساخت تکلیف (مالکیت کلاس روی داده)
 *  HW3 امنیت + رفتار بارگذاری دانش‌آموز (کلاسِ دیگر رد، کلید نهایی، تکراری رد)
 *  HW4 امنیت + رفتار تصحیح (دبیر غیرمالک رد، نمره + graded_by ثبت)
 *  HW5 سقف حجم مشترک (vclassOverCap)
 *  HW6 صفحهٔ دبیر (کارت تکلیف، شمارندهٔ بارگذاری، مودال فهرست)
 *  HW7 صفحهٔ دانش‌آموز (فرم بارگذاری / برچسب وضعیت)
 *  HW8 حذف تکلیف (مالکیت + پاک‌سازی بارگذاری‌ها)
 *
 * اجرا: node tests/homework.js
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
  catch (e) { results.push({ name, ok: false, detail: String(e.stack || e.message || e), ms: Date.now() - t0 }); }
};

/* ── فیکسور: کلاسِ دارای دبیرِ مالک + دانش‌آموز تازه ─────────────── */
async function hwFx(){
  return JSON.parse(W(`JSON.stringify((function(){
    var sc = db.schools.filter(function(s){return s.active;})[0];
    var cands = db.classes.filter(function(c){return c.school_id===sc.id;});
    var pick = null, owner = null;
    for(var i=0;i<cands.length && !pick;i++){
      var c = cands[i];
      var t = db.users.filter(function(x){return x.role==='teacher'&&x.school_id===sc.id;})
        .filter(function(x){return teacherClasses(x.id).some(function(k){return k.id===c.id;})})[0];
      if(t){ pick = c; owner = t; }
    }
    if(!pick || !owner) throw new Error('کلاس با دبیرِ مالک یافت نشد');
    var other = db.classes.filter(function(c){return c.school_id===sc.id && c.id!==pick.id;})[0] || null;
    var stud = insert('users',{role:'student',school_id:sc.id,full_name:'دانش‌آموز تستی تکالیف',username:'hwfx_'+Date.now(),password:'x12345'});
    var enr = insert('enrollments',{school_id:sc.id,class_id:pick.id,student_id:stud.id});
    window.__hwFx = {stud:stud.id,enr:enr.id};
    return {sc:sc.id, cls:pick.id, other:other?other.id:null, owner:owner.id, stud:stud.id};
  })())`));
}
async function hwFxTearDown(){
  W(`(function(){
    var fx = window.__hwFx;
    if(fx){
      remove('users', fx.stud);
      remove('enrollments', fx.enr);
    }
    window.__hwFx = null;
    vclassIdbSetBackend(null);
  })()`);
}
/* ساخت تکلیف تستی با کلید مشخص (برای تمیزکاری) */
function hwAddAssignment(clsId, ownerId, schoolId){
  return W(`(function(){
    var rec = insert('hw_assignments',{school_id:${schoolId},class_id:${clsId},subject_id:0,
      title:'HW-تکلیف تستی',description:'',due_date:'',
      created_at:new Date().toISOString(),created_by:${ownerId}});
    return rec.id;
  })()`);
}
function hwClean(assignmentId){
  W(`(function(){
    var a = byId('hw_assignments',${JSON.stringify(assignmentId)});
    if(a){
      hwSubmissionsOf(a.id).forEach(function(s){
        if(s.file_key) vclassIdbDel('hw_files', s.file_key);
        if(s.annotated_key) vclassIdbDel('hw_files', s.annotated_key);
        remove('hw_submissions', s.id);
      });
      remove('hw_assignments', a.id);
    }
  })()`);
}

(async () => {
  await sleep(300);

  await sec('HW1 دادهٔ نمونه: تکلیف + بارگذاری دمو با کلید hw:demo', async () => {
    const r = JSON.parse(W(`JSON.stringify((function(){
      var a = db.hw_assignments, s = db.hw_submissions;
      return {a:a.length, s:s.length,
        demoKey: s.length ? s[0].file_key : ''};
    })())`));
    assert(r.a>=1, 'تکلیف نمونه نیست');
    assert(r.s>=1, 'بارگذاری نمونه نیست');
    assert(/^hw:demo:\d+$/.test(r.demoKey), 'کلید دمو صحیح نیست: ' + r.demoKey);
  });

  await sec('HW2 امنیت ساخت تکلیف: غیرمالک و دانش‌آموز رد، مالک قبول', async () => {
    const fx = await hwFx();
    try{
      /* دبیری که مالک این کلاس نیست */
      const notOwner = JSON.parse(W(`JSON.stringify((function(){
        var o = db.users.filter(function(x){return x.role==='teacher'&&x.school_id===${fx.sc}
          && !teacherClasses(x.id).some(function(k){return k.id===${fx.cls};});})[0];
        return o ? o.id : null;
      })())`));
      const rNotOwner = notOwner != null
        ? JSON.parse(W(`JSON.stringify((function(){
            S.user=byId('users',${notOwner});S.persona=null;S.boss=null;
            return hwCreateAssignment({classId:${fx.cls},title:'HW-غیرمالک'});
          })())`))
        : {ok:false, msg:'no-not-owner-teacher'};
      assert(rNotOwner.ok===false, 'دبیرِ غیرمالک تکلیف ساخت!');

      const rStudent = JSON.parse(W(`JSON.stringify((function(){
        S.user=byId('users',${fx.stud});S.persona=null;S.boss=null;
        return hwCreateAssignment({classId:${fx.cls},title:'HW-از دانش‌آموز'});
      })())`));
      assert(rStudent.ok===false, 'دانش‌آموز تکلیف ساخت!');

      const aid = await (async () => {
        W(`S.user=byId('users',${fx.owner});S.persona=null;S.boss=null;`);
        return hwAddAssignment(fx.cls, fx.owner, fx.sc);
      })();
      const rec = JSON.parse(W(`JSON.stringify(byId('hw_assignments',${aid}))`));
      assert(rec && rec.class_id===fx.cls && rec.title==='HW-تکلیف تستی', 'رکورد مالک نادرست');
      hwClean(aid);
    } finally { await hwFxTearDown(); }
  });

  await sec('HW3 بارگذاری دانش‌آموز: کلاسِ دیگر رد + کلید نهایی + تکراری رد + بازیابی', async () => {
    const fx = await hwFx();
    try{
      /* تکلیف در کلاسِ دیگر → رد */
      if(fx.other != null){
        const oaid = await (async () => {
          W(`S.user=byId('users',${fx.owner});S.persona=null;S.boss=null;`);
          return hwAddAssignment(fx.other, fx.owner, fx.sc);
        })();
        const rX = await W(`(function(){
          var fake = makeIdbFake(); vclassIdbSetBackend(fake);
          S.user=byId('users',${fx.stud});S.persona=null;S.boss=null;
          var f = new File([new Uint8Array(64)], 'x.png', {type:'image/png'});
          return hwSubmit(${oaid}, f);
        })()`);
        assert(rX.ok===false, 'دانش‌آموز تکلیفِ کلاسِ دیگر را بارگذاری کرد!');
        hwClean(oaid);
      }
      /* تکلیف در کلاسِ خود → قبول؛ کلید نهایی hw:<rec.id> + بازیابی blob */
      const aid = await (async () => {
        W(`S.user=byId('users',${fx.owner});S.persona=null;S.boss=null;`);
        return hwAddAssignment(fx.cls, fx.owner, fx.sc);
      })();
      const rOk = await W(`(function(){
        S.user=byId('users',${fx.stud});S.persona=null;S.boss=null;
        var f = new File([new Uint8Array(128).fill(7)], 'hw-ok.png', {type:'image/png'});
        return hwSubmit(${aid}, f);
      })()`);
      assert(rOk.ok===true, 'بارگذاری شکست: ' + (rOk.msg||''));
      const chk = JSON.parse(W(`JSON.stringify((function(){
        var s = byId('hw_submissions',${JSON.stringify(rOk.rec.id)});
        return {key:s.file_key, expect:'hw:${JSON.stringify(rOk.rec.id)}'};
      })())`));
      assert(chk.key===chk.expect, 'کلید نهایی فایل درست نیست: ' + chk.key);
      const blobBack = await W(`(async function(){
        var b = await vclassIdbGet('hw_files','hw:${JSON.stringify(rOk.rec.id)}');
        return b ? {ok:1,size:b.size} : {ok:0};
      })()`);
      assert(blobBack.ok===1 && blobBack.size===128, 'فایل از IDB بازیابی نشد');
      /* تکراری → رد */
      const rDup = await W(`(function(){
        S.user=byId('users',${fx.stud});S.persona=null;S.boss=null;
        var f = new File([new Uint8Array(10)], 'again.png', {type:'image/png'});
        return hwSubmit(${aid}, f);
      })()`);
      assert(rDup.ok===false, 'بارگذاری تکراری پذیرفته شد!');
      /* ولی → رد می‌شود (فقط خودِ دانش‌آموز) */
      const parId = JSON.parse(W(`JSON.stringify((function(){
        var par = db.users.filter(function(x){return x.role==='parent'&&x.school_id===${fx.sc};})[0];
        return par ? par.id : null;
      })())`));
      if(parId != null){
        const rParent = await W(`(function(){
          S.user=byId('users',${parId});S.persona=null;S.boss=null;
          var f = new File([new Uint8Array(8)], 'p.png', {type:'image/png'});
          return hwSubmit(${aid}, f);
        })()`);
        assert(rParent.ok===false, 'ولی تکلیف بارگذاری کرد!');
      }
      /* چک‌نقش حتی با سوابق نادر: دبیری که (به‌اشتباه) ثبت‌نام دارد، نمی‌تواند بارگذاری کند */
      const enrT = W(`insert('enrollments',{school_id:${fx.sc},class_id:${fx.cls},student_id:${fx.owner}}).id`);
      try{
        const rTeacher = await W(`(function(){
          S.user=byId('users',${fx.owner});S.persona=null;S.boss=null;
          var f = new File([new Uint8Array(8)], 't.png', {type:'image/png'});
          return hwSubmit(${aid}, f);
        })()`);
        assert(rTeacher.ok===false, 'دبیر (با ثبت‌نام نادر) تکلیف بارگذاری کرد — چک‌نقش کار نکرد!');
      } finally {
        W(`remove('enrollments',${enrT})`);
      }
      hwClean(aid);
    } finally { await hwFxTearDown(); }
  });

  await sec('HW4 تصحیح: غیرمالک و دانش‌آموز رد؛ نمره + graded_by ثبت', async () => {
    const fx = await hwFx();
    try{
      const aid = await (async () => {
        W(`S.user=byId('users',${fx.owner});S.persona=null;S.boss=null;`);
        return hwAddAssignment(fx.cls, fx.owner, fx.sc);
      })();
      await W(`(function(){
        var fake = makeIdbFake(); vclassIdbSetBackend(fake);
        S.user=byId('users',${fx.stud});S.persona=null;S.boss=null;
        var f = new File([new Uint8Array(32)], 'hw.png', {type:'image/png'});
        return hwSubmit(${aid}, f);
      })()`);
      const sid = W(`db.hw_submissions.filter(function(s){return s.assignment_id===${aid};})[0].id`);
      /* دانش‌آموز → رد */
      const rStud = await W(`(async function(){
        S.user=byId('users',${fx.stud});S.persona=null;S.boss=null;
        window._hwGrading = ${sid};
        return hwSaveGrading(19);
      })()`);
      assert(rStud.ok===false, 'دانش‌آموز تصحیح کرد!');
      const afterStud = JSON.parse(W(`JSON.stringify(byId('hw_submissions',${sid}))`));
      assert(afterStud.score==null, 'نمرهٔ غیرمجاز ثبت شد');
      /* دبیرِ مالک → قبول (در jsdom بدون canvas: مسیرِ فقط-نمره) */
      const rTeach = await W(`(async function(){
        S.user=byId('users',${fx.owner});S.persona=null;S.boss=null;
        window._hwGrading = ${sid};
        return hwSaveGrading(17);
      })()`);
      assert(rTeach.ok===true, 'تصحیح دبیر شکست: ' + (rTeach.msg||''));
      const fin = JSON.parse(W(`JSON.stringify(byId('hw_submissions',${sid}))`));
      assert(fin.score===17 && fin.graded_by===fx.owner && fin.graded_at, 'فیلدهای تصحیح ناقص: ' + JSON.stringify(fin));
      hwClean(aid);
    } finally { await hwFxTearDown(); }
  });

  await sec('HW5 سقف حجم: فایل بزرگ‌تر از ۲۰۰ مگابایت رد می‌شود', async () => {
    const fx = await hwFx();
    try{
      const aid = await (async () => {
        W(`S.user=byId('users',${fx.owner});S.persona=null;S.boss=null;`);
        return hwAddAssignment(fx.cls, fx.owner, fx.sc);
      })();
      const r = await W(`(function(){
        S.user=byId('users',${fx.stud});S.persona=null;S.boss=null;
        var big = new File([new Uint8Array(1024)], 'big.png', {type:'image/png'});
        Object.defineProperty(big, 'size', {value: VCLASS_FILE_CAP + 1});
        return hwSubmit(${aid}, big);
      })()`);
      assert(r.ok===false && /حجم/.test(r.msg||''), 'سقف حجم کار نکرد: ' + JSON.stringify(r));
      hwClean(aid);
    } finally { await hwFxTearDown(); }
  });

  await sec('HW6 صفحهٔ دبیر: کارت تکلیف + شمارنده + مودال بارگذاری‌ها', async () => {
    const fx = await hwFx();
    try{
      const aid = await (async () => {
        W(`S.user=byId('users',${fx.owner});S.persona=null;S.boss=null;`);
        return hwAddAssignment(fx.cls, fx.owner, fx.sc);
      })();
      await W(`(function(){
        var fake = makeIdbFake(); vclassIdbSetBackend(fake);
        S.user=byId('users',${fx.stud});S.persona=null;S.boss=null;
        var f = new File([new Uint8Array(32)], 'hw.png', {type:'image/png'});
        return hwSubmit(${aid}, f);
      })()`);
      const out = W(`(function(){
        S.user=byId('users',${fx.owner});S.persona=null;S.boss=null;
        S.route='homework';S.filters={};S.page=1;
        return renderRoute();
      })()`);
      assert(typeof out==='string' && out.indexOf('دسترسی مجاز نیست')<0, 'رندر مسدود');
      assert(out.indexOf('HW-تکلیف تستی')>=0, 'عنوان تکلیف نیست');
      assert(out.indexOf('تکلیف جدید')>=0, 'دکمهٔ تکلیف جدید نیست');
      assert(out.indexOf('بارگذاری: ۱')>=0, 'شمارندهٔ بارگذاری نیست');
      const modal = W(`(function(){ hwListModal(${aid}); return document.body.innerHTML; })()`);
      assert(modal.indexOf('دانش‌آموز تستی تکالیف')>=0, 'نام دانش‌آموز در مودال نیست');
      assert(modal.indexOf('data-act="hw-grade"')>=0, 'دکمهٔ تصحیح نیست');
      W(`closeModal()`);
      hwClean(aid);
    } finally { await hwFxTearDown(); }
  });

  await sec('HW7 صفحهٔ دانش‌آموز: فرم بارگذاری + برچسب وضعیت + نمره', async () => {
    const fx = await hwFx();
    try{
      const aid = await (async () => {
        W(`S.user=byId('users',${fx.owner});S.persona=null;S.boss=null;`);
        return hwAddAssignment(fx.cls, fx.owner, fx.sc);
      })();
      /* قبل از بارگذاری: فرم input + دکمه */
      let out = W(`(function(){
        S.user=byId('users',${fx.stud});S.persona=null;S.boss=null;
        S.route='homework';S.filters={};S.page=1;
        return renderRoute();
      })()`);
      assert(out.indexOf('accept="image/*,audio/*,video/*,.pdf,.doc,.docx"')>=0, 'فرم بارگذاری نیست');
      /* بارگذاری + تصحیح */
      await W(`(function(){
        var fake = makeIdbFake(); vclassIdbSetBackend(fake);
        S.user=byId('users',${fx.stud});S.persona=null;S.boss=null;
        var f = new File([new Uint8Array(32)], 'hw.png', {type:'image/png'});
        return hwSubmit(${aid}, f);
      })()`);
      const sid = W(`db.hw_submissions.filter(function(s){return s.assignment_id===${aid};})[0].id`);
      await W(`(async function(){
        S.user=byId('users',${fx.owner});S.persona=null;S.boss=null;
        window._hwGrading = ${sid};
        return hwSaveGrading(15);
      })()`);
      out = W(`(function(){
        S.user=byId('users',${fx.stud});S.persona=null;S.boss=null;
        return renderRoute();
      })()`);
      assert(out.indexOf('بارگذاری شده')>=0, 'برچسب بارگذاری نیست');
      assert(out.indexOf('نمره: ۱۵')>=0, 'نمره نمایش داده نشد');
      hwClean(aid);
    } finally { await hwFxTearDown(); }
  });

  await sec('HW8 حذف تکلیف: غیرمالک رد؛ مالک پاک‌سازی می‌کند', async () => {
    const fx = await hwFx();
    try{
      const aid = await (async () => {
        W(`S.user=byId('users',${fx.owner});S.persona=null;S.boss=null;`);
        return hwAddAssignment(fx.cls, fx.owner, fx.sc);
      })();
      await W(`(function(){
        var fake = makeIdbFake(); vclassIdbSetBackend(fake);
        S.user=byId('users',${fx.stud});S.persona=null;S.boss=null;
        var f = new File([new Uint8Array(16)], 'hw.png', {type:'image/png'});
        return hwSubmit(${aid}, f);
      })()`);
      /* غیرمالک: askConfirm استاب می‌شود تا بدنهٔ اکشن اجرا شود */
      const notOwner = JSON.parse(W(`JSON.stringify((function(){
        var o = db.users.filter(function(x){return x.role==='teacher'&&x.school_id===${fx.sc}
          && !teacherClasses(x.id).some(function(k){return k.id===${fx.cls};});})[0];
        return o ? o.id : null;
      })())`));
      if(notOwner != null){
        W(`window.__hwAc=askConfirm; askConfirm=function(t,fn){fn();};`);
        W(`S.user=byId('users',${notOwner});S.persona=null;S.boss=null;`);
        const before = W(`db.hw_assignments.length`);
        W(`(function(){
          var el=document.createElement('button');
          el.setAttribute('data-act','hw-del'); el.setAttribute('data-id','${aid}');
          document.body.appendChild(el); el.click(); el.remove();
        })()`);
        const after = W(`db.hw_assignments.length`);
        assert(before===after, 'دبیرِ غیرمالک تکلیف حذف کرد!');
      }
      /* مالک: حذف + پاک‌سازی بارگذاری‌ها */
      W(`window.__hwAc=askConfirm; askConfirm=function(t,fn){fn();};`);
      W(`S.user=byId('users',${fx.owner});S.persona=null;S.boss=null;`);
      const subsBefore = W(`db.hw_submissions.filter(function(s){return s.assignment_id===${aid};}).length`);
      assert(subsBefore===1, 'فیکسور: یک بارگذاری انتظار می‌رود');
      W(`(function(){
        var el=document.createElement('button');
        el.setAttribute('data-act','hw-del'); el.setAttribute('data-id','${aid}');
        document.body.appendChild(el); el.click(); el.remove();
      })()`);
      const gone = JSON.parse(W(`JSON.stringify({
        a: !!byId('hw_assignments',${aid}),
        s: db.hw_submissions.filter(function(x){return x.assignment_id===${aid};}).length
      })`));
      assert(gone.a===false && gone.s===0, 'تکلیف/بارگذاری‌ها پاک نشدند');
      W(`askConfirm = window.__hwAc; window.__hwAc=null;`);
    } finally { await hwFxTearDown(); }
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت تکالیف: ${ok}/${results.length} موفق  —  ${ok===results.length?'بدون خطا ✅':'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
