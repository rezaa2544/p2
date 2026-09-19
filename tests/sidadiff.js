#!/usr/bin/env node
/**
 * سئوت گزارش اختلاف با سیدا (بند ۱۰: ورود دستی نمرهٔ سیدا + اختلاف با پایش)
 *
 * در پروسهٔ جداگانه اجرا می‌شود (نه داخل smoke.js).
 *
 * بخش‌ها:
 *  D1 دادهٔ نمونه (هم‌خوان / سیدا بالاتر / پایش بالاتر)
 *  D2 صفحهٔ مدیر (ستون‌ها، بج‌ها، فیلتر نوبت) + مسدود برای دبیر
 *  D3 sedasUpsert: ثبت + به‌روزرسانی بدون ردیفِ دوم + اعتبارسنجی + نقش‌ها
 *  D4 payeshAvgOf + sedaRowStatus (میانگین کنترل‌شده + حالت‌ها)
 *  D5 sedasDel: حذفِ مدیر + رد برای مدرسهٔ دیگر + رد برای دبیر
 *
 * اجرا: node tests/sidadiff.js
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
  catch (e) { const stack1=String((e.stack||'').split(String.fromCharCode(10))[1]||'').trim(); results.push({ name, ok: false, detail: String(e.message || e) + '  ||  ' + stack1, ms: Date.now() - t0 }); }
};

async function dFx(){
  return JSON.parse(W(`JSON.stringify((function(){
    var sc = db.schools.filter(function(s){return s.active;})[0];
    var mgr = db.users.filter(function(x){return x.role==='manager'&&x.school_id===sc.id;})[0];
    var other = db.schools.filter(function(s){return s.active && s.id!==sc.id;})[0];
    window.__dFx = {sc:sc.id, mgr:mgr.id, other:other?other.id:0};
    return {sc:sc.id, mgr:mgr.id, other:other?other.id:0};
  })())`));
}
async function dTearDown(){
  W(`(function(){
    db.grades.filter(function(g){ return g._dtest===1; }).forEach(function(g){ remove('grades', g.id); });
    db.sedascores.filter(function(r){ return r._dtest===1; }).forEach(function(r){ remove('sedascores', r.id); });
    window.__dFx = null;
  })()`);
}

(async () => {
  await sleep(300);

  await sec('D1 دادهٔ نمونه: هم‌خوان + سیدا بالاتر + پایش بالاتر', async () => {
    const fx = await dFx();
    const r = JSON.parse(W(`JSON.stringify((function(){
      var rows = db.sedascores.filter(function(x){return x.school_id===${fx.sc};});
      var keys = {};
      rows.forEach(function(x){ keys[sedaRowStatus(x.student_id,x.subject_id,x.term,x.score).key]=(keys[sedaRowStatus(x.student_id,x.subject_id,x.term,x.score).key]||0)+1; });
      return {n: rows.length, keys: keys};
    })())`));
    assert(r.n>=3, 'ردیف‌های نمونه نیست: ' + JSON.stringify(r));
    assert(r.keys.same>=1 && r.keys['seda-high']>=1 && r.keys['payesh-high']>=1,
      'هر سه حالت لازم است: ' + JSON.stringify(r));
  });

  await sec('D2 صفحهٔ مدیر: ستون‌ها + بج اختلاف + مسدود برای دبیر', async () => {
    const fx = await dFx();
    try{
      const out = W(`(function(){
        S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;
        S.route='sidadiff';S.filters={};S.page=1;
        return renderRoute();
      })()`);
      assert(typeof out==='string' && out.indexOf('دسترسی مجاز نیست')<0, 'رندر مسدود');
      assert(out.indexOf('اختلاف با سیدا')>=0, 'عنوان صفحه نیست');
      assert(out.indexOf('نمرهٔ سیدا')>=0, 'دکمهٔ ثبت نیست');
      assert(out.indexOf('سیدا − پایش')>=0, 'ستون اختلاف نیست');
      assert(out.indexOf('هم‌خوان')>=0, 'بج هم‌خوان نیست');
      assert(out.indexOf('data-act="sd-del"')>=0, 'دکمهٔ حذف نیست');
      /* فیلتر نوبت: ردیفِ نوبتِ دیگر نباید بیاید (نوبتِ دوم فقط در منوی فیلتر) */
      const outF = W(`(function(){
        S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;
        S.route='sidadiff';S.filters={term:'نوبت اول'};S.page=1;
        return renderRoute();
      })()`);
      const badgeOut = (outF.split('<span class="badge b-gray">نوبت دوم</span>').length - 1);
      assert(badgeOut===0, 'فیلتر نوبت کار نکرد — ردیفِ نوبت دوم اومد (' + badgeOut + ')');
      const badgeIn = (outF.split('<span class="badge b-gray">نوبت اول</span>').length - 1);
      assert(badgeIn>=1, 'ردیفِ نوبت اول نیست');
      /* دبیر: صفحه را نمی‌بیند */
      const t = JSON.parse(W(`JSON.stringify((function(){
        var x=db.users.filter(function(x){return x.role==='teacher'&&x.school_id===${fx.sc};})[0];
        return x?x.id:0;
      })())`));
      if(t){
        const outT = W(`(function(){
          S.user=byId('users',${t});S.persona=null;S.boss=null;
          S.route='sidadiff';S.filters={};S.page=1;
          return renderRoute();
        })()`);
        assert(outT.indexOf('دسترسی مجاز نیست')>=0, 'دبیر صفحهٔ سیدا را دید!');
      }
    } finally { await dTearDown(); }
  });

  await sec('D3 sedasUpsert: ثبت + به‌روزرسانی + اعتبارسنجی + نقش‌ها', async () => {
    const fx = await dFx();
    try{
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
      /* جفتِ (دانش‌آموز، درس) که ردیفِ سیدا ندارد (دمو ۳ جفتِ خاص را دارد) */
      const ctx = JSON.parse(W(`JSON.stringify((function(){
        var ss=db.users.filter(function(x){return x.role==='student'&&x.school_id===${fx.sc};});
        var bs=db.subjects.filter(function(x){return x.school_id===${fx.sc};});
        for(var i=0;i<ss.length;i++)for(var j=0;j<bs.length;j++){
          var hit=db.sedascores.filter(function(r){return r.student_id===ss[i].id&&r.subject_id===bs[j].id&&r.term==='نوبت اول';});
          if(!hit.length) return {s:ss[i].id,b:bs[j].id};
        }
        return null;
      })())`));
      assert(ctx, 'جفتِ خالی پیدا نشد');
      /* ثبتِ تازه */
      const r1 = JSON.parse(W(`JSON.stringify(sedasUpsert(${ctx.s}, ${ctx.b}, 'نوبت اول', 15.5, 'تست'))`));
      assert(r1.ok===true, 'ثبت شکست: ' + (r1.msg||''));
      assert(r1.updated===false, 'ردیفِ تازه «به‌روزشده» گزارش شد!');
      W(`(function(){ var r=byId('sedascores',${r1.rec.id}); if(r) r._dtest=1; })()`);
      assert(r1.rec.school_id===fx.sc, 'school_id درست نیست');
      /* ثبتِ تکراری → به‌روزرسانی، بدون ردیفِ دوم */
      const r2 = JSON.parse(W(`JSON.stringify(sedasUpsert(${ctx.s}, ${ctx.b}, 'نوبت اول', 16, 'تست ۲'))`));
      assert(r2.ok===true && r2.updated===true, 'به‌روزرسانی گزارش نشد');
      assert(r2.rec.id===r1.rec.id, 'ردیفِ دوم ساخته شد!');
      const cnt = W(`db.sedascores.filter(function(r){return r.student_id===${ctx.s}&&r.subject_id===${ctx.b}&&r.term==='نوبت اول';}).length`);
      assert(cnt===1, 'ردیف تکراری: ' + cnt);
      /* اعتبارسنجی */
      const rB = JSON.parse(W(`JSON.stringify(sedasUpsert(${ctx.s}, ${ctx.b}, 'نوبت اول', 25, ''))`));
      assert(rB.ok===false, 'نمرهٔ ۲۵ پذیرفته شد!');
      const rT = JSON.parse(W(`JSON.stringify(sedasUpsert(${ctx.s}, ${ctx.b}, 'نوبت سوم', 15, ''))`));
      assert(rT.ok===false, 'نوبت نامعتبر پذیرفته شد!');
      if(fx.other){
        const oS = JSON.parse(W(`JSON.stringify((function(){
          var s=db.users.filter(function(x){return x.role==='student'&&x.school_id===${fx.other};})[0];
          return s?s.id:0;
        })())`));
        if(oS){
          const rX = JSON.parse(W(`JSON.stringify(sedasUpsert(${oS}, ${ctx.b}, 'نوبت اول', 15, ''))`));
          assert(rX.ok===false, 'دانش‌آموزِ مدرسهٔ دیگر پذیرفته شد!');
        }
      }
      if(fx.other){
        const oB = JSON.parse(W(`JSON.stringify((function(){
          var b=db.subjects.filter(function(x){return x.school_id===${fx.other};})[0];
          return b?b.id:0;
        })())`));
        if(oB){
          const rBx = JSON.parse(W(`JSON.stringify(sedasUpsert(${ctx.s}, ${oB}, 'نوبت اول', 15, ''))`));
          assert(rBx.ok===false, 'درسِ مدرسهٔ دیگر پذیرفته شد!');
        }
      }
      /* نقش‌های دیگر → رد */
      const t = JSON.parse(W(`JSON.stringify((function(){
        var x=db.users.filter(function(x){return x.role==='teacher'&&x.school_id===${fx.sc};})[0];
        return x?x.id:0;
      })())`));
      W(`S.user=byId('users',${t});S.persona=null;S.boss=null;`);
      const rTe = JSON.parse(W(`JSON.stringify(sedasUpsert(${ctx.s}, ${ctx.b}, 'نوبت اول', 15, ''))`));
      assert(rTe.ok===false, 'دبیر نمرهٔ سیدا ثبت کرد!');
    } finally { await dTearDown(); }
  });

  await sec('D4 payeshAvgOf + sedaRowStatus: میانگین کنترل‌شده + حالت‌ها', async () => {
    const fx = await dFx();
    try{
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
      /* نمره‌های پایشِ کنترل‌شده: ۱۵ و ۱۷ روی هر جفتی — میانگینِ مورد انتظار از روی
         ردیف‌های موجودِ دمو + ۲ برگهٔ تازه حساب می‌شود */
      const ctx = JSON.parse(W(`JSON.stringify((function(){
        var s=db.users.filter(function(x){return x.role==='student'&&x.school_id===${fx.sc};})[0];
        var b=db.subjects.filter(function(x){return x.school_id===${fx.sc};})[0];
        var cls=db.classes.filter(function(c){return c.school_id===${fx.sc};})[0];
        if(!s||!b||!cls) return null;
        var old=db.grades.filter(function(g){return g.student_id===s.id&&g.subject_id===b.id&&g.term==='نوبت اول';});
        var sum=0; old.forEach(function(g){ sum+=Number(g.score)||0; });
        add('grades',{school_id:${fx.sc},student_id:s.id,class_id:cls.id,subject_id:b.id,teacher_id:0,
          term:'نوبت اول',exam_type:'کلاسی',score:15,max_score:20,created_at:new Date().toISOString(),_dtest:1});
        add('grades',{school_id:${fx.sc},student_id:s.id,class_id:cls.id,subject_id:b.id,teacher_id:0,
          term:'نوبت اول',exam_type:'پایان‌ترم',score:17,max_score:20,created_at:new Date().toISOString(),_dtest:1});
        var n=old.length+2;
        var avg=Math.round((sum+32)/n*100)/100;
        return {s:s.id,b:b.id,avg:avg};
      })())`));
      assert(ctx, 'فیکسور نبود');
      const avg = ctx.avg;
      const got = JSON.parse(W(`JSON.stringify(payeshAvgOf(${ctx.s}, ${ctx.b}, 'نوبت اول'))`));
      assert(got===avg, 'میانگین درست نیست: ' + JSON.stringify(got) + ' != ' + avg);
      /* same: دقیقاً همان میانگین */
      const stA = JSON.parse(W(`JSON.stringify(sedaRowStatus(${ctx.s}, ${ctx.b}, 'نوبت اول', ${avg}))`));
      assert(stA.key==='same' && stA.diff===0, 'هم‌خوان درست نیست: ' + JSON.stringify(stA));
      /* seda-high: میانگین +off (به شرطِ جا داشتن تا ۲۰) */
      const off = Math.min(1.25, 20 - avg);
      const bVal = Math.round((avg+off)*100)/100;
      const stB = JSON.parse(W(`JSON.stringify(sedaRowStatus(${ctx.s}, ${ctx.b}, 'نوبت اول', ${bVal}))`));
      assert(stB.key==='seda-high' && stB.diff===Math.round(off*100)/100, 'سیدا بالاتر درست نیست: ' + JSON.stringify(stB) + ' off=' + off);
      /* payesh-high: میانگین −off2 (به شرطِ جا داشتن تا ۰) */
      const off2 = Math.min(1, avg);
      const cVal = Math.round((avg-off2)*100)/100;
      const stC = JSON.parse(W(`JSON.stringify(sedaRowStatus(${ctx.s}, ${ctx.b}, 'نوبت اول', ${cVal}))`));
      assert(stC.key==='payesh-high' && stC.diff===-Math.round(off2*100)/100, 'پایش بالاتر درست نیست: ' + JSON.stringify(stC) + ' off2=' + off2);
      /* بدون نمرهٔ پایش → missing (جفتی که اصلاً نمرهٔ پایش ندارد پیدا می‌کنیم) */
      const missPair = JSON.parse(W(`JSON.stringify((function(){
        var ss=db.users.filter(function(x){return x.role==='student'&&x.school_id===${fx.sc};});
        var bs=db.subjects.filter(function(x){return x.school_id===${fx.sc};});
        for(var i=0;i<ss.length;i++)for(var j=0;j<bs.length;j++){
          var hit=db.grades.filter(function(g){return g.student_id===ss[i].id&&g.subject_id===bs[j].id&&g.term==='نوبت دوم';});
          if(!hit.length) return {s:ss[i].id,b:bs[j].id};
        }
        return null;
      })())`));
      assert(missPair, 'جفتِ بدون نمرهٔ پایش پیدا نشد');
      const stM = JSON.parse(W(`JSON.stringify(sedaRowStatus(${missPair.s}, ${missPair.b}, 'نوبت دوم', 15))`));
      assert(stM.key==='missing' && stM.payesh===null && stM.diff===null, 'حالت missing درست نیست: ' + JSON.stringify(stM));
    } finally { await dTearDown(); }
  });

  await sec('D5 sedasDel: حذفِ مدیر + رد برای مدرسهٔ دیگر + رد برای دبیر', async () => {
    const fx = await dFx();
    try{
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
      const ctx = JSON.parse(W(`JSON.stringify((function(){
        var s=db.users.filter(function(x){return x.role==='student'&&x.school_id===${fx.sc};})[0];
        var b=db.subjects.filter(function(x){return x.school_id===${fx.sc};})[0];
        var r=add('sedascores',{school_id:${fx.sc},student_id:s.id,subject_id:b.id,term:'نوبت اول',score:15,entered_by:0,created_at:new Date().toISOString(),note:'',_dtest:1});
        return r.id;
      })())`));
      /* دبیر → رد */
      const t = JSON.parse(W(`JSON.stringify((function(){
        var x=db.users.filter(function(x){return x.role==='teacher'&&x.school_id===${fx.sc};})[0];
        return x?x.id:0;
      })())`));
      W(`S.user=byId('users',${t});S.persona=null;S.boss=null;`);
      const rT = JSON.parse(W(`JSON.stringify(sedasDel(${ctx}))`));
      assert(rT.ok===false, 'دبیر ردیف سیدا حذف کرد!');
      assert(!!W(`byId('sedascores',${ctx})`), 'ردیف با تلاشِ غیرمجاز حذف شد!');
      /* مدیر → حذف */
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
      const rD = JSON.parse(W(`JSON.stringify(sedasDel(${ctx}))`));
      assert(rD.ok===true, 'حذف شکست: ' + (rD.msg||''));
      assert(!W(`byId('sedascores',${ctx})`), 'ردیف حذف نشد');
      /* ردیفِ مدرسهٔ دیگر → رد */
      if(fx.other){
        const oS = JSON.parse(W(`JSON.stringify((function(){
          var s=db.users.filter(function(x){return x.role==='student'&&x.school_id===${fx.other};})[0];
          var b=db.subjects.filter(function(x){return x.school_id===${fx.other};})[0];
          if(!s||!b) return 0;
          return add('sedascores',{school_id:${fx.other},student_id:s.id,subject_id:b.id,term:'نوبت اول',score:15,entered_by:0,created_at:new Date().toISOString(),note:'',_dtest:1}).id;
        })())`));
        if(oS){
          const rX = JSON.parse(W(`JSON.stringify(sedasDel(${oS}))`));
          assert(rX.ok===false, 'حذفِ مدرسهٔ دیگر رفت!');
          assert(!!W(`byId('sedascores',${oS})`), 'ردیفِ مدرسهٔ دیگر حذف شد!');
        }
      }
    } finally { await dTearDown(); }
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت سیدا: ${ok}/${results.length} موفق  —  ${ok===results.length?'بدون خطا ✅':'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
