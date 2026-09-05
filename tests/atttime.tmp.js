// سنجش: زمان کل «ثبت حضور یک کلاس کامل» (att-all → att-commit)
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await sleep(900);
  const r = JSON.parse(W(`(()=>{
    var tid=null;db.schedule.forEach(function(rw){if(tid)return;if(rw.day===0&&Number(rw.period)===1&&rw.teacher_id&&rw.class_id){var u=byId("users",rw.teacher_id);if(u&&u.role==="teacher")tid=rw.teacher_id;}});
    if(!tid)return JSON.stringify({skip:true});
    S.user=byId("users",tid);S.persona=null;S.boss=null;S.filters={};S.bellNow=null;
    var cls=visibleClasses();
    var target=null,tn=0;cls.forEach(function(c){var n=studentsOfClass(c.id).length;if(n>tn){tn=n;target=c;}});
    S.filters.class=target.id;S.filters.date=todayISO();
    var studs=studentsOfClass(target.id).map(function(s){return s.id;});
    var t0=Date.now();
    /* ۱) دکمهٔ «همه حاضر» */
    attDraftSetAll(target.id,todayISO(),studs,'present');
    /* ۲) مرور و ثبت نهایی — همان بدنهٔ att-commit بدون مودال */
    var d=attDraftDiff(target.id,todayISO());
    var school=byId('classes',target.id).school_id;
    var made=0;
    batchWrites(function(){d.changes.forEach(function(c){
      if(c.rec_id){update('attendance',c.rec_id,{status:c.to,class_id:target.id});}
      else {insert('attendance',{school_id:school,class_id:target.id,student_id:c.student_id,date:todayISO(),status:c.to,note:null});}
      made++;});});
    attDraftClear(target.id,todayISO());
    var t1=Date.now();
    /* پاک‌سازی: رکوردهای این سنجش را برگردان تا دادهٔ دمو دست‌نخورده بماند */
    db.attendance.slice().filter(function(a){return a.date===todayISO()&&a.class_id===target.id&&a.status==='present';}).forEach(function(a){remove('attendance',a.id);});
    return JSON.stringify({skip:false,cls:target.name,n:studs.length,changes:d.changes.length,ms:t1-t0});})()`));
  if (r.skip) { console.log('SKIP'); process.exit(2); }
  console.log(`کلاس: ${r.cls} — ${r.n} دانش‌آموز — ${r.changes} تغییر — کل زمان: ${r.ms} ms`);
  console.log(r.ms < 30000 ? '✅ زیر ۳۰ ثانیه' : '🔴 بیش از ۳۰ ثانیه');
  process.exit(r.ms < 30000 ? 0 : 1);
})().catch((e) => { console.error('ERR:', e); process.exit(3); });
