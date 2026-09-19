#!/usr/bin/env node
/**
 * سئوت تکالیف ۲ (بند ۱۲: تایمر/قفل + رسانه + مشاهده) — پایش
 *
 * در پروسهٔ جداگانه اجرا می‌شود (نه داخل smoke.js).
 *
 * بخش‌ها:
 *  H1 دادهٔ نمونه (بازه‌دار + صوتی باز + قفل‌شده)
 *  H2 منطق hwIsOpen: open / before / after / قفلِ مقدم + بدون فیلد = باز
 *  H3 hwSetWindow: مالکیت (دبیرِ کلاس/مدیر قبول، غیرمالک/دانش‌آموز رد) + اعتبارسنجی بازه
 *  H4 hwSubmit بسته: قفل/قبل/بعد هر سه رد؛ باز = قبول (کلید نهایی)
 *  H5 hwViewModal: دانش‌آموزِ دیگری رد، خودِ دانش‌آموز و دبیر قبول
 *
 * اجرا: node tests/homework2.js
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

/* ── فیکسور: کلاس با دبیرِ مالک + دو دانش‌آموزِ تازه ── */
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
    var otherT = db.users.filter(function(x){return x.role==='teacher'&&x.school_id===sc.id&&x.id!==owner.id
      && !teacherClasses(x.id).some(function(k){return k.id===pick.id;})})[0] || null;
    var mgr = db.users.filter(function(x){return x.role==='manager'&&x.school_id===sc.id;})[0] ||
              db.users.filter(function(x){return x.role==='manager';})[0] || null;
    var s1 = insert('users',{role:'student',school_id:sc.id,full_name:'تستی تکالیف ۲ الف',username:'hwx1_'+Date.now(),password:'x12345'});
    insert('enrollments',{school_id:sc.id,class_id:pick.id,student_id:s1.id});
    var s2 = insert('users',{role:'student',school_id:sc.id,full_name:'تستی تکالیف ۲ ب',username:'hwx2_'+Date.now(),password:'x12345'});
    insert('enrollments',{school_id:sc.id,class_id:pick.id,student_id:s2.id});
    return {sc:sc.id, cls:pick.id, owner:owner.id, otherT:otherT?otherT.id:0, mgr:mgr?mgr.id:0, s1:s1.id, s2:s2.id};
  })())`));
}

const setU = (id) => W(`S.user=byId('users',${id});S.persona=null;S.boss=null;S.child=null;`);
const mkFile = (name, type) => W(`new File([new Uint8Array(48)], ${JSON.stringify(name)}, {type:${JSON.stringify(type)}})`);

(async () => {
  await sleep(300);
  const fx = await hwFx();

  await sec('H1 دادهٔ نمونه: بازه‌دار + صوتی + قفل‌شده', async () => {
    const r = JSON.parse(W(`JSON.stringify((function(){
      var A = db.hw_assignments;
      var win = A.filter(function(a){return a.window_open && !a.locked;}).length;
      var audio = A.filter(function(a){return a.title.indexOf('صوتی')>=0;}).length;
      var locked = A.filter(function(a){return a.locked===true;}).length;
      return {win:win, audio:audio, locked:locked};
    })())`));
    assert(r.win>=1, 'تکلیفِ بازه‌دار نیست: ' + JSON.stringify(r));
    assert(r.audio>=1, 'تکلیف صوتی نیست: ' + JSON.stringify(r));
    assert(r.locked>=1, 'تکلیف قفل‌شده نیست: ' + JSON.stringify(r));
  });

  await sec('H2 hwIsOpen: open / before / after / قفل مقدم / بدون فیلد = باز', async () => {
    const r = JSON.parse(W(`JSON.stringify((function(){
      /* R92: زمانِ مرجعِ ثابت — تست هر ساعت از شبانه‌روز باید deterministic باشد (بمبِ زمانیِ UTC 23:00-23:59) */
      var ref = '2026-06-15T12:00:00.000Z';
      var day = ref.slice(0,11);
      return {
        open:  hwIsOpen({locked:false, window_open:day+'00:00', window_close:day+'23:00'}, ref),
        nofield: hwIsOpen({locked:false, window_open:'', window_close:''}, ref),
        before: hwIsOpen({locked:false, window_open:day+'23:00', window_close:''}, ref),
        after: hwIsOpen({locked:false, window_open:'', window_close:day+'00:00'}, ref),
        lockWins: hwIsOpen({locked:true, window_open:day+'00:00', window_close:day+'23:00'}, ref)
      };
    })())`));
    assert(r.open.open===true && r.open.reason==='open', 'بازهٔ باز درست نبود: ' + JSON.stringify(r.open));
    assert(r.nofield.open===true, 'تکلیفِ بدون فیلد باید باز باشد');
    assert(r.before.open===false && r.before.reason==='before', 'before درست نبود: ' + JSON.stringify(r.before));
    assert(r.after.open===false && r.after.reason==='after', 'after درست نبود: ' + JSON.stringify(r.after));
    assert(r.lockWins.open===false && r.lockWins.reason==='locked', 'قفلِ دستی باید مقدم باشد');
  });

  await sec('H3 hwSetWindow: مالکیت + اعتبارسنجی', async () => {
    const A1 = W(`insert('hw_assignments',{school_id:${fx.sc},class_id:${fx.cls},subject_id:0,title:'تکلیف تستی بازه',description:'',due_date:'',locked:false,window_open:'',window_close:'',created_at:new Date().toISOString(),created_by:${fx.owner}}).id`);
    try{
      setU(fx.owner);
      const okR = JSON.parse(W(`JSON.stringify(hwSetWindow(${A1}, false, '2026-09-05T08:00', '2026-09-05T12:00'))`));
      assert(okR.ok===true, 'دبیرِ مالک رد شد: ' + (okR.msg||''));
      assert(okR.rec.window_open==='2026-09-05T08:00' && okR.rec.window_close==='2026-09-05T12:00', 'بازه ثبت نشد: ' + JSON.stringify(okR.rec));
      const bad1 = JSON.parse(W(`JSON.stringify(hwSetWindow(${A1}, false, '2026-09-05T12:00', '2026-09-05T08:00'))`));
      assert(bad1.ok===false, 'پایانِ قبل از شروع پذیرفته شد!');
      const bad1b = JSON.parse(W(`JSON.stringify(hwSetWindow(${A1}, false, '2026-09-05T08:00', '2026-09-05T08:00'))`));
      assert(bad1b.ok===false, 'پایانِ مساویِ شروع پذیرفته شد!');
      const bad2 = JSON.parse(W(`JSON.stringify(hwSetWindow(${A1}, false, 'درست-نیست', ''))`));
      assert(bad2.ok===false, 'ساعتِ نامعتبر پذیرفته شد!');
      const lockR = JSON.parse(W(`JSON.stringify(hwSetWindow(${A1}, true, '2026-09-05T08:00', '2026-09-05T12:00'))`));
      assert(lockR.ok===true && lockR.rec.locked===true, 'قفل ثبت نشد');
      /* غیرمالک (دبیرِ کلاسِ دیگر) → رد */
      if(fx.otherT){
        setU(fx.otherT);
        const rT = JSON.parse(W(`JSON.stringify(hwSetWindow(${A1}, false, '', ''))`));
        assert(rT.ok===false, 'دبیرِ کلاسِ دیگر بازه را تغییر داد!');
      }
      /* دانش‌آموز → رد */
      setU(fx.s1);
      const rS = JSON.parse(W(`JSON.stringify(hwSetWindow(${A1}, false, '', ''))`));
      assert(rS.ok===false, 'دانش‌آموز بازه را تغییر داد!');
      /* مدیر → قبول */
      if(fx.mgr){
        setU(fx.mgr);
        const rM = JSON.parse(W(`JSON.stringify(hwSetWindow(${A1}, false, '2026-09-05T09:00', '2026-09-05T10:00'))`));
        assert(rM.ok===true, 'مدیر رد شد: ' + (rM.msg||''));
      }
    } finally {
      setU(fx.owner);
      W(`remove('hw_assignments',${A1})`);
    }
  });

  await sec('H4 hwSubmit بسته: قفل/قبل/بعد رد؛ باز = قبول', async () => {
    const A2 = W(`insert('hw_assignments',{school_id:${fx.sc},class_id:${fx.cls},subject_id:0,title:'تکلیف تستی ارسال',description:'',due_date:'',locked:false,window_open:'',window_close:'',created_at:new Date().toISOString(),created_by:${fx.owner}}).id`);
    W(`vclassIdbSetBackend(makeIdbFake())`);
    /* R92: بازه‌ها نسبت به «اکنون» — مستقل از ساعتِ شبانه‌روز (بمبِ زمانیِ UTC 23:00-23:59) */
    const later = new Date(Date.now() + 3600e3).toISOString().slice(0,16);
    const earlier = new Date(Date.now() - 3600e3).toISOString().slice(0,16);
    try{
      setU(fx.s1);
      /* قفل → رد */
      W(`update('hw_assignments',${A2},{locked:true})`);
      let r = await W(`(async()=>{var f=new File([new Uint8Array(32)],'a.png',{type:'image/png'}); var r=await hwSubmit(${A2}, f); return JSON.stringify(r);})()`);
      r = JSON.parse(r);
      assert(r.ok===false, 'ارسال روی تکلیفِ قفل‌شده پذیرفته شد!');
      /* قبل از باز شدن → رد */
      W(`update('hw_assignments',${A2},{locked:false, window_open:'${later}', window_close:''})`);
      r = JSON.parse(await W(`(async()=>{var f=new File([new Uint8Array(32)],'b.png',{type:'image/png'}); var r=await hwSubmit(${A2}, f); return JSON.stringify(r);})()`));
      assert(r.ok===false, 'ارسال قبل از باز شدن پذیرفته شد!');
      /* بعد از بسته شدن → رد */
      W(`update('hw_assignments',${A2},{window_open:'', window_close:'${earlier}'})`);
      r = JSON.parse(await W(`(async()=>{var f=new File([new Uint8Array(32)],'c.png',{type:'image/png'}); var r=await hwSubmit(${A2}, f); return JSON.stringify(r);})()`));
      assert(r.ok===false, 'ارسال بعد از مهلت پذیرفته شد!');
      /* باز → قبول + کلید نهایی */
      W(`update('hw_assignments',${A2},{window_open:'${earlier}', window_close:'${later}'})`);
      r = JSON.parse(await W(`(async()=>{var f=new File([new Uint8Array(32)],'ok.png',{type:'image/png'}); var r=await hwSubmit(${A2}, f); return JSON.stringify(r);})()`));
      assert(r.ok===true, 'ارسالِ باز شکست: ' + (r.msg||''));
      assert(r.rec.file_key.indexOf('hw:')===0 && r.rec.file_key.indexOf('tmp:')<0, 'کلید نهایی نه: ' + r.rec.file_key);
    } finally {
      W(`(function(){
        db.hw_submissions.filter(function(s){return s.assignment_id===${A2};}).forEach(function(s){
          if(s.file_key) vclassIdbDel('hw_files', s.file_key);
          remove('hw_submissions', s.id);
        });
        remove('hw_assignments', ${A2});
      })()`);
    }
  });

  await sec('H5 hwViewModal: دانش‌آموزِ دیگری رد، خود/دبیر قبول', async () => {
    /* یک بارگذاریِ دمو پیدا کن (کلید hw:demo) */
    const sub = JSON.parse(W(`JSON.stringify((function(){
      var s = db.hw_submissions.filter(function(x){return x.file_key;})[0];
      if(!s) return null;
      return {id:s.id, student:s.student_id, a:s.assignment_id, key:s.file_key};
    })())`));
    if(!sub) throw new Error('بارگذاریِ دمو یافت نشد');
    W(`(function(){
      var fake = makeIdbFake(); vclassIdbSetBackend(fake);
      var f = new File([new Uint8Array(16)], 'demo.png', {type:'image/png'});
      vclassIdbPut('hw_files', ${JSON.stringify(sub.key)}, f);
    })()`);
    const otherStud = JSON.parse(W(`JSON.stringify((function(){
      var st = db.users.filter(function(x){return x.role==='student'&&x.id!==${sub.student};})[0];
      return st?st.id:0;
    })())`));
    if(otherStud){
      setU(otherStud);
      W(`hwViewModal(${sub.id})`);
      await sleep(150);
      const body = W(`document.getElementById('modal') ? document.getElementById('modal').innerHTML : ''`);
      assert(body.indexOf('download=')<0 && body.indexOf('<audio')<0 && body.indexOf('<video')<0, 'دانش‌آموزِ دیگر فایل را دید!');
    }
    /* خودِ دانش‌آموز → مودال (فایلِ تصویر → <img>) */
    setU(sub.student);
    W(`hwViewModal(${sub.id})`);
    await sleep(200);
    let body = W(`document.getElementById('modal') ? document.getElementById('modal').innerHTML : ''`);
    assert(body.indexOf('<img')>=0 || body.indexOf('<audio')>=0 || body.indexOf('<video')>=0 || body.indexOf('download=')>=0, 'مودالِ مشاهده باز نشد');
    W(`closeModal()`);
    /* دبیر → مودال */
    setU(fx.owner);
    W(`hwViewModal(${sub.id})`);
    await sleep(200);
    body = W(`document.getElementById('modal') ? document.getElementById('modal').innerHTML : ''`);
    assert(body.indexOf('بارگذاری — ')>=0, 'مودالِ دبیر باز نشد');
    W(`closeModal()`);
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت تکالیف ۲: ${ok}/${results.length} موفق  —  ${ok===results.length?'بدون خطا ✅':'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
