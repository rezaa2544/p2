/* ═══════════════════════════════════════════════════════════════════
   کوئری‌های نقش‌محور
   مرز دسترسی داده از اینجا می‌گذرد؛ پیش از تغییر، بخش امنیت سند مرجع را بخوانید.
   ═══════════════════════════════════════════════════════════════════ */
/* 🔴 TODO پیش از اتصال به سرور — IDOR (دسترسی با شمردن شناسه)
   byId هیچ سنجش محدوده‌ای ندارد: هر شناسه‌ای بدهید رکورد را می‌دهد.
   سنجش روی دادهٔ نمونه (tests/smoke.js، آزمون‌های «IDOR ⚠️»):
     مدیر مدرسه   → ۸۷۰ کاربر خارج از مدرسه‌اش
     ولی با ۱ فرزند → ۵۲۶ دانش‌آموز غیرفرزند
     دبیر با ۳ کلاس → ۴۱ کلاس و ۱۱٬۵۹۲ نمرهٔ خارج از محدوده
   ⚠️ گمان نکنید scopeDescriptor یا visibleClasses محافظت می‌کنند —
   آن‌ها فقط در نماها صدا زده می‌شوند و byId مستقیم از ایندکس
   می‌خواند؛ مهاجم از لایهٔ نما رد نمی‌شود.
   سرور باید مالکیت رکورد را بسنجد و برای خارج از محدوده 404
   برگرداند نه 403 (پاسخ 403 وجود رکورد را تأیید می‌کند).
   📄 docs/SERVER_SECURITY_CONTRACT.md بند ۱.۲ */
const byId=(c,id)=>{const m=(typeof idxById==='function')?idxById(c):null;return m?m.get(Number(id)):db[c].find(x=>x.id===Number(id));};
const classOf=sid=>{const m=(typeof idxEnrollByStudent==='function')?idxEnrollByStudent():null;const e=m?m.get(Number(sid)):db.enrollments.find(e=>e.student_id===sid);return e?byId('classes',e.class_id):null;};
const studentsOfClass=cid=>{cid=Number(cid);const m=(typeof idxEnrollByClass==='function')?idxEnrollByClass():null;const es=m?(m.get(cid)||[]):db.enrollments.filter(e=>e.class_id===cid);const out=[];for(let i=0;i<es.length;i++){const u=byId('users',es[i].student_id);if(u)out.push(u);}return (typeof sortByNameFa==='function')?sortByNameFa(out):out.sort((a,b)=>a.full_name.localeCompare(b.full_name,'fa'));};
const teacherClasses=tid=>{const _im=(typeof idxScheduleByTeacher==='function')?idxScheduleByTeacher():null;const _rows=_im?(_im.get(tid)||[]):db.schedule.filter(x=>x.teacher_id===tid);const s=new Set(_rows.map(x=>x.class_id));db.classes.filter(c=>c.homeroom_teacher_id===tid).forEach(c=>s.add(c.id));return [...s].map(id=>byId('classes',id)).filter(Boolean);};
/* ── مدل چندپایهٔ زودهنگام (فقط دادهٔ مدل، بدون UI) ──────────
   بندهای متوسطهٔ دوم می‌توانند چند «پایه/رشته» داشته باشند؛ نقشهٔ
   درس↔دانش‌آموز در سطح دانش‌آموز است، نه سطح کلاس. جدول
   class_subject_members این نقشه را نگه می‌دارد. تا وقتی ردیفی
   نباشد، رفتار دقیقاً همان امروز است: همهٔ دانش‌آموزان کلاس برای
   همهٔ دروس (fallback تنبل) — یعنی صفر تغییر رفتار.
   📄 docs/ARCHITECTURE_DECISIONS.md «قفل‌شده» ردیف ۲.۱ */
const classSubjectMembers=(cid,sid)=>{
  cid=Number(cid);sid=Number(sid);
  const rows=(db.class_subject_members||[]).filter(function(x){return x.class_id===cid&&x.subject_id===sid;});
  if(rows.length){
    const out=[];
    rows.forEach(function(x){const u=byId('users',x.student_id);if(u)out.push(u);});
    return out;
  }
  return studentsOfClass(cid);
};
/**
 * زمینهٔ نمرات یک کلاس در یک دور — برای نمایش «میانگین کلاس» کنار
 * هر نمره (بند ۳). بدون نام: فقط عدد.
 * خروجی: { "subjectId|term|examType": {avg, n, students} }
 * فقط وقتی حداقل ۲ دانش‌آموزِ عضو در همان (درس، نوبت، نوع) نمره
 * داشته باشند مقدار تولید می‌شود — میانگینِ تک‌نفره بی‌معناست.
 * عضویتِ هر درس از classSubjectMembers (مدل چندپایه، بند ۲) می‌آید.
 */
function classScoreContext(classId){
  var cls=byId('classes',Number(classId));
  var out=Object.create(null);
  if(!cls||!db.grades) return out;
  var groups=Object.create(null);
  db.grades.forEach(function(g){
    var k=g.subject_id+'|'+g.term+'|'+g.exam_type;
    if(!groups[k]) groups[k]={subject:g.subject_id, rows:[]};
    groups[k].rows.push(g);
  });
  Object.keys(groups).forEach(function(k){
    var grp=groups[k];
    var ids=Object.create(null);
    classSubjectMembers(cls.id, grp.subject).forEach(function(u){ids[u.id]=true;});
    var sum=0,sumN=0,n=0,students=Object.create(null);
    grp.rows.forEach(function(g){
      if(!ids[g.student_id]) return;
      sum+=g.score;
      /* دور ۷۹ (بند ۴.۹): میانگینِ نرمال‌شدهٔ ۲۰ — برای هم‌سطح‌سازی
         نمراتِ با max متفاوت در نمودارِ مقایسه‌ای */
      var mx=Number(g.max_score)||20;
      sumN+=Math.max(0,Math.min(20,(Number(g.score)/mx)*20));
      n++;students[g.student_id]=true;
    });
    var cnt=Object.keys(students).length;
    if(cnt<2) return;
    out[k]={avg:n?sum/n:0, avgNorm:n?sumN/n:0, n:n, students:cnt};
  });
  return out;
}
/** تطبیق نقشهٔ درس↔دانش‌آموز (برای ماژول آتی؛ امروز فراخوانی نمی‌شود) */
function setClassSubjectMembers(cid,sid,studentIds){
  cid=Number(cid);sid=Number(sid);
  const keep=studentIds.map(Number);
  (db.class_subject_members||[]).slice().forEach(function(x){
    if(x.class_id===cid&&x.subject_id===sid&&keep.indexOf(x.student_id)<0)
      remove('class_subject_members',x.id);
  });
  keep.forEach(function(st){
    const exists=(db.class_subject_members||[]).some(function(x){return x.class_id===cid&&x.subject_id===sid&&x.student_id===st;});
    if(!exists) insert('class_subject_members',{class_id:cid,subject_id:sid,student_id:st});
  });
}
const avgOf=list=>list.length?list.reduce((a,b)=>a+b.score,0)/list.length:0;
function visibleClasses(){const u=S.user;if(u.role==='superadmin')return db.classes;if(u.role==='manager')return db.classes.filter(c=>c.school_id===u.school_id);if(u.role==='teacher')return teacherClasses(u.id);const c=classOf(u.id);return c?[c]:[];}
function visibleSubjects(){const u=S.user;return u.role==='superadmin'?db.subjects:db.subjects.filter(s=>s.school_id===u.school_id);}
function myAnnouncements(){const u=S.user;return db.announcements.filter(a=>(a.school_id===null||u.role==='superadmin'||a.school_id===u.school_id)&&(a.audience==='all'||a.audience===u.role)).sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));}
