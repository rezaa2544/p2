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
const avgOf=list=>list.length?list.reduce((a,b)=>a+b.score,0)/list.length:0;
function visibleClasses(){const u=S.user;if(u.role==='superadmin')return db.classes;if(u.role==='manager')return db.classes.filter(c=>c.school_id===u.school_id);if(u.role==='teacher')return teacherClasses(u.id);const c=classOf(u.id);return c?[c]:[];}
function visibleSubjects(){const u=S.user;return u.role==='superadmin'?db.subjects:db.subjects.filter(s=>s.school_id===u.school_id);}
function myAnnouncements(){const u=S.user;return db.announcements.filter(a=>(a.school_id===null||u.role==='superadmin'||a.school_id===u.school_id)&&(a.audience==='all'||a.audience===u.role)).sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));}
