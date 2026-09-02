/* ═══════════════════════════════════════════════════════════════════
   کاربران
   فهرست، جستجو، ویرایش و بازنشانی رمز. صفحه‌بندی ۱۵تایی.
   ═══════════════════════════════════════════════════════════════════ */
function viewUsers(){
  const u=S.user, canEdit=['superadmin','manager'].includes(u.role);
  const q=(S.filters.q||'').trim(), role=S.filters.role||'', sch=S.filters.school||'', act=S.filters.uactive||'';
  let rows=db.users.filter(x=>x.role!=='superadmin');
  if(u.role!=='superadmin')rows=rows.filter(x=>x.school_id===u.school_id);
  if(sch)rows=rows.filter(x=>x.school_id===Number(sch));
  if(role)rows=rows.filter(x=>x.role===role);
  if(q)rows=rows.filter(x=>(x.full_name+x.username+(x.national_id||'')).includes(q));
  if(act!=='')rows=rows.filter(x=>String(x.active?1:0)===act);
  const per=15,pages=Math.ceil(rows.length/per)||1,page=Math.min(S.page,pages);
  const slice=rows.slice((page-1)*per,page*per);
  return `<div class="card"><div class="card-head">
    <h3>کاربران <span class="badge b-gray">${fa(rows.length)} نفر</span></h3>
    <div class="row"><button class="btn ghost sm" data-act="export-csv" data-r="users">⬇️ خروجی</button></div>
    <div class="row">
     <input class="input" style="width:180px" placeholder="نام یا کد ملی…" data-f="q" value="${esc(q)}" />
     ${canEdit?`<button class="btn" data-act="user-new">➕ کاربر جدید</button>`:''}</div></div>
   ${filterPanel('users',`
     <select class="select" style="width:135px" data-f="role"><option value="">همه نقش‌ها</option>${['manager','teacher','student','parent'].map(r=>`<option value="${r}" ${role===r?'selected':''}>${ROLE_FA[r]}</option>`).join('')}</select>
     ${u.role==='superadmin'?`<select class="select" style="width:170px" data-f="school"><option value="">همه مدارس</option>${db.schools.map(s=>`<option value="${s.id}" ${sch==String(s.id)?'selected':''}>${esc(s.name)}</option>`).join('')}</select>`:''}
     <select class="select" style="width:130px" data-f="uactive"><option value="">همه وضعیت‌ها</option><option value="1" ${act==='1'?'selected':''}>فعال</option><option value="0" ${act==='0'?'selected':''}>غیرفعال</option></select>`)}
   ${slice.length?`<div class="table-wrap"><table><thead><tr><th>نام و نام خانوادگی</th><th>نقش</th><th>نام کاربری</th><th>مدرسه</th><th>کلاس</th><th>تلفن</th><th>وضعیت</th>${canEdit?'<th></th>':''}</tr></thead><tbody>
    ${slice.map(x=>`<tr><td><div class="row" style="flex-wrap:nowrap;gap:8px"><div class="avatar" style="width:30px;height:30px;font-size:12px;background:var(--primary-soft);color:var(--primary)">${esc(x.full_name[0])}</div>
      <div><b>${esc(x.full_name)}</b><div class="small muted">${esc(x.national_id||'—')}</div></div></div></td>
      <td><span class="badge ${ROLE_BADGE[x.role]}">${ROLE_FA[x.role]}</span></td><td class="muted">${esc(x.username)}</td>
      <td class="muted">${esc(x.school_id?byId('schools',x.school_id).name:'—')}</td><td>${esc(x.role==='student'?((classOf(x.id)||{}).name||'—'):'—')}</td>
      <td class="muted">${esc(x.phone||'—')}</td>
      <td><span class="badge ${x.active?'b-green':'b-gray'}" ${canEdit?`data-act="user-toggle" data-id="${x.id}" style="cursor:pointer"`:''}>${x.active?'فعال':'غیرفعال'}</span></td>
      ${canEdit?`<td><button class="icon-btn" title="بازنشانی رمز" data-act="pass-reset" data-id="${x.id}">🔑</button> <button class="icon-btn" data-act="user-edit" data-id="${x.id}">✏️</button> <button class="icon-btn danger" data-act="user-del" data-id="${x.id}">🗑️</button></td>`:''}</tr>`).join('')}
    </tbody></table></div>${pager(page,pages)}`:empty('👥','کاربری یافت نشد','فیلترها را تغییر دهید یا کاربر جدید بسازید.')}
   </div>`;
}
function pager(page,pages){ if(pages<2)return '';
  const nums=[];for(let i=Math.max(1,page-2);i<=Math.min(pages,page+2);i++)nums.push(i);
  return `<div class="pager"><button data-act="page" data-p="${page-1}" ${page<=1?'disabled':''}>›</button>
   ${nums.map(n=>`<button class="${n===page?'active':''}" data-act="page" data-p="${n}">${fa(n)}</button>`).join('')}
   <button data-act="page" data-p="${page+1}" ${page>=pages?'disabled':''}>‹</button><span class="muted small">از ${fa(pages)} صفحه</span></div>`;}
