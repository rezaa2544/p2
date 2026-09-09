/* ═══════════════════════════════════════════════════════════════════
   نمرات
   ثبت و ویرایش نمره به تفکیک درس و نوبت.
   ═══════════════════════════════════════════════════════════════════ */

/* ── بند ۴.۲: نمرهٔ عملی/کارگاهی هنرستان + ساعتِ کارآموزی ──
   «مدرسهٔ کارگاهی» = مدرسه‌ای با رشتهٔ فنی‌وحرفه‌ای/کاردانش و
   توانِ has_workshop. «سالِ آخر» = پایهٔ دوازدهم (پایانِ این رشته‌ها). */
function workshopSchool(id){
  var s=id?(byId('schools',Number(id))||{}):{};
  var tr=s.branches||[];
  var cap=(typeof hasCap==='function')?hasCap(s.id,'has_workshop'):false;
  return !!(cap&&tr.length&&tr.some(function(t){return /فنی|حرفه|کاردانش/.test(t);}));
}
function workshopStudent(sid){
  var u=byId('users',sid);
  return !!(u&&workshopSchool(u.school_id));
}
function isFinalYearStudent(sid){
  var cls=(typeof classOf==='function')?classOf(sid):null;
  return !!(cls&&cls.grade==='دوازدهم');
}
function internshipSessions(sid){
  return (db.internships||[]).filter(function(x){return x.student_id===Number(sid);})
    .slice().sort(function(a,b){return String(b.date).localeCompare(String(a.date));});
}
function internshipTotals(sid){
  var total=0,approved=0;
  internshipSessions(sid).forEach(function(r){
    var h=Number(r.hours)||0;
    total+=h;
    if(r.status==='approved')approved+=h;
  });
  return {total:total,approved:approved,count:internshipSessions(sid).length};
}
/** آیا کاربرِ فعلی می‌تواند این رکوردِ کارآموزی را تأیید کند؟
    (مدیر هر مدرسهٔ خود؛ دبیر فقط وقتی دبیرِ مربوطهٔ دانش‌آموز است) */
function canApproveInternship(rec,role){
  role=role||((typeof activePersona==='function')?activePersona():(S.user&&S.user.role));
  if(!role||!rec)return false;
  if(role==='superadmin')return true;
  if(role==='manager')return true;
  if(role!=='teacher')return false;
  var u=S.user;if(!u)return false;
  var enr=(db.enrollments||[]).find(function(e){return e.student_id===Number(rec.student_id);});
  var cls=enr?(byId('classes',enr.class_id)||null):null;
  if(!cls)return false;
  if(cls.homeroom_teacher_id===u.id)return true;
  return (db.schedule||[]).some(function(s){return s.class_id===cls.id&&s.teacher_id===u.id;});
}

function viewGrades(){
  const u=S.user, canEdit=['superadmin','manager','teacher'].includes(u.role);
  const cls=visibleClasses(), subs=visibleSubjects();
  /* طرح زنگ (گام ثبت نمره): کلاس و درس از زنگ جاری پیش‌گزینش می‌شوند.
     انتخاب دستی همیشه مقدم است؛ S.bellNow فقط برای آزمون‌پذیری. */
  const _now=(S.bellNow||null);
  const _auto=(typeof bellAutoClass==='function')?bellAutoClass(null,null,_now):null;
  const _autoOk=_auto&&cls.some(c=>c.id===_auto.classId)&&subs.some(s=>s.id===_auto.subjectId);
  const cid=u.role==='student'?((classOf(u.id)||{}).id):Number(S.filters.class||(_autoOk&&_auto.classId)||(cls[0]||{}).id);
  const sub=S.filters.subject||(_autoOk&&!S.filters.class?String(_auto.subjectId):''), term=S.filters.term||'';
  const _autoShown=_autoOk&&!S.filters.class&&!S.filters.subject&&cid===_auto.classId&&sub===String(_auto.subjectId);
  let rows=db.grades.filter(g=>u.role==='student'?g.student_id===u.id:g.class_id===cid);
  if(u.role==='teacher')rows=rows.filter(g=>g.teacher_id===u.id);
  if(sub)rows=rows.filter(g=>g.subject_id===Number(sub));
  if(term)rows=rows.filter(g=>g.term===term);
  rows=rows.slice().sort((a,b)=>b.id-a.id).slice(0,200);
  const avg=rows.length?avgOf(rows).toFixed(2):null;
  return `<div class="card"><div class="card-head"><div class="row">
    ${u.role!=='student'?`<select class="select" style="width:170px" data-f="class">${cls.map(c=>`<option value="${escAttr(c.id)}" ${c.id===cid?'selected':''}>${esc(c.name)}</option>`).join('')}</select>${_autoShown?`<span class="badge b-blue" title="بر اساس زنگ جاری و برنامهٔ هفتگی شما — انتخاب دستی بر این مقدم است">🔔 انتخاب خودکار بر اساس زنگ</span><button class="btn ghost sm" data-act="grade-reset-auto">همهٔ کلاس و درس</button>`:''}`:''}
    ${avg?`<span class="badge b-blue">میانگین: ${fa(avg)}</span>`:''}</div>
    ${canEdit?`<button class="btn" data-act="grade-new">➕ ثبت نمره</button>`:''}</div>
   ${filterPanel('grades',`
    <select class="select" style="width:150px" data-f="subject"><option value="">همه دروس</option>${subs.map(s=>`<option value="${escAttr(s.id)}" ${sub==String(s.id)?'selected':''}>${esc(s.name)}</option>`).join('')}</select>
    <select class="select" style="width:125px" data-f="term"><option value="">همه نوبت‌ها</option>${TERMS.map(t=>`<option ${term===t?'selected':''}>${t}</option>`).join('')}</select>`)}
   ${rows.length?`<div class="table-wrap"><table><thead><tr><th>دانش‌آموز</th><th>درس</th><th>کلاس</th><th>نوبت</th><th>نوع آزمون</th><th>نمره</th>${canEdit?'<th></th>':''}</tr></thead><tbody>
    ${rows.map(g=>`<tr><td><b>${esc((byId('users',g.student_id)||{}).full_name||'—')}</b></td><td>${esc((byId('subjects',g.subject_id)||{}).name||'—')}</td>
      <td class="muted">${esc((byId('classes',g.class_id)||{}).name||'—')}</td><td><span class="badge b-gray">${esc(g.term)}</span></td><td class="muted">${esc(g.exam_type)}${g.kind==='practical'?' <span class="badge b-purple" title="نمرهٔ عملی/کارگاهی (بند ۴.۲)">عملی</span>':''}</td>
      <td><span class="badge ${g.score>=17?'b-green':g.score>=12?'b-blue':'b-red'}">${fa(g.score)} / ${fa(g.max_score)}</span></td>
      ${canEdit?`<td><button class="icon-btn" data-act="grade-edit" data-id="${escAttr(g.id)}">✏️</button> <button class="icon-btn danger" data-act="grade-del" data-id="${escAttr(g.id)}">🗑️</button></td>`:''}</tr>`).join('')}
   </tbody></table></div>`:empty('📝','نمره‌ای ثبت نشده',canEdit?'با دکمه «ثبت نمره» شروع کنید.':'هنوز نمره‌ای برای شما ثبت نشده است.')}
   ${u.role==='teacher'&&typeof retakeTeacherCard==='function'?retakeTeacherCard():''}</div>`;
}
