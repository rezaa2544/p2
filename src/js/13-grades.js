/* ═══════════════════════════════════════════════════════════════════
   نمرات
   ثبت و ویرایش نمره به تفکیک درس و نوبت.
   ═══════════════════════════════════════════════════════════════════ */
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
  if(u.role==='teacher')rows=rows.filter(g=>g.teacher_id===u.id||true);
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
      <td class="muted">${esc((byId('classes',g.class_id)||{}).name||'—')}</td><td><span class="badge b-gray">${esc(g.term)}</span></td><td class="muted">${esc(g.exam_type)}</td>
      <td><span class="badge ${g.score>=17?'b-green':g.score>=12?'b-blue':'b-red'}">${fa(g.score)} / ${fa(g.max_score)}</span></td>
      ${canEdit?`<td><button class="icon-btn" data-act="grade-edit" data-id="${escAttr(g.id)}">✏️</button> <button class="icon-btn danger" data-act="grade-del" data-id="${escAttr(g.id)}">🗑️</button></td>`:''}</tr>`).join('')}
   </tbody></table></div>`:empty('📝','نمره‌ای ثبت نشده',canEdit?'با دکمه «ثبت نمره» شروع کنید.':'هنوز نمره‌ای برای شما ثبت نشده است.')}</div>`;
}
