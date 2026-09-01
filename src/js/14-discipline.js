/* ============================ discipline ============================ */
function viewDiscipline(){
  const u=S.user, canEdit=['superadmin','manager','teacher'].includes(u.role);
  const kind=S.filters.kind||'';
  let rows;
  if(u.role==='student')rows=db.discipline.filter(d=>d.student_id===u.id);
  else{const cls=visibleClasses().map(c=>c.id);const ids=new Set(db.enrollments.filter(e=>cls.includes(e.class_id)).map(e=>e.student_id));
    rows=db.discipline.filter(d=>ids.has(d.student_id));}
  if(kind)rows=rows.filter(d=>d.kind===kind);
  rows=rows.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,150);
  return `<div class="card"><div class="card-head"><div class="row">
    <select class="select" style="width:150px" data-f="kind"><option value="">همه موارد</option><option value="positive" ${kind==='positive'?'selected':''}>موارد مثبت 👍</option><option value="negative" ${kind==='negative'?'selected':''}>موارد منفی 👎</option></select>
    <span class="badge b-gray">${fa(rows.length)} مورد</span></div>
    ${canEdit?`<button class="btn" data-act="disc-new">➕ ثبت مورد انضباطی</button>`:''}</div>
   ${rows.length?`<div class="table-wrap"><table><thead><tr><th>دانش‌آموز</th><th>کلاس</th><th>نوع</th><th>عنوان</th><th>توضیحات</th><th>امتیاز</th><th>تاریخ</th>${canEdit?'<th></th>':''}</tr></thead><tbody>
    ${rows.map(d=>{const s=byId('users',d.student_id);return `<tr><td><b>${esc(s?s.full_name:'—')}</b></td><td class="muted">${esc((classOf(d.student_id)||{}).name||'—')}</td>
     <td><span class="badge ${d.kind==='positive'?'b-green':'b-red'}">${d.kind==='positive'?'👍 مثبت':'👎 منفی'}</span></td><td>${esc(d.title)}</td>
     <td class="muted small" style="white-space:normal;max-width:240px">${esc(d.description||'—')}</td>
     <td><b style="color:${d.points>=0?'var(--green)':'var(--red)'}">${fa(d.points)}</b></td><td class="muted small">${jalali(d.date)}</td>
     ${canEdit?`<td><button class="icon-btn" data-act="disc-edit" data-id="${d.id}">✏️</button> <button class="icon-btn danger" data-act="disc-del" data-id="${d.id}">🗑️</button></td>`:''}</tr>`;}).join('')}
   </tbody></table></div>`:empty('⚖️','پرونده انضباطی خالی است',u.role==='student'?'خوشبختانه موردی برای شما ثبت نشده است.':'موردی مطابق فیلتر یافت نشد.')}</div>`;
}
