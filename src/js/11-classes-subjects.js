/* ============================ classes / subjects ============================ */
function viewClasses(){
  const canEdit=['superadmin','manager'].includes(S.user.role);
  const rows=visibleClasses();
  return `<div class="card"><div class="card-head"><h3>کلاس‌ها <span class="badge b-gray">${fa(rows.length)}</span></h3>
    ${canEdit?`<button class="btn" data-act="class-new">➕ کلاس جدید</button>`:''}</div>
   ${rows.length?`<div class="grid g3" style="padding:16px">${rows.map(c=>{const n=db.enrollments.filter(e=>e.class_id===c.id).length;const fill=Math.min(100,Math.round(n/(c.capacity||30)*100));const ht=c.homeroom_teacher_id?byId('users',c.homeroom_teacher_id):null;
     return `<div class="card" style="padding:15px;box-shadow:none">
      <div class="row"><b style="font-size:15px">${esc(c.name)}</b><div class="spacer"></div>
       ${canEdit?`<button class="icon-btn" data-act="class-edit" data-id="${c.id}">✏️</button> <button class="icon-btn danger" data-act="class-del" data-id="${c.id}">🗑️</button>`:''}</div>
      <div class="row small muted" style="margin-top:6px"><span class="badge b-blue">${esc(c.grade||'—')}</span>${c.field?`<span class="badge b-purple">${esc(c.field)}</span>`:''}${c.room?`<span>🚪 ${esc(c.room)}</span>`:''}</div>
      <div class="small muted" style="margin-top:8px">سرپرست: ${esc(ht?ht.full_name:'—')}</div>
      ${S.user.role==='superadmin'?`<div class="small muted">${esc(byId('schools',c.school_id).name)}</div>`:''}
      <div style="margin-top:10px"><div class="row small"><span>${fa(n)} از ${fa(c.capacity)} نفر</span><div class="spacer"></div><span class="muted">${fa(fill)}٪</span></div>${bar(fill,100,fill>90?'var(--red)':'var(--primary)')}</div></div>`;}).join('')}</div>`
   :empty('🏛️','کلاسی تعریف نشده',canEdit?'اولین کلاس را بسازید.':'کلاسی به شما تخصیص نیافته است.',canEdit?'<button class="btn" data-act="class-new">ساخت کلاس</button>':'')}</div>`;
}

function viewSubjects(){
  const canEdit=['superadmin','manager'].includes(S.user.role);
  const rows=visibleSubjects();
  return `<div class="card"><div class="card-head"><h3>دروس <span class="badge b-gray">${fa(rows.length)}</span></h3>
   ${canEdit?`<button class="btn" data-act="subject-new">➕ درس جدید</button>`:''}</div>
   ${rows.length?`<div class="table-wrap"><table><thead><tr><th>نام درس</th><th>کد</th><th>ساعت هفتگی</th>${S.user.role==='superadmin'?'<th>مدرسه</th>':''}${canEdit?'<th></th>':''}</tr></thead><tbody>
    ${rows.map(s=>`<tr><td><b>${esc(s.name)}</b></td><td class="muted">${esc(s.code||'—')}</td><td><span class="badge b-blue">${fa(s.weekly_hours)} ساعت</span></td>
     ${S.user.role==='superadmin'?`<td class="muted">${esc(byId('schools',s.school_id).name)}</td>`:''}
     ${canEdit?`<td><button class="icon-btn" data-act="subject-edit" data-id="${s.id}">✏️</button> <button class="icon-btn danger" data-act="subject-del" data-id="${s.id}">🗑️</button></td>`:''}</tr>`).join('')}
   </tbody></table></div>`:empty('📚','درسی تعریف نشده','دروس مدرسه را اضافه کنید.')}</div>`;
}
