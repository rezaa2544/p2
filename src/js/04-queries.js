/* ============================ queries ============================ */
const byId=(c,id)=>db[c].find(x=>x.id===Number(id));
const classOf=sid=>{const e=db.enrollments.find(e=>e.student_id===sid);return e?byId('classes',e.class_id):null;};
const studentsOfClass=cid=>db.enrollments.filter(e=>e.class_id===Number(cid)).map(e=>byId('users',e.student_id)).filter(Boolean).sort((a,b)=>a.full_name.localeCompare(b.full_name,'fa'));
const teacherClasses=tid=>{const s=new Set(db.schedule.filter(x=>x.teacher_id===tid).map(x=>x.class_id));db.classes.filter(c=>c.homeroom_teacher_id===tid).forEach(c=>s.add(c.id));return [...s].map(id=>byId('classes',id)).filter(Boolean);};
const avgOf=list=>list.length?list.reduce((a,b)=>a+b.score,0)/list.length:0;
function visibleClasses(){const u=S.user;if(u.role==='superadmin')return db.classes;if(u.role==='manager')return db.classes.filter(c=>c.school_id===u.school_id);if(u.role==='teacher')return teacherClasses(u.id);const c=classOf(u.id);return c?[c]:[];}
function visibleSubjects(){const u=S.user;return u.role==='superadmin'?db.subjects:db.subjects.filter(s=>s.school_id===u.school_id);}
function myAnnouncements(){const u=S.user;return db.announcements.filter(a=>(a.school_id===null||u.role==='superadmin'||a.school_id===u.school_id)&&(a.audience==='all'||a.audience===u.role)).sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));}
