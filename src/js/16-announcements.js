/* ============================ announcements ============================ */
function viewAnnouncements(){
  const canEdit=['superadmin','manager','teacher'].includes(S.user.role);
  const rows=myAnnouncements();
  const AUD={all:'همه',teacher:'دبیران',student:'دانش‌آموزان',parent:'اولیا',manager:'مدیران'};
  return `<div class="card"><div class="card-head"><h3>اطلاعیه‌ها</h3>${canEdit?`<button class="btn" data-act="ann-new">➕ اطلاعیه جدید</button>`:''}</div>
   ${rows.length?`<div class="card-body" style="display:grid;gap:12px">${rows.map(a=>{const au=a.created_by?byId('users',a.created_by):null;
    return `<div class="card" style="padding:15px;box-shadow:none;background:var(--surface-2)">
     <div class="row"><b style="font-size:15px">${esc(a.title)}</b><span class="badge b-blue">${AUD[a.audience]||'همه'}</span><div class="spacer"></div>
      <span class="small muted">${jalali(a.created_at)}</span>${canEdit?`<button class="icon-btn" title="ویرایش" data-act="ann-edit" data-id="${a.id}">✏️</button> <button class="icon-btn danger" title="حذف" data-act="ann-del" data-id="${a.id}">🗑️</button>`:''}</div>
     <p style="margin:10px 0 0;line-height:2">${esc(a.body)}</p>${au?`<div class="small muted" style="margin-top:6px">✍️ ${esc(au.full_name)}</div>`:''}</div>`;}).join('')}</div>`
   :empty('📢','اطلاعیه‌ای وجود ندارد',canEdit?'اولین اطلاعیه را منتشر کنید.':'به محض انتشار، اینجا نمایش داده می‌شود.')}</div>`;
}
