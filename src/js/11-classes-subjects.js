/* ═══════════════════════════════════════════════════════════════════
   کلاس‌ها و دروس
   شبکهٔ کلاس‌ها با درصد پرشدن، و جدول دروس با فیلتر پایه و رشته.
   ═══════════════════════════════════════════════════════════════════ */
function viewClasses(){
  const canEdit=['superadmin','manager'].includes(S.user.role);
  const rows=visibleClasses();
  return `<div class="card"><div class="card-head"><h3>کلاس‌ها <span class="badge b-gray">${fa(rows.length)}</span></h3>
    ${canEdit?`<button class="btn" data-act="class-new">➕ کلاس جدید</button>`:''}</div>
   ${rows.length?`<div class="grid g3" style="padding:16px">${(()=>{const _ec=(typeof idxEnrollByClass==='function')?idxEnrollByClass():null;return rows.map(c=>{const n=_ec?(_ec.get(c.id)||[]).length:db.enrollments.filter(e=>e.class_id===c.id).length;const fill=Math.min(100,Math.round(n/(c.capacity||30)*100));const ht=c.homeroom_teacher_id?byId('users',c.homeroom_teacher_id):null;
     return `<div class="card" style="padding:15px;box-shadow:none">
      <div class="row"><b style="font-size:15px">${esc(c.name)}</b><div class="spacer"></div>
       ${canEdit?`<button class="icon-btn" data-act="class-edit" data-id="${escAttr(c.id)}">✏️</button> <button class="icon-btn danger" data-act="class-del" data-id="${escAttr(c.id)}">🗑️</button>`:''}</div>
      <div class="row small muted" style="margin-top:6px"><span class="badge b-blue">${esc(c.grade||'—')}</span>${c.field?`<span class="badge b-purple">${esc(c.field)}</span>`:''}${c.room?`<span>🚪 ${esc(c.room)}</span>`:''}</div>
      <div class="small muted" style="margin-top:8px">سرپرست: ${esc(ht?ht.full_name:'—')}</div>
      ${S.user.role==='superadmin'?`<div class="small muted">${esc(byId('schools',c.school_id).name)}</div>`:''}
      <div style="margin-top:10px"><div class="row small"><span>${fa(n)} از ${fa(c.capacity)} نفر</span><div class="spacer"></div><span class="muted">${fa(fill)}٪</span></div>${bar(fill,100,fill>90?'var(--red)':'var(--primary)')}</div></div>`;}).join('');})()}</div>`
   :empty('🏛️','کلاسی تعریف نشده',canEdit?'اولین کلاس را بسازید.':'کلاسی به شما تخصیص نیافته است.',canEdit?'<button class="btn" data-act="class-new">ساخت کلاس</button>':'')}</div>`;
}

function viewSubjects(){
  const u=S.user, canEdit=['superadmin','manager'].includes(u.role), isSuper=u.role==='superadmin';
  const q=(S.filters.subq||'').trim();
  const flv=S.filters.sublevel||'', fgr=S.filters.subgrade||'',
        fbr=S.filters.subbranch||'', ffd=S.filters.subfield||'', fsc=S.filters.subschool||'';

  let rows=visibleSubjects();
  if(q)rows=rows.filter(s=>(s.name+(s.code||'')).includes(q));
  if(fsc)rows=rows.filter(s=>String(s.school_id)===String(fsc));
  if(flv)rows=rows.filter(s=>levelOfGrade(s.grade)===flv);
  if(fgr)rows=rows.filter(s=>s.grade===fgr);
  if(fbr)rows=rows.filter(s=>branchOfField(s.field)===fbr);
  if(ffd)rows=rows.filter(s=>s.field===ffd);

  const opt=(list,val,label)=>[`<option value="">${label}</option>`,
    ...list.map(o=>`<option value="${esc(o[0])}" ${String(val)===String(o[0])?'selected':''}>${esc(o[1])}</option>`)].join('');
  const gradeList = flv ? (GRADES_OF_LEVEL[flv]||[]) : LEVELS.flatMap(l=>GRADES_OF_LEVEL[l]);
  const fieldList = fieldsOfBranch(fbr);
  const showFieldFilters = !flv || needsField(flv);

  /* گروه‌بندی: مقطع › پایه › (رشته) */
  const groups={};
  rows.forEach(s=>{
    const lv=levelOfGrade(s.grade)||'سایر دروس';
    const gr=s.grade||'—';
    const key=needsField(lv)&&s.field ? `${lv}|${gr}|${s.field}` : `${lv}|${gr}|`;
    (groups[key]=groups[key]||[]).push(s);
  });
  const orderKey=(k)=>{
    const [lv,gr]=k.split('|');
    const li=LEVELS.indexOf(lv); const gi=(GRADES_OF_LEVEL[lv]||[]).indexOf(gr);
    return (li<0?99:li)*100 + (gi<0?99:gi);
  };
  const keys=Object.keys(groups).sort((a,b)=>orderKey(a)-orderKey(b)||a.localeCompare(b,'fa'));

  return `<div class="card"><div class="card-head">
    <h3>دروس و کتاب‌ها <span class="badge b-gray">${fa(rows.length)}</span></h3>
    <div class="row">
      <input class="input" style="width:190px" placeholder="جستجوی نام درس یا کد…" data-f="subq" value="${esc(q)}" />
      ${canEdit?`<button class="btn ghost" data-act="subject-import">📥 افزودن کتاب‌های استاندارد</button>
                 <button class="btn" data-act="subject-new">➕ درس جدید</button>`:''}
    </div></div>
   ${filterPanel('subjects',`
     <select class="select" style="width:145px" data-f="sublevel">${opt(LEVELS.map(l=>[l,l]),flv,'همه مقاطع')}</select>
     <select class="select" style="width:135px" data-f="subgrade">${opt(gradeList.map(g=>[g,g]),fgr,'همه پایه‌ها')}</select>
     ${showFieldFilters?`
       <select class="select" style="width:150px" data-f="subbranch">${opt(schoolBranches(fsc||S.user.school_id).map(b=>[b,b]),fbr,'همه شاخه‌ها')}</select>
       <select class="select" style="width:180px" data-f="subfield">${opt(fieldList.map(f=>[f,f]),ffd,'همه رشته‌ها')}</select>`:''}
     ${isSuper?`<select class="select" style="width:180px" data-f="subschool">${opt(db.schools.map(s=>[s.id,s.name]),fsc,'همه مدارس')}</select>`:''}`)}

   ${rows.length?keys.map(k=>{
     const [lv,gr,fd]=k.split('|');
     const list=groups[k].slice().sort((a,b)=>a.name.localeCompare(b.name,'fa'));
     const hours=list.reduce((t,s)=>t+(Number(s.weekly_hours)||0),0);
     return `<div style="padding:0 16px 6px">
       <div class="sec-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
         <span>${esc(lv)}</span>
         ${gr&&gr!=='—'?`<span class="badge b-blue">پایه ${esc(gr)}</span>`:''}
         ${fd?`<span class="badge b-purple">${esc(fd)}</span><span class="badge b-gray">${esc(branchOfField(fd))}</span>`:''}
         <div class="spacer"></div>
         <span class="badge b-gray">${fa(list.length)} کتاب</span>
         <span class="badge b-amber">${fa(hours)} ساعت</span>
       </div>
       <div class="table-wrap"><table><thead><tr><th>نام کتاب / درس</th><th>کد</th><th>ساعت هفتگی</th>${isSuper?'<th>مدرسه</th>':''}${canEdit?'<th></th>':''}</tr></thead><tbody>
       ${list.map(s=>`<tr><td><b>${esc(s.name)}</b></td><td class="muted">${esc(s.code||'—')}</td>
         <td><span class="badge b-blue">${fa(s.weekly_hours)} ساعت</span></td>
         ${isSuper?`<td class="muted">${esc((byId('schools',s.school_id)||{}).name||'—')}</td>`:''}
         ${canEdit?`<td><button class="icon-btn" title="ویرایش" data-act="subject-edit" data-id="${escAttr(s.id)}">✏️</button>
                      <button class="icon-btn danger" title="حذف" data-act="subject-del" data-id="${escAttr(s.id)}">🗑️</button></td>`:''}</tr>`).join('')}
       </tbody></table></div></div>`;}).join('')
   :empty('📚','درسی یافت نشد',(q||flv||fgr||fbr||ffd)?'با این فیلترها نتیجه‌ای نبود.':'کتاب‌های استاندارد را وارد کنید یا درس جدید بسازید.',
     canEdit?'<button class="btn" data-act="subject-import">📥 افزودن کتاب‌های استاندارد</button>':'')}
   </div>`;
}
