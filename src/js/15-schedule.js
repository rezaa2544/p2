/* ═══════════════════════════════════════════════════════════════════
   برنامهٔ هفتگی
   جدول شش‌روزه؛ نمای دبیر و دانش‌آموز متفاوت است.
   ═══════════════════════════════════════════════════════════════════ */
function viewSchedule(){
  const u=S.user;
  const byTeacher=u.role==='teacher';
  const cls=visibleClasses();
  const cid=byTeacher?null:Number(S.filters.class||(u.role==='student'?(classOf(u.id)||{}).id:(cls[0]||{}).id));
  const rows=byTeacher?db.schedule.filter(s=>s.teacher_id===u.id):db.schedule.filter(s=>s.class_id===cid);
  const cell=(d,p)=>rows.find(r=>r.day===d&&r.period===p);
  const canEditSched=['manager','superadmin'].includes(u.role)&&!!cid;
  return `<div class="card"><div class="card-head"><h3>برنامه هفتگی ${byTeacher?'تدریس من':''}</h3>
   ${!byTeacher&&u.role!=='student'?`<select class="select" style="width:190px" data-f="class">${cls.map(c=>`<option value="${escAttr(c.id)}" ${c.id===cid?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`:''}</div>
   ${(rows.length||canEditSched)?`<div class="card-body table-wrap"><div class="timetable"><div></div>${DAYS.map(d=>`<div class="tt-head"><b>${d}</b></div>`).join('')}
    ${[1,2,3,4,5,6].map(p=>`<div class="tt-head" style="display:grid;place-items:center"><span class="badge b-blue">زنگ ${fa(p)}</span></div>
     ${DAYS.map((_,d)=>{const c=cell(d,p);
       if(c)return `<div class="tt-cell" ${canEditSched?`style="cursor:pointer;position:relative" data-act="slot-edit" data-day="${escAttr(d)}" data-period="${escAttr(p)}" data-sid="${escAttr(c.id)}" data-class="${escAttr(cid)}"`:''}>
         <b>${esc((byId('subjects',c.subject_id)||{}).name||'—')}</b><span>${esc(byTeacher?byId('classes',c.class_id).name:(c.teacher_id?byId('users',c.teacher_id).full_name:'بدون دبیر'))}</span></div>`;
       return `<div class="tt-cell tt-empty" ${canEditSched?`style="cursor:pointer" data-act="slot-edit" data-day="${escAttr(d)}" data-period="${escAttr(p)}" data-class="${escAttr(cid)}"`:''}><span class="muted small">${canEditSched?'+ افزودن':'—'}</span></div>`;}).join('')}`).join('')}
   </div>${canEditSched?`<div class="small muted" style="margin-top:12px;line-height:2">💡 روی هر خانه بزنید تا درس و دبیر آن را تعیین کنید. اگر دبیر در همان ساعت در <b>مدرسه دیگری</b> کلاس داشته باشد، ثبت نمی‌شود.</div>`:''}</div>`:empty('🗓️','برنامه‌ای ثبت نشده','برنامه هفتگی هنوز تنظیم نشده است.')}</div>`;
}
